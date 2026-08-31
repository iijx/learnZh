// data/scenes.js —— 场景课定义（共 20 节，每学满 25 字解锁一节）
// 字段：
//   id       编号
//   title    场景名
//   unlockAt 解锁所需已学字数（25 / 50 / 75 ...）
//   image    场景大图（占位图路径，未来换 AI 插画）
//   items    待找目标字列表：{ char: 要找的字, hint: 语音提示的引导语 }
// 第 1 节「菜市场价签」为完整示范，其余占位。
// 【未来替换为服务端 REST API】课程包改由 CDN 下发（GET {CDN}/course/v1/scenes.json）。

module.exports = [
  {
    id: 1,
    title: '菜市场价签',
    unlockAt: 25,
    image: '/assets/img/placeholder-场.svg',
    items: [
      { char: '元', hint: '价签上写着几块「元」一斤，找找「元」字在哪里' },
      { char: '斤', hint: '买菜论「斤」，找找「斤」字在哪里' },
      { char: '菜', hint: '白「菜」、青「菜」，找找「菜」字在哪里' },
      { char: '大', hint: '「大」白菜的「大」，找找它在哪里' }
    ]
  },
  { id: 2, title: '公交站牌', unlockAt: 50, image: '/assets/img/placeholder-站.svg', items: [] },
  { id: 3, title: '药品说明书', unlockAt: 75, image: '/assets/img/placeholder-药.svg', items: [] },
  { id: 4, title: '菜单', unlockAt: 100, image: '/assets/img/placeholder-菜.svg', items: [] },
  { id: 5, title: '手机短信', unlockAt: 125, image: '/assets/img/placeholder-信.svg', items: [] },
  { id: 6, title: '银行叫号屏', unlockAt: 150, image: '/assets/img/placeholder-号.svg', items: [] },
  { id: 7, title: '超市货架', unlockAt: 175, image: '/assets/img/placeholder-超.svg', items: [] },
  { id: 8, title: '医院科室牌', unlockAt: 200, image: '/assets/img/placeholder-医.svg', items: [] },
  { id: 9, title: '水果摊', unlockAt: 225, image: '/assets/img/placeholder-果.svg', items: [] },
  { id: 10, title: '早餐店', unlockAt: 250, image: '/assets/img/placeholder-早.svg', items: [] },
  { id: 11, title: '快递取件码', unlockAt: 275, image: '/assets/img/placeholder-件.svg', items: [] },
  { id: 12, title: '电视字幕', unlockAt: 300, image: '/assets/img/placeholder-视.svg', items: [] },
  { id: 13, title: '小区通知栏', unlockAt: 325, image: '/assets/img/placeholder-区.svg', items: [] },
  { id: 14, title: '公园指示牌', unlockAt: 350, image: '/assets/img/placeholder-园.svg', items: [] },
  { id: 15, title: '药店货架', unlockAt: 375, image: '/assets/img/placeholder-店.svg', items: [] },
  { id: 16, title: '收款码牌子', unlockAt: 400, image: '/assets/img/placeholder-钱.svg', items: [] },
  { id: 17, title: '天气预报', unlockAt: 425, image: '/assets/img/placeholder-天.svg', items: [] },
  { id: 18, title: '日历挂历', unlockAt: 450, image: '/assets/img/placeholder-日.svg', items: [] },
  { id: 19, title: '火车票', unlockAt: 475, image: '/assets/img/placeholder-票.svg', items: [] },
  { id: 20, title: '电梯楼层牌', unlockAt: 500, image: '/assets/img/placeholder-楼.svg', items: [] }
];
