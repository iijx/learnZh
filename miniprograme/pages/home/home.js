// pages/home/home.js —— 首页逻辑
// 极简适老化卡片首页：大字展示、具象图标、进入课堂主入口、识字成果展示、全语音引导

var tts = require('../../services/tts.js');
var storage = require('../../services/storage.js');
var progress = require('../../services/progress.js');

// 同一天只自动播报一次的记录键
var GREET_DATE_KEY = 'lz_home_greet_date';

Page({
  data: {
    greeting: '早上好',
    learnedCount: 0,
    streak: 0,
    fontClass: 'font-large'
  },

  onLoad: function (options) {
    // 子女分享进来的新用户（还没学过任何字）→ 进「帮爸妈设置」引导页
    if (options && options.from === 'share' && progress.getSummary().totalLearned === 0) {
      wx.redirectTo({ url: '/pages/guide/guide' });
    }
  },

  onShow: function () {
    var self = this;
    var settings = storage.getSettings();
    var hour = new Date().getHours();
    var greeting = hour < 12 ? '早上好' : (hour < 18 ? '下午好' : '晚上好');

    // 先用缓存汇总渲染，后台刷新服务端进度后更新
    this._renderHome(greeting, settings);
    progress.refresh().then(function () {
      self._renderHome(greeting, storage.getSettings());
    });

    this._speakTodayTask(greeting);
  },

  _renderHome: function (greeting, settings) {
    this.setData({
      greeting: greeting,
      learnedCount: progress.getSummary().totalLearned,
      streak: storage.getStreak(),
      fontClass: settings.fontSize === 'xl' ? 'font-xl' : 'font-large'
    });
  },

  // 语音播报问候 + 引导；同一天只自动播一次，之后 onShow 不再重播
  _speakTodayTask: function (greeting) {
    var today = storage._dateStr();
    var last = '';
    try { last = wx.getStorageSync(GREET_DATE_KEY) || ''; } catch (e) { }
    if (last === today) return;
    try { wx.setStorageSync(GREET_DATE_KEY, today); } catch (e) { }

    tts.speak(greeting + '！亲爱的长辈，欢迎来到课堂。一组五个字，有复习有新生字，学完一组接着下一组。');
  },

  onStart: function () {
    wx.navigateTo({ url: '/pages/learn/learn' });
  },

  onGoReading: function () {
    // 阅读课是 tab 页，用 switchTab 跳转
    wx.switchTab({ url: '/pages/reading/reading' });
  },

  goProgress: function () {
    wx.navigateTo({ url: '/pages/progress/progress' });
  },

  onShareAppMessage: function () {
    var count = progress.getSummary().totalLearned;
    return {
      title: '我在阿福认字上已认识' + count + '个字！一天五个字，认遍生活',
      path: '/pages/home/home?from=share'
    };
  }
});
