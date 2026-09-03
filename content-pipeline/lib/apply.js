// lib/apply.js —— 把审校通过（approved）的文案写回 miniprograme/data/chars.js
// 原则：
//   - 学习顺序 = 字表数组顺序，重写时严格保持原顺序；
//   - 已有完整内容的手写字原样保留；占位字用 output/<字>.json 水合；
//   - 字表去重（首次出现为准，顺带修复「家」重复）；
//   - hasStroke 按 data/strokes/<字>.json.js 是否存在重新判定；
//   - 写回成功的字在 output 里标记为 applied。

var fs = require('fs');
var path = require('path');
var store = require('./store.js');

var MINIPROG = path.join(__dirname, '..', '..', 'miniprograme');
var CHARS_FILE = path.join(MINIPROG, 'data', 'chars.js');
var STROKES_DIR = path.join(MINIPROG, 'data', 'strokes');

var PLACEHOLDER = '内容待补充';

function isFull(c) { return c.explain && c.explain !== PLACEHOLDER; }

function hasStrokeFile(char) {
  return fs.existsSync(path.join(STROKES_DIR, char + '.json.js'));
}

function jstr(v) { return JSON.stringify(v); }

function entryLine(c) {
  return '  { char: ' + jstr(c.char) + ', pinyin: ' + jstr(c.pinyin) +
    ', explain: ' + jstr(c.explain) + ', mnemonic: ' + jstr(c.mnemonic) +
    ', words: ' + jstr(c.words) + ', sentence: ' + jstr(c.sentence) +
    ', hasStroke: ' + !!c.hasStroke + ' },';
}

function placeholderLine(char) {
  return '  { char: ' + jstr(char) + ', pinyin: \'\', explain: ' + jstr(PLACEHOLDER) +
    ', mnemonic: ' + jstr(PLACEHOLDER) + ', words: [' + jstr(PLACEHOLDER) +
    '], sentence: ' + jstr(PLACEHOLDER) + ', hasStroke: false },';
}

// 执行写回，返回统计 { total, kept, hydrated, placeholder, dropped }
function apply() {
  delete require.cache[require.resolve(CHARS_FILE)];
  var chars = require(CHARS_FILE);

  var seen = {};
  var ordered = [];
  var dropped = [];
  chars.forEach(function (c) {
    if (seen[c.char]) { dropped.push(c.char); return; }
    seen[c.char] = true;
    ordered.push(c);
  });

  var kept = 0, hydrated = 0, placeholder = 0;
  var lines = [];
  var appliedChars = [];

  ordered.forEach(function (c) {
    if (isFull(c)) {
      kept++;
      lines.push(entryLine(c));
      return;
    }
    var e = store.read(c.char);
    if (e && (e.status === 'approved' || e.status === 'applied')) {
      hydrated++;
      appliedChars.push(e.char);
      lines.push(entryLine({
        char: e.char, pinyin: e.pinyin, explain: e.explain, mnemonic: e.mnemonic,
        words: e.words, sentence: e.sentence, hasStroke: hasStrokeFile(e.char)
      }));
      return;
    }
    placeholder++;
    lines.push(placeholderLine(c.char));
  });

  var header = [
    '// data/chars.js —— 高频字表（数组顺序即学习顺序）',
    '// 字段说明（PRD 6.1）：',
    '//   char      字',
    '//   pinyin    拼音（内部用，界面全程不展示）',
    '//   explain   大白话口语讲解（禁用书面语）',
    '//   mnemonic  记字诀（字谜/顺口溜）',
    '//   words     组词 2-3 个',
    '//   sentence  生活例句 1 句（≤15 个汉字）',
    '//   hasStroke 是否有笔顺数据（有则 data/strokes/<字>.json.js 存在）',
    '//',
    '// 完整文案由 content-pipeline 生成、人工审校后 apply 写回（勿直接手改本文件，',
    '// 改 content-pipeline/output/<字>.json 后重新 apply）；占位字待生产。',
    '// 【未来替换为服务端 REST API】整个字表改由 CDN 课程包下发（GET {CDN}/course/v1/chars.json）。',
    '',
    'var chars = ['
  ].join('\n');

  var body = lines.join('\n').replace(/,$/, '');
  fs.writeFileSync(CHARS_FILE, header + '\n' + body + '\n];\n\nmodule.exports = chars;\n');

  appliedChars.forEach(function (ch) { store.setStatus(ch, 'applied'); });

  return {
    total: ordered.length, kept: kept, hydrated: hydrated,
    placeholder: placeholder, dropped: dropped
  };
}

module.exports = { apply: apply };
