// pages/learn/learn.js —— 学习页（PRD 3.3/3.4，状态机，核心页面）
//
// 阶段机：GREET 问候 → REVIEW 到期复习（批量听音选字）→ TEACH 逐字教学闭环 → DONE 结束表扬
// 单字闭环步骤：SHOW 大字+插画 → EXPLAIN 讲解+记字诀 → STROKES 笔顺动画×2
//   → TRACE 描红 → WORDS 组词 → SENTENCE 例句 → QUIZ 听音选字×2 → 下一字
// 除描红 / 答题停等操作外，其余步骤播完语音后显示「继续」按钮，点击手动推进（不自动跳转）。
// 断点续学：每进入新 step 记 storage.saveResume；onLoad 恢复当天位置；DONE 时清除。
// 30 秒无操作由 speaker 组件守望提醒；onUnload 统一清理定时器并停播报。

var tts = require('../../services/tts.js');
var storage = require('../../services/storage.js');
var review = require('../../services/review.js');
var course = require('../../services/course.js');
var strokesIndex = require('../../data/strokes/index.js');

var STAGE = { REVIEW: 'REVIEW', TEACH: 'TEACH', DONE: 'DONE' };
var STEP = {
  SHOW: 'SHOW', EXPLAIN: 'EXPLAIN', STROKES: 'STROKES', TRACE: 'TRACE',
  WORDS: 'WORDS', SENTENCE: 'SENTENCE', QUIZ: 'QUIZ'
};

var IMG_FALLBACK = '/assets/img/placeholder.svg';

