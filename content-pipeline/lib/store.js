// lib/store.js —— 生成产物的本地存取：output/<字>.json 一字一文件
// 文件即状态机：status = draft（待审）→ approved（已审校）→ applied（已写回字表）
// 校验失败也落盘为 invalid，审校人可直接改文件修正后 approve。
// output/ 目录提交进 git，审校协作走 PR。

var fs = require('fs');
var path = require('path');

var OUT_DIR = path.join(__dirname, '..', 'output');

function fileOf(char) { return path.join(OUT_DIR, char + '.json'); }

function has(char) { return fs.existsSync(fileOf(char)); }

function read(char) {
  try { return JSON.parse(fs.readFileSync(fileOf(char), 'utf8')); }
  catch (e) { return null; }
}

function write(entry) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(fileOf(entry.char), JSON.stringify(entry, null, 2) + '\n');
}

function list() {
  if (!fs.existsSync(OUT_DIR)) return [];
  return fs.readdirSync(OUT_DIR)
    .filter(function (f) { return f.endsWith('.json'); })
    .map(function (f) { return read(f.replace(/\.json$/, '')); })
    .filter(Boolean);
}

function setStatus(char, status) {
  var e = read(char);
  if (!e) return false;
  e.status = status;
  write(e);
  return true;
}

function counts() {
  var c = { draft: 0, invalid: 0, approved: 0, applied: 0 };
  list().forEach(function (e) {
    if (c[e.status] === undefined) c[e.status] = 0;
    c[e.status]++;
  });
  return c;
}

module.exports = {
  OUT_DIR: OUT_DIR,
  has: has, read: read, write: write,
  list: list, setStatus: setStatus, counts: counts
};
