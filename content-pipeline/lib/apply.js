// lib/apply.js —— 把审校通过（approved）的文案写回 miniprograme/data/chars.js
// 原则：
//   - 学习顺序由 syllabus.json 的 order 决定；chars.js 按此重排，大纲外的旧字排在其后；
//   - 大纲有而 chars.js 没有的字（新增字）自动补占位条目；
//   - 已有完整内容的手写字原样保留；占位字用 output/<字>.json 水合；
//   - hasStroke 按 hanzi-writer-data 是否有该字笔顺重新判定（笔顺数据走 CDN，见 lib/strokes.js）；
//   - 写回成功的字在 output 里标记为 applied。

var fs = require('fs');
var path = require('path');
var store = require('./store.js');
var syllabus = require('./syllabus.js');
var strokes = require('./strokes.js');

var MINIPROG = path.join(__dirname, '..', '..', 'miniprograme');
var CHARS_FILE = path.join(MINIPROG, 'data', 'chars.js');

var PLACEHOLDER = '内容待补充';

function isFull(c) { return c.explain && c.explain !== PLACEHOLDER; }

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

// 执行写回，返回统计 { total, inSyllabus, kept, hydrated, added, placeholder, dropped }
function apply() {
  delete require.cache[require.resolve(CHARS_FILE)];
  var chars = require(CHARS_FILE);
  var byChar = {};
  chars.forEach(function (c) { if (!byChar[c.char]) byChar[c.char] = c; });

  // 顺序：syllabus order 在前，大纲外的旧字按原顺序排在后
  var inSyllabus = {};
  var ordered = [];
  syllabus.order().forEach(function (o) {
    if (inSyllabus[o.char]) return;
    inSyllabus[o.char] = true;
    ordered.push(o.char);
  });
  var extra = 0;
  chars.forEach(function (c) {
    if (!inSyllabus[c.char]) { inSyllabus[c.char] = true; ordered.push(c.char); extra++; }
  });

  var kept = 0, hydrated = 0, added = 0, placeholder = 0;
  var lines = [];
  var appliedChars = [];

  ordered.forEach(function (ch) {
    var c = byChar[ch];
    var e = store.read(ch);
    // output 里有 approved/applied 产物的一律以产物为准（复审修订也要能覆盖已写回的旧文案）；
    // 没有产物的字（如手写示范字）保留 chars.js 原文
    if (e && (e.status === 'approved' || e.status === 'applied')) {
      if (c && isFull(c)) {
        var same = c.pinyin === e.pinyin && c.explain === e.explain && c.mnemonic === e.mnemonic &&
          JSON.stringify(c.words) === JSON.stringify(e.words) && c.sentence === e.sentence;
        if (same) { kept++; lines.push(entryLine(c)); return; }
        kept++;
        appliedChars.push(ch);
        lines.push(entryLine({
          char: ch, pinyin: e.pinyin, explain: e.explain, mnemonic: e.mnemonic,
          words: e.words, sentence: e.sentence, hasStroke: strokes.available(ch)
        }));
        return;
      }
      if (!c) added++; // 大纲新增、旧字表没有的字
      hydrated++;
      appliedChars.push(ch);
      lines.push(entryLine({
        char: ch, pinyin: e.pinyin, explain: e.explain, mnemonic: e.mnemonic,
        words: e.words, sentence: e.sentence, hasStroke: strokes.available(ch)
      }));
      return;
    }
    if (c && isFull(c)) {
      kept++;
      lines.push(entryLine(c));
      return;
    }
    if (!c) added++;
    placeholder++;
    lines.push(placeholderLine(ch));
  });

  var header = [
    '// data/chars.js —— 字表文案存储（由 content-pipeline 维护，勿手改）',
    '// 学习顺序 = 本文件数组顺序 = syllabus.json 的 order（大纲外旧字排在其后）。',
    '// 字段说明（PRD 6.1）：char 字 / pinyin 拼音 / explain 大白话讲解 / mnemonic 记字诀',
    '//   words 组词 2-3 个 / sentence 生活例句（≤15 个汉字）/ hasStroke 有无笔顺数据',
    '// 完整文案由 content-pipeline 生成、人工审校后 apply 写回；占位字待生产。',
    '',
    'var chars = ['
  ].join('\n');

  var body = lines.join('\n').replace(/,$/, '');
  fs.writeFileSync(CHARS_FILE, header + '\n' + body + '\n];\n\nmodule.exports = chars;\n');

  appliedChars.forEach(function (ch) { store.setStatus(ch, 'applied'); });

  return {
    total: ordered.length, kept: kept, hydrated: hydrated,
    added: added, placeholder: placeholder, extra: extra
  };
}

module.exports = { apply: apply };
