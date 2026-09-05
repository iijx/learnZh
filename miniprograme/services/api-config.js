// services/api-config.js —— 后端 API 地址（唯一改动点）
// 部署后改成线上域名（需在微信公众平台配置 request 合法域名）。
// 开发工具里 project.config.json 已关 urlCheck，本地 http 也能调。
module.exports = {
  // BASE: 'https://api.pastecuts.cn',   // 线上（上线时启用）
  BASE: 'http://127.0.0.1:3009'          // 本地联调
};
