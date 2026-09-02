# 内容素材替换指南

本目录脚本生成的是**占位素材**。正式上线前按下面的规范批量替换为真实素材，代码无需改动。

## 1. TTS 音频（替换 assets/audio/）

- 命名规范：`audio/<key>.mp3`，key 规则：
  - 单字读音：`audio/的.mp3`、`audio/一.mp3`（key 就是字本身）
  - 组词/例句：`audio/word_的_0.mp3`、`audio/sentence_的.mp3`（讲解不合成音频，由小程序端另行处理）
- 生成方式：
  - **高拟真统一音色生成（推荐）**：运行 `python3 tools/gen-unified-audio.py --count 5`（采用 `zh-CN-XiaoxiaoNeural` 亲切温和女声，语速 -10%，自动重写清单）。
  - **云端生产管线**：`../audio-pipeline/`（豆包 TTS → 腾讯云 COS，用法见该目录 README）。
    `node index.js` 生成本地 mp3 并自动重写 `data/audio-manifest.js`；
    `--skip-upload` 只出本地，`--remote-only` 只传 COS。
  - 全量 500 字 × 字音+讲解+组词+例句 ≈ 3000+ 条（见 PRD 6.2）。
- 代码侧改动（已就绪）：`services/tts.js` 的 `USE_LOCAL_AUDIO` 置为 `true`，
  音频位置由 `services/audio-config.js` 的 `BASE` 一处决定：
  - 本地打包：保持默认 `'/assets/audio/'`；
  - 若音频放 CDN：`BASE` 填 `https://<CDN>/course/v1/audio/<key>.mp3` 的目录前缀，
    `tts.js` 会用 `wx.downloadFile` 做本地缓存（老人多为流量敏感用户）。
  调用处传 `tts.speak(text, { audioKey: '的' })` 即可。
- `silence.mp3` 是占位静音，正式接入真实 TTS 后可删除。

## 2. AI 插画（替换 assets/img/placeholder-<字>.svg）

- 命名规范：`img/<char>.png`（2:1 尺寸，如 800×400）。
- 风格：暖色简笔画、主体突出、无多余细节（PRD 6.3）；抽象虚词配生活场景插画。
- 流程：批量 AI 生成 → 人工审核（无细节错误、无恐怖谷、主体明确）→ 压缩入库。
- 代码侧改动：数据文件里引用图片的字段改指新路径即可。

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
