#!/usr/bin/env node
// tools/check-components.js —— 校验 3 个自定义组件结构完整
//
// 用法：node tools/check-components.js
// 检查每个组件目录下 .json/.wxml/.wxss/.js 四件套齐全，
// json 可解析且 "component": true，wxml 无 <32rpx 以下的字号声明（适老化红线抽查）。

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..', 'components');
var COMPONENTS = ['big-button', 'tracer', 'speaker'];

var failed = false;

function fail(msg) {
  failed = true;
  console.error('  ✗ ' + msg);
}

COMPONENTS.forEach(function (name) {
  var dir = path.join(ROOT, name);
  console.log('检查 components/' + name + '/');

  ['json', 'wxml', 'wxss', 'js'].forEach(function (ext) {
    var file = path.join(dir, name + '.' + ext);
    if (!fs.existsSync(file)) {
      fail('缺少 ' + name + '.' + ext);
      return;
    }
    var content = fs.readFileSync(file, 'utf8');

    if (ext === 'json') {
      try {
        var json = JSON.parse(content);
        if (json.component !== true) fail(name + '.json 缺 "component": true');
      } catch (e) {
        fail(name + '.json 解析失败：' + e.message);
      }
    }

    if (ext === 'wxss') {
      // 适老化红线：不允许出现小于 32rpx 的字号（0/1px 边框线宽除外，这里只查 font-size）
      var m = content.match(/font-size:\s*(\d+(?:\.\d+)?)rpx/g) || [];
      m.forEach(function (decl) {
        var v = parseFloat(decl.match(/(\d+(?:\.\d+)?)rpx/)[1]);
        if (v < 32) fail(name + '.wxss 出现 <32rpx 字号：' + decl);
      });
    }
  });
});

// tracer 额外要求 judge.js 存在
if (!fs.existsSync(path.join(ROOT, 'tracer', 'judge.js'))) {
  console.error('  ✗ 缺少 tracer/judge.js');
  failed = true;
}

if (failed) {
  console.error('\n组件校验未通过');
  process.exit(1);
}
console.log('\n全部 3 个组件结构校验通过 ✓');
