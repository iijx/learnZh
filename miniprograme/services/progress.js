// services/progress.js —— 学习进度（服务端为准，learnzh-api）
//
// 规则（服务端 learnzh-api 的 scheduler 实现）：
//   每组 5 个 = 3 复习 + 2 新；一个字连续认识 5 次毕业（mastered），
//   复习在第 2/3/4/7 天，中途"不认识"清零重来；当天出现过的字当天不再出现。
//
// 本模块只做三件事：出组、上报、进度汇总缓存。
// 汇总缓存（lz_progress_summary）供首页/我的页同步展示，每次刷新后覆盖；
// 弱网时展示上次缓存值，恢复后以服务端为准。
var api = require('./api.js');

var SUMMARY_KEY = 'lz_progress_summary';

var DEFAULT_SUMMARY = {
  masteredCount: 0,   // 完全认识（连续 5 次毕业）
  learningCount: 0,   // 巩固中（学过未毕业）
  totalLearned: 0     // 学过的字总数（里程碑解锁按它算）
};

function hasWx() {
  return typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function';
}

var progress = {
  // 同步读缓存汇总（页面渲染用；首启无缓存时为 0）
  getSummary: function () {
    if (!hasWx()) return DEFAULT_SUMMARY;
    var v = wx.getStorageSync(SUMMARY_KEY);
    return (v && typeof v === 'object') ? v : DEFAULT_SUMMARY;
  },

  // 联网拉最新汇总并刷新缓存；失败保留旧缓存，resolve(null)
  refresh: function () {
    return api.request('GET', '/api/progress').then(function (data) {
      var summary = {
        masteredCount: data.masteredCount || 0,
        learningCount: data.learningCount || 0,
        totalLearned: data.totalLearned || 0
      };
      if (hasWx()) wx.setStorageSync(SUMMARY_KEY, summary);
      return summary;
    }).catch(function () {
      return null;
    });
  },

  // 今日学习组：[{ char, isReview, streak }]。失败 reject，页面展示重试。
  getNextGroup: function () {
    return api.request('GET', '/api/group/next').then(function (data) {
      return (data && data.group) || [];
    });
  },

  // 上报某字结果。后台静默刷新汇总缓存；失败仅记日志（该字服务端未记录，之后自然再出现）。
  report: function (ch, known) {
    var self = this;
    return api.request('POST', '/api/report', { char: ch, known: !!known })
      .then(function (data) {
        self.refresh();
        return data;
      })
      .catch(function (err) {
        console.warn('[progress] 上报失败：', ch, err && err.message);
        return null;
      });
  }
};

module.exports = progress;
