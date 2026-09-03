#!/usr/bin/env node
// index.js —— 文案生产管线主入口
//
// 用法：
//   node index.js generate                 # 为字表中没有产物的占位字生成文案（增量）
//   node index.js generate --chars 药医病   # 只生成指定的字
//   node index.js generate --force         # 连已有产物的占位字也重新生成
//   node index.js generate --limit N       # 最多生成 N 个（试跑用）
//   node index.js generate --dry-run       # 不调用 LLM，打印目标清单与完整提示词
//   node index.js stats                    # 生产进度统计
//   node index.js approve --chars 药医病    # 审校通过后标记 approved（会先跑机器校验）
//   node index.js approve --all            # 全部 draft 中校验通过的标记 approved
//   node index.js apply                    # 把 approved 写回 miniprograme/data/chars.js
//
// 工作流：generate → 人工审校 output/<字>.json → approve → apply → 跑 audio-pipeline 合成音频
//
// 产物：
//   output/<字>.json   一字一文件，status: draft | invalid | approved | applied
//   miniprograme/data/chars.js   apply 时重写（保持学习顺序，去重）

var path = require('path');

var config = require('./lib/config.js');
var llm = require('./lib/llm.js');
var prompt = require('./lib/prompt.js');
var store = require('./lib/store.js');
var validator = require('./lib/validate.js');
var applyLib = require('./lib/apply.js');

var MINIPROG = path.join(__dirname, '..', 'miniprograme');
var CHARS_FILE = path.join(MINIPROG, 'data', 'chars.js');
var PLACEHOLDER = '内容待补充';

var ARGS = process.argv.slice(2);
var CMD = ARGS[0] || '';

function flag(name) { return ARGS.indexOf(name) !== -1; }
function optValue(name) {
  var i = ARGS.indexOf(name);
  return (i !== -1 && ARGS[i + 1] && ARGS[i + 1].indexOf('--') !== 0) ? ARGS[i + 1] : '';
}