function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// 听音选字选项：自适应 2 选 1（早期前 15 字，认知减负）/ 3 选 1（15~35 字）/ 4 选 1（35+ 字）
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
    step: '',
    fontClass: 'font-large',
    writeExam: false,
    showNext: true,   // 学习过程中「继续」按钮一直显示，点继续直接往下走
    // REVIEW
    reviewOptions: [], reviewAnswer: '', reviewIndex: 0, reviewTotal: 0,
    // TEACH
    teachChar: '', explain: '', mnemonic: '', words: [], sentence: '', imgSrc: '',
    charIndex: 0, charTotal: 0,
    quizOptions: [], quizAnswer: '', quizRound: 0,
    // DONE
    learnedCount: 0, doneBtnText: '回到首页', milestoneTitle: ''
  },

  onLoad: function () {
    this.timers = [];
    this._stepIndex = 0;
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

    // 断点续学：当天有记录则直接跳到对应位置
    var r = storage.getResume();
    if (r && r.page === 'learn' && r.date === storage._dateStr()) {
      if (r.stage === STAGE.REVIEW) {
        this._enterReview(r.reviewIndex || 0);
        return;
      }
      if (r.stage === STAGE.TEACH) {
        this._enterTeach(r.charIndex || 0, r.stepIndex || 0, r.charList);
        return;
      }
    }

    if (this.reviewList && this.reviewList.length) {
      this._enterReview(0);
    } else {
      this._enterTeach(0, 0);
    }
  },

  onReady: function () {
    // 30 秒无操作守望：speaker 自动播提示，这里再补一句页面级口播
    this.speaker = this.selectComponent('#speaker');
    if (this.speaker) {
      this.speaker.startIdleWatch(function () {
        tts.speak('点一下屏幕，我们继续');
      });
    }
  },

  onUnload: function () {
    this._clearTimers();
    tts.stop();
  },

  // 页面任意点击/触摸都重置无操作计时（事件自组件冒泡到根节点）
  onAnyTap: function () {
    if (this.speaker) this.speaker.resetIdle();
  },

  onImgError: function () {
    if (this.data.imgSrc !== IMG_FALLBACK) this.setData({ imgSrc: IMG_FALLBACK });
  },

  // ===== 定时器统一管理（防跳转后乱播 / 内存泄漏）=====
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

  // ===== 断点续学 =====
  _saveResume: function () {
    storage.saveResume({
      page: 'learn',
      stage: this.data.stage,
      charIndex: this.data.charIndex,
      stepIndex: this._stepIndex,
      reviewIndex: this._reviewIndex,
      charList: this._charList,
      date: storage._dateStr()
    });
  },

  // ===== REVIEW =====
  _enterReview: function (fromIndex) {
    if (!this.reviewList || !this.reviewList.length) {
      this._enterTeach(0, 0);
      return;
    }
    this.setData({ stage: STAGE.REVIEW, reviewTotal: this.reviewList.length, showNext: true });
    this._showReviewQuestion(fromIndex || 0);
  },

  _showReviewQuestion: function (i) {
    var self = this;
    var ch = this.reviewList[i];
    this._reviewIndex = i;
    var next = i + 1;
    this._pendingNext = function () {
      if (next < self.reviewList.length) self._showReviewQuestion(next);
      else self._enterTeach(0, 0);
    };
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
    this._pendingNext = function () {
      if (next < self.reviewList.length) self._showReviewQuestion(next);
      else self._enterTeach(0, 0);
    };
    tts.speak('答对啦！');
  },

  onReviewWrong: function () {
    if (this.data.stage !== STAGE.REVIEW) return;
    // 答错 24 小时后重排；组件已播「没关系，再听一遍」，允许再答直到对
    review.rescheduleWrong(this.reviewList[this._reviewIndex]);
  },

  // ===== TEACH =====
  _enterTeach: function (charIndex, stepIndex, charList) {
    if (charList && charList.length) {
      // 断点恢复：用当天进入学习时固定下来的新字列表，避免中途已学字导致列表漂移
      this._charList = charList;
      this.newChars = charList.map(function (ch) { return course.getChar(ch); })
        .filter(function (c) { return !!c; });
    } else {
      this.newChars = course.getTodayNewChars();
      this._charList = this.newChars.map(function (c) { return c.char; });
    }
    if (!this.newChars.length) { this._finish(); return; }
    this.setData({ stage: STAGE.TEACH, charTotal: this.newChars.length, showNext: true });
    this._startChar(charIndex || 0, stepIndex || 0);
  },

  _startChar: function (charIndex, stepIndex) {
    var info = this.newChars[charIndex];
    this._charInfo = info;
    this._charIndex = charIndex;
    // 无笔顺数据的字跳过笔顺动画步骤（描红步骤保留，静态底字照着写）
    this._hasStroke = !!(info.hasStroke && strokesIndex.hasChar(info.char));
    var steps = [STEP.SHOW, STEP.EXPLAIN];
    if (this._hasStroke) steps.push(STEP.STROKES);
    steps.push(STEP.TRACE, STEP.WORDS, STEP.SENTENCE, STEP.QUIZ);
    this._steps = steps;
    this.setData({
      teachChar: info.char,
      explain: info.explain,
      mnemonic: info.mnemonic,
      words: (info.words || []).slice(0, 3),
      sentence: info.sentence,
      imgSrc: '/assets/img/placeholder-' + info.char + '.svg',
      charIndex: charIndex
    });
    this._runStep(stepIndex || 0);
  },

  _runStep: function (stepIndex) {
    var self = this;
    this._stepIndex = stepIndex;
    var step = this._steps[stepIndex];
    this._pendingNext = function () { self._nextStep(); };
    this.setData({ step: step, showNext: true }, function () {
      self._saveResume();
      self._doStep(step);
    });
  },

  _nextStep: function () {
    var next = this._stepIndex + 1;
    if (next < this._steps.length) {
      this._runStep(next);
    } else {
      this._finishChar();
    }
  },

  _finishChar: function () {
    storage.markCharLearned(this._charInfo.char);
    var nextChar = this._charIndex + 1;
    if (nextChar < this.newChars.length) {
      this._startChar(nextChar, 0);
    } else {
      this._finish();
    }
  },

  // ===== 手动推进：直接往下走 =====
  _offerNext: function (action) {
    this._pendingNext = action;
    this.setData({ showNext: true });
  },

  onTapNext: function () {
    tts.stop();
    this._clearTimers();
    var fn = this._pendingNext;
    this._pendingNext = null;
    if (fn) {
      fn();
    } else {
      this._nextStep();
    }
  },

  _doStep: function (step) {
    var self = this;
    var info = this._charInfo;
    this._pendingNext = function () { self._nextStep(); };
    switch (step) {
      case STEP.SHOW:
        // 大字 + 插画展示，读音×2
        tts.speak('这个字念' + info.char + '，' + info.char, {
          audioKey: info.char
        });
        break;

      case STEP.EXPLAIN:
        // 讲解 + 记字诀合成一条播报
        tts.speak(info.explain + '。记字诀：' + info.mnemonic, {
          audioKey: 'explain_' + info.char
        });
        break;

      case STEP.STROKES:
        // tracer 随 wx:if 挂载，等一拍再调方法；笔顺动画连播两遍
        this._delay(function () {
          var tracer = self.selectComponent('#tracer');
          if (!tracer) return;
          tracer.playStrokes(function () {
            tracer.playStrokes(function () {
              tts.speak('现在，用手指跟着写一写');
            });
          });
        }, 400);
        break;

      case STEP.TRACE:
        // 描红步骤；无笔顺数据的字在这里补口播提示
        this._delay(function () {
          var tracer = self.selectComponent('#tracer');
          if (!tracer) return;
          if (self._hasStroke) {
            tracer.startTrace();
          } else {
            tts.speak('现在，用手指跟着写一写', {
              onDone: function () { tracer.startTrace(); }
            });
          }
        }, 400);
        break;

      case STEP.WORDS:
        tts.speakSequence(this.data.words);
        break;

      case STEP.SENTENCE:
        tts.speak(info.sentence);
        break;

      case STEP.QUIZ:
        this._showQuiz(0);
        break;
    }
  },

  onTracePass: function () {
    if (this.data.stage !== STAGE.TEACH || this.data.step !== STEP.TRACE) return;
    var self = this;
    this._pendingNext = function () { self._nextStep(); };
    tts.speak('写得真好！');
  },

  // 听音选字 ×2：第二题重新随机选项（干扰字与顺序都换）
  _showQuiz: function (round) {
    var self = this;
    var ch = this._charInfo.char;
    this._quizRound = round;
    if (round === 0) {
      this._pendingNext = function () { self._showQuiz(1); };
    } else {
      this._pendingNext = function () { self._finishChar(); };
    }
    this.setData({
      quizRound: round,
      quizAnswer: ch,
      quizOptions: buildOptions(ch)
    }, function () {
      self._saveResume();
      var card = self.selectComponent('#quizCard');
      if (card) card.start('听一听，是哪个字？');
    });
  },

  onQuizCorrect: function () {
    if (this.data.stage !== STAGE.TEACH || this.data.step !== STEP.QUIZ) return;
    var self = this;
    if (this._quizRound === 0) {
      this._pendingNext = function () { self._showQuiz(1); };
      tts.speak('答对啦！');
      return;
    }
    // 两题都答对：记录该字已学，进下一字
    this._pendingNext = function () { self._finishChar(); };
    var nextChar = this._charIndex + 1;
    if (nextChar < this.newChars.length) {
      tts.speak('太好了！我们学下一个字');
    } else {
      tts.speak('太好了！', {
        onDone: function () { self._finish(); }
      });
    }
  },

  onQuizWrong: function () {
    // 组件已播「没关系，再听一遍」并重读题目；永不显示「错」，允许再答直到对
  },

  // ===== DONE =====
  _finish: function () {
    storage.clearResume();
    var n = storage.getLearnedCount();
    // 里程碑解锁判定：与进入学习页时对比，看本次学完后是否多解锁了课
    var unlocked = course.getMilestones().unlocked;
    var newly = unlocked.slice(this._unlockedBefore);
    var milestone = newly.length ? newly[newly.length - 1] : null;
    this._milestone = milestone;
    this.setData({
      stage: STAGE.DONE,
      showNext: false,
      learnedCount: n,
      doneBtnText: milestone ? '去看看新解锁的课' : '回到首页',
      milestoneTitle: milestone ? milestone.title : ''
    });
    tts.speak('今天学完啦！你真棒！你已经认识' + n + '个字了！');
  },

  onDoneBtn: function () {
    if (this._milestone) {
      wx.redirectTo({
        url: this._milestone.type === 'scene' ? '/pages/scene/scene' : '/pages/milestone/milestone'
      });
    } else {
      wx.navigateBack();
    }
  }
});
