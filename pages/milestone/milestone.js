// pages/milestone/milestone.js —— 里程碑课（古诗 + 故事共用页）
// onLoad options: type=poem|story & id=N；缺省时列出所有已解锁的古诗和故事供选择。
// 古诗：逐句超大字认读（读完每句高亮）+ 跟读 + 「背给孙子听」打卡；
// 故事：逐句大字朗读，读完展示全文 + 表扬。
// 打卡记录存 storage（key: lz_poem_checkin）。

var storage = require('../../services/storage.js');
var course = require('../../services/course.js');

var CHECKIN_KEY = 'lz_poem_checkin'; // { poemId: 'YYYY-MM-DD', ... }

Page({
  data: {
    fontClass: 'font-large',
    mode: 'list',      // list | poem | story
    title: '',
    author: '',
    lines: [],
    currentLine: -1,   // 正在朗读的句子下标（-1 = 未开始/已读完）
    phase: 'reading',  // reading | done
    poems: [],         // 清单态：已解锁古诗
    stories: []        // 清单态：已解锁故事
  },

  onLoad: function (options) {
    this._type = options && options.type ? options.type : '';
    this._id = options && options.id ? Number(options.id) : 0;
  },

  onShow: function () {
    this.setData({
      fontClass: storage.getSettings().fontSize === 'xl' ? 'font-xl' : 'font-large'
    });
  },

  onReady: function () {
    this.speaker = this.selectComponent('#speaker');
    this.speaker.startIdleWatch();
    if (this._type && this._id) {
      this._openContent(this._type, this._id);
    } else {
      this._buildList();
      this.speaker.speak('点一首你想读的诗，或者一个故事。');
    }
  },

  onUnload: function () {
    this._reading = false;
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
    this.speaker.resetIdle();
    this._openContent('poem', Number(e.currentTarget.dataset.id));
  },

  onPickStory: function (e) {
    this.speaker.resetIdle();
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
    this.setData({
      mode: type,
      title: item.title,
      author: item.author || '',
      lines: item.lines,
      currentLine: -1,
      phase: 'reading'
    });
    this._workId = id;
    this._readFrom(0);
  },

  // 逐句朗读：读完一句高亮下一句（不用 speakSequence，要逐句回调做高亮）
  _readFrom: function (i) {
    var self = this;
    var lines = this.data.lines;
    if (i >= lines.length) {
      this._finishReading();
      return;
    }
    this._reading = true;
    this.setData({ currentLine: i, phase: 'reading' });
    this.speaker.speak(lines[i], {
      onDone: function () {
        if (!self._reading) return; // 页面已离开或用户切了流程
        self._readFrom(i + 1);
      }
    });
  },

  _finishReading: function () {
    this._reading = false;
    this.setData({ currentLine: -1, phase: 'done' });
    if (this.data.mode === 'story') {
      this.speaker.speak('你自己读完了一个故事，真了不起！');
    } else {
      this.speaker.speak('读完啦！你可以跟着再读一遍。');
    }
  },

  // 「跟着读一遍」/「再读一遍」
  onReplay: function () {
    this.speaker.resetIdle();
    this._readFrom(0);
  },

  // 「背给孙子听」打卡：记录 storage + 语音表扬
  onCheckin: function () {
    this.speaker.resetIdle();
    var map = wx.getStorageSync(CHECKIN_KEY) || {};
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    map[this._workId] = d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
    wx.setStorageSync(CHECKIN_KEY, map);
    this.speaker.speak('太棒了！记得背给孙子听哦');
  },

  goBack: function () {
    this.speaker.resetIdle();
    this._reading = false;
    wx.navigateBack({
      fail: function () {
        wx.reLaunch({ url: '/pages/home/home' });
      }
    });
  }
});
