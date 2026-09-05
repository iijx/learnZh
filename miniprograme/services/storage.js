// services/storage.js —— 本地存储层
// 职责：连续学习天数、设置项、断点续学状态、荣誉奖状（按传入已学数计算）
//
// 学习进度（已学字/复习排期）已全部移到服务端 learnzh-api，见 services/progress.js；
// openid 由 services/api.js 管理（wx.login code 换取）。
// 本文件只保留纯本地、与账号无关的状态。
// 所有读写落在 wx.setStorageSync / wx.getStorageSync（node 环境降级为内存）。

// node 环境下没有 wx 对象，用内存 Map 降级（便于 node require 自测）
var _mem = {};
var hasWx = typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function';

function rawGet(key, def) {
  if (hasWx) {
    var v = wx.getStorageSync(key);
    return v === '' || v === undefined || v === null ? def : v;
  }
  return key in _mem ? _mem[key] : def;
}
function rawSet(key, value) {
  if (hasWx) { wx.setStorageSync(key, value); return; }
  _mem[key] = value;
}

// 本地日期字符串 YYYY-MM-DD（按本地时区，连续天数判断用）
function dateStr(d) {
  var date = d ? new Date(d) : new Date();
  var m = date.getMonth() + 1;
  var day = date.getDate();
  return date.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

// 日期串转当天 0 点时间戳
function dayStart(str) {
  if (!str) return 0;
  var parts = str.split('-');
  return new Date(+parts[0], +parts[1] - 1, +parts[2]).getTime();
}


// 设置项默认值（PRD 3.10）
var DEFAULT_SETTINGS = {
  fontSize: 'large',     // 字号：'large' 大 / 'xl' 特大
  speechRate: 'slow'     // 语速：'slow' 慢 / 'normal' 正常
};

var KEY = {
  STREAK: 'lz_streak',         // { days: 连续天数, lastStudyDate: 'YYYY-MM-DD' }
  SETTINGS: 'lz_settings',
  RESUME: 'lz_resume'          // 断点续学状态
};

var storage = {
  // 初始化：确保设置、连续天数结构存在（App.onLaunch 调用）
  init: function () {
    this.getSettings();
    if (!rawGet(KEY.STREAK)) rawSet(KEY.STREAK, { days: 0, lastStudyDate: '' });
  },

  // ===== 连续学习天数 streak =====
  // 每完成一天学习调用一次（progress.report 成功后调用）；同一天重复调用不叠加
  recordStudyDay: function () {
    var s = rawGet(KEY.STREAK, { days: 0, lastStudyDate: '' });
    var today = dateStr();
    if (s.lastStudyDate === today) return s.days;
    var yesterday = dateStr(Date.now() - 86400000);
    s.days = (s.lastStudyDate === yesterday) ? s.days + 1 : 1;
    s.lastStudyDate = today;
    rawSet(KEY.STREAK, s);
    return s.days;
  },
  getStreak: function () {
    return rawGet(KEY.STREAK, { days: 0, lastStudyDate: '' }).days;
  },
  // 距上次学习间隔天数
  getDaysSinceLastStudy: function () {
    var s = rawGet(KEY.STREAK, { days: 0, lastStudyDate: '' });
    if (!s.lastStudyDate) return 0;
    var lastTs = dayStart(s.lastStudyDate);
    var todayTs = dayStart(dateStr());
    return Math.max(0, Math.floor((todayTs - lastTs) / 86400000));
  },
  // 今天是否学过（progress 页「今日已学习」标识用）
  studiedToday: function () {
    return rawGet(KEY.STREAK, { days: 0, lastStudyDate: '' }).lastStudyDate === dateStr();
  },

  // ===== 设置项 =====
  getSettings: function () {
    var s = rawGet(KEY.SETTINGS, null) || {};
    // 合并默认值，新增设置项时已有存储自动补齐
    var merged = {};
    for (var k in DEFAULT_SETTINGS) merged[k] = (k in s) ? s[k] : DEFAULT_SETTINGS[k];
    rawSet(KEY.SETTINGS, merged);
    return merged;
  },
  saveSetting: function (key, value) {
    var s = this.getSettings();
    s[key] = value;
    rawSet(KEY.SETTINGS, s);
    return s;
  },

  // ===== 断点续学 =====
  // state 例：{ page: 'learn', stage: 'TEACH', charIndex: 2, charList: [...], date: 'YYYY-MM-DD' }
  saveResume: function (state) {
    state.savedAt = Date.now();
    rawSet(KEY.RESUME, state);
  },
  getResume: function () {
    return rawGet(KEY.RESUME, null);
  },
  clearResume: function () {
    rawSet(KEY.RESUME, null);
  },

  _dateStr: dateStr,
  // 内部裸读写（course.js 缓存课程包 manifest 等自有 key 用；业务代码请用上面的语义接口）
  _rawGet: rawGet,
  _rawSet: rawSet
};

module.exports = storage;
