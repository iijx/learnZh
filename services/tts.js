// services/tts.js —— 语音播报抽象层
//
// 当前方案：本地 TTS 音频（USE_LOCAL_AUDIO = true）。
//   音频由 tools/gen-audio.js 用本地 Fish Speech 批量生成，存 assets/audio/，
//   已生成的 key 登记在 data/audio-manifest.js（每次生成后自动重写）。
//   speak() 会先用 opts.audioKey、再用「文本 → key」自动映射（_textKeyMap）找本地音频；
//   找不到对应音频的文本走占位实现（播静音 + 按字数估算时长），流程不受影响。
//   若音频托管 CDN，把 _audioSrcFor 返回 https URL，配合 wx.downloadFile 本地缓存。
//
// 备选方案：微信同声传译插件（实时合成）——把 USE_WECHAT_SI 置 true，并在 app.json 注册插件：
//   "plugins": { "WechatSI": { "version": "0.3.6", "provider": "wx069ba97219f66d99" } }
//   然后用 plugin.textToSpeech({ content, tts: true, success(res){ 播放 res.filename } })。
//   注意：该插件逐条联网合成，语速不可调，仅作备选。
var USE_WECHAT_SI = false;
var USE_LOCAL_AUDIO = true;

var storage = require('./storage.js');
var audioManifest = require('../data/audio-manifest.js');
var charsData = require('../data/chars.js');

// 占位音频：极短静音 mp3（tools/gen-placeholders.js 生成）
var SILENCE_SRC = '/assets/audio/silence.mp3';

// 语速系数：每个字占多少秒（占位实现按文本长度估算播报时长；真实音频也用它算兜底超时）
var SECONDS_PER_CHAR = { slow: 0.45, normal: 0.28 };

var hasWx = typeof wx !== 'undefined' && typeof wx.createInnerAudioContext === 'function';

var _ctx = null;        // innerAudioContext 实例
var _timer = null;      // 估算时长 / 兜底超时定时器
var _queue = [];        // speakSequence 队列
var _onQueueDone = null;
var _stopped = false;
var _realDone = null;   // 正在播放真实音频时的 onDone（由 onEnded 触发）

// ===== 文本 → 音频 key 自动映射 =====
// 从字表构建：单字 -> <字>；例句原文 -> sentence_<字>；组词原文 -> word_<字>_<i>
var _textKeyMap = null;
function _getTextKeyMap() {
  if (_textKeyMap) return _textKeyMap;
  _textKeyMap = {};
  charsData.forEach(function (c) {
    if (audioManifest.has(c.char)) {
      _textKeyMap[c.char] = c.char;
      _textKeyMap[c.char + '，' + c.char] = c.char;
    }
    if (c.explain && c.explain !== '内容待补充' && audioManifest.has('explain_' + c.char)) {
      _textKeyMap[c.explain + '。记字诀：' + c.mnemonic] = 'explain_' + c.char;
    }
    (c.words || []).forEach(function (w, i) {
      if (audioManifest.has('word_' + c.char + '_' + i)) _textKeyMap[w] = 'word_' + c.char + '_' + i;
    });
    if (c.sentence && audioManifest.has('sentence_' + c.char)) {
      _textKeyMap[c.sentence] = 'sentence_' + c.char;
    }
  });
  return _textKeyMap;
}

// 真实 TTS 音频按 key 取路径；不在清单内（尚未生成）返回 null
function _audioSrcFor(audioKey) {
  return USE_LOCAL_AUDIO && audioKey ? audioManifest.path(audioKey) : null;
}

// 当前语速（读设置项，'slow' / 'normal'）
function _rate(opts) {
  if (opts && opts.rate) return opts.rate;
  try { return storage.getSettings().speechRate; } catch (e) { return 'slow'; }
}

// 估算播报时长（毫秒）：字数 × 语速系数，外加 0.4s 收尾停顿
function _estimateMs(text, rate) {
  var coef = SECONDS_PER_CHAR[rate] || SECONDS_PER_CHAR.slow;
  return Math.round((String(text).length * coef + 0.4) * 1000);
}

function _getCtx() {
  if (!hasWx) return null;
  if (!_ctx) {
    _ctx = wx.createInnerAudioContext();
    _ctx.src = SILENCE_SRC;
    // 真实音频播完自然结束时触发 onDone（比估算时长准确）
    _ctx.onEnded(function () {
      if (!_realDone) return;
      var done = _realDone;
      _realDone = null;
      if (_timer) { clearTimeout(_timer); _timer = null; }
      done();
    });
    // 音频加载/播放失败（如文件缺失）：按兜底定时器走，不卡流程
    _ctx.onError(function () {
      if (!_realDone) return;
      var done = _realDone;
      _realDone = null;
      // 不额外延迟，直接交回（占位定时器已被 _stopCurrent 清掉时静默返回）
      if (_timer) { clearTimeout(_timer); _timer = null; }
      done();
    });
  }
  return _ctx;
}

// 停当前这一条（不动队列）：speak 开播前清场用
function _stopCurrent() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  _realDone = null;
  if (_ctx) { try { _ctx.stop(); } catch (e) {} }
}

var tts = {
  // 播一条语音。opts: { rate: 'slow'|'normal', audioKey: '字/词音频键', onDone: fn }
  // 音频命中本地清单时真实播放；否则播静音占位 + 按字数估算时长，流程不受影响。
  speak: function (text, opts) {
    opts = opts || {};
    var rate = _rate(opts);
    var audioKey = opts.audioKey || _getTextKeyMap()[String(text)] || null;
    var src = _audioSrcFor(audioKey);
    console.log('[TTS]', text, '（语速:' + rate + (src ? '，音频:' + audioKey : '，占位静音') + '）');

    _stopCurrent();

    if (USE_WECHAT_SI) {
      // 【未来替换为微信同声传译插件】见文件顶部注释
    }

    var done = opts.onDone;
    var ctx = _getCtx();
    if (ctx) {
      ctx.src = src || SILENCE_SRC;
      ctx.stop();
      if (src) {
        // 真实音频：onEnded 回调触发 onDone；这里只设兜底超时（估算时长 2 倍 + 3s）
        _realDone = done || null;
        ctx.play();
        var fallbackMs = _estimateMs(text, rate) * 2 + 3000;
        _timer = setTimeout(function () {
          _timer = null;
          if (_realDone) {
            var d = _realDone;
            _realDone = null;
            if (ctx) ctx.stop();
            if (d) d();
          }
        }, fallbackMs);
        return fallbackMs;
      }
      ctx.play();
    }

    // 占位：静音 + 估算时长
    var ms = _estimateMs(text, rate);
    _timer = setTimeout(function () {
      _timer = null;
      if (ctx) ctx.stop();
      if (done) done();
    }, ms);
    return ms;
  },

  // 顺序播多条，全部播完回调 onDone
  speakSequence: function (texts, onDone) {
    _queue = (texts || []).slice();
    _onQueueDone = onDone || null;
    _stopped = false;
    _playNext();
  },

  // 停止当前播报（含队列）
  stop: function () {
    _stopped = true;
    _queue = [];
    _onQueueDone = null;
    if (_timer) { clearTimeout(_timer); _timer = null; }
    _realDone = null;
    if (_ctx) { try { _ctx.stop(); } catch (e) {} }
  }
};

function _playNext() {
  if (_stopped) return;
  if (_queue.length === 0) {
    var done = _onQueueDone;
    _onQueueDone = null;
    if (done) done();
    return;
  }
  var text = _queue.shift();
  tts.speak(text, { onDone: _playNext });
}

module.exports = tts;