function loadChars() {
  delete require.cache[require.resolve(CHARS_FILE)];
  return require(CHARS_FILE);
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// 并发池：最多 concurrency 个 worker 并行；结果按输入顺序返回，出错项为 { error }
function runPool(items, worker, concurrency) {
  var next = 0, active = 0, results = new Array(items.length);
  return new Promise(function (resolve) {
    function pump() {
      while (active < concurrency && next < items.length) {
        (function (i) {
          active++;
          worker(items[i]).then(function (r) {
            results[i] = r;
          }, function (e) {
            results[i] = { error: e && e.message ? e.message : String(e) };
          }).then(function () {
            active--;
            if (next >= items.length && active === 0) resolve(results);
            else pump();
          });
        })(next++);
      }
      if (next >= items.length && active === 0) resolve(results);
    }
    pump();
  });
}

// 生成单个字：LLM 调用（重试）→ 解析 → 校验 → 校验失败自动修正一轮 → 落盘
function generateOne(char, cfg) {
  var attempts = (cfg.run.retries || 0) + 1;
  var attempt = 0;
  var messages = prompt.buildMessages(char);

  function tryChat() {
    attempt++;
    return llm.chat(messages, cfg.llm).catch(function (e) {
      if (attempt >= attempts) throw e;
      var wait = 1000 * Math.pow(2, attempt - 1);
      console.log('    ' + char + ' 重试 ' + attempt + '/' + (attempts - 1) + '（' + wait + 'ms 后，' + e.message + '）');
      return sleep(wait).then(tryChat);
    });
  }

  return tryChat().then(function (raw) {
    var data = llm.parseJson(raw);
    var result = validator.validate(char, data);
    if (!result.errors.length) return { data: data, result: result };
    // 校验失败：把错误反馈给模型，自我修正一轮
    messages.push({ role: 'assistant', content: raw });
    messages.push({ role: 'user', content: prompt.fixMessage(result.errors) });
    return llm.chat(messages, cfg.llm).then(function (raw2) {
      var data2 = llm.parseJson(raw2);
      return { data: data2, result: validator.validate(char, data2) };
    });
  }).then(function (out) {
    var ok = !out.result.errors.length;
    store.write({
      char: char,
      pinyin: out.data.pinyin, explain: out.data.explain, mnemonic: out.data.mnemonic,
      words: out.data.words, sentence: out.data.sentence,
      status: ok ? 'draft' : 'invalid',
      errors: out.result.errors, warnings: out.result.warnings,
      model: cfg.llm.model,
      generatedAt: new Date().toISOString()
    });
    return { char: char, ok: ok, errors: out.result.errors, warnings: out.result.warnings };
  });
}

// ===== generate =====
async function cmdGenerate() {
  var chars = loadChars();
  var inTable = {};
  chars.forEach(function (c) { if (!inTable[c.char]) inTable[c.char] = c; });

  var targets;
  var charsArg = optValue('--chars');
  if (charsArg) {
    targets = charsArg.split('');
    var unknown = targets.filter(function (ch) { return !inTable[ch]; });
    if (unknown.length) {
      console.error('这些字不在字表里：' + unknown.join(' '));
      process.exit(2);
    }
    var full = targets.filter(function (ch) { return inTable[ch].explain !== PLACEHOLDER; });
    if (full.length) {
      console.log('跳过已有完整文案的字（手写字不覆盖）：' + full.join(' '));
      targets = targets.filter(function (ch) { return full.indexOf(ch) === -1; });
    }
  } else {
    targets = chars
      .filter(function (c) { return c.explain === PLACEHOLDER; })
      .map(function (c) { return c.char; });
    if (!flag('--force')) {
      var before = targets.length;
      targets = targets.filter(function (ch) { return !store.has(ch); });
      var skipped = before - targets.length;
      if (skipped > 0) console.log('已有产物跳过 ' + skipped + ' 字（重生成请加 --force）');
    }
  }
  // 去重
  targets = targets.filter(function (ch, i) { return targets.indexOf(ch) === i; });

  var limit = parseInt(optValue('--limit'), 10);
  if (limit > 0 && targets.length > limit) targets = targets.slice(0, limit);

  if (!targets.length) {
    console.log('没有需要生成的字。');
    return;
  }

  if (flag('--dry-run')) {
    console.log('【dry-run】不调用 LLM。目标 ' + targets.length + ' 字：' + targets.slice(0, 50).join('') +
      (targets.length > 50 ? ' ……' : ''));
    console.log('\n===== 提示词（以「' + targets[0] + '」为例）=====');
    prompt.buildMessages(targets[0]).forEach(function (m) {
      console.log('\n[' + m.role + ']\n' + m.content);
    });
    return;
  }

  var cfg = config.load();
  config.validate(cfg);
  console.log('模型 ' + cfg.llm.model + '，并发 ' + cfg.run.concurrency + '，目标 ' + targets.length + ' 字');

  var done = 0, okCount = 0, invalid = [], failed = [];
  await runPool(targets, function (ch) {
    return generateOne(ch, cfg).then(function (r) {
      done++;
      if (r.ok) {
        okCount++;
        var warn = r.warnings.length ? '（提醒：' + r.warnings.join('；') + '）' : '';
        console.log('[' + done + '/' + targets.length + '] ' + ch + ' OK' + warn);
      } else {
        invalid.push(ch);
        console.log('[' + done + '/' + targets.length + '] ' + ch + ' 校验未过：' + r.errors.join('；') + '（已存为 invalid，可人工修正后 approve）');
      }
      return r;
    }).catch(function (e) {
      done++;
      failed.push(ch + '（' + e.message + '）');
      console.log('[' + done + '/' + targets.length + '] ' + ch + ' 生成失败: ' + e.message);
      return { char: ch, failed: true };
    });
  }, cfg.run.concurrency);

  console.log('\n完成：成功 ' + okCount + ' 字（draft，待审校）' +
    (invalid.length ? '，校验未过 ' + invalid.length + ' 字：' + invalid.join('') : '') +
    (failed.length ? '，调用失败 ' + failed.length + ' 字：' + failed.join('、') : ''));
  console.log('下一步：人工审校 output/<字>.json，然后 node index.js approve --all，再 node index.js apply');
  if (failed.length) process.exitCode = 1;
}

// ===== stats =====
function cmdStats() {
  var chars = loadChars();
  var full = chars.filter(function (c) { return c.explain !== PLACEHOLDER; }).length;
  var c = store.counts();
  console.log('字表：共 ' + chars.length + ' 字，已完整 ' + full + '，占位 ' + (chars.length - full));
  console.log('产物：draft ' + c.draft + '，invalid ' + c.invalid + '，approved ' + c.approved + '，applied ' + c.applied);
  var remaining = chars.length - full - c.draft - c.approved;
  console.log('待生成：约 ' + Math.max(remaining, 0) + ' 字');
}

// ===== approve =====
function cmdApprove() {
  var entries = store.list();
  var charsArg = optValue('--chars');
  if (charsArg) {
    var want = charsArg.split('');
    entries = entries.filter(function (e) { return want.indexOf(e.char) !== -1; });
  } else if (flag('--all')) {
    entries = entries.filter(function (e) { return e.status === 'draft'; });
  } else {
    console.error('用法：node index.js approve --chars 药医病   或   node index.js approve --all');
    process.exit(2);
  }

  var ok = 0, refused = [];
  entries.forEach(function (e) {
    var result = validator.validate(e.char, e);
    if (result.errors.length) {
      refused.push(e.char + '（' + result.errors.join('；') + '）');
      return;
    }
    store.setStatus(e.char, 'approved');
    ok++;
  });
  console.log('已标记 approved：' + ok + ' 字' +
    (refused.length ? '；拒绝 ' + refused.length + ' 字（仍有机器校验错误）：' + refused.join('、') : ''));
}

// ===== apply =====
function cmdApply() {
  var r = applyLib.apply();
  console.log('已写回 miniprograme/data/chars.js：');
  console.log('  总字数 ' + r.total + '（去重剔除 ' + r.dropped.length + ' 个' +
    (r.dropped.length ? '：' + r.dropped.join('') : '') + '）');
  console.log('  保留手写完整 ' + r.kept + ' 字，本次水合 ' + r.hydrated + ' 字，仍为占位 ' + r.placeholder + ' 字');
  if (r.hydrated > 0) {
    console.log('下一步：运行 audio-pipeline 合成新增字的音频（node ../audio-pipeline/index.js）');
  }
}

var handlers = {
  generate: cmdGenerate,
  stats: cmdStats,
  approve: cmdApprove,
  apply: cmdApply
};

if (!handlers[CMD]) {
  console.log('用法：node index.js <generate|stats|approve|apply> [选项]，详见文件头注释');
  process.exit(CMD ? 2 : 0);
}

Promise.resolve(handlers[CMD]()).catch(function (e) {
  console.error('\n运行中止：' + e.message);
  process.exit(1);
});
