// services/course.js —— 课程包加载与里程碑解锁判定
//
// 内容来源：
//   字表（chars）——线上课程包（CDN，地址见 services/course-config.js），
//     启动时拉 manifest.json 比对 contentVersion，差异包下载到本地文件缓存；
//     首次启动无缓存时必须联网，之后离线可用。不内置任何课程包。
//   笔顺（strokes）——manifest.strokes 列出有数据的字，getStroke 按字从 CDN 下载
//     并写入本地文件缓存（数据不可变，缓存永久有效）；无数据时描红降级为静态底字。
//   古诗/故事——仍为本地 data/（尚未上线课程包，publish 支持后切换）。
//
// 页面使用约定：所有读字表的页面必须先 await course.ready() 再调同步接口
// （loadChars / getChar），ready(false) 表示首次拉取失败，
// 页面应展示重试入口（见 pages/learn/learn.js）。
// 出组与学习进度在服务端（services/progress.js → learnzh-api）；
// 里程碑解锁按服务端汇总缓存的已学字数在本地判定。

var storage = require('./storage.js');
var progress = require('./progress.js');
var courseConfig = require('./course-config.js');

var BASE = courseConfig.BASE;
var MANIFEST_KEY = 'lz_course_manifest'; // storage 缓存的 manifest 对象
var PACK_VER_KEY = 'lz_course_pack_ver_'; // storage 记录的各包已落盘 contentVersion
var PACK_DIR = 'course';                 // USER_DATA_PATH 下的课程包目录

var _chars = [];        // 全部级别字表（按 level 顺序拼接，数组顺序即学习顺序）
var _manifest = null;   // 当前生效的 manifest
var _strokeChars = null;// manifest.strokes.chars 的 Set（有笔顺数据的字）
var _strokeMem = {};    // 笔顺内存缓存 char → data
var _strokeLoading = {};// 进行中的笔顺下载 char → Promise
var _readyPromise = null;

// ===== 本地缓存读写 =====
function hasFs() {
  return typeof wx !== 'undefined' && typeof wx.getFileSystemManager === 'function';
}

function packPath(name) {
  return wx.env.USER_DATA_PATH + '/' + PACK_DIR + '/' + name;
}

function readCachedPack(name) {
  if (!hasFs()) return null;
  try {
    return JSON.parse(wx.getFileSystemManager().readFileSync(packPath(name), 'utf8'));
  } catch (e) {
    return null;
  }
}

function writePack(name, body) {
  var fs = wx.getFileSystemManager();
  var dir = wx.env.USER_DATA_PATH + '/' + PACK_DIR;
  try { fs.mkdirSync(dir, true); } catch (e) { /* 已存在 */ }
  // name 可能含子目录（如 strokes/<字>.json），确保子目录存在
  var sub = name.lastIndexOf('/') > -1 ? dir + '/' + name.slice(0, name.lastIndexOf('/')) : null;
  if (sub) { try { fs.mkdirSync(sub, true); } catch (e) { /* 已存在 */ } }
  fs.writeFileSync(packPath(name), body, 'utf8');
}

// 从本地缓存载入全部级别字表；有任何一级缺失返回 false
function loadFromCache() {
  var m = storage._rawGet ? storage._rawGet(MANIFEST_KEY, null) : null;
  if (!m || !m.levels || !m.levels.length) return false;
  var all = [];
  for (var i = 0; i < m.levels.length; i++) {
    var pack = readCachedPack(m.levels[i].pack);
    if (!pack) return false;
    all = all.concat(pack);
  }
  setManifest(m);
  _chars = all;
  return true;
}

// manifest 生效时的派生状态
function setManifest(m) {
  _manifest = m;
  _strokeChars = {};
  ((m.strokes && m.strokes.chars) || []).forEach(function (ch) { _strokeChars[ch] = true; });
}

// ===== 网络拉取 =====
function requestJson(url) {
  return new Promise(function (resolve, reject) {
    wx.request({
      url: url,
      dataType: 'json',
      success: function (res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data) resolve(res.data);
        else reject(new Error('HTTP ' + res.statusCode));
      },
      fail: function (err) { reject(new Error((err && err.errMsg) || '网络错误')); }
    });
  });
}

