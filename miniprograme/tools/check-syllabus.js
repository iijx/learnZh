// tools/check-syllabus.js —— 大纲质量验收（syllabus.md §6 五条规则的脚本化）
// 运行：node miniprograme/tools/check-syllabus.js
// 退出码：有阻断项失败时非 0（可挂 CI）

var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var syllabus = require(path.join(ROOT, 'content-pipeline', 'lib', 'syllabus.js'));

var PLACEHOLDER = '内容待补充';
var errors = [];
var warns = [];

function err(msg) { errors.push(msg); }
function warn(msg) { warns.push(msg); }
function hanziOf(s) { return String(s || '').match(/[一-鿿]/g) || []; }

var order = syllabus.order(); // [{char, level, unit, sceneId}]

// ===== 规则 1：字表无重复 =====
(function () {
  var seen = {};
  order.forEach(function (o) {
    if (seen[o.char]) err('规则1 字表重复：「' + o.char + '」出现多次');
    seen[o.char] = true;
  });
  console.log('规则1 无重复：' + order.length + ' 字，' + (errors.length ? '有重复 ✗' : '通过 ✓'));
})();

// 字 → 学习位置（1 起）、级别内截止位置（unit u 结束时的累计字数）
var posOf = syllabus.posOf();
function learnedUpToUnit(level, unit) {
  var set = {};
  order.forEach(function (o) {
    if (o.level < level || (o.level === level && o.unit <= unit)) set[o.char] = true;
  });
  return set;
}

// ===== 规则 4：内容完整度（线上包七件套 + 音频六条）=====
(function () {
  var levels = {};
  order.forEach(function (o) { levels[o.level] = true; });
  var audioManifest = require(path.join(ROOT, 'miniprograme', 'data', 'audio-manifest.js'));
  var hasAudio = audioManifest.has.bind(audioManifest);

  Object.keys(levels).forEach(function (lv) {
    var packFile = path.join(ROOT, 'content-pipeline', 'dist', 'learn-zh', 'chars.L' + lv + '.json');
    var pack;
    try { pack = require(packFile); } catch (e) { warn('规则4 L' + lv + ' 包不存在（未 publish？）'); return; }
    var bad = [];
    pack.forEach(function (c) {
      var lack = [];
      if (!c.pinyin) lack.push('拼音');
      if (!c.explain || c.explain === PLACEHOLDER) lack.push('讲解');
      if (!c.mnemonic || c.mnemonic === PLACEHOLDER) lack.push('记字诀');
      if (!c.words || c.words.filter(function (w) { return w !== PLACEHOLDER; }).length < 3) lack.push('组词');
      if (!c.sentence || c.sentence === PLACEHOLDER) lack.push('例句');
      if (!c.hasStroke) lack.push('笔顺');
      ['', 'sentence_', 'explain_'].forEach(function (p) {
        if (!hasAudio(p + c.char)) lack.push(p ? p.replace('_', '') + '音频' : '字音');
      });
      (c.words || []).forEach(function (w, i) {
        if (w !== PLACEHOLDER && !hasAudio('word_' + c.char + '_' + i)) lack.push('组词' + i + '音频');
      });
      if (lack.length) bad.push(c.char + '(' + lack.join('/') + ')');
    });
    if (bad.length) err('规则4 L' + lv + ' 完整度不足 ' + bad.length + ' 字：' + bad.slice(0, 10).join('、') + (bad.length > 10 ? '…' : ''));
    console.log('规则4 L' + lv + ' 内容完整度：' + pack.length + ' 字，' + (bad.length ? '缺项 ✗' : '七件套+音频齐 ✓'));
  });
})();

// ===== 规则 2：场景语料自洽（场景文本用字 ⊆ 该单元及之前已学的字）=====
(function () {
  var scenes = require(path.join(ROOT, 'content-pipeline', 'corpus', 'scenes.json')).scenes;
  var totalBad = 0;
  scenes.forEach(function (sc) {
    // 级别内序号即单元号（每级场景从 1 编号）
    var seq = scenes.filter(function (s) { return s.level === sc.level; }).indexOf(sc) + 1;
    var learned = learnedUpToUnit(sc.level, seq);
    // 该级之前级别的字也算已学
    var unknown = [];
    hanziOf(sc.text).forEach(function (ch) {
      if (!learned[ch] && unknown.indexOf(ch) === -1) unknown.push(ch);
    });
    // 未列入大纲的字（语料里有但不教）不算违规，只提醒
    var notInSyllabus = unknown.filter(function (ch) { return !posOf[ch]; });
    var tooEarly = unknown.filter(function (ch) { return posOf[ch]; });
    if (tooEarly.length) {
      totalBad++;
      err('规则2 场景「' + sc.title + '」(L' + sc.level + ' 单元' + seq + ') 含未学字：' + tooEarly.join(''));
    }
    if (notInSyllabus.length) {
      warn('规则2 场景「' + sc.title + '」含大纲外字（不教但出现）：' + notInSyllabus.join(''));
    }
  });
  console.log('规则2 场景自洽：60 场景，' + (totalBad ? totalBad + ' 个场景超纲 ✗' : 'L1-L5 全部自洽 ✓'));
})();

// ===== 规则 3：古诗/故事 i+1（生字率 ≤5%，单篇生字 ≤2，生字 = 解锁点之前未学的字）=====
// unlockAt 超出当前已定稿字数的条目属后续级别范围，只提醒不阻断（定稿该级时须修平）
(function () {
  var maxPos = order.length;
  function check(list, kind) {
    list.forEach(function (item) {
      var text = (item.lines || []).join('');
      var chars = hanziOf(text);
      var fresh = [];
      chars.forEach(function (ch) {
        if ((!posOf[ch] || posOf[ch] > item.unlockAt) && fresh.indexOf(ch) === -1) fresh.push(ch);
      });
      var rate = chars.length ? fresh.length / chars.length : 0;
      if (fresh.length > 2 || rate > 0.05) {
        var msg = '规则3 ' + kind + '《' + item.title + '》(unlockAt=' + item.unlockAt + ') 生字 ' +
          fresh.length + ' 个（' + fresh.join('') + '），生字率 ' + (rate * 100).toFixed(1) + '%';
        if (item.unlockAt <= maxPos) err(msg); else warn(msg + '（未上线范围）');
      }
    });
    console.log('规则3 ' + kind + ' i+1：' + list.length + ' 篇已检查');
  }
  check(require(path.join(ROOT, 'miniprograme', 'data', 'poems.js')), '古诗');
  check(require(path.join(ROOT, 'miniprograme', 'data', 'stories.js')), '故事');
})();

// ===== 规则 5：覆盖抽测 =====
// 注：现有语料（corpus/scenes.json）参与了选字，按 §6 要求应用「未参与选字的文本」抽测，
// 待补充外部抽测语料库后实现；当前以规则 2 的场景自洽作为下界保障。
warn('规则5 覆盖抽测未实现：缺「未参与选字」的外部文本语料');

// ===== 汇总 =====
console.log('');
console.log('==== 验收结果 ====');
console.log('阻断项失败：' + errors.length);
errors.forEach(function (m) { console.log('  ✗ ' + m); });
console.log('提醒：' + warns.length);
warns.slice(0, 20).forEach(function (m) { console.log('  ⚠ ' + m); });
if (warns.length > 20) console.log('  ⚠ …其余 ' + (warns.length - 20) + ' 条省略');
process.exit(errors.length ? 1 : 0);
