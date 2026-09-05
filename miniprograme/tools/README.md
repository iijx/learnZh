# 内容素材替换指南

本目录脚本生成的是**占位素材**。正式上线前按下面的规范批量替换为真实素材，代码无需改动。

## 1. TTS 音频（全部由 audio-pipeline 生产，走 CDN）

- 命名规范：`<key>.mp3`，key 规则：
  - 单字读音 `<字>`；组词 `word_<字>_<i>`；例句 `sentence_<字>`；讲解 `explain_<字>`；
  - 里程碑朗读 `poem_<id>_<行>` / `story_<id>_<行>`
- 生成方式：`../audio-pipeline/`（豆包 TTS → 腾讯云 COS，用法见该目录 README）。
  `node index.js` 增量合成到本地缓存 `audio-pipeline/out/audio/`、上传 CDN、并自动重写 `data/audio-manifest.js`；
  `--chars <字>` 在文案修订后定向重合成。
- 客户端：`services/audio-config.js` 的 `BASE` 指向 CDN（`https://cdn.pastecuts.cn/learn-zh/audio/`），
  `tts.js` 首播时 `wx.downloadFile` 落本地缓存（老人多为流量敏感用户）。
- `assets/silence.mp3` 是占位静音（tts.js 兜底用），需打进小程序包，勿删。

## 2. AI 插画（替换 assets/img/placeholder-<字>.svg）

- 命名规范：`img/<char>.png`（2:1 尺寸，如 800×400）。
- 风格：暖色简笔画、主体突出、无多余细节（PRD 6.3）；抽象虚词配生活场景插画。
- 流程：批量 AI 生成 → 人工审核（无细节错误、无恐怖谷、主体明确）→ 压缩入库。
- 代码侧改动：数据文件里引用图片的字段改指新路径即可。

## 3. 笔顺数据（已 CDN 化，不再本地存放）

- 数据源：npm 包 `hanzi-writer-data`（9575 字，Make Me a Hanzi 项目，CC 协议），格式 `{strokes: [...], medians: [...]}`。
- 分发：`content-pipeline` 的 `publish` 自动为大纲全部字生成 `strokes/<字>.json` 并上传 CDN（`learn-zh/strokes/`），`manifest.strokes.chars` 登记有数据的字。
- 客户端：`course.hasStroke(ch)` 同步判定、`course.getStroke(ch)` 按需下载并本地文件缓存；tracer 组件异步加载，数据到达前画降级底字。
- 旧方案（本地 `data/strokes/*.json.js` + 静态索引）已废弃删除——小程序 require 不支持动态路径的限制在走 CDN 文件系统读后不复存在。

## 4. 占位生成脚本

```bash
node tools/gen-placeholders.js   # 重新生成全部占位图与静音音频（会覆盖同名文件）
```
