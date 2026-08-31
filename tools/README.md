# 内容素材替换指南

本目录脚本生成的是**占位素材**。正式上线前按下面的规范批量替换为真实素材，代码无需改动。

## 1. TTS 音频（替换 assets/audio/）

- 命名规范：`audio/<key>.mp3`，key 规则：
  - 单字读音：`audio/的.mp3`、`audio/一.mp3`（key 就是字本身）
  - 讲解/组词/例句等长文本：建议 `audio/explain_的.mp3`、`audio/sentence_的.mp3`
- 生成方式：用自有 TTS 管线离线批量合成（500 字 × 字音+讲解+组词+例句 ≈ 3000+ 条，见 PRD 6.2），
  音色选亲和的中老年男声/女声，语速调慢一档。
- 代码侧改动：打开 `services/tts.js`，把 `USE_LOCAL_AUDIO` 置为 `true`，
  并按上面的命名规范实现 `_audioSrcFor(audioKey)`（已预留）。
  调用处传 `tts.speak(text, { audioKey: '的' })` 即可。
- 若音频放 CDN：把 `_audioSrcFor` 返回 `https://<CDN>/course/v1/audio/<key>.mp3`，
  并配合 `wx.downloadFile` 做本地缓存（老人多为流量敏感用户）。
- `silence.mp3` 是占位静音，正式接入真实 TTS 后可删除。

## 2. AI 插画（替换 assets/img/placeholder-<字>.svg）

- 命名规范：`img/<char>.png`（2:1 尺寸，如 800×400），场景课大图 `img/scene_<id>.png`。
- 风格：暖色简笔画、主体突出、无多余细节（PRD 6.3）；抽象虚词配生活场景插画。
- 流程：批量 AI 生成 → 人工审核（无细节错误、无恐怖谷、主体明确）→ 压缩入库。
- 代码侧改动：数据文件里引用图片的字段（如 scenes.js 的 `image`）改指新路径即可。

## 3. 笔顺数据（扩充 data/strokes/）

- 现有：前 20 个示范字的 hanzi-writer 格式数据（`{strokes: [...], medians: [...]}`）。
- 注意：小程序打包器不支持 `require('*.json')`，因此笔顺文件一律以 **`.json.js`**（CommonJS 模块）形式存放，并在 `data/strokes/index.js` 中登记。
- 批量拉取与转换：
  ```bash
  # 以「药」为例，文件名就是字本身
  curl -s 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/药.json' -o /tmp/药.json
  node -e "const fs=require('fs');fs.writeFileSync('data/strokes/药.json.js','module.exports = '+fs.readFileSync('/tmp/药.json','utf8').trim()+';\n')"
  # 然后在 data/strokes/index.js 的 DATA 里加一行：'药': require('./药.json.js'),
  ```
  对 500 字循环执行即可（数据源 Make Me a Hanzi，CC 协议，见 PRD 6.4）。
- 每拉到一个字，把 `data/chars.js` 中该字的 `hasStroke` 改为 `true`。
  无笔顺数据的字，描红环节退化为静态描红底字（页面逻辑处理）。

## 4. 占位生成脚本

```bash
node tools/gen-placeholders.js   # 重新生成全部占位图与静音音频（会覆盖同名文件）
```
