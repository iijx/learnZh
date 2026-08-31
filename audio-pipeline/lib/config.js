// lib/config.js —— 配置加载：默认值 ← config.json ← .env ← process.env（后者覆盖前者）
// 输出结构 { doubao, cos, run }，run.speechRate 为最终生效的语速值。

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var CONFIG_FILE = path.join(ROOT, 'config.json');
var ENV_FILE = path.join(ROOT, '.env');

var DEFAULTS = {
  doubao: {
    apiKey: '',
    appId: '',
    accessToken: '',
    resourceId: 'seed-tts-2.0',
    voice: 'zh_female_wenroumama_uranus_bigtts',
    speechRate: null,           // null = 用 run.rateMap[run.rate]
    sampleRate: 24000,
    format: 'mp3',
    uid: 'learnzh-pipeline',
    timeoutMs: 60000
  },
  cos: {
    secretId: '',
    secretKey: '',
    bucket: '',
    region: 'ap-guangzhou',
    prefix: 'course/v1/audio',
    publicBaseUrl: ''
  },
  run: {
    concurrency: 4,
    retries: 2,
    rate: 'slow',
    rateMap: { slow: -10, normal: 0 }
  }
};

function merge(target, source) {
  Object.keys(source || {}).forEach(function (k) {
    if (k.charAt(0) === '_') return; // 跳过注释字段
    var v = source[k];
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      if (target[k] === undefined) target[k] = {};
      merge(target[k], v);
    } else {
      target[k] = v;
    }
  });
  return target;
}

// 极简 .env 解析（KEY=VALUE 每行，支持 # 注释），零依赖
function parseEnvFile(file) {
  var out = {};
  if (!fs.existsSync(file)) return out;
  fs.readFileSync(file, 'utf8').split('\n').forEach(function (line) {
    line = line.trim();
    if (!line || line.charAt(0) === '#') return;
    var i = line.indexOf('=');
    if (i <= 0) return;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
  return out;
}

var ENV_KEYS = {
  DOUBAO_API_KEY: ['doubao', 'apiKey'],
  DOUBAO_APP_ID: ['doubao', 'appId'],
  DOUBAO_ACCESS_TOKEN: ['doubao', 'accessToken'],
  DOUBAO_VOICE: ['doubao', 'voice'],
  DOUBAO_SPEECH_RATE: ['doubao', 'speechRate'],
  COS_SECRET_ID: ['cos', 'secretId'],
  COS_SECRET_KEY: ['cos', 'secretKey'],
  COS_BUCKET: ['cos', 'bucket'],
  COS_REGION: ['cos', 'region'],
  COS_PREFIX: ['cos', 'prefix'],
  COS_PUBLIC_BASE_URL: ['cos', 'publicBaseUrl']
};

function load() {
  var cfg = JSON.parse(JSON.stringify(DEFAULTS));
  if (fs.existsSync(CONFIG_FILE)) {
    try { merge(cfg, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))); }
    catch (e) { throw new Error('config.json 解析失败：' + e.message); }
  }
  merge(cfg, parseEnvFile(ENV_FILE));
  Object.keys(ENV_KEYS).forEach(function (env) {
    if (process.env[env] !== undefined && process.env[env] !== '') {
      var p = ENV_KEYS[env];
      var v = process.env[env];
      cfg[p[0]][p[1]] = /^-?\d+$/.test(v) ? parseInt(v, 10) : v;
    }
  });
  // 语速生效值：doubao.speechRate 未显式配置时按 run.rateMap[run.rate]
  if (cfg.doubao.speechRate === null || cfg.doubao.speechRate === undefined) {
    var map = cfg.run.rateMap || {};
    cfg.doubao.speechRate = (cfg.run.rate in map) ? map[cfg.run.rate] : 0;
  }
  return cfg;
}

// 按模式校验必备凭证，缺失时抛出带指引的中文错误
function validate(cfg, mode) {
  var errs = [];
  if (!cfg.doubao.apiKey && !(cfg.doubao.appId && cfg.doubao.accessToken)) {
    errs.push('缺少豆包凭证：请在 config.json 填 doubao.apiKey（新版控制台 API Key），' +
      '或 doubao.appId + doubao.accessToken（旧版控制台）');
  }
  if (mode !== 'skip-upload') {
    if (!cfg.cos.secretId || !cfg.cos.secretKey) {
      errs.push('缺少 COS 凭证：请填 cos.secretId / cos.secretKey（建议子账号最小权限密钥）');
    }
    if (!cfg.cos.bucket) errs.push('缺少 COS 桶名：请填 cos.bucket（格式如 learnzh-1250000000）');
  }
  if (!cfg.doubao.voice) errs.push('缺少音色：请填 doubao.voice（如 zh_female_wenroumama_uranus_bigtts）');
  if (errs.length) throw new Error('配置不完整：\n  - ' + errs.join('\n  - '));
}

module.exports = { load: load, validate: validate, ROOT: ROOT };
