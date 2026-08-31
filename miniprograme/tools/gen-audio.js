#!/usr/bin/env node
// tools/gen-audio.js —— 用本地 Fish Speech（http://localhost:8080/v1/tts）批量生成示例字语音
//
// 用法：
//   node tools/gen-audio.js            # 生成缺失的音频（已存在的跳过）
//   node tools/gen-audio.js --force    # 全部重新生成
//
// 产物（存入 assets/audio/，命名规范见 tools/README.md 第 1 节）：
//   <字>.mp3            单字读音（读两遍，对应教学闭环「TTS读字音×2」）
//   explain_<字>.mp3    大白话讲解 + 记字诀
//   word_<字>_<i>.mp3   组词逐个播报
//   sentence_<字>.mp3   生活例句
//
// 服务端：Fish Speech API Server（~/service/fish-speech/），
// POST /v1/tts，JSON {"text": "...", "format": "mp3"}，无参考音色时用默认音色。

var fs = require('fs');
var path = require('path');
var http = require('http');

var TTS_URL = 'http://localhost:8080/v1/tts';
var OUT_DIR = path.join(__dirname, '..', 'assets', 'audio');
var FORCE = process.argv.indexOf('--force') !== -1;

var chars = require('../data/chars.js');
// 只处理有完整内容的示范字（其余占位字讲解文案待内容生产，见 PRD 第 6 章）
var demoChars = chars.filter(function (c) { return c.explain && c.explain !== '内容待补充'; });

// 生成待合成清单：[{ file, text }]
function buildJobs() {
  var jobs = [];
  demoChars.forEach(function (c) {
    jobs.push({ file: c.char + '.mp3', text: c.char + '，' + c.char });
    jobs.push({ file: 'explain_' + c.char + '.mp3', text: c.explain + '。记字诀：' + c.mnemonic });
    c.words.forEach(function (w, i) {
      jobs.push({ file: 'word_' + c.char + '_' + i + '.mp3', text: w });
    });
    jobs.push({ file: 'sentence_' + c.char + '.mp3', text: c.sentence });
  });
  return jobs;
}

function isMp3(buf) {
  // ID3 头或 MPEG 帧同步字 0xFFEx
  return buf.length > 100 &&
    (buf.slice(0, 3).toString() === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
}

function synth(text) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify({ text: text, format: 'mp3' });
    var req = http.request(TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 300000
    }, function (res) {
      var chunks = [];
      res.on('data', function (d) { chunks.push(d); });
      res.on('end', function () {
        var buf = Buffer.concat(chunks);
        if (res.statusCode !== 200) {
          return reject(new Error('HTTP ' + res.statusCode + ': ' + buf.slice(0, 200).toString()));
        }
        if (!isMp3(buf)) {
          return reject(new Error('返回的不是 MP3（' + buf.length + ' 字节）'));
        }
        resolve(buf);
      });
    });
    req.on('timeout', function () { req.destroy(new Error('请求超时')); });
    req.on('error', reject);
    req.end(body);
  });
}

async function synthWithRetry(text) {
  try {
    return await synth(text);
  } catch (e) {
    console.log('  重试一次（' + e.message + '）');
    return await synth(text);
  }
}

// 每次运行后重写 data/audio-manifest.js（tts.js 据此判断哪些音频可用）
function writeManifest() {
  var files = fs.readdirSync(OUT_DIR).filter(function (f) {
    return f.endsWith('.mp3') && f !== 'silence.mp3';
  });
  var keys = files.map(function (f) { return f.replace(/\.mp3$/, ''); });
  var out = '// data/audio-manifest.js —— 已生成的本地语音清单（tools/gen-audio.js 每次运行后自动重写）\n' +
    '// key 规则：单字读音 <字>；讲解 explain_<字>；组词 word_<字>_<i>；例句 sentence_<字>\n' +
    'var KEYS = ' + JSON.stringify(keys, null, 2) + ';\n\n' +
    'module.exports = {\n' +
    '  has: function (key) { return KEYS.indexOf(key) !== -1; },\n' +
    '  path: function (key) { return this.has(key) ? \'/assets/audio/\' + key + \'.mp3\' : null; },\n' +
    '  keys: KEYS\n};\n';
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'audio-manifest.js'), out);
  return keys.length;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  var jobs = buildJobs();
  var todo = FORCE ? jobs : jobs.filter(function (j) {
    return !fs.existsSync(path.join(OUT_DIR, j.file));
  });
  console.log('示范字 ' + demoChars.length + ' 个，共 ' + jobs.length + ' 条，本次需生成 ' + todo.length + ' 条');

  var ok = 0, failed = [];
  for (var i = 0; i < todo.length; i++) {
    var j = todo[i];
    process.stdout.write('[' + (i + 1) + '/' + todo.length + '] ' + j.file + ' ... ');
    try {
      var buf = await synthWithRetry(j.text);
      fs.writeFileSync(path.join(OUT_DIR, j.file), buf);
      ok++;
      console.log('OK (' + (buf.length / 1024).toFixed(1) + ' KB)');
    } catch (e) {
      failed.push(j.file);
      console.log('失败: ' + e.message);
    }
  }
  var total = writeManifest();
  console.log('\n完成：成功 ' + ok + ' 条' + (failed.length ? '，失败 ' + failed.length + ' 条：' + failed.join('、') : ''));
  console.log('音频清单已更新：data/audio-manifest.js（共 ' + total + ' 条）');
  if (failed.length) process.exitCode = 1;
}

main();
