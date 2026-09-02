// pages/home/home.js —— 首页逻辑
// 极简适老化卡片首页：大字展示、具象图标、进入课堂主入口、识字成果展示、全语音引导

var tts = require('../../services/tts.js');
var storage = require('../../services/storage.js');
var review = require('../../services/review.js');

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
    if (options && options.from === 'share' && storage.getLearnedCount() === 0) {
      wx.redirectTo({ url: '/pages/guide/guide' });
    }
  },

  onShow: function () {
    var settings = storage.getSettings();
    var hour = new Date().getHours();
    var greeting = hour < 12 ? '早上好' : (hour < 18 ? '下午好' : '晚上好');
    var learnedCount = storage.getLearnedCount();
    var streak = storage.getStreak();
    this.setData({
      greeting: greeting,
      learnedCount: learnedCount,
      streak: streak,
      fontClass: settings.fontSize === 'xl' ? 'font-xl' : 'font-large'
    });

    this._speakTodayTask(greeting);
  },

  // 语音播报问候 + 引导；同一天只自动播一次，之后 onShow 不再重播
  _speakTodayTask: function (greeting) {
    var today = storage._dateStr();
    var last = '';
    try { last = wx.getStorageSync(GREET_DATE_KEY) || ''; } catch (e) {}
    if (last === today) return;
    try { wx.setStorageSync(GREET_DATE_KEY, today); } catch (e) {}

    var text = greeting + '！亲爱的长辈，欢迎来到课堂。一组五个字，学完一组接着下一组';
    text += review.getTodayReview().length > 0 ? '，先复习之前学过的字。' : '。';
    tts.speak(text);
  },

  onStart: function () {
    wx.navigateTo({ url: '/pages/learn/learn' });
  },

  goProgress: function () {
    // 我的页是 tab 页，用 switchTab 跳转
    wx.switchTab({ url: '/pages/progress/progress' });
  },

  onShareAppMessage: function () {
    var count = storage.getLearnedCount();
    return {
      title: '我爸妈已认识' + count + '个字！一天五个字，认遍生活',
      path: '/pages/home/home?from=share'
    };
  }
});
