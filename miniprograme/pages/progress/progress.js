// pages/progress/progress.js —— 「我的」tab 页（识字果树 + 荣誉奖状 + 里程碑）
// 视觉化展示识字果树阶段、大红奖状、已学字数、连续天数及里程碑列表。

var storage = require('../../services/storage.js');
var course = require('../../services/course.js');
var progress = require('../../services/progress.js');
var tts = require('../../services/tts.js');

function getTreeInfo(n) {
  if (n < 5) return { icon: '🌱', levelName: '破土小幼苗', desc: '已经认识 ' + n + ' 个字，每天坚持，小幼苗很快长大！' };
  if (n < 25) return { icon: '🌿', levelName: '茁壮小青树', desc: '已经认识 ' + n + ' 个字，枝叶正在快快舒展！' };
  if (n < 50) return { icon: '🌳', levelName: '繁茂识字树', desc: '已经认识 ' + n + ' 个字，买菜看牌都不慌！' };
  if (n < 100) return { icon: '🍎', levelName: '硕果累累果树', desc: '已经认识 ' + n + ' 个字，树上结出红苹果，能诵读唐诗啦！' };
  return { icon: '🌟', levelName: '百字金光树', desc: '已经认识 ' + n + ' 个字，金灿灿的大金树，脱盲大状元！' };
}

Page({
  data: {
    fontClass: 'font-large',
    learnedCount: 0,
    masteredCount: 0,   // 完全认识（连续 5 次毕业）
    learningCount: 0,   // 巩固中
    streak: 0,
    studiedToday: false,
    treeInfo: { icon: '🌱', levelName: '破土小幼苗', desc: '' },
    certificates: [],
    activeCert: null,
    groups: []  // [{ name: '古诗', items: [{ key, type, id, label, unlocked, need }] }]
  },

  onShow: function () {
    var self = this;
    this.setData({
      fontClass: storage.getSettings().fontSize === 'xl' ? 'font-xl' : 'font-large'
    });
    this._refresh();
    this._speakSummary();
    // 后台拉服务端最新进度后重渲染
    progress.refresh().then(function () {
      self._refresh();
    });
  },

  onReady: function () {
    this.speaker = this.selectComponent('#speaker');
    // onShow 可能先于 onReady 触发，这里补一次播报
    this._speakSummary();
  },

  _refresh: function () {
    var summary = progress.getSummary();
    var n = summary.totalLearned;

    var groups = [
      { name: '古诗', items: this._buildItems(course.loadPoems(), 'poem', n, '首') },
      { name: '故事', items: this._buildItems(course.loadStories(), 'story', n, '个') }
    ];

    this.setData({
      learnedCount: n,
      masteredCount: summary.masteredCount,
      learningCount: summary.learningCount,
      streak: storage.getStreak(),
      studiedToday: storage.studiedToday(),
      treeInfo: getTreeInfo(n),
      certificates: storage.getCertificates(n),
      groups: groups
    });
  },

  // 构造某一类里程碑的展示条目
  _buildItems: function (list, type, learnedCount, unit) {
    return list.map(function (item, i) {
      var unlocked = learnedCount >= item.unlockAt;
      var label;
      if (type === 'poem') label = '第' + (i + 1) + '首古诗《' + item.title + '》';
      else label = '第' + (i + 1) + '个故事《' + item.title + '》';
      return {
        key: type + '_' + item.id,
        type: type,
        id: item.id,
        label: label,
        unlocked: unlocked,
        need: unlocked ? 0 : item.unlockAt - learnedCount,
        unit: unit
      };
    });
  },

  _speakSummary: function () {
    if (!this.speaker) return;
    if (this._spoken) return; // 每次进页只播报一次汇总
    this._spoken = true;
    this.speaker.speak(
      '你已经认识 ' + this.data.learnedCount + ' 个字啦，识字树长成' +
      this.data.treeInfo.levelName + '，真厉害！'
    );
  },

  // 点击奖状：已解锁展示光荣大奖状，未解锁播报还差多少字
  onTapCert: function (e) {
    var d = e.currentTarget.dataset;
    var cert = null;
    for (var i = 0; i < this.data.certificates.length; i++) {
      if (this.data.certificates[i].id === d.id) {
        cert = this.data.certificates[i];
        break;
      }
    }
    if (!cert) return;

    if (!cert.unlocked) {
      var diff = cert.need - this.data.learnedCount;
      this.speaker.speak('再学 ' + diff + ' 个字，就能获得' + cert.title + '大奖状啦！');
      return;
    }

    this.setData({ activeCert: cert });
    tts.speak('恭喜你获得' + cert.title + '！' + cert.desc);
  },

  closeCertModal: function () {
    this.setData({ activeCert: null });
  },

  // 点「发给儿女看一看」：打开分享面板的同时语音引导（分享结果无可靠回调，不做成功提示）
  onShareTap: function () {
    tts.speak('选择儿女的微信，把奖状发给他们吧');
  },

  stopProp: function () {
    // 阻止弹窗内点击关闭
  },

  // 点击里程碑：已解锁跳对应页，未解锁播报还差多少字
  onTapMilestone: function (e) {
    var d = e.currentTarget.dataset;
    if (!d.unlocked) {
      this.speaker.speak('再学一些字就能解锁这节课啦');
      return;
    }
    wx.navigateTo({ url: '/pages/milestone/milestone?type=' + d.type + '&id=' + d.id });
  },

  goHome: function () {
    // 本页是 tab 页，返回首页用 switchTab
    wx.switchTab({ url: '/pages/home/home' });
  },

  onShareAppMessage: function () {
    var title = this.data.activeCert
      ? '快来看！我刚刚荣获了「' + this.data.activeCert.title + '」大红奖状！'
      : '我在爸妈识字课已经认识' + this.data.learnedCount + '个字了！识字果树长大啦！';
    return {
      title: title,
      path: '/pages/home/home?from=share'
    };
  }
});

