#!/usr/bin/env node
// tools/gen-tab-icons.js —— 生成 tabBar 图标（微信 tabBar 的 iconPath 不支持 svg，需 png）
// 用法：node tools/gen-tab-icons.js
// 输出：assets/img/tab-{home,my}[-active].png（81×81，4 倍超采样抗锯齿）

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var SIZE = 81;   // 微信建议 tab 图标 81×81
var SS = 4;      // 超采样倍数
var W = 5;       // 描边宽度（最终像素）
var NORMAL = [0x9C, 0x8E, 0x82]; // 未选中：暖灰
var ACTIVE = [0x3E, 0x6B, 0x4F]; // 选中：墨绿（--color-accent）

// ---------- 极简 PNG 编码器（RGBA8，无滤波） ----------
var crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  var crc = -1;
  for (var i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  var len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  var body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  var crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(rgba, size) {
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  var raw = Buffer.alloc(size * (size * 4 + 1));
  for (var y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------- 距离场绘制（坐标均为最终像素空间，内部乘 SS） ----------
function makeCanvas() {
  return new Float32Array(SIZE * SS * SIZE * SS); // 只存 alpha
}
function cover(d, hw) {
  // d：到笔画中心线的距离（高分辨率单位）；hw：笔画半宽
  return Math.min(1, Math.max(0, hw - d + 0.5));
}
function distSeg(px, py, x0, y0, x1, y1) {
  var dx = x1 - x0, dy = y1 - y0;
  var t = ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  var qx = x0 + t * dx, qy = y0 + t * dy;
  return Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
}
function eachPixel(cv, x0, y0, x1, y1, fn) {
  // 包围盒（最终像素空间）裁剪后遍历高分辨率像素
  var hw = W * SS / 2 + 1;
  var gx0 = Math.max(0, Math.floor((Math.min(x0, x1)) * SS - hw));
  var gy0 = Math.max(0, Math.floor((Math.min(y0, y1)) * SS - hw));
  var gx1 = Math.min(SIZE * SS - 1, Math.ceil((Math.max(x0, x1)) * SS + hw));
  var gy1 = Math.min(SIZE * SS - 1, Math.ceil((Math.max(y0, y1)) * SS + hw));
  for (var gy = gy0; gy <= gy1; gy++) {
    for (var gx = gx0; gx <= gx1; gx++) {
      var a = fn(gx + 0.5, gy + 0.5);
      if (a > 0) {
        var idx = gy * SIZE * SS + gx;
        if (a > cv[idx]) cv[idx] = a;
      }
    }
  }
}
function drawLine(cv, x0, y0, x1, y1) {
  var hw = W * SS / 2;
  eachPixel(cv, x0, y0, x1, y1, function (px, py) {
    return cover(distSeg(px, py, x0 * SS, y0 * SS, x1 * SS, y1 * SS), hw);
  });
}
function drawArc(cv, cx, cy, r, a0, a1) {
  // 角度 a0→a1（弧度，屏幕坐标系 y 向下，上半圆为 PI..2PI）
  var hw = W * SS / 2;
  eachPixel(cv, cx - r, cy - r, cx + r, cy + r, function (px, py) {
    var d = Math.abs(Math.sqrt((px - cx * SS) * (px - cx * SS) + (py - cy * SS) * (py - cy * SS)) - r * SS);
    var ang = Math.atan2(py - cy * SS, px - cx * SS);
    if (ang < 0) ang += Math.PI * 2;
    if (ang < a0 || ang > a1) return 0;
    return cover(d, hw);
  });
}
function drawCircle(cv, cx, cy, r) {
  drawArc(cv, cx, cy, r, 0, Math.PI * 2);
}

// ---------- 两个图标的形状定义 ----------
var PI = Math.PI;
var SHAPES = {
  home: function (cv) {
    drawLine(cv, 17, 37, 40.5, 15); // 屋顶左
    drawLine(cv, 40.5, 15, 64, 37); // 屋顶右
    drawLine(cv, 22, 33, 22, 64);   // 左墙
    drawLine(cv, 59, 33, 59, 64);   // 右墙
    drawLine(cv, 22, 64, 59, 64);   // 底边
  },
  my: function (cv) {
    // 人像：头（圆）+ 肩（上半圆）
    drawCircle(cv, 40.5, 27, 11.5);
    drawArc(cv, 40.5, 68, 18, PI, PI * 2);
  }
};

// ---------- 超采样降采样 + 着色输出 ----------
function render(shapeFn, rgb) {
  var cv = makeCanvas();
  shapeFn(cv);
  var rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (var y = 0; y < SIZE; y++) {
    for (var x = 0; x < SIZE; x++) {
      var sum = 0;
      for (var sy = 0; sy < SS; sy++) {
        for (var sx = 0; sx < SS; sx++) {
          sum += cv[(y * SS + sy) * SIZE * SS + (x * SS + sx)];
        }
      }
      var a = Math.round((sum / (SS * SS)) * 255);
      var o = (y * SIZE + x) * 4;
      rgba[o] = rgb[0];
      rgba[o + 1] = rgb[1];
      rgba[o + 2] = rgb[2];
      rgba[o + 3] = a;
    }
  }
  return rgba;
}

var outDir = path.join(__dirname, '..', 'assets', 'img');
Object.keys(SHAPES).forEach(function (name) {
  [
    { suffix: '', rgb: NORMAL },
    { suffix: '-active', rgb: ACTIVE }
  ].forEach(function (v) {
    var file = path.join(outDir, 'tab-' + name + v.suffix + '.png');
    fs.writeFileSync(file, encodePNG(render(SHAPES[name], v.rgb), SIZE));
    console.log('生成 ' + file);
  });
});
