# learnZh 音频生产管线

爸妈识字课语音批量生产：豆包 TTS（火山引擎大模型语音合成）合成 → 本地 mp3 → 腾讯云 COS 上传 → 重写小程序音频清单。

## 首次配置

```bash
npm install
cp config.example.json config.json   # 填入 doubao 与 cos 凭证（各字段说明见文件内 _说明）
```

凭证也可以只通过环境变量注入（见 `.env.example`），CI 场景推荐，优先级高于 config.json。

## 用法

```bash
node index.js                 # 合成缺失音频，本地写入 + 上传 COS（已存在均跳过）
node index.js --force         # 全部重新合成并覆盖上传
node index.js --skip-upload   # 只生成本地 mp3 不上传（本地试听/调试）
node index.js --remote-only   # 不落本地直接传 COS（CDN 全量部署，等价于全量重跑）
node index.js --all           # 占位字也纳入（占位字只合成单字读音）
node index.js --dry-run       # 只看任务清单，无需凭证
node index.js --limit N       # 最多处理 N 条（试跑用）
```

## 产物

- `miniprograme/assets/audio/<key>.mp3` —— 合成音频（remote-only 时不写）
- `miniprograme/data/audio-manifest.js` —— 小程序端读取的可用 key 清单（每次运行后重写）
- COS `course/v1/audio/<key>.mp3` + `manifest.json`（上传模式）
- `state.json` —— 最近一次运行统计与失败清单

key 规则（与 `miniprograme/tools/README.md` 第 1 节一致）：单字 `<字>`；组词 `word_<字>_<i>`；例句 `sentence_<字>`。讲解不合成音频，由小程序端另行处理。

## 小程序端部署切换

音频放本地代码包还是 CDN，由 `miniprograme/services/audio-config.js` 的 `BASE` 一处决定：

- 本地打包（默认）：`BASE = '/assets/audio/'`
- CDN 托管：`BASE = 'https://<公网域名>/course/v1/audio/'`，域名与 `config.json` 的 `cos.publicBaseUrl + prefix` 一致；`tts.js` 会在首次播放时下载到用户本地缓存（老人多为流量敏感用户）。

注意：微信主包体积上限 2MB，500 字全量音频（3000+ 条）必须走 CDN。