// 拉 manifest，下载有变化的级别包，写入缓存并刷新内存。resolve(true/false)。
// manifest 加时间戳参数防 CDN/代理缓存旧版本（内容包按 contentVersion 变化，可缓存）。
function updateFromNetwork() {
  return requestJson(BASE + 'manifest.json?t=' + Date.now()).then(function (m) {
    var downloads = (m.levels || []).map(function (lv, i) {
      var fresh = readCachedPack(lv.pack);
      var diskVer = storage._rawGet ? storage._rawGet(PACK_VER_KEY + lv.pack, 0) : 0;
      // 缓存可信的条件：包文件存在、落盘版本与线上 contentVersion 一致；
      // 只比 manifest 不可靠——可能上次下载时就拿到了 CDN 边缘节点的旧包
      if (fresh && diskVer === lv.contentVersion) {
        return Promise.resolve({ pack: lv.pack, data: fresh });
      }
      // 包 URL 带 contentVersion 防 CDN 边缘节点缓存旧包（manifest 用 ?t=，内容包按版本寻址）
      return requestJson(BASE + lv.pack + '?v=' + lv.contentVersion).then(function (data) {
        writePack(lv.pack, JSON.stringify(data));
        if (storage._rawSet) storage._rawSet(PACK_VER_KEY + lv.pack, lv.contentVersion);
        return { pack: lv.pack, data: data };
      });
    });
    return Promise.all(downloads).then(function (packs) {
      var all = [];
      packs.forEach(function (p) { all = all.concat(p.data); });
      setManifest(m);
      _chars = all;
      if (storage._rawSet) storage._rawSet(MANIFEST_KEY, m);
      return true;
    });
  }).catch(function (e) {
    console.warn('[course] 课程包更新失败：', e && e.message);
    return false;
  });
}

var course = {
  // App.onLaunch 调用一次。有缓存：同步载入后立即 ready，后台静默更新；
  // 无缓存（首次启动）：联网拉取完成后才 ready。永不 reject。
  init: function () {
    if (_readyPromise) return _readyPromise;
    _readyPromise = new Promise(function (resolve) {
      if (loadFromCache()) {
        resolve(true);
        updateFromNetwork(); // 后台静默更新，失败不影响本次使用
        return;
      }
      updateFromNetwork().then(resolve);
    });
    return _readyPromise;
  },

  // 页面入口守卫：then(function (ok) {...})，ok=false 时展示重试入口
  ready: function () {
    return this.init();
  },

  // 首次加载失败后的重试
  retry: function () {
    _readyPromise = null;
    return this.init();
  },

  // 级别元信息（manifest.levels；首页/进度页展示级别名与进度用）
  getLevels: function () {
    return (_manifest && _manifest.levels) || [];
  },

  // ===== 字表 =====
  loadChars: function () {
    return _chars;
  },

  // 取某个字的完整课程条目
  getChar: function (ch) {
    for (var i = 0; i < _chars.length; i++) {
      if (_chars[i].char === ch) return _chars[i];
    }
    return null;
  },

  // 已学字数（服务端汇总缓存；里程碑解锁按它算）
  _learnedCount: function () {
    return progress.getSummary().totalLearned;
  },

  // ===== 笔顺（CDN，按需下载 + 本地文件缓存；数据不可变，缓存永久有效）=====
  // 同步判定某字是否有笔顺数据（依据 manifest.strokes.chars）
  hasStroke: function (ch) {
    return !!(_strokeChars && _strokeChars[ch]);
  },

  // 异步取笔顺数据 {strokes, medians}；无数据或失败 resolve(null)，永不 reject
  getStroke: function (ch) {
    if (_strokeMem[ch]) return Promise.resolve(_strokeMem[ch]);
    if (!this.hasStroke(ch)) return Promise.resolve(null);
    if (_strokeLoading[ch]) return _strokeLoading[ch];

    var name = 'strokes/' + ch + '.json';
    var cached = readCachedPack(name); // 通用文件缓存：USER_DATA_PATH/course/strokes/<字>.json
    if (cached) {
      _strokeMem[ch] = cached;
      return Promise.resolve(cached);
    }
    _strokeLoading[ch] = requestJson(BASE + 'strokes/' + encodeURIComponent(ch) + '.json')
      .then(function (data) {
        delete _strokeLoading[ch];
        if (!data || !data.strokes) return null;
        _strokeMem[ch] = data;
        try { writePack(name, JSON.stringify(data)); } catch (e) { /* 缓存失败不影响本次使用 */ }
        return data;
      })
      .catch(function () {
        delete _strokeLoading[ch];
        return null;
      });
    return _strokeLoading[ch];
  },

  // ===== 古诗/故事（本地，未上线课程包）=====
  loadPoems: function () {
    if (!this._poems) this._poems = require('../data/poems.js');
    return this._poems;
  },
  loadStories: function () {
    if (!this._stories) this._stories = require('../data/stories.js');
    return this._stories;
  },

  // ===== 里程碑解锁判定（按已学字数，进度来自服务端汇总缓存）=====
  // 每 50 字解锁一首古诗、每 100 字一篇故事（数据里带 unlockAt）
  getUnlockedPoems: function () {
    var n = this._learnedCount();
    return this.loadPoems().filter(function (p) { return n >= p.unlockAt; });
  },
  getUnlockedStories: function () {
    var n = this._learnedCount();
    return this.loadStories().filter(function (s) { return n >= s.unlockAt; });
  },

  // 汇总：已解锁的里程碑课 + 下一个待解锁里程碑（进度页/首页展示用）
  getMilestones: function () {
    var n = this._learnedCount();
    var all = [];
    this.loadPoems().forEach(function (p) { all.push({ type: 'poem', title: p.title, unlockAt: p.unlockAt }); });
    this.loadStories().forEach(function (s) { all.push({ type: 'story', title: s.title, unlockAt: s.unlockAt }); });
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
