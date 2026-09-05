// services/api-config.js —— 后端 API 地址（唯一改动点）
// 线上域名需在微信公众平台配置 request 合法域名；
// 开发工具里 project.config.json 已关 urlCheck，本地 http 也能调。
module.exports = {
  BASE: 'https://vapi.pastecuts.cn/learnzh'   // 线上（nginx 反代到 3009）
  // BASE: 'http://127.0.0.1:3009'            // 本地联调
};
