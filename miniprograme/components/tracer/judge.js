// components/tracer/judge.js —— 描红覆盖度判定（纯函数，不依赖 wx 环境，可用 node 直接自测）
//
// 输入坐标一律使用 canvas 像素坐标（tracer.js 负责把 hanzi-writer 的
// 1024 坐标系转换好再传进来），本文件不做任何坐标系换算。

// 两点距离平方
function dist2(ax, ay, bx, by) {
  var dx = ax - bx;
  var dy = ay - by;
  return dx * dx + dy * dy;
}

// median 采样点 (px,py) 的 radius 半径内是否存在用户轨迹点
function isCovered(px, py, trace, radius) {
  var r2 = radius * radius;
  for (var i = 0; i < trace.length; i++) {
    if (dist2(px, py, trace[i][0], trace[i][1]) <= r2) return true;
  }
  return false;
}

// 把稀疏的 median 折线按 step 像素插值加密，避免长段两端采样点之间漏判
// medians: [[[x,y],...], ...]  返回同结构、更密的新数组
function densify(medians, step) {
  step = step || 10;
  var out = [];
  for (var s = 0; s < medians.length; s++) {
    var pts = medians[s];
    if (!pts || pts.length === 0) { out.push([]); continue; }
    var dense = [[pts[0][0], pts[0][1]]];
    for (var i = 1; i < pts.length; i++) {
      var ax = pts[i - 1][0], ay = pts[i - 1][1];
      var bx = pts[i][0], by = pts[i][1];
      var len = Math.sqrt(dist2(ax, ay, bx, by));
      var n = Math.max(1, Math.ceil(len / step));
      for (var k = 1; k <= n; k++) {
        dense.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
      }
    }
    out.push(dense);
  }
  return out;
}

// 覆盖率：全部笔画加密采样点中，radius 半径内有用户轨迹点的比例（0~1）
function coverage(medians, trace, radius, step) {
  var dense = densify(medians, step || (radius || 35) / 2);
  var total = 0;
  var covered = 0;
  for (var s = 0; s < dense.length; s++) {
    for (var i = 0; i < dense[s].length; i++) {
      total++;
      if (isCovered(dense[s][i][0], dense[s][i][1], trace, radius)) covered++;
    }
  }
  return total === 0 ? 0 : covered / total;
}

// 综合判定是否通过：
//   - exam=false（设置里关了书写考核）→ 画满 minPoints 个点即过；
//   - 无 medians 数据 → 同样画满即过（无法判定就放行，不卡老人）；
//   - 否则 medians 覆盖率 ≥ threshold 即过。
// opts: { medians, trace, exam, radius, threshold, minPoints }
function judge(opts) {
  opts = opts || {};
  var trace = opts.trace || [];
  var minPoints = opts.minPoints || 40;
  if (opts.exam === false || !opts.medians || opts.medians.length === 0) {
    return trace.length >= minPoints;
  }
  var radius = opts.radius || 35;
  var threshold = opts.threshold || 0.6;
  return coverage(opts.medians, trace, radius) >= threshold;
}

module.exports = {
  dist2: dist2,
  isCovered: isCovered,
  densify: densify,
  coverage: coverage,
  judge: judge
};
