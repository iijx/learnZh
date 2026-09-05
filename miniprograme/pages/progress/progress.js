// pages/progress/progress.js —— 「我的」tab 页
// 展示学习数据统计（已学/完全认识/巩固中/连续天数/今日状态），提供阅读课入口。
// 数据来自服务端汇总缓存（services/progress.js），进页后后台刷新。

var storage = require('../../services/storage.js');
var progress = require('../../services/progress.js');
var tts = require('../../services/tts.js');

Page({
  data: {
    fontClass: 'font-large',
    learnedCount: 0,
    masteredCount: 0,   // 完全认识（连续 5 次毕业）
    learningCount: 0,   // 巩固中
    streak: 0,
    studiedToday: false
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
    this.setData({
      learnedCount: summary.totalLearned,
      masteredCount: summary.masteredCount,
      learningCount: summary.learningCount,
      streak: storage.getStreak(),
      studiedToday: storage.studiedToday()
    });
  },

  _speakSummary: function () {
    if (!this.speaker) return;
    if (this._spoken) return; // 每次进页只播报一次汇总
    this._spoken = true;
    this.speaker.speak('你已经学了 ' + this.data.learnedCount + ' 个字，其中完全认识 ' + this.data.masteredCount + ' 个，真厉害！');
  },

  // 阅读课入口（场景 / 古诗 / 故事）——阅读页是 tab 页，用 switchTab
  goReading: function () {
    wx.switchTab({ url: '/pages/reading/reading' });
  },

  goHome: function () {
    wx.switchTab({ url: '/pages/home/home' });
  },

  onShareAppMessage: function () {
    return {
      title: '我在阿福认字已经学了' + this.data.learnedCount + '个字了！',
      path: '/pages/home/home?from=share'
    };
  }
});
