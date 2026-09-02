#!/usr/bin/env node
// tools/check-pages.js —— 校验 app.json 注册的 6 个页面
// 检查项：pages/<name>/ 下四件套（js/json/wxml/wxss）齐全、json 合法且含 navigationBarTitleText。
// 页面目录不存在则跳过（多代理并行开发时，他人负责的页面可能尚未创建）。
// 用法：node tools/check-pages.js；有「存在但不合规」的页面时退出码为 1。

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var PAGES = ['home', 'learn', 'scene', 'milestone', 'progress', 'guide'];
var EXTS = ['js', 'json', 'wxml', 'wxss'];

var ok = 0, failed = 0, skipped = 0;

PAGES.forEach(function (name) {
  var dir = path.join(ROOT, 'pages', name);
  if (!fs.existsSync(dir)) {
    console.log('[跳过] pages/' + name + '（目录不存在，可能尚未创建）');
    skipped++;
    return;
  }
  var base = path.join(dir, name);
  var problems = [];

  EXTS.forEach(function (ext) {
    if (!fs.existsSync(base + '.' + ext)) problems.push(name + '.' + ext + ' 缺失');
  });

  if (fs.existsSync(base + '.json')) {
    try {
      var json = JSON.parse(fs.readFileSync(base + '.json', 'utf8'));
      if (!json.navigationBarTitleText) problems.push('json 缺 navigationBarTitleText');
    } catch (e) {
      problems.push('json 解析失败：' + e.message);
    }
  }

  if (problems.length) {
    failed++;
    console.log('[未通过] pages/' + name + '：' + problems.join('；'));
  } else {
    ok++;
    console.log('[通过] pages/' + name);
  }
});

console.log('----');
console.log('通过 ' + ok + ' 个，未通过 ' + failed + ' 个，跳过 ' + skipped + ' 个');
process.exit(failed ? 1 : 0);
