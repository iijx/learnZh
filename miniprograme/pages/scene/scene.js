// pages/scene/scene.js —— 场景课页（列表态 + 课内找字 + 过关表扬，同页切换 view）
// 解锁判定走 services/course.js：每学满 25 字解锁一节。
// 已过关的课记录到 storage（key: lz_scene_passed），允许重复玩。

var storage = require('../../services/storage.js');
var course = require('../../services/course.js');

var PASSED_KEY = 'lz_scene_passed'; // { sceneId: true, ... }

Page({
  data: {
    fontClass: 'font-large',
    view: 'list',        // list | lesson | done
    learnedCount: 0,
    scenes: [],          // 列表态：{ id, title, unlocked, need }
    lesson: null,        // 课内态：{ id, title, image, cards: [{ char, found }] }
    goal: 0,             // 过关需找到的字数：min(3, 目标字数)
    foundCount: 0,
    targetChar: '',      // 当前要找的字
    targetSeq: []        // 找字顺序（目标字列表）
  },

  onLoad: function (options) {
    // 支持从进度页带 id 直接进入某节课
    this._openId = options && options.id ? Number(options.id) : 0;
  },

  onShow: function () {
    this.setData({
      fontClass: storage.getSettings().fontSize === 'xl' ? 'font-xl' : 'font-large'
    });
    this._buildList();
    // 从「我的」页跳转进来：switchTab 不能带参数，用 storage 传递待打开的课
    var pending = 0;
    try { pending = wx.getStorageSync('lz_pending_scene') || 0; } catch (e) {}
    if (pending) {
      try { wx.removeStorageSync('lz_pending_scene'); } catch (e) {}
      this._tryOpen(Number(pending));
    }
  },

  onReady: function () {
    this.speaker = this.selectComponent('#speaker');
    if (this._openId) {
      var id = this._openId;
      this._openId = 0;
      this._tryOpen(id);
    } else if (this.data.view !== 'lesson') {
      // 已从 pending 课直接进入课内态时，不再播列表引导语
      this.speaker.speak('场景课。点一节课，找一找你认识的字。');
    }
  },

  // ---------- 列表态 ----------

  _buildList: function () {
    var n = storage.getLearnedCount();
    var passed = wx.getStorageSync(PASSED_KEY) || {};
    var list = course.loadScenes().map(function (s) {
      var unlocked = n >= s.unlockAt;
      return {
        id: s.id,
        title: s.title,
        unlocked: unlocked,
        need: unlocked ? 0 : s.unlockAt - n,
        passed: !!passed[s.id]
      };
    });
    this.setData({ learnedCount: n, scenes: list });
  },

  onTapScene: function (e) {
    var id = Number(e.currentTarget.dataset.id);
    var item = null;
    for (var i = 0; i < this.data.scenes.length; i++) {
      if (this.data.scenes[i].id === id) item = this.data.scenes[i];
    }
    if (!item) return;
    if (!item.unlocked) {
      this.speaker.speak('再学 ' + item.need + ' 个字就能上这节课啦');
      return;
    }
    this._startLesson(id);
  },

  _tryOpen: function (id) {
    var n = storage.getLearnedCount();
    var list = course.loadScenes();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        if (n >= list[i].unlockAt) this._startLesson(id);
        else this.speaker.speak('这节课还没解锁，先点别的课吧');
        return;
      }
    }
  },

  // ---------- 课内态 ----------

  _startLesson: function (id) {
    var scenes = course.loadScenes();
    var scene = null;
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].id === id) scene = scenes[i];
    }
    if (!scene) return;

    // 目标字：数据里 items 为空（占位课）时，用最近学过的字兜底，保证可玩
    var items = scene.items && scene.items.length ? scene.items : this._fallbackItems();
    var cards = items.slice(0, 4).map(function (it) {
      return { char: it.char, found: false };
    });
    var goal = Math.min(3, cards.length);
    var seq = cards.map(function (c) { return c.char; });

    this.setData({
      view: 'lesson',
      lesson: { id: scene.id, title: scene.title, image: scene.image, cards: cards },
      goal: goal,
      foundCount: 0,
      targetSeq: seq,
      targetChar: seq[0]
    });
    this._speakTarget();
  },

  // 占位课兜底目标字：最近学过的 4 个字（不够则取字表前 4 个）
  _fallbackItems: function () {
    var learned = storage.getLearnedChars();
    var pick = learned.slice(-4);
    if (pick.length < 4) {
      var chars = course.loadChars();
      for (var i = 0; i < chars.length && pick.length < 4; i++) {
        if (pick.indexOf(chars[i].char) === -1) pick.push(chars[i].char);
      }
    }
    return pick.map(function (ch) { return { char: ch }; });
  },

  _speakTarget: function () {
    this.speaker.speak('找一找，你认识的「' + this.data.targetChar + '」在哪里');
  },

  onTapCard: function (e) {
    if (this.data.view !== 'lesson') return;
    var ch = e.currentTarget.dataset.char;
    var cards = this.data.lesson.cards;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].char === ch && cards[i].found) return; // 已找过，不重复计
    }
    if (ch === this.data.targetChar) {
      // 点对：变墨绿 + 表扬，再播下一个目标
      var newCards = cards.map(function (c) {
        return c.char === ch ? { char: c.char, found: true } : c;
      });
      var foundCount = this.data.foundCount + 1;
      this.setData({ 'lesson.cards': newCards, foundCount: foundCount });
      var self = this;
      this.speaker.speak('对啦！这是 ' + ch, {
        onDone: function () {
          if (foundCount >= self.data.goal) {
            self._finishLesson();
          } else {
            self.setData({ targetChar: self.data.targetSeq[foundCount] });
            self._speakTarget();
          }
        }
      });
    } else {
      // 点错：不打叉，温和提示重找
      this.speaker.speak('不是这个哦，再找找「' + this.data.targetChar + '」');
    }
  },

  _finishLesson: function () {
    // 记录过关（防重复播报简化为允许重复玩，再次过关会覆盖同一记录）
    var passed = wx.getStorageSync(PASSED_KEY) || {};
    passed[this.data.lesson.id] = true;
    wx.setStorageSync(PASSED_KEY, passed);
    this.setData({ view: 'done' });
    this.speaker.speak('你真棒！这节课的字你全找对啦！');
  },

  backToList: function () {
    this.setData({ view: 'list' });
    this._buildList();
  },

  goHome: function () {
    // 本页是 tab 页，返回首页用 switchTab
    wx.switchTab({ url: '/pages/home/home' });
  }
});
