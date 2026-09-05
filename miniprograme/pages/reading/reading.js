// pages/reading/reading.js —— 阅读课：场景 / 古诗 / 故事 三个 tab 切换
// 场景：L1 共 12 个真实生活场景（菜市场价签、公交站牌……），每学满 25 字解锁一个；
// 古诗/故事：沿用里程碑解锁（数据里带 unlockAt）。
// 解锁判定按服务端汇总缓存的已学字数（progress.getSummary().totalLearned）。

var tts = require('../../services/tts.js');
var storage = require('../../services/storage.js');
var course = require('../../services/course.js');
var progress = require('../../services/progress.js');

var TABS = [
  { key: 'scene', name: '场景' },
  { key: 'poem', name: '古诗' },
  { key: 'story', name: '故事' }
];

Page({
  data: {
    fontClass: 'font-large',
    tabs: TABS,
    tab: 'scene',
    items: []          // [{ id, title, sub, unlocked, need }]
  },

  onShow: function () {
    var self = this;
    this.setData({
      fontClass: storage.getSettings().fontSize === 'xl' ? 'font-xl' : 'font-large'
    });
    this._render();
    // 后台拉服务端最新进度后重渲染（解锁状态可能变化）
    progress.refresh().then(function () {
      self._render();
    });
  },

  _render: function () {
    var n = progress.getSummary().totalLearned;
    var tab = this.data.tab;
    var list = tab === 'scene' ? course.loadScenes()
      : tab === 'poem' ? course.loadPoems()
      : course.loadStories();

    var items = list.map(function (item) {
      var unlocked = n >= item.unlockAt;
      return {
        id: item.id,
        title: item.title,
        sub: item.author || '',
        unlocked: unlocked,
        need: unlocked ? 0 : item.unlockAt - n
      };
    });
    this.setData({ items: items });
  },

  onTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    this.setData({ tab: tab });
    this._render();
    var name = TABS.filter(function (t) { return t.key === tab; })[0].name;
    tts.speak(name + '课');
  },

  onTapItem: function (e) {
    var d = e.currentTarget.dataset;
    if (!d.unlocked) {
      tts.speak('再学 ' + d.need + ' 个字就能解锁啦');
      return;
    }
    wx.navigateTo({ url: '/pages/milestone/milestone?type=' + this.data.tab + '&id=' + d.id });
  }
});
