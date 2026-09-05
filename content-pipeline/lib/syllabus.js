// lib/syllabus.js —— 学习大纲（syllabus.json）读取
// syllabus.json 是字序的唯一真相源：order 数组即学习顺序（level → unit → 单元内顺序）。
// chars.js 只是文案存储；字在不在课程里、第几个学，都以本文件为准。

var fs = require('fs');
var path = require('path');

var SYLLABUS_FILE = path.join(__dirname, '..', 'syllabus.json');

function load() {
  return JSON.parse(fs.readFileSync(SYLLABUS_FILE, 'utf8'));
}

// order 数组（每项 { char, level, unit, sceneId }）
function order() {
  return load().order;
}

// 字 → 学习位置（1 起）
function posOf() {
  var map = {};
  order().forEach(function (o, i) { if (map[o.char] === undefined) map[o.char] = i + 1; });
  return map;
}

// 级别元信息（levels 数组）
function levels() {
  return load().levels;
}

// 某级有哪些字（按学习顺序）
function charsOfLevel(level) {
  return order().filter(function (o) { return o.level === level; }).map(function (o) { return o.char; });
}

module.exports = { load: load, order: order, posOf: posOf, levels: levels, charsOfLevel: charsOfLevel };
