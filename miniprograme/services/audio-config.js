// services/audio-config.js —— 音频存放位置（部署切换开关，整个小程序只有这一处）
//
// CDN 托管（当前）：1515 条音频约 50 MB，远超微信主包 2MB 上限，必须走 CDN；
//   tts.js 会在首次播放时下载到用户本地缓存（老人流量敏感，见 tools/README.md 第 1 节）。
//   域名与 audio-pipeline/config.json 的 cos.publicBaseUrl + prefix 一致。
// 本地打包：`BASE = '/assets/audio/'`（调试用途；当前仓库音频不进包，用此模式需先把
//   audio-pipeline/out/audio/ 拷到 miniprograme/assets/audio/）。
var BASE = 'https://cdn.pastecuts.cn/learn-zh/audio/';

module.exports = { BASE: BASE };
