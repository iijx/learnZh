// lib/config.js —— 配置加载：默认值 ← config.json ← .env ← process.env（后者覆盖前者）
// 输出结构 { llm, cos, run }，字段说明见 config.example.json。

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var CONFIG_FILE = path.join(ROOT, 'config.json');
var ENV_FILE = path.join(ROOT, '.env');

var DEFAULTS = {
  llm: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: '',
    model: '',
    temperature: 0.7,
    timeoutMs: 60000,
    // 思考型模型（doubao-seed 等）默认深度思考，单次要 2 分钟以上；文案生成不需要，关掉提速 60 倍
    thinking: { type: 'disabled' }
  },
  cos: {
    secretId: '',
    secretKey: '',
    bucket: '',
    region: 'ap-guangzhou',
    prefix: 'learn-zh',
    publicBaseUrl: ''
  },
  run: {
    concurrency: 3,
    retries: 2
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
  LLM_BASE_URL: ['llm', 'baseUrl'],
  LLM_API_KEY: ['llm', 'apiKey'],
  LLM_MODEL: ['llm', 'model'],
  COS_SECRET_ID: ['cos', 'secretId'],
  COS_SECRET_KEY: ['cos', 'secretKey'],
  COS_BUCKET: ['cos', 'bucket'],
  COS_REGION: ['cos', 'region'],
  COS_PREFIX: ['cos', 'prefix'],
  COS_PUBLIC_BASE_URL: ['cos', 'publicBaseUrl']
};

// COS 凭证缺省时回退读 audio-pipeline/.env（两条管线共用同一个桶；prefix 不回退，各自独立）
function fillCosFromAudioPipeline(cfg) {
  if (cfg.cos.secretId) return;
  var ap = parseEnvFile(path.join(ROOT, '..', 'audio-pipeline', '.env'));
  var map = {
    COS_SECRET_ID: 'secretId', COS_SECRET_KEY: 'secretKey', COS_BUCKET: 'bucket',
    COS_REGION: 'region', COS_PUBLIC_BASE_URL: 'publicBaseUrl'
  };
  Object.keys(map).forEach(function (k) {
    if (ap[k] && !cfg.cos[map[k]]) cfg.cos[map[k]] = ap[k];
  });
}

function load() {
  var cfg = JSON.parse(JSON.stringify(DEFAULTS));
  if (fs.existsSync(CONFIG_FILE)) {
    try { merge(cfg, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))); }
    catch (e) { throw new Error('config.json 解析失败：' + e.message); }
  }
  // .env 与 process.env 共用 ENV_KEYS 映射写回嵌套配置；process.env 优先级最高
  var envFile = parseEnvFile(ENV_FILE);
  Object.keys(ENV_KEYS).forEach(function (env) {
    var p = ENV_KEYS[env];
    var fromFile = envFile[env];
    if (fromFile !== undefined && fromFile !== '') cfg[p[0]][p[1]] = fromFile;
    var fromProc = process.env[env];
    if (fromProc !== undefined && fromProc !== '') cfg[p[0]][p[1]] = fromProc;
  });
  fillCosFromAudioPipeline(cfg);
  cfg.llm.baseUrl = String(cfg.llm.baseUrl || '').replace(/\/+$/, '');
  cfg.cos.prefix = String(cfg.cos.prefix || '').replace(/^\/+|\/+$/g, '');
  return cfg;
}

// 生成前校验必备配置，缺失时抛出带指引的中文错误
function validate(cfg) {
  var errs = [];
  if (!cfg.llm.apiKey) {
    errs.push('缺少 LLM 凭证：请在 config.json 填 llm.apiKey（或设环境变量 LLM_API_KEY）');
  }
  if (!cfg.llm.model) {
    errs.push('缺少模型：请填 llm.model——火山方舟填推理接入点 ID（形如 ep-xxxx），' +
      'DeepSeek 填 deepseek-chat，其他 OpenAI 兼容服务填模型名');
  }
  if (errs.length) throw new Error('配置不完整：\n  - ' + errs.join('\n  - '));
}

// publish --upload 前校验 COS 配置
function validateCos(cfg) {
  var errs = [];
  if (!cfg.cos.secretId || !cfg.cos.secretKey) {
    errs.push('缺少 COS 凭证：请设环境变量 COS_SECRET_ID / COS_SECRET_KEY（或在 audio-pipeline/.env 配置，本管线会自动回退读取）');
  }
  if (!cfg.cos.bucket) errs.push('缺少 COS 桶名：请设 COS_BUCKET（格式如 learnzh-1250000000）');
  if (errs.length) throw new Error('配置不完整：\n  - ' + errs.join('\n  - '));
}

module.exports = { load: load, validate: validate, validateCos: validateCos, ROOT: ROOT };
