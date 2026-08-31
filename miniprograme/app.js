// app.js —— 小程序入口
// 「爸妈识字课」：面向零基础老人的识字课
var storage = require('./services/storage.js');

App({
  globalData: {
    // 全局共享的设置项引用（设置页修改后，各页面从这里读最新值）
    settings: null,
    // 模拟的微信 openid（未来替换为服务端 REST API：code 换 openid）
    openid: ''
  },

  onLaunch: function () {
    // 初始化本地存储：模拟 openid、默认设置项、学习进度结构
    storage.init();
    this.globalData.settings = storage.getSettings();
    this.globalData.openid = storage.getOpenid();
  }
});
