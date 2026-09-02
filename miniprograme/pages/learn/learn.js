// pages/learn/learn.js —— 学习页逻辑
// 适老化全景新字教学：TEACH 拆成「认一认 → 看意思 → 写一写」三个子步骤（teachStep 0/1/2），
// 一屏一个动作。「认一认」自动播字音后让用户选「认识 / 不认识」：
// 认识直接学下一个字（跳过讲解和临摹），不认识才进入「看意思 → 写一写」完整教学。

var tts = require('../../services/tts.js');
var storage = require('../../services/storage.js');
var review = require('../../services/review.js');
var course = require('../../services/course.js');
var strokesIndex = require('../../data/strokes/index.js');

var STAGE = { REVIEW: 'REVIEW', TEACH: 'TEACH', DONE: 'DONE' };
var IMG_FALLBACK = '/assets/img/placeholder.svg';

function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

function buildOptions(answer) {
  var learnedTotal = storage.getLearnedCount();
  var targetCount = learnedTotal < 15 ? 2 : (learnedTotal < 35 ? 3 : 4);
  var distractCount = targetCount - 1;

  var picked = {};
  picked[answer] = true;
  var distract = [];
  var learned = shuffle(storage.getLearnedChars().filter(function (c) { return c !== answer; }));
  for (var i = 0; i < learned.length && distract.length < distractCount; i++) {
    distract.push(learned[i]); picked[learned[i]] = true;
  }
  if (distract.length < distractCount) {
    var front = course.loadChars().slice(0, 40);
    for (var k = 0; k < front.length && distract.length < distractCount; k++) {
      var c = front[k].char;
      if (!picked[c]) { distract.push(c); picked[c] = true; }
    }
  }
  return shuffle(distract.concat([answer]));
}

