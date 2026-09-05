// lib/publish.js —— 课程包构建与发布
// 产物（dist/<prefix>/）：
//   manifest.json      版本与各内容包清单（客户端每次启动拉它比对 contentVersion）
//   chars.L{n}.json    每级一个字表内容包（按 syllabus.json 的 order 拆包，内容取自 chars.js）
//   strokes/<字>.json  笔顺数据（hanzi-writer 格式，一字一文件，客户端按需下载）
// --upload 时上传 COS：{prefix}/manifest.json 与 {prefix}/chars.L{n}.json（默认 prefix = learn-zh）

var fs = require('fs');
var path = require('path');
var syllabus = require('./syllabus.js');
var strokes = require('./strokes.js');

var MINIPROG = path.join(__dirname, '..', '..', 'miniprograme');
var CHARS_FILE = path.join(MINIPROG, 'data', 'chars.js');

var PLACEHOLDER = '内容待补充';

function distDir(cfg) {
  return path.join(__dirname, '..', 'dist', cfg.cos.prefix);
}

// 简易内容哈希：同一级别内容不变则 contentVersion 不变，客户端不重复下载
function contentHash(body) {
  var h = 5381;
  for (var i = 0; i < body.length; i++) h = ((h << 5) + h + body.charCodeAt(i)) >>> 0;
  return h;
}

function placeholderEntry(ch) {
  return { char: ch, pinyin: '', explain: PLACEHOLDER, mnemonic: PLACEHOLDER, words: [PLACEHOLDER], sentence: PLACEHOLDER, hasStroke: strokes.available(ch) };
}

// 构建全部级别包，返回 { manifest, files: [{name, body}] }
function build(cfg) {
  delete require.cache[require.resolve(CHARS_FILE)];
  var chars = require(CHARS_FILE);
  var byChar = {};
  chars.forEach(function (c) { if (!byChar[c.char]) byChar[c.char] = c; });

  // 按 syllabus 的 level 分组（order 即学习顺序）；hasStroke 以笔顺数据实际可用为准
  var groups = {};
  var allChars = [];
  syllabus.order().forEach(function (o) {
    if (!groups[o.level]) groups[o.level] = [];
    allChars.push(o.char);
    var c = byChar[o.char];
    var entry = (c && c.explain) ? {
      char: c.char, pinyin: c.pinyin, explain: c.explain, mnemonic: c.mnemonic,
      words: c.words, sentence: c.sentence, hasStroke: strokes.available(c.char)
    } : placeholderEntry(o.char);
    entry.unit = o.unit;
    groups[o.level].push(entry);
  });

  var files = [];
  var levelMeta = syllabus.levels().filter(function (lv) { return groups[lv.level]; });
  levelMeta.forEach(function (lv) {
    var body = JSON.stringify(groups[lv.level]);
    lv.count = groups[lv.level].length;
    lv.pack = 'chars.L' + lv.level + '.json';
    lv.contentVersion = contentHash(body);
    lv.bytes = Buffer.byteLength(body);
    delete lv.size; // size 是规划容量，线上用实际 count
    files.push({ name: lv.pack, body: body });
  });

  // 笔顺包：全部大纲字一字一文件（不可变数据，客户端按字缓存，永久有效）
  var strokeBuild = strokes.buildFor(allChars);

  var manifest = {
    version: Date.now(),
    generatedAt: new Date().toISOString(),
    levels: levelMeta,
    strokes: { base: 'strokes/', chars: strokeBuild.chars }
  };
  files.unshift({ name: 'manifest.json', body: JSON.stringify(manifest, null, 2) });
  strokeBuild.files.forEach(function (f) { files.push(f); });

  return { manifest: manifest, files: files };
}

// 写本地 dist，返回文件清单（含绝对路径与大小）
function writeDist(cfg, built) {
  var dir = distDir(cfg);
  built.files.forEach(function (f) {
    f.path = path.join(dir, f.name);
    if (!fs.existsSync(path.dirname(f.path))) fs.mkdirSync(path.dirname(f.path), { recursive: true });
    f.bytes = Buffer.byteLength(f.body);
    fs.writeFileSync(f.path, f.body);
  });
  return built.files;
}

// 上传 COS（public-read，客户端直接 GET）
function upload(cfg, files) {
  var COS = require('cos-nodejs-sdk-v5');
  var cos = new COS({ SecretId: cfg.cos.secretId, SecretKey: cfg.cos.secretKey });
  return Promise.all(files.map(function (f) {
    return new Promise(function (resolve, reject) {
      cos.putObject({
        Bucket: cfg.cos.bucket,
        Region: cfg.cos.region,
        Key: cfg.cos.prefix + '/' + f.name,
        Body: f.body,
        ACL: 'public-read',
        ContentType: 'application/json; charset=utf-8',
        // manifest 每次启动都拉，禁缓存；字表包按 contentVersion 变化；笔顺数据不可变，长缓存
        CacheControl: f.name === 'manifest.json' ? 'no-cache'
          : f.name.indexOf('strokes/') === 0 ? 'max-age=31536000, immutable'
          : 'max-age=86400'
      }, function (err) {
        if (err) {
          err.message = 'COS 上传失败 ' + (err.code || '') + '：' + (err.message || '');
          return reject(err);
        }
        resolve(f.name);
      });
    });
  }));
}

function publicUrl(cfg, name) {
  var base = String(cfg.cos.publicBaseUrl || '').replace(/\/+$/, '');
  return base ? base + '/' + cfg.cos.prefix + '/' + name : '';
}

module.exports = { build: build, writeDist: writeDist, upload: upload, publicUrl: publicUrl };
