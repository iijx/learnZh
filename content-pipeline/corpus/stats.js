#!/usr/bin/env node
// corpus/stats.js —— 语料库字频统计（syllabus.md §3 第1步的统计工具）
//
// 用法：
//   node corpus/stats.js            # 分级覆盖概览 + 高频字 TOP 50
//   node corpus/stats.js --all      # 追加输出完整字频表（按频率降序）
//   node corpus/stats.js --missing  # 追加输出：语料用到、但现有字表（chars.js）没有的字
//
// 输出解读：L1 语料的独立字数 ≈ L1 字表的参考规模；累计独立字数增长曲线
// 用于校准各级容量（syllabus.md §2：L1 300 / L2 500 / L3 700 / L4 500 / L5 500）。

var fs = require('fs');
var path = require('path');

var CORPUS_FILE = path.join(__dirname, 'scenes.json');
var CHARS_FILE = path.join(__dirname, '..', '..', 'miniprograme', 'data', 'chars.js');

var corpus = JSON.parse(fs.readFileSync(CORPUS_FILE, 'utf8'));

function hanziOf(s) {
  return String(s || '').match(/[一-鿿]/g) || [];
}

var freq = {};          // 字 → 总频次
var byLevel = {};       // level → Set（该级语料用到的字）
corpus.scenes.forEach(function (sc) {
  var set = byLevel[sc.level] || (byLevel[sc.level] = {});
  hanziOf(sc.text).forEach(function (ch) {
    freq[ch] = (freq[ch] || 0) + 1;
    set[ch] = true;
  });
});

var levels = Object.keys(byLevel).map(Number).sort(function (a, b) { return a - b; });
var seen = {};
var cumulative = 0;

console.log('语料：' + corpus.scenes.length + ' 个场景，共 ' +
  Object.keys(freq).length + ' 个不同汉字\n');
console.log('级别\t场景数\t本级新字\t累计字数');
levels.forEach(function (lv) {
  var fresh = 0;
  Object.keys(byLevel[lv]).forEach(function (ch) {
    if (!seen[ch]) { seen[ch] = true; fresh++; }
  });
  cumulative += fresh;
  var nScenes = corpus.scenes.filter(function (s) { return s.level === lv; }).length;
  console.log('L' + lv + '\t' + nScenes + '\t' + fresh + '\t' + cumulative);
});

if (process.argv.indexOf('--missing') !== -1) {
  delete require.cache[require.resolve(CHARS_FILE)];
  var table = {};
  require(CHARS_FILE).forEach(function (c) { table[c.char] = true; });
  var missing = Object.keys(freq).filter(function (ch) { return !table[ch]; });
  console.log('\n语料用到但现有字表没有的字（' + missing.length + ' 个）：');
  console.log(missing.join(''));
}

if (process.argv.indexOf('--all') !== -1) {
  var sorted = Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; });
  console.log('\n完整字频表（字:频次）：');
  console.log(sorted.map(function (ch) { return ch + ':' + freq[ch]; }).join(' '));
} else {
  var top = Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; }).slice(0, 50);
  console.log('\n高频字 TOP 50：');
  console.log(top.map(function (ch) { return ch + ':' + freq[ch]; }).join(' '));
}
