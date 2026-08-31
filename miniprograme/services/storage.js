// services/storage.js —— 本地存储层
// 职责：openid（模拟）、学习进度、连续学习天数、设置项、错字本、断点续学状态
//
// 【未来替换为服务端 REST API】
// 本文件所有读写目前落在 wx.setStorageSync / wx.getStorageSync（node 环境降级为内存），
// 上线后按 openid 存服务端数据库，接口一一对应：
//   init            -> POST /api/login        （code 换 openid + 拉取用户档案）
//   markCharLearned -> POST /api/progress     （同步已学字与 learnDate）
//   recordStudyDay  -> POST /api/streak
//   getSettings/saveSetting -> GET/PUT /api/settings
//   addWrongChar 等 -> POST/DELETE /api/wrong-chars
//   saveResume 等   -> PUT/GET /api/resume
// 函数签名保持不变即可平替。

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

// 设置项默认值（PRD 3.10）
var DEFAULT_SETTINGS = {
  dailyNewChars: 5,      // 每日新字数：1 / 3 / 5
  writingExam: false,    // 书写考核：默认关
  fontSize: 'large',     // 字号：'large' 大 / 'xl' 特大
  speechRate: 'slow'     // 语速：'slow' 慢 / 'normal' 正常
};

var KEY = {
  OPENID: 'lz_openid',
  LEARNED: 'lz_learned',       // { 字: { learnDate: 'YYYY-MM-DD', reviewStage: 0, wrongAt: 0 } }
  STREAK: 'lz_streak',         // { days: 连续天数, lastStudyDate: 'YYYY-MM-DD' }
  SETTINGS: 'lz_settings',
  WRONG: 'lz_wrong',           // [字, ...] 错字本
  RESUME: 'lz_resume'          // 断点续学状态
};

var storage = {
  // 初始化：确保 openid、设置、进度结构存在（App.onLaunch 调用）
  init: function () {
    this.getOpenid();
    this.getSettings();
    if (!rawGet(KEY.LEARNED)) rawSet(KEY.LEARNED, {});
    if (!rawGet(KEY.STREAK)) rawSet(KEY.STREAK, { days: 0, lastStudyDate: '' });
    if (!rawGet(KEY.WRONG)) rawSet(KEY.WRONG, []);
  },

  // ===== openid（模拟）=====
  // 本地生成随机 id 并缓存；【未来替换为服务端 REST API】wx.login code 换真实 openid
  getOpenid: function () {
    var id = rawGet(KEY.OPENID, '');
    if (!id) {
      id = 'mock_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      rawSet(KEY.OPENID, id);
    }
    return id;
  },

  // ===== 学习进度（已学字列表 + learnDate）=====
  // 返回 { 字: { learnDate, reviewStage, wrongAt } }
  getLearnedMap: function () {
    return rawGet(KEY.LEARNED, {});
  },
  // 已学字列表
  getLearnedChars: function () {
    return Object.keys(this.getLearnedMap());
  },
  // 已学字数
  getLearnedCount: function () {
    return this.getLearnedChars().length;
  },
  // 标记一个字为已学（学完教学闭环时调用）
  markCharLearned: function (ch) {
    var map = this.getLearnedMap();
    if (!map[ch]) {
      map[ch] = { learnDate: dateStr(), reviewStage: 0, wrongAt: 0 };
      rawSet(KEY.LEARNED, map);
      this.recordStudyDay();
    }
  },
  // 更新某个字的复习字段（review.js 排期用）
  updateLearnedChar: function (ch, patch) {
    var map = this.getLearnedMap();
    if (!map[ch]) return;
    for (var k in patch) map[ch][k] = patch[k];
    rawSet(KEY.LEARNED, map);
  },

  // ===== 连续学习天数 streak =====
  // 每完成一天学习调用一次；同一天重复调用不叠加
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

  // ===== 设置项 =====
  getSettings: function () {
    var s = rawGet(KEY.SETTINGS, null) || {};
    // 合并默认值，保证新增设置项老数据也有值
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

  // ===== 错字本 =====
  getWrongChars: function () {
    return rawGet(KEY.WRONG, []);
  },
  addWrongChar: function (ch) {
    var list = this.getWrongChars();
    if (list.indexOf(ch) === -1) {
      list.push(ch);
      rawSet(KEY.WRONG, list);
    }
  },
  removeWrongChar: function (ch) {
    var list = this.getWrongChars().filter(function (c) { return c !== ch; });
    rawSet(KEY.WRONG, list);
  },

  // ===== 断点续学 =====
  // state 例：{ page: 'learn', phase: 'new', charIndex: 2, step: 4, savedAt: 时间戳 }
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

  _dateStr: dateStr
};

module.exports = storage;
