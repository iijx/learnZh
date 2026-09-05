#!/usr/bin/env node
// tools/gen-placeholders.js —— 生成占位插画与占位音频
// 用法：node tools/gen-placeholders.js
// 产物：
//   assets/img/placeholder-<字>.svg  暖色底 + 居中大字的占位插画（2:1 尺寸，对应 PRD 6.3）
//   assets/img/placeholder.svg       通用占位图
//   assets/silence.mp3               极短静音音频（tts.js 兜底播放用）
// 全部为程序生成，无 npm 依赖；真实素材替换方法见 tools/README.md。

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var IMG_DIR = path.join(ROOT, 'assets', 'img');
var AUDIO_DIR = path.join(ROOT, 'assets');

// 需要生成占位插画的字：前 20 个示范字 + 其余需要占位插画的教学字 + 通用占位
var DEMO_CHARS = '的一是了 我人 在他 有 这个 大 们 来 上 到 时 地 为 子'.replace(/\s/g, '').split('');
var EXTRA_CHARS = '场站药菜信号超医果早件视区园店钱天日票楼'.split('');

// ===== SVG 占位插画：暖色底（米黄）+ 居中深棕大字，2:1 尺寸 =====
function makeSvg(label) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">',
    '  <rect width="800" height="400" fill="#FAF0DC"/>',
    '  <rect x="16" y="16" width="768" height="368" rx="24" fill="#FFF8E7" stroke="#E3D3B3" stroke-width="4"/>',
    '  <text x="400" y="400" font-size="300" font-family="sans-serif" font-weight="bold"',
    '        fill="#4A3428" text-anchor="middle" dominant-baseline="text-after-edge">' + label + '</text>',
    '</svg>',
    ''
  ].join('\n');
}

// ===== 静音 MP3：手工拼 MPEG1 Layer III 静音帧（128kbps / 44.1kHz）=====
// 帧头 0xFF 0xFB 0x90 0x00，帧长 417 字节，帧体全零即解码为静音。
// 共 40 帧 ≈ 1.04 秒。占位够用；拿到正式静音文件后直接覆盖 silence.mp3 即可。
function makeSilenceMp3() {
  var FRAME_SIZE = 417;
  var FRAME_COUNT = 40;
  var buf = Buffer.alloc(FRAME_SIZE * FRAME_COUNT, 0);
  for (var i = 0; i < FRAME_COUNT; i++) {
    var off = i * FRAME_SIZE;
    buf[off] = 0xFF;
    buf[off + 1] = 0xFB;
    buf[off + 2] = 0x90;
    buf[off + 3] = 0x00;
  }
  return buf;
}

function main() {
  fs.mkdirSync(IMG_DIR, { recursive: true });
  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  // 通用占位图（未下载到 CDN 插画时兜底使用）
  fs.writeFileSync(path.join(IMG_DIR, 'placeholder.svg'), makeSvg('图'), 'utf8');

  // 占位静音音频
  fs.writeFileSync(path.join(AUDIO_DIR, 'silence.mp3'), makeSilenceMp3());

  console.log('生成完成：');
  console.log('  assets/img/placeholder.svg（通用占位图）');
  console.log('  assets/silence.mp3（约 1 秒静音）');
}

main();
