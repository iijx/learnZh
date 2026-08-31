// data/strokes/index.js —— 笔顺数据静态索引
//
// 小程序的 require 只支持静态路径，无法按变量拼 data/strokes/<char>.json，
// 因此在这里显式登记已打包的 20 个示范字；tracer 组件通过 hasChar/getChar 查询。
// 后续补齐更多字的笔顺数据时，在此文件追加一行即可（见 tools/README.md）。

var DATA = {
  '的': require('./的.json.js'),
  '一': require('./一.json.js'),
  '是': require('./是.json.js'),
  '了': require('./了.json.js'),
  '我': require('./我.json.js'),
  '人': require('./人.json.js'),
  '在': require('./在.json.js'),
  '他': require('./他.json.js'),
  '有': require('./有.json.js'),
  '这': require('./这.json.js'),
  '个': require('./个.json.js'),
  '大': require('./大.json.js'),
  '们': require('./们.json.js'),
  '来': require('./来.json.js'),
  '上': require('./上.json.js'),
  '到': require('./到.json.js'),
  '时': require('./时.json.js'),
  '地': require('./地.json.js'),
  '为': require('./为.json.js'),
  '子': require('./子.json.js')
};

module.exports = {
  hasChar: function (ch) { return Object.prototype.hasOwnProperty.call(DATA, ch); },
  // 返回 { strokes: [svgPath...], medians: [[[x,y],...],...] }，无数据返回 null
  getChar: function (ch) { return DATA[ch] || null; }
};
