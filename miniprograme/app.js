// app.js —— 小程序入口
// 「阿福认字」：面向零基础老人的识字课
var storage = require('./services/storage.js');
var course = require('./services/course.js');
var api = require('./services/api.js');
var progress = require('./services/progress.js');

App({
  globalData: {
    // 全局共享的设置项引用（设置页修改后，各页面从这里读最新值）
    settings: null
  },

  onLaunch: function () {
    // 初始化本地存储：默认设置项、连续天数结构
    storage.init();
    this.globalData.settings = storage.getSettings();

    // 登录后端（wx.login code 换 openid）并拉取进度汇总缓存；
    // 失败不阻塞启动——学习页出组时会带重试
    api.ensureLogin().then(function () {
      progress.refresh();
    }).catch(function (err) {
      console.warn('[app] 登录失败：', err && err.message);
    });

    // 加载线上课程包：有缓存立即可用并后台静默更新；无缓存时联网拉取，
    // 读字表的页面自行 await course.ready()（见 pages/learn/learn.js）
    course.init();
  }
});
