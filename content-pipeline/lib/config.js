// lib/config.js —— 配置加载：默认值 ← config.json ← .env ← process.env（后者覆盖前者）
// 输出结构 { llm, run }，字段说明见 config.example.json。

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
    timeoutMs: 60000
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
  LLM_MODEL: ['llm', 'model']
};

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
  cfg.llm.baseUrl = String(cfg.llm.baseUrl || '').replace(/\/+$/, '');
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

module.exports = { load: load, validate: validate, ROOT: ROOT };
