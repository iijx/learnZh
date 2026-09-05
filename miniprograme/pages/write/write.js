// pages/write/write.js —— 写字页（独立页面，由学习页「写一写」进入）
//
// 交互流程（适老化：全程语音引导、按钮大而少）：
//   1. 进入页面：语音「先看一遍笔顺」→ 自动播放笔顺动画；
//   2. 播完语音「跟着金色的点，把字描一遍」→ 进入描红（第一笔起点有金色圆点引导）；
//   3. 底部三个大按钮：重看笔顺 / 擦掉重写 / 写好了 ✓；
//      不做书写完成度判定，「写好了」随时可点；
//   4. 返回用小程序自带导航栏；
//   5. 「写好了」：回学习页并自动进入下一个字（上一页 onWritingDone）。

var tts = require('../../services/tts.js');
var course = require('../../services/course.js');

Page({
  data: {
    char: '',
    pinyin: '',
    hasStroke: false,
    tracing: false       // 已进入描红阶段（笔顺动画播完）
  },

  onLoad: function (options) {
    var ch = decodeURIComponent((options && options.char) || '');
    var info = course.getChar(ch) || {};
    this.setData({
      char: ch,
      pinyin: info.pinyin || '',
      hasStroke: course.hasStroke(ch)
    });
    this._startDemo();
  },

  onUnload: function () {
    tts.stop();
  },

  // 开场：语音提示 + 自动播笔顺动画（无笔顺数据则直接进入描红）
  _startDemo: function () {
    var self = this;
    if (!this.data.hasStroke) {
      this.setData({ tracing: true });
      tts.speak('照着底字，用手指写一写');
      this._startTraceWhenReady();
      return;
    }
    tts.speak('先看一遍笔顺');
    this._delay(600).then(function () {
      var tracer = self.selectComponent('#tracer');
      if (!tracer) return;
      tracer.playStrokes(function () {
        self.setData({ tracing: true });
        tts.speak('跟着金色的点，把字描一遍');
        tracer.startTrace();
      });
    });
  },

  _startTraceWhenReady: function () {
    var self = this;
    this._delay(400).then(function () {
      var tracer = self.selectComponent('#tracer');
      if (tracer) tracer.startTrace();
    });
  },

  _delay: function (ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  },

  // 重看笔顺：播动画，播完自动回到描红
  onReplay: function () {
    var self = this;
    var tracer = this.selectComponent('#tracer');
    if (!tracer || !this.data.hasStroke) return;
    tts.speak('再看一遍笔顺');
    tracer.playStrokes(function () {
      tts.speak('跟着金色的点，把字描一遍');
      tracer.startTrace();
    });
  },

  // 擦掉重写：清空笔迹，重新进入描红
  onClear: function () {
    var tracer = this.selectComponent('#tracer');
    if (!tracer) return;
    tracer.clear();
    tracer.startTrace();
    tts.speak('擦掉了，再描一遍');
  },

  // 写好了：回学习页进入下一个字
  onFinish: function () {
    var pages = getCurrentPages();
    var prev = pages[pages.length - 2];
    tts.speak('写好了，真棒！');
    if (prev && prev.onWritingDone) prev.onWritingDone();
    wx.navigateBack();
  }
});
