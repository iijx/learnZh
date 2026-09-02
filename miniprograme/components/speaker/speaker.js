// components/speaker/speaker.js —— 全局语音播报封装（非 UI 组件）
//
// 用法：
//   页面 json:  "usingComponents": { "speaker": "/components/speaker/speaker" }
//   页面 wxml:  <speaker id="speaker" />
//   页面 js:    onReady() { this.speaker = this.selectComponent('#speaker'); }
//
// 能力：
//   - 页面 onUnload → 组件 detached → 自动 tts.stop()，页面无需手动停播报；
//   - 页面也可以直接调 this.speaker.speak(text) / speakSequence(texts, onDone)，
//     统一从这一个口子走 tts，便于将来切换真实 TTS 实现。

var tts = require('../../services/tts.js');

Component({
  lifetimes: {
    detached: function () {
      // 页面卸载：停所有播报
      tts.stop();
    }
  },

  methods: {
    // 透传 tts 能力，页面统一从这里发语音
    speak: function (text, opts) { return tts.speak(text, opts); },
    speakSequence: function (texts, onDone) { tts.speakSequence(texts, onDone); },
    stop: function () { tts.stop(); }
  }
});
