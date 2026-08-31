// pages/progress/progress.js —— 我的进度（大字页）
// 超大字展示已学字数、连续学习天数、今日是否已学；
// 里程碑列表（场景课/古诗/故事）按 course.js 解锁判定展示进度，
// 已解锁的可点击跳转（古诗/故事 → milestone 页，场景课 → scene 页）。

var storage = require('../../services/storage.js');
var course = require('../../services/course.js');

Page({
  data: {
    fontClass: 'font-large',
    learnedCount: 0,
    streak: 0,
    studiedToday: false,
    groups: []  // [{ name: '场景课', items: [{ key, type, id, label, unlocked, need }] }]
  },

  onShow: function () {
    this.setData({
      fontClass: storage.getSettings().fontSize === 'xl' ? 'font-xl' : 'font-large'
    });
    this._refresh();
    this._speakSummary();
  },

  onReady: function () {
    this.speaker = this.selectComponent('#speaker');
    this.speaker.startIdleWatch();
    // onShow 可能先于 onReady 触发，这里补一次播报
    this._speakSummary();
  },

  _refresh: function () {
    var n = storage.getLearnedCount();
    var today = storage._dateStr();
    var map = storage.getLearnedMap();
    var studiedToday = false;
    for (var ch in map) {
      if (map[ch].learnDate === today) { studiedToday = true; break; }
    }

    var groups = [
      { name: '场景课', items: this._buildItems(course.loadScenes(), 'scene', n, '课') },
      { name: '古诗', items: this._buildItems(course.loadPoems(), 'poem', n, '首') },
      { name: '故事', items: this._buildItems(course.loadStories(), 'story', n, '个') }
    ];

    this.setData({
      learnedCount: n,
      streak: storage.getStreak(),
      studiedToday: studiedToday,
      groups: groups
    });
  },

  // 构造某一类里程碑的展示条目
  _buildItems: function (list, type, learnedCount, unit) {
    return list.map(function (item, i) {
      var unlocked = learnedCount >= item.unlockAt;
      var label;
      if (type === 'scene') label = '第' + (i + 1) + '课 ' + item.title;
      else if (type === 'poem') label = '第' + (i + 1) + '首古诗《' + item.title + '》';
      else label = '第' + (i + 1) + '个故事《' + item.title + '》';
      return {
        key: type + '_' + item.id,
        type: type,
        id: item.id,
        label: label,
        unlocked: unlocked,
        need: unlocked ? 0 : item.unlockAt - learnedCount,
        unit: unit
      };
    });
  },

  _speakSummary: function () {
    if (!this.speaker) return;
    if (this._spoken) return; // 每次进页只播报一次汇总
    this._spoken = true;
    this.speaker.speak(
      '你已经认识 ' + this.data.learnedCount + ' 个字啦，连续学习 ' +
      this.data.streak + ' 天，真厉害！'
    );
  },

  // 点击里程碑：已解锁跳对应页，未解锁播报还差多少字
  onTapMilestone: function (e) {
    this.speaker.resetIdle();
    var d = e.currentTarget.dataset;
    if (!d.unlocked) {
      // dataset 布尔在 wxml 里传 true/false，兜底转一下
      this.speaker.speak('再学一些字就能解锁啦');
      return;
    }
    if (d.type === 'scene') {
      wx.navigateTo({ url: '/pages/scene/scene?id=' + d.id });
    } else {
      wx.navigateTo({ url: '/pages/milestone/milestone?type=' + d.type + '&id=' + d.id });
    }
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
