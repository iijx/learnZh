// lib/strokes.js —— 笔顺数据：来自 hanzi-writer-data（npm，9575 字，Make Me a Hanzi 项目数据）
// 数据格式 { strokes: [SVG path...], medians: [[点...]...] }，与小程序端 tracer 组件约定一致。
// 发布形态：dist/<prefix>/strokes/<字>.json，一字一文件，客户端按字按需下载并本地缓存。

var fs = require('fs');
var path = require('path');

var DATA_DIR = path.join(__dirname, '..', 'node_modules', 'hanzi-writer-data');

function fileOf(ch) {
  return path.join(DATA_DIR, ch + '.json');
}

// 该字是否有笔顺数据
function available(ch) {
  return fs.existsSync(fileOf(ch));
}

// 取一字的笔顺数据（无则 null）
function dataFor(ch) {
  try {
    return JSON.parse(fs.readFileSync(fileOf(ch), 'utf8'));
  } catch (e) {
    return null;
  }
}

// 为字清单构建笔顺文件，返回 { files: [{name, body}], chars: [有数据的字] }
function buildFor(chars) {
  var files = [];
  var ok = [];
  chars.forEach(function (ch) {
    var d = dataFor(ch);
    if (!d || !d.strokes || !d.medians) return;
    ok.push(ch);
    files.push({
      // 对象 Key 用原始 UTF-8 字（与音频 key 同约定），客户端拼 URL 时再 encodeURIComponent
      name: 'strokes/' + ch + '.json',
      body: JSON.stringify({ strokes: d.strokes, medians: d.medians })
    });
  });
  return { files: files, chars: ok };
}

module.exports = { available: available, dataFor: dataFor, buildFor: buildFor };