Page({
  data: {
    stage: STAGE.TEACH,
    fontClass: 'font-large',
    writeExam: false,

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
    isWritingOpen: false,
    teachStep: 0,        // TEACH 子步骤：0 认一认 / 1 看意思 / 2 写一写
    traceDone: false,    // 当前字描红是否已完成
    writeOpened: false,  // 当前字是否打开过描红弹层（决定「开始临摹」还是「再描一遍」）
    showExitConfirm: false, // 描红弹层退出确认条

    // REVIEW 状态数据
    reviewOptions: [],
    reviewAnswer: '',
    reviewIndex: 0,
    reviewTotal: 0,

    // DONE 状态数据
    learnedCount: 0,
    doneBtnText: '回到首页',
    milestoneTitle: ''
  },

  onLoad: function () {
    this.timers = [];
    this._reviewIndex = 0;
    var settings = storage.getSettings();
    this._unlockedBefore = course.getMilestones().unlocked.length;
    this.reviewList = review.getTodayReview();
    this.newChars = [];
    this._charList = null;

    this.setData({
      fontClass: settings.fontSize === 'xl' ? 'font-xl' : 'font-large',
      writeExam: !!settings.writingExam
    });

    // 断点续学
    var r = storage.getResume();
    var today = storage._dateStr();
    if (r && r.page === 'learn' && r.date === today) {
      if (r.stage === STAGE.REVIEW) {
        this._enterReview(r.reviewIndex || 0);
        return;
      }
      if (r.stage === STAGE.TEACH) {
        this._enterTeach(r.charIndex || 0, r.charList, r.teachStep || 0);
        return;
      }
    }

    // 隔天旧断点：语音告知后清除，从头开始今天的课
    var startDelay = 0;
    if (r && r.page === 'learn' && r.date !== today) {
      startDelay = tts.speak('昨天的课没学完，今天我们重新开始') || 0;
      storage.clearResume();
    }

    var self = this;
    var begin = function () {
      if (self.reviewList && self.reviewList.length) {
        self._enterReview(0);
      } else {
        self._enterTeach(0);
      }
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

  onPreventBubble: function () {
    // 阻止弹窗事件冒泡关闭
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
      reviewIndex: this._reviewIndex,
      charList: this._charList,
      teachStep: this.data.teachStep,
      date: storage._dateStr()
    });
  },

  // ===== REVIEW 阶段 =====
  _enterReview: function (fromIndex) {
    if (!this.reviewList || !this.reviewList.length) {
      this._enterTeach(0);
      return;
    }
    this.setData({
      stage: STAGE.REVIEW,
      reviewTotal: this.reviewList.length
    });
    // 首次进入复习：若队列里有之前答错重排的字，先播一句安抚提示（每次进页面只播一次）
    if (!fromIndex && !this._wrongAnnounced) {
      this._wrongAnnounced = true;
      var map = storage.getLearnedMap();
      var wrongCount = this.reviewList.filter(function (ch) {
        return map[ch] && map[ch].wrongAt;
      }).length;
      if (wrongCount > 0) {
        var self = this;
        tts.speak('今天先复习之前没记住的' + wrongCount + '个字，没关系，我们再练一次', {
          onDone: function () { self._showReviewQuestion(0); }
        });
        return;
      }
    }
    this._showReviewQuestion(fromIndex || 0);
  },

  _showReviewQuestion: function (i) {
    var self = this;
    var ch = this.reviewList[i];
    this._reviewIndex = i;
    this.setData({
      reviewIndex: i,
      reviewAnswer: ch,
      reviewOptions: buildOptions(ch)
    }, function () {
      self._saveResume();
      var card = self.selectComponent('#reviewCard');
      if (card) card.start();
    });
  },

  onReviewCorrect: function () {
    if (this.data.stage !== STAGE.REVIEW) return;
    var self = this;
    review.markReviewResult(this.reviewList[this._reviewIndex], true);
    var next = self._reviewIndex + 1;
    tts.speak('答对啦！');
    this._delay(function () {
      if (next < self.reviewList.length) {
        self._showReviewQuestion(next);
      } else {
        self._enterTeach(0);
      }
    }, 1200);
  },

  onReviewWrong: function () {
    if (this.data.stage !== STAGE.REVIEW) return;
    review.rescheduleWrong(this.reviewList[this._reviewIndex]);
  },

  // ===== TEACH 新字教学阶段 =====
  _enterTeach: function (charIndex, charList, teachStep) {
    if (charList && charList.length) {
      this._charList = charList;
      this.newChars = charList.map(function (ch) { return course.getChar(ch); })
        .filter(function (c) { return !!c; });
    } else {
      this.newChars = course.getTodayNewChars();
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
    var hasStroke = !!(info.hasStroke && strokesIndex.hasChar(info.char));

    this.setData({
      teachChar: info.char,
      teachCharPinyin: info.pinyin || '',
      explain: info.explain || '',
      mnemonic: info.mnemonic || '',
      words: (info.words || []).slice(0, 3),
      sentence: info.sentence || '',
      imgSrc: '/assets/img/placeholder-' + info.char + '.svg',
      charIndex: charIndex,
      charTotal: this.newChars.length,
      isLastChar: charIndex === this.newChars.length - 1,
      hasStroke: hasStroke,
      isWritingOpen: false,
      teachStep: 0,
      traceDone: false,
      writeOpened: false,
      showExitConfirm: false
    });

    // 每个字从「认一认」开始（断点续学可恢复到指定子步骤）
    this._enterTeachStep(teachStep || 0);
  },

  // 进入 TEACH 的某个子步骤：一屏一个动作，每步播一句简短引导语
  _enterTeachStep: function (step) {
    var self = this;
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
    } else if (step === 2) {
      if (this.data.hasStroke) {
        // 写一写：自动打开描红弹层，引导语由 openWritingModal 播报
        this._delay(function () {
          self.openWritingModal();
        }, 600);
      } else {
        // 无笔顺数据的字不安排描红，直接可去下一个字
        tts.speak('这个字不用写，点下面的按钮，学下一个字');
      }
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

  // teachStep 1 → 2：写一写
  onTapToWrite: function () {
    this._enterTeachStep(2);
  },

  // 播放当前字的发音及字义解读
  onPlayVoice: function () {
    var info = this._charInfo;
    if (!info) return;
    var text = '这个字念' + info.char + '，' + info.char + '。' + info.explain;
    tts.speak(text, {
      audioKey: info.char
    });
  },

  // 打开临摹练字浮层
  openWritingModal: function () {
    var self = this;
    this.setData({ isWritingOpen: true, writeOpened: true, showExitConfirm: false });
    tts.speak('跟着金色的点，把字描一遍');
    this._delay(function () {
      var tracer = self.selectComponent('#tracer');
      if (tracer) {
        if (self.data.hasStroke) {
          tracer.playStrokes(function () {
            tracer.startTrace();
          });
        } else {
          tracer.startTrace();
        }
      }
    }, 300);
  },

  // 播放笔顺动画
  playStrokesAnimation: function () {
    var tracer = this.selectComponent('#tracer');
    if (tracer) {
      tracer.playStrokes();
    }
  },

  // 点「× 退出」：已有笔迹先弹确认条，无笔迹直接关闭
  onTapExitWriting: function () {
    var tracer = this.selectComponent('#tracer');
    var traced = !!(tracer && tracer.hasTrace && tracer.hasTrace());
    if (traced && !this.data.traceDone) {
      this.setData({ showExitConfirm: true });
      tts.speak('还没描完，要退出吗？');
    } else {
      this.closeWritingModal();
    }
  },

  // 退出确认条：继续描（主按钮）
  onTapContinueTrace: function () {
    this.setData({ showExitConfirm: false });
  },

  // 退出确认条：确认退出（次按钮）
  onTapConfirmExit: function () {
    this.closeWritingModal();
  },

  // 关闭临摹练字浮层（仅内部/确认后调用）
  closeWritingModal: function () {
    this.setData({ isWritingOpen: false, showExitConfirm: false });
    this._saveResume();
  },

  // 描红完成：播报鼓励，稍停让用户看一眼成果后自动关弹层
  onTracePass: function () {
    var self = this;
    tts.speak('写得真好！');
    this.setData({ traceDone: true });
    this._delay(function () {
      self.closeWritingModal();
    }, 1200);
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
      doneBtnText: milestone ? '去看看新解锁的课' : '回到首页',
      milestoneTitle: milestone ? milestone.title : ''
    });
    tts.speak('今天学完啦！你真棒！你已经认识' + n + '个字了！');
  },

  onDoneBtn: function () {
    if (this._milestone) {
      // 场景课是 tab 页，只能 switchTab；古诗/故事仍是普通页
      if (this._milestone.type === 'scene') {
        wx.switchTab({ url: '/pages/scene/scene' });
      } else {
        wx.redirectTo({ url: '/pages/milestone/milestone' });
      }
    } else {
      wx.navigateBack();
    }
  }
});
