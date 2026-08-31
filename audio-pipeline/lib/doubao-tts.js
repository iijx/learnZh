// lib/doubao-tts.js —— 豆包 TTS v3 单向接口客户端（火山引擎大模型语音合成 seed-tts-2.0）
//
// 接口：POST https://openspeech.bytedance.com/api/v3/tts/unidirectional
// 鉴权：X-Api-Key（新版控制台 API Key），或 X-Api-App-Id + X-Api-Access-Key（旧版）；
//       X-Api-Resource-Id 必须与音色家族匹配（seed-tts-2.0 ↔ *_uranus_bigtts）；
//       X-Api-Request-Id 每请求唯一。
// 响应：NDJSON，每行一个分片：{"code":0,"data":"<base64 mp3>"}，结束行 {"code":20000000}；
//       错误为平铺 {"code","message"} 或包在 {"header":{...}} 里，code 非 0/20000000 即失败。

var https = require('https');
var crypto = require('crypto');

var TTS_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
var OK_CODE = 0;
var DONE_CODE = 20000000;

// mp3 校验：ID3 头或 MPEG 帧同步字 0xFFEx（与 tools/gen-audio.js 判据一致）
function isMp3(buf) {
  return buf.length > 100 &&
    (buf.slice(0, 3).toString() === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
}

// 解析 NDJSON 响应：拼接所有 code=0 的 base64 分片；遇到错误码抛错
function parseNdjson(raw) {
  var audio = [];
  var errCode = null, errMsg = null;
  raw.split('\n').forEach(function (line) {
    line = line.trim();
    if (!line) return;
    var obj;
    try { obj = JSON.parse(line); } catch (e) { return; }
    var header = (obj && typeof obj.header === 'object') ? obj.header : {};
    var code = (obj.code !== undefined && obj.code !== null) ? obj.code : header.code;
    var message = (obj.message !== undefined && obj.message !== null) ? obj.message : header.message;
    if (code === OK_CODE && obj.data) {
      audio.push(Buffer.from(obj.data, 'base64'));
    } else if (code !== undefined && code !== null && code !== OK_CODE && code !== DONE_CODE) {
      if (errCode === null) { errCode = code; errMsg = message; }
    }
  });
  if (errCode !== null) {
    var e = new Error('TTS 错误 code=' + errCode + (errMsg ? '：' + errMsg : ''));
    e.code = errCode;
    throw e;
  }
  return audio.length ? Buffer.concat(audio) : null;
}

// 合成一条文本 → mp3 Buffer。cfg 为 config.doubao（含 apiKey/appId/accessToken/voice/speechRate 等）
function synth(text, cfg) {
  return new Promise(function (resolve, reject) {
    var reqid = crypto.randomUUID();
    var headers = {
      'Content-Type': 'application/json',
      'X-Api-Resource-Id': cfg.resourceId,
      'X-Api-Request-Id': reqid
    };
    if (cfg.apiKey) {
      headers['X-Api-Key'] = cfg.apiKey;
    } else {
      headers['X-Api-App-Id'] = cfg.appId;
      headers['X-Api-Access-Key'] = cfg.accessToken;
    }
    var body = JSON.stringify({
      user: { uid: cfg.uid || 'learnzh-pipeline' },
      req_params: {
        text: text,
        speaker: cfg.voice,
        audio_params: {
          format: cfg.format || 'mp3',
          sample_rate: cfg.sampleRate || 24000,
          speech_rate: cfg.speechRate || 0
        }
      }
    });

    var req = https.request(TTS_URL, {
      method: 'POST',
      headers: headers,
      timeout: cfg.timeoutMs || 60000
    }, function (res) {
      var chunks = [];
      res.on('data', function (d) { chunks.push(d); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          return reject(new Error('HTTP ' + res.statusCode + '：' + raw.slice(0, 200)));
        }
        var buf;
        try { buf = parseNdjson(raw); } catch (e) { return reject(e); }
        if (!buf || !buf.length) return reject(new Error('响应中没有音频数据'));
        if (!isMp3(buf)) return reject(new Error('返回的不是 MP3（' + buf.length + ' 字节）'));
        resolve(buf);
      });
    });
    req.on('timeout', function () { req.destroy(new Error('合成请求超时（' + (cfg.timeoutMs || 60000) + 'ms）')); });
    req.on('error', reject);
    req.end(body);
  });
}

module.exports = { synth: synth };
