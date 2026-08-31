#!/usr/bin/env node
// index.js —— 音频生产管线主入口：字表 → 豆包 TTS 合成 → 本地写入 → COS 上传 → 清单更新
//
// 用法：
//   node index.js                  # 合成缺失音频，本地写入 + 上传 COS（已存在均跳过）
//   node index.js --force          # 全部重新合成并覆盖上传
//   node index.js --skip-upload    # 只生成本地 mp3，不上传 COS（本地试听/调试）
//   node index.js --remote-only    # 不落本地，合成后直接传 COS（CDN 全量部署，等价于全量重跑）
//   node index.js --all            # 占位字也纳入（占位字只合成单字读音，见 lib/jobs.js）
//   node index.js --dry-run        # 只打印任务清单，不合成不上传（无需配置凭证）
//   node index.js --limit N        # 最多处理 N 条（试跑用）
//
// 产物：
//   miniprograme/assets/audio/<key>.mp3   合成音频（--remote-only 时不写）
//   miniprograme/data/audio-manifest.js   每次运行后按最终可用 key 重写（小程序端读取）
//   COS  <prefix>/<key>.mp3 + manifest.json（上传模式，prefix 见 config.json）
//   state.json                            本次运行统计（含失败清单，供续跑排查）
//
// key 规则与 miniprograme/tools/README.md 第 1 节一致：
//   单字读音 <字>；讲解 explain_<字>；组词 word_<字>_<i>；例句 sentence_<字>

var fs = require('fs');
var path = require('path');

var config = require('./lib/config.js');
var cosLib = require('./lib/cos.js');
var tts = require('./lib/doubao-tts.js');
var jobsLib = require('./lib/jobs.js');

var MINIPROG = path.join(__dirname, '..', 'miniprograme');
var OUT_DIR = path.join(MINIPROG, 'assets', 'audio');
var MANIFEST_FILE = path.join(MINIPROG, 'data', 'audio-manifest.js');
var STATE_FILE = path.join(__dirname, 'state.json');
var CHARS_FILE = path.join(MINIPROG, 'data', 'chars.js');

// ===== 命令行参数 =====
var ARGS = process.argv.slice(2);
var FORCE = ARGS.indexOf('--force') !== -1;
var SKIP_UPLOAD = ARGS.indexOf('--skip-upload') !== -1;
var REMOTE_ONLY = ARGS.indexOf('--remote-only') !== -1;
var ALL = ARGS.indexOf('--all') !== -1;
var DRY_RUN = ARGS.indexOf('--dry-run') !== -1;
var LIMIT = 0;
(function () {
  var i = ARGS.indexOf('--limit');
  if (i !== -1 && ARGS[i + 1] && /^\d+$/.test(ARGS[i + 1])) LIMIT = parseInt(ARGS[i + 1], 10);
})();

if (REMOTE_ONLY && SKIP_UPLOAD) {
  console.error('参数冲突：--remote-only 与 --skip-upload 不能同时使用');
  process.exit(2);
}

var UPLOAD = !SKIP_UPLOAD;

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

// 合成 + 指数退避重试（共 retries + 1 次尝试）
function synthWithRetry(text, cfg) {
  var attempts = (cfg.run.retries || 0) + 1;
  var attempt = 0;
  function tryOnce() {
    attempt++;
    return tts.synth(text, cfg.doubao).catch(function (e) {
      if (attempt >= attempts) throw e;
      var wait = 1000 * Math.pow(2, attempt - 1);
      console.log('    重试 ' + attempt + '/' + (attempts - 1) + '（' + wait + 'ms 后，' + e.message + '）');
      return sleep(wait).then(tryOnce);
    });
  }
  return tryOnce();
}

// 按可用 key 重写 miniprograme/data/audio-manifest.js（格式与旧 tools/gen-audio.js 一致）
function writeManifest(keys) {
  keys = keys.slice().sort();
  var out = '// data/audio-manifest.js —— 已生成的语音清单（audio-pipeline/index.js 每次运行后自动重写）\n' +
    '// key 规则：单字读音 <字>；讲解 explain_<字>；组词 word_<字>_<i>；例句 sentence_<字>\n' +
    '// 音频实际位置由 services/audio-config.js 的 BASE 决定（本地打包或 CDN）\n' +
    'var KEYS = ' + JSON.stringify(keys, null, 2) + ';\n\n' +
    'module.exports = {\n' +
    '  has: function (key) { return KEYS.indexOf(key) !== -1; },\n' +
    '  path: function (key) { return this.has(key) ? \'/assets/audio/\' + key + \'.mp3\' : null; },\n' +
    '  keys: KEYS\n};\n';
  fs.writeFileSync(MANIFEST_FILE, out);
  return keys.length;
}

