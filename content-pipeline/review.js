// review.js —— LLM 辅助审校：逐字检查 output/<字>.json 的文案质量
// 用法：
//   node review.js            # 审校全部 draft/approved，问题写入 review-report.json
//   node review.js --fix      # 审校后对问题字自动修正一轮（模型按问题清单修订，机器校验兜底）
// 视角：审校员只看质量（大白话、字义准确、顺口溜合理、例句自然），格式问题由 lib/validate.js 负责。

var fs = require('fs');
var path = require('path');
var config = require('./lib/config');
var llm = require('./lib/llm');
var validator = require('./lib/validate');
var syllabus = require('./lib/syllabus');

var OUT_DIR = path.join(__dirname, 'output');
var REPORT = path.join(__dirname, 'review-report.json');
var doFix = process.argv.indexOf('--fix') !== -1;

var REVIEW_SYS = [
  '你是「爸妈识字课」的文案审校员。学员是五六十岁、完全不识字的老人。逐字审下面这条识字文案，只挑真实存在的问题，不要吹毛求疵：',
  '1. explain 必须是大白话、像跟老人面对面说话；字义解释必须正确；',
  '2. mnemonic 的字形联想必须合理（偏旁拆解不能错）；',
  '3. words 必须是老人日常会听到的常用词；',
  '4. sentence 必须通顺自然、是生活中真实会说的话；',
  '5. pinyin 声调用符号标注，多音字取该用法下的读音。',
  '只输出 JSON：{"ok":true} 或 {"ok":false,"issues":["问题1","问题2"]}'
].join('\n');

function reviewOne(d, cfg) {
  var payload = {
    char: d.char, pinyin: d.pinyin, explain: d.explain,
    mnemonic: d.mnemonic, words: d.words, sentence: d.sentence
  };
  return llm.chat([
    { role: 'system', content: REVIEW_SYS },
    { role: 'user', content: JSON.stringify(payload) }
  ], cfg.llm).then(function (raw) {
    var r = llm.parseJson(raw);
    return { char: d.char, ok: !!r.ok, issues: r.issues || [] };
  });
}

// 修正一轮：把问题反馈给模型修订，机械校验通过才接受
function fixOne(d, issues, cfg, pos) {
  var payload = {
    char: d.char, pinyin: d.pinyin, explain: d.explain,
    mnemonic: d.mnemonic, words: d.words, sentence: d.sentence
  };
  return llm.chat([
    { role: 'system', content: require('./lib/prompt').SYSTEM },
    { role: 'user', content: d.char },
    { role: 'assistant', content: JSON.stringify(payload) },
    { role: 'user', content: '审校发现以下问题：\n- ' + issues.join('\n- ') +
      '\n请修正后重新输出完整 JSON 对象（没问题的地方别动），仍然只输出 JSON。' }
  ], cfg.llm).then(function (raw) {
    var data = llm.parseJson(raw);
    var r = validator.validate(d.char, data, { position: pos[d.char] || 0, posOf: pos });
    if (r.errors.length) return { char: d.char, fixed: false, errors: r.errors };
    return { char: d.char, fixed: true, data: data, warnings: r.warnings };
  });
}

async function main() {
  var cfg = config.load();
  config.validate(cfg);
  var pos = syllabus.posOf();

  var files = fs.readdirSync(OUT_DIR).filter(function (f) { return /\.json$/.test(f); });
  var entries = files.map(function (f) {
    return JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'));
  }).filter(function (d) {
    return d.status === 'draft' || d.status === 'approved' || d.status === 'applied';
  });
  console.log('待审校 ' + entries.length + ' 字');

  var problems = [];
  var idx = 0, done = 0;
  async function worker() {
    while (idx < entries.length) {
      var d = entries[idx++];
      try {
        var r = await reviewOne(d, cfg);
        done++;
        if (!r.ok) {
          problems.push(r);
          console.log('[' + done + '/' + entries.length + '] ' + r.char + ' ✗ ' + r.issues.join('；'));
        } else if (done % 50 === 0) {
          console.log('[' + done + '/' + entries.length + '] …');
        }
      } catch (e) {
        console.log('    ' + d.char + ' 审校调用失败：' + e.message);
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker(), worker()]);

  problems.sort(function (a, b) { return (pos[a.char] || 9999) - (pos[b.char] || 9999); });
  fs.writeFileSync(REPORT, JSON.stringify({ generatedAt: new Date().toISOString(), problems: problems }, null, 2));
  console.log('\n审校完成：' + entries.length + ' 字，发现问题 ' + problems.length + ' 字 → review-report.json');

  if (doFix && problems.length) {
    console.log('\n开始修正 ' + problems.length + ' 字…');
    var fixed = 0;
    for (var i = 0; i < problems.length; i++) {
      var p = problems[i];
      var d = entries.filter(function (e) { return e.char === p.char; })[0];
      try {
        var f = await fixOne(d, p.issues, cfg, pos);
        if (f.fixed) {
          d.pinyin = f.data.pinyin; d.explain = f.data.explain; d.mnemonic = f.data.mnemonic;
          d.words = f.data.words; d.sentence = f.data.sentence;
          var vr = validator.validate(d.char, d, { position: pos[d.char] || 0, posOf: pos });
          d.errors = vr.errors; d.warnings = vr.warnings;
          d.status = 'draft'; // 修正后回到待审
          fs.writeFileSync(path.join(OUT_DIR, p.char + '.json'), JSON.stringify(d, null, 2) + '\n');
          fixed++;
          console.log('  ' + p.char + ' 已修正（回 draft 待复审）');
        } else {
          console.log('  ' + p.char + ' 修正后校验未过，保留原文：' + f.errors.join('；'));
        }
      } catch (e) {
        console.log('  ' + p.char + ' 修正调用失败：' + e.message);
      }
    }
    console.log('修正完成：' + fixed + '/' + problems.length);
  }
}

main().catch(function (e) { console.error(e.message); process.exit(1); });
