#!/usr/bin/env node
// tools/test-judge.js —— components/tracer/judge.js 覆盖率判定自测
//
// 用法：node tools/test-judge.js
// 构造假轨迹验证 60% 覆盖阈值、exam 关闭直通、无数据兜底三条规则。

var judge = require('../components/tracer/judge.js');

var failed = 0;

function expect(name, actual, want) {
  var ok = actual === want;
  if (!ok) failed++;
  console.log((ok ? '✓' : '✗') + ' ' + name + ' => ' + actual + (ok ? '' : '（期望 ' + want + '）'));
}

// 一条水平笔画中线：y=100，x 从 0 到 400
var medians = [[
  [0, 100], [100, 100], [200, 100], [300, 100], [400, 100]
]];

// 轨迹 A：紧贴中线描了一遍（覆盖≈100%）
var traceGood = [];
for (var x = 0; x <= 400; x += 8) traceGood.push([x, 102]);

// 轨迹 B：完全偏离（在 y=500 处乱画，覆盖≈0%）
var traceBad = [];
for (var x2 = 0; x2 <= 400; x2 += 8) traceBad.push([x2, 500]);

// 轨迹 C：只描了中线的左一小段（x 0~120），加上 35px 半径的延伸，
// 覆盖约 (120+35)/400 ≈ 39%，应低于 60% 阈值
var tracePart = [];
for (var x3 = 0; x3 <= 120; x3 += 8) tracePart.push([x3, 100]);

var covGood = judge.coverage(medians, traceGood, 35);
var covBad = judge.coverage(medians, traceBad, 35);
var covPart = judge.coverage(medians, tracePart, 35);
console.log('覆盖率：描满=' + covGood.toFixed(2) + '  偏离=' + covBad.toFixed(2) + '  一小段=' + covPart.toFixed(2));

expect('描满轨迹 → 通过', judge.judge({ medians: medians, trace: traceGood, exam: true }), true);
expect('偏离轨迹 → 不通过', judge.judge({ medians: medians, trace: traceBad, exam: true }), false);
expect('只描一小段（~39% < 60%）→ 不通过', judge.judge({ medians: medians, trace: tracePart, exam: true }), false);
expect('60% 阈值生效：coverage(一小段) 确实低于 0.6', covPart < 0.6, true);
expect('描满覆盖率确实 ≥0.6', covGood >= 0.6, true);

// exam 关闭：画满 40 个点直接过，不看轨迹画在哪
expect('exam=false 且 ≥40 点 → 直接通过', judge.judge({ medians: medians, trace: traceBad, exam: false }), true);
expect('exam=false 但不足 40 点 → 不通过', judge.judge({ medians: medians, trace: traceBad.slice(0, 20), exam: false }), false);

// 无笔顺数据：同样按 40 点兜底放行
expect('无 medians 且 ≥40 点 → 兜底通过', judge.judge({ medians: null, trace: traceGood, exam: true }), true);
expect('无 medians 且不足 40 点 → 不通过', judge.judge({ medians: null, trace: [], exam: true }), false);

// 真实笔顺数据走一遍（「大」字 3 笔，1024 坐标系）
var da = require('../data/strokes/大.json.js');
var traceDa = [];
da.medians.forEach(function (pts) {
  // 把每条中线按 1024 坐标系原样当轨迹（半径 35/300*1024 ≈ 120 的数据坐标单位，必然全覆盖）
  pts.forEach(function (p) { traceDa.push(p); });
});
var covDa = judge.coverage(da.medians, traceDa, 120);
console.log('「大」字真实笔顺，原线当轨迹覆盖率=' + covDa.toFixed(2));
expect('真实数据自描 → 通过', judge.judge({ medians: da.medians, trace: traceDa, exam: true, radius: 120 }), true);

if (failed) {
  console.error('\n' + failed + ' 项自测失败');
  process.exit(1);
}
console.log('\njudge.js 自测全部通过 ✓');
