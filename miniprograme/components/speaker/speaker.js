// components/speaker/speaker.js —— 全局语音播报封装（非 UI 组件）
//
// 用法：
//   页面 json:  "usingComponents": { "speaker": "/components/speaker/speaker" }
//   页面 wxml:  <speaker id="speaker" />
//   页面 js:
//     onReady()  { this.speaker = this.selectComponent('#speaker');
//                  this.speaker.startIdleWatch(function () { /* 可选： idle 时的额外 UI 提示 */ }); }
//     任意用户交互处调用 this.speaker.resetIdle() 重置 30 秒计时。
//
// 能力：
//   - 页面 onUnload → 组件 detached → 自动 tts.stop()，页面无需手动停播报；
//   - 30 秒无操作自动播报「点一下屏幕中间的按钮，我们继续」，并回调 onIdle；
//     提示后重新计时，直到有操作为止；
//   - 页面也可以直接调 this.speaker.speak(text) / speakSequence(texts, onDone)，
//     统一从这一个口子走 tts，便于将来切换真实 TTS 实现。

var tts = require('../../services/tts.js');

var IDLE_MS = 30 * 1000;
var IDLE_HINT = '点一下屏幕中间的按钮，我们继续';

Component({
  lifetimes: {
    detached: function () {
      // 页面卸载：停 idle 计时 + 停所有播报
      this.stopIdleWatch();
      tts.stop();
    }
  },

  methods: {
    // 透传 tts 能力，页面统一从这里发语音
    speak: function (text, opts) { return tts.speak(text, opts); },
    speakSequence: function (texts, onDone) { tts.speakSequence(texts, onDone); },
    stop: function () { tts.stop(); },

    // 开启 30 秒无操作提醒。onIdle 可选，每次触发提醒时回调
    startIdleWatch: function (onIdle) {
      this._onIdle = onIdle || null;
      this.resetIdle();
    },

    stopIdleWatch: function () {
      if (this._idleTimer) {
        clearTimeout(this._idleTimer);
        this._idleTimer = null;
      }
    },

    // 有任何用户操作时调用，重新计时
    resetIdle: function () {
      var self = this;
      this.stopIdleWatch();
      this._idleTimer = setTimeout(function () {
        tts.speak(IDLE_HINT);
        if (self._onIdle) self._onIdle();
        self.resetIdle(); // 提示后继续守望，直到用户操作
      }, IDLE_MS);
    }
  }
});
