// data/stories.js —— 小故事阅读课（共 5 篇，每学满 100 字解锁一篇）
// 用已学字撰写 50-80 字生活小故事，大字逐句朗读。
// 字段：id / title / unlockAt（100 / 200 / ... / 500）/ lines（全文，逐句）
// 第 1 篇「赶集」为完整示范（用字尽量落在前 100 个已学字内），其余占位。
// 【未来替换为服务端 REST API】课程包改由 CDN 下发（GET {CDN}/course/v1/stories.json）。

module.exports = [
  {
    id: 1, title: '赶集', unlockAt: 100,
    lines: [
      '今天赶集，我起了个大早。',
      '集上人真多，有卖菜的，有卖鱼的。',
      '我买了一斤肉、两斤白菜，',
      '还给孙子买了个大苹果。',
      '到家一看，才九点钟。'
    ]
  },
  { id: 2, title: '看病', unlockAt: 200, lines: ['（内容待补充）'] },
  { id: 3, title: '接孙子放学', unlockAt: 300, lines: ['（内容待补充）'] },
  { id: 4, title: '包饺子', unlockAt: 400, lines: ['（内容待补充）'] },
  { id: 5, title: '坐公交', unlockAt: 500, lines: ['（内容待补充）'] }
];
