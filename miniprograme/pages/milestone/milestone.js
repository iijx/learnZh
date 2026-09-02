// pages/milestone/milestone.js —— 里程碑课（古诗 + 故事共用页）
// onLoad options: type=poem|story & id=N；缺省时列出所有已解锁的古诗和故事供选择。
// 古诗：逐句超大字认读（读完每句高亮）+ 跟读 + 「背给孙子听」打卡；
// 故事：逐句大字朗读，读完展示全文 + 表扬。
// 朗读中带吸底控制条：暂停/继续、再读这句；
// 打卡记录存 storage（key: lz_poem_checkin）。

var storage = require('../../services/storage.js');
var course = require('../../services/course.js');

// { poemId: { last: 'YYYY-MM-DD', count: 累计次数 }, ... }
// 兼容旧数据：值直接是日期字符串，视为已打过 1 次
var CHECKIN_KEY = 'lz_poem_checkin';

// 今天日期串 YYYY-MM-DD（本地时区）
function todayStr() {
  var d = new Date();
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

// 取某作品的打卡记录；旧结构（日期字符串）统一升级为 { last, count }
function getCheckin(map, id) {
  var v = map[id];
  if (!v) return null;
  if (typeof v === 'string') return { last: v, count: 1 };
  return { last: v.last || '', count: v.count || 0 };
}

Page({
  data: {
    fontClass: 'font-large',
    mode: 'list',        // list | poem | story
    title: '',
    author: '',
    lines: [],
    currentLine: -1,     // 正在朗读的句子下标（-1 = 未开始/已读完）
    phase: 'reading',    // reading | done
    paused: false,       // 朗读已暂停（控制条显示「继续」并金光呼吸）
    checkedToday: false, // 今天已打卡（打卡按钮变禁用态）
    checkinCount: 0,     // 累计打卡次数
    poems: [],           // 清单态：已解锁古诗
    stories: []          // 清单态：已解锁故事
  },

  onLoad: function (options) {
    this._type = options && options.type ? options.type : '';
    this._id = options && options.id ? Number(options.id) : 0;
    this._gen = 0; // 朗读代际令牌：每开口一句 +1，旧句子的回调一律作废
  },

  onShow: function () {
    this.setData({
      fontClass: storage.getSettings().fontSize === 'xl' ? 'font-xl' : 'font-large'
    });
  },

  onReady: function () {
    this.speaker = this.selectComponent('#speaker');
    if (this._type && this._id) {
      this._openContent(this._type, this._id);
    } else {
      this._buildList();
      this.speaker.speak('点一首你想读的诗，或者一个故事。');
    }
  },

  onHide: function () {
    this._stopReading();
    // 切后台/被覆盖：若还在朗读中，回到页面时显示「继续」让老人一键接着读
    if (this.data.mode !== 'list' && this.data.phase === 'reading') {
      this.setData({ paused: true });
    }
  },

  onUnload: function () {
    this._stopReading();
  },

  // 停止朗读并作废进行中的回调（页面隐藏/卸载/返回时调用）
  _stopReading: function () {
    this._gen++; // 令牌 +1，旧句子的 onDone 即使触发也直接返回
    if (this.speaker) this.speaker.stop();
  },

  // ---------- 清单态（options 缺省时） ----------

  _buildList: function () {
    this.setData({
      mode: 'list',
      poems: course.getUnlockedPoems(),
      stories: course.getUnlockedStories()
    });
  },

  onPickPoem: function (e) {
    this._openContent('poem', Number(e.currentTarget.dataset.id));
  },

  onPickStory: function (e) {
    this._openContent('story', Number(e.currentTarget.dataset.id));
  },

  // ---------- 内容态 ----------

  _openContent: function (type, id) {
    var list = type === 'poem' ? course.loadPoems() : course.loadStories();
    var item = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) item = list[i];
    }
    if (!item) {
      this._buildList();
      return;
    }
    var rec = getCheckin(wx.getStorageSync(CHECKIN_KEY) || {}, id);
    this.setData({
      mode: type,
      title: item.title,
      author: item.author || '',
      lines: item.lines,
      currentLine: -1,
      phase: 'reading',
      paused: false,
      checkedToday: !!(rec && rec.last === todayStr()),
      checkinCount: rec ? rec.count : 0
    });
    this._workId = id;
    this._readFrom(0);
  },

  // 逐句朗读：读完一句高亮并接下一句（不用 speakSequence，要逐句回调做高亮）。
  // 防跳句：每开口一句先 ++this._gen，暂停/重读/换句后旧句子的 onDone 因令牌过期直接返回。
  _readFrom: function (i) {
    var self = this;
    var lines = this.data.lines;
    var gen = ++this._gen;
    if (i >= lines.length) {
      this._finishReading();
      return;
    }
    this.setData({ currentLine: i, phase: 'reading', paused: false });
    this.speaker.speak(lines[i], {
      onDone: function () {
        if (gen !== self._gen) return; // 令牌已换：暂停/重读/离开页面
        self._readFrom(i + 1);
      }
    });
  },

  _finishReading: function () {
    this.setData({ currentLine: -1, phase: 'done', paused: false });
    if (this.data.mode === 'story') {
      this.speaker.speak('你自己读完了一个故事，真了不起！');
    } else {
      this.speaker.speak('读完啦！你可以跟着再读一遍。');
    }
  },

  // ---------- 朗读控制条 ----------

  // 「暂停 / 继续」
  onTogglePause: function () {
    if (this.data.paused) {
      // 继续：从当前句重读并往后
      this._readFrom(this.data.currentLine < 0 ? 0 : this.data.currentLine);
    } else {
      // 暂停：停当前音频、作废旧回调，当前句保持高亮
      this._gen++;
      this.speaker.stop();
      this.setData({ paused: true });
    }
  },

  // 「再读这句」：重读当前句，读完自动继续往后
  onRereadLine: function () {
    this._readFrom(this.data.currentLine < 0 ? 0 : this.data.currentLine);
  },

  // 「跟着读一遍」/「再读一遍」
  onReplay: function () {
    this._readFrom(0);
  },

  // 「背给孙子听」打卡：记录 storage + 语音播报累计次数（今天已打过卡则忽略）
  onCheckin: function () {
    if (this.data.checkedToday) return; // 防重复打卡
    var map = wx.getStorageSync(CHECKIN_KEY) || {};
    var rec = getCheckin(map, this._workId);
    var count = (rec ? rec.count : 0) + 1;
    map[this._workId] = { last: todayStr(), count: count };
    wx.setStorageSync(CHECKIN_KEY, map);
    this.setData({ checkedToday: true, checkinCount: count });
    this.speaker.speak('真棒！这是你第 ' + count + ' 次背诗打卡');
  },

  goBack: function () {
    this._stopReading();
    wx.navigateBack({
      fail: function () {
        wx.reLaunch({ url: '/pages/home/home' });
      }
    });
  }
});
