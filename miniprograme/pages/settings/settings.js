// pages/settings/settings.js —— 设置页（PRD 3.10）
// 5 个设置项，每项一组大按钮单选（当前项墨绿高亮）；
// 点击先 tts 播报选项名，再存 storage；
// 字号切换：存 storage.fontSize（'large'/'xl'），各页 onShow 读取后给根容器加 .font-large/.font-xl。

var storage = require('../../services/storage.js');

Page({
  data: {
    fontClass: 'font-large',
    settings: {},
    // 选项定义：value 存 storage，name 用于展示和语音播报
    dailyOptions: [
      { value: 1, name: '每天学 1 个字' },
      { value: 3, name: '每天学 3 个字' },
      { value: 5, name: '每天学 5 个字' }
    ],
    examOptions: [
      { value: false, name: '写字不打分' },
      { value: true, name: '写字要打分' }
    ],
    fontOptions: [
      { value: 'large', name: '大字' },
      { value: 'xl', name: '特大字' }
    ],
    rateOptions: [
      { value: 'slow', name: '慢慢读' },
      { value: 'normal', name: '正常读' }
    ]
  },

  onShow: function () {
    this._loadSettings();
  },

  onReady: function () {
    this.speaker = this.selectComponent('#speaker');
    this.speaker.startIdleWatch();
    this.speaker.speak('设置。点一下你要改的地方');
  },

  _loadSettings: function () {
    var s = storage.getSettings();
    this.setData({
      settings: s,
      fontClass: s.fontSize === 'xl' ? 'font-xl' : 'font-large'
    });
  },

  // 统一的选择处理：先播报选项名，再保存
  onPick: function (e) {
    this.speaker.resetIdle();
    var d = e.currentTarget.dataset;
    var group = d.group;
    var value = d.value;
    var name = d.name;

    this.speaker.speak(name);
    storage.saveSetting(group, value);

    // 同步到全局，其他页面 onShow 时读取生效
    var app = getApp();
    if (app && app.globalData) {
      app.globalData.settings = storage.getSettings();
    }
    this._loadSettings();
  },

  // 音量：系统音量键调节，按钮只做试听播报
  onTestVolume: function () {
    this.speaker.resetIdle();
    this.speaker.speak('现在的声音大小合适吗？不合适就用手机旁边的音量键调一调');
  },

  goHome: function () {
    this.speaker.resetIdle();
    wx.navigateBack({
      fail: function () {
        wx.reLaunch({ url: '/pages/home/home' });
      }
    });
  }
});
