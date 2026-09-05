# learnZh 爸妈识字课

教完全不识字的中老年人认字的微信小程序。总目标 2500 字、五级大纲（L1-L5），达到功能性阅读。

## 当前进度（2026-09-05）

**总字表：300 / 2500（12%）** —— L1 生存篇已上线，L2-L5 未定稿。

| 级别 | 字数 | 字表 | 文案七件套 | 音频 | 笔顺 | 验收 |
|---|---|---|---|---|---|---|
| L1 生存篇 | 300 | ✅ 定稿（12 单元） | ✅ 300/300（LLM 生成 + 两轮机器审校，**人工终审未做**） | ✅ 1874 条（字音/讲解/组词/例句 + 里程碑朗读） | ✅ 300/300 | ✅ check-syllabus 0 阻断 |
| L2 生活篇 | 500 | 未定稿 | — | — | — | — |
| L3 脱盲篇 | 700 | 未定稿 | — | — | — | — |
| L4 报刊篇 | 500 | 未定稿 | — | — | — | — |
| L5 自由篇 | 500 | 未定稿 | — | — | — | — |

L1 里程碑课：6 首原创童谣 + 3 篇生活小故事（生字率 0，经典古诗生字率必然超标，挪到 L3）。

**L1 收尾待办**：人工终审 `content-pipeline/output/`；场景课重建（60 节，素材 `corpus/scenes.json`）；插画（搁置中）；规则5 覆盖抽测（缺外部语料）。

## 架构：一切内容走 CDN

- 小程序运行时零内置内容包：字表/笔顺/音频全部 `https://cdn.pastecuts.cn/learn-zh/` + 本地缓存，改内容不发版
- `services/course.js` —— 唯一内容入口（manifest 比对、版本寻址、离线缓存）
- `services/tts.js` —— 播报抽象层（预合成音频，首播下载缓存）

## 两条生产管线（仓库根目录）

- `content-pipeline/` —— 大纲（syllabus.json）→ LLM 文案 → 机器校验 → `review.js` LLM 审校 → apply → publish 上 CDN
- `audio-pipeline/` —— 豆包 TTS 合成 → COS（`learn-zh/audio/`），`--chars` 定向重合成

## 验收

```bash
node miniprograme/tools/check-syllabus.js   # 大纲 §6 五条规则，阻断项为 0 才可上线
```

## 文档

- `docs/syllabus.md` —— 学什么：五级大纲、选字方法论、验收规则、Roadmap
- `docs/course-package.md` —— 怎么存怎么发：课程包存储与分发方案
- `tools/README.md` —— 内容素材规范
