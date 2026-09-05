# learnzh 文案生产管线

爸妈识字课单字文案批量生产：LLM 生成讲解/记字诀/组词/例句 → 机器校验 → 人工审校 → 写回字表 → 发布课程包。
对应大纲 `miniprograme/docs/syllabus.md` §7 的「字讲解文案」一行；插画/场景图暂不生产。

## 首次配置

Node ≥ 18。生成/审校零依赖；`publish` 需要 `npm install`（cos-nodejs-sdk-v5 上传、hanzi-writer-data 笔顺数据源）。

```bash
cp config.example.json config.json   # 填入 llm.apiKey 与 llm.model（字段说明见文件内 _说明）
```

支持任意 OpenAI 兼容服务：火山方舟（豆包）填推理接入点 ID，DeepSeek 改 baseUrl 填 `deepseek-chat`。
凭证也可以用环境变量注入（见 `.env.example`），CI 场景推荐，优先级高于 config.json。
COS 凭证可留空——缺省时自动回退读取 `../audio-pipeline/.env` 的 COS_*（两条管线共用同一个桶）。

## 工作流

```
generate → 人工审校 output/<字>.json → approve → apply → publish --upload（+ audio-pipeline 合成音频）
```

```bash
node index.js generate                 # 为 syllabus 大纲中缺文案的字生成（增量，默认，按学习顺序）
node index.js generate --chars 药医病   # 只生成指定的字
node index.js generate --force         # 已有产物的占位字也重新生成
node index.js generate --limit 5       # 试跑 5 个
node index.js generate --dry-run       # 不调 LLM，打印目标清单和完整提示词
node index.js stats                    # 生产进度
node index.js approve --all            # draft 中校验通过的标记 approved（人工审校后执行）
node index.js approve --chars 药医病    # 只通过指定的字
node index.js apply                    # 把 approved 写回 miniprograme/data/chars.js
node index.js publish                  # 构建课程包到 dist/learn-zh/（manifest.json + chars.L1.json）
node index.js publish --upload         # 构建并上传 COS（learn-zh/ 前缀）
node review.js                         # LLM 辅助审校：逐字挑文案质量毛病 → review-report.json
node review.js --fix                   # 审校 + 对问题字自动修正一轮（修正后回 draft 待复审）
```

`publish` 的产物即小程序运行时读取的线上课程包（方案见 `miniprograme/docs/course-package.md`）：

- `manifest.json` —— 版本与各内容包清单，客户端每次启动拉它比对（响应头 no-cache）
- `chars.L1.json` —— L1「生存篇」300 字内容包（按 syllabus.json 的级别拆分，L2-L5 定稿后陆续上线）

## 大纲（syllabus.json）

`syllabus.json` 是字序真相源：2500 字总目标分 L1-L5 五级（规划见 `miniprograme/docs/syllabus.md`），`order[]` 记录每个字的 `char/level/unit/sceneId`。目前 **L1 已定稿**：300 字 × 12 单元（每单元 25 字），按 12 个生活场景的语料首现排序生成。

- `syllabus/build-l1.js` —— L1 生成器：`node syllabus/build-l1.js` 重建 L1。语料字按首次出现归单元，`EXCLUDE`（过难不教）与 `FORCE_EARLY`（功能字强制提前）在文件头部调整，不足 300 由策展队列 `SUPPLEMENT` 填充
- `lib/syllabus.js` —— 读取/查询（load/order/posOf/levels/charsOfLevel），generate/apply/publish 共用
- 学习顺序 = `order[]` 顺序；`apply` 写回 chars.js 时按此排序（大纲字在前，大纲外旧字在后）
- `generate` 的默认目标 = 大纲内还没有完整文案的字，按学习顺序取，保证"先学先生成"
- `publish` 按 `level` 拆包；`contentVersion` 为内容哈希（内容不变版本不变，客户端不会空更新）

## 审校约定

- 生成的文案一字一文件落在 `output/<字>.json`，**该目录提交进 git**，多人审校走 PR。
- 状态机：`draft`（待审）→ `approved`（已审校）→ `applied`（已写回字表）；机器校验未过的是 `invalid`。
- 审校时直接改 JSON 文件里的文案字段即可，改完 `approve --chars <字>`；`approve` 会再跑一次机器校验兜底。
- 机器校验规则（`lib/validate.js`，对应 syllabus.md §6 规则 4）：
  - 阻断项：字段齐全、组词 2-3 个且含该字、例句含该字且 ≤15 个汉字、拼音合法、explain 含该字且 ≥10 字；
  - 提醒项：例句过短、记字诀没点出该字、explain 超 160 字、组词超 4 字、例句含 3 个以上"更晚才学的字"（学习位置 ≤50 的字不检查此项——开头几十字无已学字可组句）。
- 提示词的 few-shot 范例取自 chars.js 的手写示范字（的/人/大），风格自动对齐；手写完整字永远不会被 LLM 覆盖。

## 产物

- `output/<字>.json` —— 单字文案（含 status、校验结果、生成时间与模型）
- `miniprograme/data/chars.js` —— `apply` 重写：保持学习顺序、去重、`hasStroke` 按笔顺文件重判
- `dist/learn-zh/` —— `publish` 构建的线上课程包（gitignore；上传后客户端直读）：manifest.json、chars.L{n}.json、strokes/<字>.json（笔顺，hanzi-writer 格式，数据源 npm `hanzi-writer-data`）

## 语料库（corpus/）

- `corpus/scenes.json` —— 60 个生活场景的目标阅读文本（原创，按 L1-L5 分级），是选字倒推与场景课素材的语料来源
- `corpus/stats.js` —— 字频统计：`node corpus/stats.js [--all] [--missing]`，输出分级覆盖曲线、高频字、语料有而字表没有的字

## 与音频管线的衔接

`apply` 写回字表后，运行 `node ../audio-pipeline/index.js` 即可增量合成新增字的
字音/讲解/组词/例句音频（audio-pipeline 按 `explain !== '内容待补充'` 识别完整字）。