function fmtKb(n) { return (n / 1024).toFixed(1) + ' KB'; }

async function main() {
  var cfg = config.load();
  var chars = require(CHARS_FILE);
  var jobs = jobsLib.buildJobs(chars, { all: ALL });
  var fullCount = chars.filter(function (c) { return c.explain && c.explain !== '内容待补充'; }).length;

  if (DRY_RUN) {
    console.log('【dry-run】不合成不上传，仅列出任务（共 ' + jobs.length + ' 条）');
    jobs.forEach(function (j, i) {
      console.log(String(i + 1).padStart(4, ' ') + '. ' + j.key + '  「' + j.text + '」');
    });
    return;
  }

  config.validate(cfg, UPLOAD ? 'upload' : 'skip-upload');
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // 需合成的：本地缺失，或 --force / --remote-only 全量
  var todo = (FORCE || REMOTE_ONLY)
    ? jobs.slice()
    : jobs.filter(function (j) { return !fs.existsSync(path.join(OUT_DIR, j.key + '.mp3')); });
  var skipLocal = jobs.length - todo.length;
  var limited = false;
  if (LIMIT > 0 && todo.length > LIMIT) { todo = todo.slice(0, LIMIT); limited = true; }

  console.log('配置：语速档 ' + cfg.run.rate + '（speechRate=' + cfg.doubao.speechRate + '），并发 ' +
    cfg.run.concurrency + '，重试 ' + cfg.run.retries + '，模式 ' +
    (REMOTE_ONLY ? 'remote-only' : (UPLOAD ? '本地+上传' : 'skip-upload')));
  console.log('字表 ' + chars.length + ' 字（完整 ' + fullCount + '），任务 ' + jobs.length +
    ' 条，本地已有 ' + skipLocal + ' 条，本次需合成 ' + todo.length + ' 条' +
    (limited ? '（--limit 截断）' : ''));

  var cos = null;
  if (UPLOAD) cos = cosLib.makeCos(cfg.cos);

  var done = 0, synOk = 0, synFailed = [], uploaded = 0, upSkipped = 0, upFailed = [];
  var remoteKeys = {};   // remote-only 模式下记录 COS 上最终可用的 key

  // ===== 阶段一：合成（并发）→ 本地写入 → 上传 =====
  await runPool(todo, function (j) {
    return synthWithRetry(j.text, cfg).then(function (buf) {
      synOk++;
      if (!REMOTE_ONLY) fs.writeFileSync(path.join(OUT_DIR, j.key + '.mp3'), buf);
      if (!UPLOAD) {
        console.log('[' + (++done) + '/' + todo.length + '] ' + j.key + ' OK (' + fmtKb(buf.length) + ')');
        return { key: j.key };
      }
      // 上传：--force / --remote-only 直接覆盖；否则 COS 已存在就跳过
      var p = (FORCE || REMOTE_ONLY)
        ? Promise.resolve('put')
        : cosLib.head(cos, cfg.cos, j.key).then(function (exists) { return exists ? 'skip' : 'put'; });
      return p.then(function (act) {
        if (act === 'skip') {
          upSkipped++;
          if (REMOTE_ONLY) remoteKeys[j.key] = true;
          console.log('[' + (++done) + '/' + todo.length + '] ' + j.key + ' OK (' + fmtKb(buf.length) + '，COS 已有)');
          return { key: j.key };
        }
        return cosLib.putMp3(cos, cfg.cos, j.key, buf).then(function () {
          uploaded++;
          if (REMOTE_ONLY) remoteKeys[j.key] = true;
          console.log('[' + (++done) + '/' + todo.length + '] ' + j.key + ' OK (' + fmtKb(buf.length) + '，已上传)');
          return { key: j.key };
        }, function (e) {
          upFailed.push(j.key + '（' + e.message + '）');
          console.log('[' + (++done) + '/' + todo.length + '] ' + j.key + ' 上传失败: ' + e.message);
          return { key: j.key, uploadFailed: true };
        });
      });
    }).catch(function (e) {
      synFailed.push(j.key + '（' + e.message + '）');
      console.log('[' + (++done) + '/' + todo.length + '] ' + j.key + ' 失败: ' + e.message);
      return { key: j.key, failed: true };
    });
  }, cfg.run.concurrency);

  // ===== 阶段二：本地已有、COS 可能缺失的补传 =====
  if (UPLOAD && !REMOTE_ONLY) {
    var todoSet = {};
    todo.forEach(function (j) { todoSet[j.key] = true; });
    var backlog = jobs.filter(function (j) { return !todoSet[j.key]; });
    if (backlog.length) {
      console.log('补传检查：本地已有 ' + backlog.length + ' 条，核对 COS……');
      await runPool(backlog, function (j) {
        return cosLib.head(cos, cfg.cos, j.key).then(function (exists) {
          if (exists) { upSkipped++; return { key: j.key }; }
          var buf = fs.readFileSync(path.join(OUT_DIR, j.key + '.mp3'));
          return cosLib.putMp3(cos, cfg.cos, j.key, buf).then(function () {
            uploaded++;
            console.log('  补传 ' + j.key);
            return { key: j.key };
          }, function (e) {
            upFailed.push(j.key + '（' + e.message + '）');
            console.log('  补传失败 ' + j.key + ': ' + e.message);
            return { key: j.key, uploadFailed: true };
          });
        }, function (e) {
          upFailed.push(j.key + '（' + e.message + '）');
          console.log('  查询失败 ' + j.key + ': ' + e.message);
          return { key: j.key, uploadFailed: true };
        });
      }, cfg.run.concurrency);
    }
  }

  // ===== 阶段三：清单 + 状态 + 汇总 =====
  var manifestKeys;
  if (REMOTE_ONLY) {
    manifestKeys = Object.keys(remoteKeys);
  } else {
    manifestKeys = fs.readdirSync(OUT_DIR).filter(function (f) {
      return f.endsWith('.mp3') && f !== 'silence.mp3';
    }).map(function (f) { return f.replace(/\.mp3$/, ''); });
  }
  var total = writeManifest(manifestKeys);

  if (UPLOAD) {
    var manifestObj = {
      keys: manifestKeys.slice().sort(),
      baseUrl: cfg.cos.publicBaseUrl ? cfg.cos.publicBaseUrl.replace(/\/+$/, '') + '/' + cfg.cos.prefix.replace(/^\/+|\/+$/g, '') : '',
      generatedAt: new Date().toISOString()
    };
    try {
      await cosLib.putJson(cos, cfg.cos, 'manifest.json', manifestObj);
      console.log('COS manifest.json 已更新（' + manifestObj.keys.length + ' 条）');
    } catch (e) {
      console.log('COS manifest.json 上传失败（不影响音频本身）：' + e.message);
    }
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify({
    lastRun: new Date().toISOString(),
    mode: REMOTE_ONLY ? 'remote-only' : (UPLOAD ? 'upload' : 'skip-upload'),
    force: FORCE, all: ALL,
    totalJobs: jobs.length, synOk: synOk, synFailed: synFailed,
    uploaded: uploaded, upSkipped: upSkipped, upFailed: upFailed,
    manifestKeys: total
  }, null, 2));

  console.log('\n完成：合成成功 ' + synOk + ' 条' +
    (synFailed.length ? '，失败 ' + synFailed.length + ' 条：' + synFailed.join('、') : ''));
  if (UPLOAD) {
    console.log('上传：新上传 ' + uploaded + ' 条，跳过 ' + upSkipped + ' 条（COS 已有）' +
      (upFailed.length ? '，失败 ' + upFailed.length + ' 条：' + upFailed.join('、') : ''));
  }
  console.log('音频清单已更新：miniprograme/data/audio-manifest.js（共 ' + total + ' 条）');
  if (synFailed.length || upFailed.length) process.exitCode = 1;
}

main().catch(function (e) {
  console.error('\n运行中止：' + e.message);
  process.exit(1);
});
