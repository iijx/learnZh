# learnzh 文案生产管线

爸妈识字课单字文案批量生产：LLM 生成讲解/记字诀/组词/例句 → 机器校验 → 人工审校 → 写回字表。
对应大纲 `miniprograme/docs/syllabus.md` §7 的「字讲解文案」一行；插画/场景图暂不生产。

## 首次配置

零依赖，Node ≥ 18 即可，无需 npm install。

```bash
cp config.example.json config.json   # 填入 llm.apiKey 与 llm.model（字段说明见文件内 _说明）
```

支持任意 OpenAI 兼容服务：火山方舟（豆包）填推理接入点 ID，DeepSeek 改 baseUrl 填 `deepseek-chat`。
凭证也可以用环境变量注入（见 `.env.example`），CI 场景推荐，优先级高于 config.json。

## 工作流

```
generate → 人工审校 output/<字>.json → approve → apply → audio-pipeline 合成音频
```

```bash
node index.js generate                 # 为字表中没有产物的占位字生成（增量，默认）
node index.js generate --chars 药医病   # 只生成指定的字
node index.js generate --force         # 已有产物的占位字也重新生成
node index.js generate --limit 5       # 试跑 5 个
node index.js generate --dry-run       # 不调 LLM，打印目标清单和完整提示词
node index.js stats                    # 生产进度
node index.js approve --all            # draft 中校验通过的标记 approved（人工审校后执行）
node index.js approve --chars 药医病    # 只通过指定的字
node index.js apply                    # approved 写回 miniprograme/data/chars.js
```

## 审校约定

- 生成的文案一字一文件落在 `output/<字>.json`，**该目录提交进 git**，多人审校走 PR。
- 状态机：`draft`（待审）→ `approved`（已审校）→ `applied`（已写回字表）；机器校验未过的是 `invalid`。
- 审校时直接改 JSON 文件里的文案字段即可，改完 `approve --chars <字>`；`approve` 会再跑一次机器校验兜底。
- 机器校验规则（`lib/validate.js`，对应 syllabus.md §6 规则 4）：
  - 阻断项：字段齐全、组词 2-3 个且含该字、例句含该字且 ≤15 个汉字、拼音合法、explain 含该字且 ≥10 字；
  - 提醒项：例句过短、记字诀没点出该字、explain 超 160 字、组词超 4 字。
- 提示词的 few-shot 范例取自 chars.js 的手写示范字（的/人/家），风格自动对齐；手写完整字永远不会被 LLM 覆盖。

## 产物

- `output/<字>.json` —— 单字文案（含 status、校验结果、生成时间与模型）
- `miniprograme/data/chars.js` —— `apply` 重写：保持学习顺序、去重、`hasStroke` 按笔顺文件重判

## 与音频管线的衔接

`apply` 写回字表后，运行 `node ../audio-pipeline/index.js` 即可增量合成新增字的
字音/讲解/组词/例句音频（audio-pipeline 按 `explain !== '内容待补充'` 识别完整字）。
