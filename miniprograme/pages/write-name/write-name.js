// pages/write-name/write-name.js —— 写名字专项
// 首次进入：子女代录姓名（存 storage，key: lz_user_name）；
// 已有名字：逐字展示 → tracer 笔顺演示 playStrokes() → startTrace() 描红
// （exam 恒 false，描完即过）；全部写完播报「以后领钱、看病，都能自己签名啦」。
// 无笔顺数据的字 tracer 自动降级为静态底字。

var storage = require('../../services/storage.js');

var NAME_KEY = 'lz_user_name';

Page({
  data: {
    fontClass: 'font-large',
    mode: 'input',      // input | practice | done
    name: '',
    chars: [],          // 姓名拆成的单字
    idx: 0,
    currentChar: ''
  },

  onLoad: function () {
    this._inputValue = '';
  },

  onShow: function () {
    this.setData({
      fontClass: storage.getSettings().fontSize === 'xl' ? 'font-xl' : 'font-large'
    });
    var name = wx.getStorageSync(NAME_KEY) || '';
    if (name && this.data.mode === 'input') {
      this._startPractice(name);
    }
  },

  onReady: function () {
    this.speaker = this.selectComponent('#speaker');
    this.speaker.startIdleWatch();
    if (this.data.mode === 'practice') {
      this._playCurrent();
    } else {
      this.speaker.speak('请家里的孩子帮忙，把你的名字打进来');
    }
  },

  // ---------- 录入名字 ----------

  onNameInput: function (e) {
    this._inputValue = e.detail.value;
  },

  onConfirmName: function () {
    this.speaker.resetIdle();
    var name = (this._inputValue || '').replace(/\s+/g, '');
    if (!name) {
      this.speaker.speak('名字还没有写进去哦，请家里的孩子帮忙打进来');
      return;
    }
    wx.setStorageSync(NAME_KEY, name);
    var self = this;
    this.speaker.speak('好！我们开始学写你的名字', {
      onDone: function () { self._startPractice(name); }
    });
  },

  // ---------- 逐字描红 ----------

  _startPractice: function (name) {
    this.setData({
      mode: 'practice',
      name: name,
      chars: name.split(''),
      idx: 0,
      currentChar: name.charAt(0)
    });
    if (this.speaker) this._playCurrent();
  },

  // 演示当前字笔顺，播完进入描红；tracer 无笔顺数据时自动降级静态底字
  _playCurrent: function () {
    var self = this;
    var ch = this.data.currentChar;
    this.speaker.speak('这是你的「' + ch + '」字，先看一遍笔顺');
    // 等 tracer 完成 _setup（char observer 触发）后再播动画
    setTimeout(function () {
      var tracer = self.selectComponent('#tracer');
      if (!tracer) return;
      tracer.playStrokes(function () {
        tracer.startTrace();
        self.speaker.speak('现在轮到你了，用手指跟着描一遍');
      });
    }, 400);
  },

  // 描红过关（exam=false，描满即过）
  onTracePass: function () {
    this.speaker.resetIdle();
    var self = this;
    var next = this.data.idx + 1;
    this.speaker.speak('这个名字你会写啦！', {
      onDone: function () {
        if (next >= self.data.chars.length) {
          self.setData({ mode: 'done' });
          self.speaker.speak('太棒了！以后领钱、看病，都能自己签名啦');
        } else {
          self.setData({ idx: next, currentChar: self.data.chars[next] });
          self._playCurrent();
        }
      }
    });
  },

  // 再看一遍笔顺
  onReplayStrokes: function () {
    this.speaker.resetIdle();
    this._playCurrent();
  },

  // 全部写完后「再写一遍」
  onRePractice: function () {
    this.speaker.resetIdle();
    this._startPractice(this.data.name);
  },

  // 换个名字：清空重录
  onChangeName: function () {
    this.speaker.resetIdle();
    wx.removeStorageSync(NAME_KEY);
    this._inputValue = '';
    this.setData({ mode: 'input', name: '', chars: [], idx: 0, currentChar: '' });
    this.speaker.speak('请家里的孩子帮忙，把你的名字打进来');
  },

  goHome: function () {
    this.speaker.resetIdle();
    wx.navigateBack({
      fail: function () {
        wx.reLaunch({ url: '/pages/home/home' });
      }
    });
  },

  onShareAppMessage: function () {
    return {
      title: '我学会写自己的名字「' + (this.data.name || '') + '」啦！以后看病领钱都能自己签名！',
      path: '/pages/home/home?from=share'
    };
  }
});
