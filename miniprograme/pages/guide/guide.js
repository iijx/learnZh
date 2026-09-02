// pages/guide/guide.js —— 「帮爸妈设置」引导页（子女视角，PRD 8.1）
// 三步图文说明，字号 ≥32rpx（子女阅读，可低于适老化正文标准但不低于下限）。

Page({
  data: {},

  onReady: function () {
    this.speaker = this.selectComponent('#speaker');
  },

  // 「我都设置好了」→ 回首页
  onDone: function () {
    wx.reLaunch({ url: '/pages/home/home' });
  }
});
