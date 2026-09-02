// services/course.js —— 课程包加载与里程碑解锁判定
// 课程内容全部来自 data/ 目录（本地课程包）。
//
// 【未来替换为服务端 REST API / CDN 课程包】
// 课程包改为自有 CDN 托管（JSON + 音频 + 图片），启动时拉取并本地缓存：
//   loadChars / loadPoems / loadStories -> GET {CDN}/course/v1/<type>.json
// 里程碑解锁规则不变，仍按已学字数在本地判定（已学字数来自服务端进度）。

var storage = require('./storage.js');

var _chars = null;
var _poems = null;
var _stories = null;

function loadChars() {
  if (!_chars) _chars = require('../data/chars.js');
  return _chars;
}
function loadPoems() {
  if (!_poems) _poems = require('../data/poems.js');
  return _poems;
}
function loadStories() {
  if (!_stories) _stories = require('../data/stories.js');
  return _stories;
}

var course = {
  loadChars: loadChars,
  loadPoems: loadPoems,
  loadStories: loadStories,

  // 取某个字的完整课程条目
  getChar: function (ch) {
    var list = loadChars();
    for (var i = 0; i < list.length; i++) {
      if (list[i].char === ch) return list[i];
    }
    return null;
  },

  // 下一组新字：每组固定 5 个，从字表前部跳过已学字选取；学完一组接着下一组
  getNewCharsGroup: function () {
    var GROUP_SIZE = 5;
    var learned = {};
    storage.getLearnedChars().forEach(function (c) { learned[c] = true; });
    var result = [];
    var list = loadChars();
    for (var i = 0; i < list.length && result.length < GROUP_SIZE; i++) {
      if (!learned[list[i].char]) result.push(list[i]);
    }
    return result;
  },

  // ===== 里程碑解锁判定（按已学字数）=====
  // 每 50 字解锁一首古诗、每 100 字一篇故事（数据里带 unlockAt）
  getUnlockedPoems: function () {
    var n = storage.getLearnedCount();
    return loadPoems().filter(function (p) { return n >= p.unlockAt; });
  },
  getUnlockedStories: function () {
    var n = storage.getLearnedCount();
    return loadStories().filter(function (s) { return n >= s.unlockAt; });
  },

  // 汇总：已解锁的里程碑课 + 下一个待解锁里程碑（进度页/首页展示用）
  getMilestones: function () {
    var n = storage.getLearnedCount();
    var all = [];
    loadPoems().forEach(function (p) { all.push({ type: 'poem', title: p.title, unlockAt: p.unlockAt }); });
    loadStories().forEach(function (s) { all.push({ type: 'story', title: s.title, unlockAt: s.unlockAt }); });
    all.sort(function (a, b) { return a.unlockAt - b.unlockAt; });
    var next = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].unlockAt > n) { next = all[i]; break; }
    }
    return {
      learnedCount: n,
      unlocked: all.filter(function (m) { return m.unlockAt <= n; }),
      next: next
    };
  }
};

module.exports = course;
