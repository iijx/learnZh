// components/big-button/big-button.js —— 超大语音按钮
//
// 用法：
//   <big-button text="开始学习" subText="点这里" type="primary" bind:tap="onStart" />
// 防误触原则下只需点一次：speakFirst 开启时，点击同时用 tts 播报名字
// （不等播报完，立即触发 tap 事件，避免延迟感；语音仅为提示）。

var tts = require('../../services/tts.js');

Component({
  // 允许页面传入外部类（如首页主按钮需要撑满 1/3 屏容器）
  externalClasses: ['ext-class'],

  properties: {
    text: { type: String, value: '' },
    subText: { type: String, value: '' },
    icon: { type: String, value: '' },           // 具象物象图标（如 ☀️、🈴、🧺、🌳）
    showSpeaker: { type: Boolean, value: false }, // 是否显示大喇叭提示
    layout: { type: String, value: 'vertical' }, // 'vertical' | 'horizontal'
    // primary 墨绿实心 / plain 米白描边
    type: { type: String, value: 'primary' },
    // 点击时先播报名字（语音提示，不阻塞事件）
    speakFirst: { type: Boolean, value: true }
  },

  methods: {
    onTap: function () {
      if (this.data.speakFirst && this.data.text) {
        tts.speak(this.data.text);
      }
      // 立即触发事件，不等播报结束
      this.triggerEvent('tap', { text: this.data.text });
    }
  }
});
