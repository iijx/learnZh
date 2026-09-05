#!/usr/bin/env node
// syllabus/build-l1.js —— L1「生存篇」300 字定稿生成器
//
// 方法（syllabus.md §3）：
//   1. 语料倒推：corpus/scenes.json 里 12 个 L1 场景的用字，按"首次出现的场景"归入对应单元；
//   2. 权威表校准：SUPPLEMENT 是人工策展的补充字队列（功能字/高频字/称谓/数字/时间），
//      按优先级从前往后填充各单元空位（每单元 25 字），前面的单元优先补"能组句"的字
//     （人称、数字、吃喝、常见动词形容词），保证例句可组合性；
//   3. 输出 ../syllabus.json：levels 元信息 + order（char → level/unit/sceneId）。
//
// 用法：node syllabus/build-l1.js          # 生成并打印各单元构成（供人工审阅）
// 单元即场景：第 N 单元学完后上第 N 节场景课（场景课是单元毕业考）。

var fs = require('fs');
var path = require('path');

var CORPUS_FILE = path.join(__dirname, '..', 'corpus', 'scenes.json');
var OUT_FILE = path.join(__dirname, '..', 'syllabus.json');

var UNIT_SIZE = 25;
var L1_LEVEL = { level: 1, name: '生存篇', size: 300, promise: '看懂价签、药盒、站牌、钱数、日期' };

// 语料里出现但不进 L1 教学的字（过难或低频书面字；场景文本里保留原字，由语音带读）：
//   驿（菜鸟驿站）、露（白露）、惠顾（谢谢惠顾）
var EXCLUDE = '驿露惠顾'.split('');

// 强制提前的字：语料首次出现太晚、但早期组句必需（场景归属让位于可组合性）
var FORCE_EARLY = '的'.split('');

// 人工策展的补充字队列（优先级从前到后；已出现在语料里的自动跳过）。
// 头部是「可组合性包」：人称 + 虚词 + 吃喝常见动形，让前几个单元就能组出闭合例句。
var SUPPLEMENT = (
  '我你他她的了是有在不这那个们吃喝买看说走好多少' +
  '家卖听坐站睡洗穿拿放找给送帮问答想爱怕新旧快慢冷热高矮胖瘦长短远近轻重上左右' +
  '爸妈爷奶哥姐弟妹夫妻红绿黄蓝黑白水火茶饭汤米面鱼花草树风雪' +
  '山田土河海桥街村镇县市店场桌' +
  '椅床灯窗门口手脚头心耳鼻牙嘴四五六七八九十百千万零两半' +
  '双第张条瓶盒件年昨早晚午点分秒春夏秋冬' +
  '也都会能吗呢吧很没再又还就才真什么怎谁哪对于把被让从向' +
  '和与或因如但所以可学认识字读写打接笑哭忘孩书报纸笔机电视歌舞棋牌钓游玩朋亲邻居'
).split('');

function hanziOf(s) {
  return String(s || '').match(/[一-鿿]/g) || [];
}

function main() {
  var corpus = JSON.parse(fs.readFileSync(CORPUS_FILE, 'utf8'));
  var scenes = corpus.scenes
    .filter(function (s) { return s.level === 1; })
    .sort(function (a, b) { return a.id - b.id; });

  // 第 1 步：场景用字按首次出现归单元（EXCLUDE 不进字表；FORCE_EARLY 交给补充队列放最前）
  var seen = {};
  EXCLUDE.concat(FORCE_EARLY).forEach(function (ch) { seen[ch] = true; });
  var units = scenes.map(function (sc) {
    var chars = [];
    hanziOf(sc.text).forEach(function (ch) {
      if (!seen[ch]) { seen[ch] = true; chars.push(ch); }
    });
    return { unit: sc.id, sceneId: sc.id, title: sc.title, chars: chars };
  });

  // 第 2 步：补充字队列填充（语料已有的跳过；FORCE_EARLY 插队到最前）
  var queue = FORCE_EARLY.concat(SUPPLEMENT).filter(function (ch) { return !seen[ch] || FORCE_EARLY.indexOf(ch) !== -1; });
  queue = queue.filter(function (ch, i) { return queue.indexOf(ch) === i; });
  var total = units.reduce(function (n, u) { return n + u.chars.length; }, 0);
  var capacity = units.length * UNIT_SIZE;
  var need = capacity - total;
  if (need > queue.length) {
    console.error('补充字不够：缺 ' + need + '，队列只有 ' + queue.length + '（请扩充 SUPPLEMENT）');
    process.exit(1);
  }
  var qi = 0;
  units.forEach(function (u) {
    u.supplement = [];
    while (u.chars.length + u.supplement.length < UNIT_SIZE && qi < queue.length) {
      var ch = queue[qi++];
      if (u.chars.indexOf(ch) === -1) u.supplement.push(ch);
    }
  });

  // 汇总 order
  var order = [];
  units.forEach(function (u) {
    u.chars.concat(u.supplement).forEach(function (ch) {
      order.push({ char: ch, level: 1, unit: u.unit, sceneId: u.sceneId });
    });
  });

  var syllabus = {
    version: 1,
    note: '学习大纲（syllabus.md 的机器可读版）。order 即学习顺序：level → unit → 单元内顺序；unit 与场景课一一绑定。',
    levels: [
      L1_LEVEL,
      { level: 2, name: '生活篇', size: 500, promise: '读懂手机短信、小区通知、菜单、快递信息' },
      { level: 3, name: '脱盲篇', size: 700, promise: '读小故事、浅近古诗、说明书全文（国家脱盲标准）' },
      { level: 4, name: '报刊篇', size: 500, promise: '读报纸标题、微信文章大意、天气预报' },
      { level: 5, name: '自由篇', size: 500, promise: '自由阅读一般书面语（99% 覆盖）' }
    ],
    order: order
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(syllabus, null, 2) + '\n');

  // 打印审阅表
  console.log('syllabus.json 已生成：L1 共 ' + order.length + ' 字 / ' + units.length + ' 单元\n');
  units.forEach(function (u) {
    console.log('第' + u.unit + '单元（' + u.title + '）');
    console.log('  场景字(' + u.chars.length + '): ' + u.chars.join(''));
    console.log('  补充字(' + u.supplement.length + '): ' + u.supplement.join(''));
  });
}

main();
