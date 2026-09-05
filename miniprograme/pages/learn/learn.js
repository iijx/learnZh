// pages/learn/learn.js —— 学习页逻辑
// 适老化新字教学：TEACH 拆成「认一认 → 看意思 → 写一写」三个子步骤。
// 「认一认」自动播字音后让用户在底部选「认识 / 不认识」：
// 认识直接学下一个字（跳过讲解和写字）；不认识则展开字义解读，再进「写一写」。
// 每个字 6 条音频：字音、组词×3、例句、讲解——「看意思」里每条配独立播放按钮，点哪个播哪个。
// 「写一写」是独立页面（pages/write），写好后自动回到这里进入下一个字。
// 新字按组学习：一组 5 个字，学完一组可接着学下一组（没有每日字数限制）。

var tts = require('../../services/tts.js');
var storage = require('../../services/storage.js');
var course = require('../../services/course.js');

var STAGE = { TEACH: 'TEACH', DONE: 'DONE' };
var IMG_FALLBACK = '/assets/img/placeholder.svg';

Page({
  data: {
    stage: STAGE.TEACH,
    fontClass: 'font-large',
    packLoading: true,   // 课程包加载中（首次启动需联网拉取）
    packError: false,    // 课程包加载失败（展示重试入口）

    // TEACH 状态数据
    teachChar: '',
    teachCharPinyin: '',
    explain: '',
    mnemonic: '',
    words: [],
    sentence: '',
    imgSrc: '',
    charIndex: 0,
    charTotal: 0,
    isLastChar: false,
    hasStroke: false,
    teachStep: 0,        // TEACH 子步骤：0 认一认 / 1 看意思（写一写走独立页面）

    // 逐条音频点播（每条音频一个 key，页面按 has 显隐播放按钮）
    wordList: [],        // [{ text, key, has }] 组词 3 条
    charKey: '',         // 字音 key（即字本身）
    hasCharAudio: false,
    explainKey: '',
    explainText: '',     // explain 音频对应文本（占位估算时长用）
    hasExplainAudio: false,
    sentenceKey: '',
    hasSentenceAudio: false,
    playingKey: '',      // 正在播放的音频 key（播放中按钮高亮）

    // DONE 状态数据
    learnedCount: 0,
    doneBtnText: '回到首页',
    milestoneTitle: ''
  },

  onLoad: function () {
    this.timers = [];
    this.newChars = [];
    this._charList = null;

    var settings = storage.getSettings();
    this.setData({
      fontClass: settings.fontSize === 'xl' ? 'font-xl' : 'font-large',
      packLoading: true,
      packError: false
    });

    this._loadPack();
  },

  // 课程包加载守卫：读字表前必须就绪；首次启动无缓存时联网拉取，失败给大字重试
  _loadPack: function () {
    var self = this;
    this.setData({ packLoading: true, packError: false });
    course.ready().then(function (ok) {
      if (!ok) {
        self.setData({ packLoading: false, packError: true });
        return;
      }
      self.setData({ packLoading: false });
      self._startLesson();
    });
  },

  onRetryPack: function () {
    course.retry();
    this._loadPack();
  },

  _startLesson: function () {
    this._unlockedBefore = course.getMilestones().unlocked.length;

    // 断点续学
    var r = storage.getResume();
    var today = storage._dateStr();
    if (r && r.page === 'learn' && r.date === today && r.stage === STAGE.TEACH) {
      // 断点续学保留到「第几个字」，但子步骤强制回到「认一认」（认识/不认识）重新开始
      this._enterTeach(r.charIndex || 0, r.charList);
      return;
    }

    // 隔天旧断点：语音告知后清除，从头开始今天的课
    var startDelay = 0;
    if (r && r.page === 'learn' && r.date !== today) {
      startDelay = tts.speak('昨天的课没学完，今天我们重新开始') || 0;
      storage.clearResume();
    }

    var self = this;
    var begin = function () {
      self._enterTeach(0);
    };
    // 有隔天提示时，等提示播完再进入第一阶段，避免播报互相打断
    if (startDelay > 0) {
      this._delay(begin, startDelay + 300);
    } else {
      begin();
    }
  },

  onReady: function () {
    this.speaker = this.selectComponent('#speaker');
  },

  onUnload: function () {
    this._clearTimers();
    tts.stop();
  },

  onImgError: function () {
    if (this.data.imgSrc !== IMG_FALLBACK) {
      this.setData({ imgSrc: IMG_FALLBACK });
    }
  },

  _delay: function (fn, ms) {
    var self = this;
    var t = setTimeout(function () {
      var i = self.timers.indexOf(t);
      if (i > -1) self.timers.splice(i, 1);
      fn();
    }, ms);
    this.timers.push(t);
    return t;
  },

  _clearTimers: function () {
    (this.timers || []).forEach(function (t) { clearTimeout(t); });
    this.timers = [];
  },

  _saveResume: function () {
    storage.saveResume({
      page: 'learn',
      stage: this.data.stage,
      charIndex: this.data.charIndex,
      charList: this._charList,
      date: storage._dateStr()
    });
  },

  // ===== TEACH 新字教学阶段 =====
  _enterTeach: function (charIndex, charList, teachStep) {
    if (charList && charList.length) {
      this._charList = charList;
      this.newChars = charList.map(function (ch) { return course.getChar(ch); })
        .filter(function (c) { return !!c; });
    } else {
      this.newChars = course.getNewCharsGroup();
      this._charList = this.newChars.map(function (c) { return c.char; });
    }
    if (!this.newChars.length) {
      this._finish();
      return;
    }
    this.setData({
      stage: STAGE.TEACH,
      charTotal: this.newChars.length
    });
    this._startChar(charIndex || 0, teachStep);
  },

  _startChar: function (charIndex, teachStep) {
    var info = this.newChars[charIndex];
    this._charInfo = info;
    this._charIndex = charIndex;
    var hasStroke = course.hasStroke(info.char);
    var ch = info.char;

    // 每个字 6 条音频：字音 <字>、组词 word_<字>_0/1/2、例句 sentence_<字>、讲解 explain_<字>
    var wordList = (info.words || []).slice(0, 3).map(function (w, i) {
      var key = 'word_' + ch + '_' + i;
      return { text: w, key: key, has: tts.hasAudio(key) };
    });

    this.setData({
      teachChar: ch,
      teachCharPinyin: info.pinyin || '',
      explain: info.explain || '',
      mnemonic: info.mnemonic || '',
      words: (info.words || []).slice(0, 3),
      sentence: info.sentence || '',
      imgSrc: '/assets/img/placeholder-' + ch + '.svg',
      charIndex: charIndex,
      charTotal: this.newChars.length,
      isLastChar: charIndex === this.newChars.length - 1,
      hasStroke: hasStroke,
      teachStep: 0,

      wordList: wordList,
      charKey: ch,
      hasCharAudio: tts.hasAudio(ch),
      explainKey: 'explain_' + ch,
      explainText: '这个字念' + ch + '，' + ch + '。' + (info.explain || ''),
      hasExplainAudio: tts.hasAudio('explain_' + ch),
      sentenceKey: 'sentence_' + ch,
      hasSentenceAudio: tts.hasAudio('sentence_' + ch),
      playingKey: ''
    });

    // 每个字从「认一认」开始（断点续学也回到这一步）
    this._enterTeachStep(teachStep || 0);
  },

  // 进入 TEACH 的某个子步骤：每步播一句简短引导语（「看意思」的解读直接展开在字的下方）
  _enterTeachStep: function (step) {
    this.setData({ teachStep: step });
    this._saveResume();

    if (step === 0) {
      // 认一认：自动播字音，再引导用户在底部选「认识 / 不认识」
      tts.speakSequence([
        this.data.teachChar,
        '认识这个字吗？认识就点「认识」，不认识就点「不认识」'
      ]);
    } else if (step === 1) {
      tts.speak('看看这个字的意思');
    }
  },

  // teachStep 0：点「认识」——本会，直接学下一个字（跳过讲解和临摹）
  onTapKnow: function () {
    this.onTapNext();
  },

  // teachStep 0：点「不认识」——进入「看意思」讲解，之后照常「写一写」
  onTapUnknown: function () {
    this._enterTeachStep(1);
  },

  // teachStep 1：点「写一写」进入写字页（写好自动回来进下一个字）
  onTapToWrite: function () {
    tts.stop();
    wx.navigateTo({ url: '/pages/write/write?char=' + encodeURIComponent(this.data.teachChar) });
  },

  // 写字页「写好了」回调：标记学会并进入下一个字
  onWritingDone: function () {
    this.onTapNext();
  },

  // 点米字格 / 拼音行喇叭：播单字读音（音频 key 即字本身）
  onPlayChar: function () {
    var info = this._charInfo;
    if (!info) return;
    this._playKey(info.char, info.char);
  },

  // 通用点播：每条音频一个播放按钮，点哪个播哪个（播放中按钮高亮）
  onPlayAudio: function (e) {
    var ds = e.currentTarget.dataset;
    if (!ds || !ds.key) return;
    this._playKey(ds.key, ds.text || '');
  },

  _playKey: function (key, text) {
    var self = this;
    this.setData({ playingKey: key });
    tts.speak(text, {
      audioKey: key,
      onDone: function () {
        if (self.data.playingKey === key) self.setData({ playingKey: '' });
      }
    });
  },

  // 点击「下一个字 →」推进
  onTapNext: function () {
    tts.stop();
    this._clearTimers();
    storage.markCharLearned(this._charInfo.char);

    var nextChar = this._charIndex + 1;
    if (nextChar < this.newChars.length) {
      this._startChar(nextChar);
    } else {
      this._finish();
    }
  },

  // ===== DONE 结束表扬阶段 =====
  _finish: function () {
    storage.clearResume();
    var n = storage.getLearnedCount();
    var unlocked = course.getMilestones().unlocked;
    var newly = unlocked.slice(this._unlockedBefore);
    var milestone = newly.length ? newly[newly.length - 1] : null;
    this._milestone = milestone;

    this.setData({
      stage: STAGE.DONE,
      learnedCount: n,
      doneBtnText: milestone ? '去看看新解锁的课' : '再学一组 →',
      milestoneTitle: milestone ? milestone.title : ''
    });
    tts.speak('这一组学完啦！你真棒！你已经认识' + n + '个字了！');
  },

  // DONE 主按钮：有新解锁去里程碑页，否则接着学下一组
  onDoneBtn: function () {
    if (this._milestone) {
      // 里程碑（古诗/故事）是普通页，直接跳转
      wx.redirectTo({ url: '/pages/milestone/milestone' });
    } else {
      this.onLearnMore();
    }
  },

  // 再学一组：取下一组 5 个新字，重新进入 TEACH；字表学完则语音提示
  onLearnMore: function () {
    var group = course.getNewCharsGroup();
    if (!group.length) {
      tts.speak('字表里的字都学完啦，你真了不起！');
      return;
    }
    this._unlockedBefore = course.getMilestones().unlocked.length;
    this._milestone = null;
    this._enterTeach(0);
  },

  // DONE 次按钮：回到首页
  onTapHome: function () {
    wx.navigateBack();
  }
});
