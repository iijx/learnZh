// services/course-config.js —— 课程包地址（部署切换开关，整个小程序只有这一处）
//
// 课程包（manifest.json + chars.L{n}.json + 未来的 strokes/poems/stories）全部走 CDN，
// 不内置进代码包；course.js 启动时拉取 manifest 比对版本，差异包下载到本地缓存。
// 域名与 content-pipeline/config.json 的 cos.publicBaseUrl + cos.prefix 一致：
//   {publicBaseUrl}/{prefix}/
var BASE = 'https://cdn.pastecuts.cn/learn-zh/';

module.exports = { BASE: BASE };
