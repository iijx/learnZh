// services/audio-config.js —— 音频存放位置（部署切换开关，整个小程序只有这一处）
//
// 本地打包（默认）：BASE = '/assets/audio/'，音频打进代码包，离线可用。
//   注意微信主包体积上限 2MB，音频增多后必须切换 CDN。
// CDN 托管：BASE = 'https://<公网域名>/course/v1/audio/'，
//   域名与 audio-pipeline/config.json 的 cos.publicBaseUrl + prefix 一致；
//   tts.js 会在首次播放时下载到用户本地缓存（老人流量敏感，见 tools/README.md 第 1 节）。
var BASE = '/assets/audio/';

module.exports = { BASE: BASE };
