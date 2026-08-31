// pages/home/home.js —— 首页（PRD 4.1/4.2）
// 大字问候 + 唯一主按钮「开始学习」+ 三个次级入口 + 右上角设置；
// onShow 语音播报问候与今日任务（同一天只自动播一次）。

var tts = require('../../services/tts.js');
var storage = require('../../services/storage.js');
var review = require('../../services/review.js');

// 同一天只自动播报一次的记录键（存在本地即可，无需入 storage.js 接口）
var GREET_DATE_KEY = 'lz_home_greet_date';

Page({
  data: {
    greeting: '',                    // 早上好 / 下午好 / 晚上好
    fontClass: 'font-large'          // 跟随设置里的字号档位
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
    this.setData({
      greeting: greeting,
      fontClass: settings.fontSize === 'xl' ? 'font-xl' : 'font-large'
    });
    this._speakTodayTask(greeting, settings);
  },

  // 语音播报问候 + 今日任务；同一天只自动播一次，之后 onShow 不再重播
  _speakTodayTask: function (greeting, settings) {
    var today = storage._dateStr();
    var last = '';
    try { last = wx.getStorageSync(GREET_DATE_KEY) || ''; } catch (e) {}
    if (last === today) return;
    try { wx.setStorageSync(GREET_DATE_KEY, today); } catch (e) {}

    var text = greeting + '！今天我们要学' + settings.dailyNewChars + '个新字';
    text += review.getTodayReview().length > 0 ? '，先复习昨天学过的字。' : '。';
    tts.speak(text);
  },

  onStart: function () {
    wx.navigateTo({ url: '/pages/learn/learn' });
  },
  goWriteName: function () {
    wx.navigateTo({ url: '/pages/write-name/write-name' });
  },
  goScene: function () {
    wx.navigateTo({ url: '/pages/scene/scene' });
  },
  goProgress: function () {
    wx.navigateTo({ url: '/pages/progress/progress' });
  },
  goSettings: function () {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  onShareAppMessage: function () {
    return {
      title: '我爸妈已认识' + storage.getLearnedCount() + '个字！一天五个字，认遍生活',
      path: '/pages/home/home?from=share'
    };
  }
});
