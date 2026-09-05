# 课程包存储与分发方案（L1-L5，2500 字）

> 配套文档：`syllabus.md`（大纲）。本文档回答：2500 字的内容**存在哪、怎么打包、小程序怎么读**。
> 已决策：**不内置任何课程包，全程线上包 + 本地缓存**。

## 1. 体积账（实测）

| 内容 | 单条体积 | L1(300字) | 全量(2500字) |
|---|---|---|---|
| 字文案（chars） | ~180 B/字（占位字）~450 B/字（完整字；当前 L1 300 字混合包实测 52 KB） | ~52 KB | ~1.2 MB |
| 笔顺（strokes） | 0.5–2.5 KB/字（实测 20 字共 84 KB） | ~0.9 MB | ~7 MB |
| 音频 | ~35 KB/条（实测 44 条 1.5 MB） | ~60 MB（300×6 条） | ~500 MB（1.5 万条） |
| 古诗/故事/场景 | KB 级 | — | <200 KB |

约束：微信主包上限 2 MB；`wx.setStorageSync` 全局限 10 MB；本地文件目录（`wx.env.USER_DATA_PATH`）容量有限需管理。

**结论：字表、笔顺、音频全部走 CDN + 本地缓存。** 首次启动必须联网拉取一次（L1 包 ~52 KB，秒级），之后离线可用。

## 2. 存储总原则

```
content-pipeline（真相源，git 版本管理）
  ├── syllabus.json            # 大纲：级别定义 + 字序（char → level/unit）
  └── output/<字>.json         # 文案：一字一文件（已有）
         │
         │  node index.js publish [--upload]     ← 已实现
         ▼
dist/learn-zh/（产物 → COS → CDN）
  ├── manifest.json            # ✅ 已上线  https://cdn.pastecuts.cn/learn-zh/manifest.json
  ├── chars.L1.json            # ✅ 已上线  https://cdn.pastecuts.cn/learn-zh/chars.L1.json
  ├── chars.L2.json …          # 大纲定稿后按 level 拆分
  ├── poems.json / stories.json
  ├── strokes/<字>.json        # hanzi-writer 原始 JSON，不再转 .js
  └── audio/<key>.mp3          # ✅ 已上线  https://cdn.pastecuts.cn/learn-zh/audio/（1515 条，audio-pipeline 产物）
```

- **真相源只有一处**：`output/` + `syllabus.json`。`miniprograme/data/chars.js` 是 publish 的输入（开发期字表）；小程序运行时只读线上包，chars.js 不参与运行。
- 更新内容 = 改 output/ → `publish --upload`。**改文案不用发版**。
- COS 对象前缀 `learn-zh/`，public-read；`manifest.json` 响应头 `no-cache`（客户端再叠加 `?t=` 时间戳，双保险每次拿到最新的），内容包 `max-age=86400`。
- 内容包按 **contentVersion 寻址**：客户端下载 URL 带 `?v=<contentVersion>`，内容一变 URL 就变，CDN 边缘节点不可能给出旧包；落盘版本号记在 storage（`lz_course_pack_ver_<包名>`），缓存可信与否只认落盘版本号，不认 manifest 对比。

### manifest.json 结构（当前线上实际结构 + 规划字段）

```json
{
  "version": 1788519726390,
  "generatedAt": "2026-09-04T11:02:06Z",
  "levels": [
    { "level": 1, "name": "生存篇", "promise": "看懂价签、药盒、站牌、钱数、日期",
      "count": 300, "pack": "chars.L1.json",
      "contentVersion": 3025693482, "bytes": 52964 }
  ],
  "texts": { "poems": { "pack": "poems.json", "contentVersion": 1 } },
  "strokes": { "base": "strokes/", "chars": ["的","一"] },
  "audio": { "base": "audio/", "manifest": "audio-manifest.json" }
}
```

`texts / strokes / audio` 为规划字段，随内容上线补充。L1 已是 syllabus.json 大纲版（300 字×12 单元，包内条目带 `unit` 字段）；`contentVersion` 是内容哈希，内容不变则版本不变，客户端不会空更新。L2-L5 定稿后按同样方式拆分上线。

## 3. 小程序端：services/course.js（新增，唯一内容入口）

```
启动（app.js onLaunch）
  ├─ 读本地缓存 manifest
  │    ├─ 有缓存 → 载入缓存内容包，立即可用（离线可学）
  │    └─ 无缓存（首次启动）→ 全屏加载页：拉 manifest + L1 包（~80KB），
  │         失败显示大字「请检查网络后重试」按钮
  └─ 后台：GET manifest.json → 比对 contentVersion
        └─ 有更新 → wx.downloadFile 差异包 → 存 USER_DATA_PATH → 更新缓存（下次启动生效）
学习页 learn.js
  └─ course.getChars(level) 同步返回（init 时已载入内存）
描红 tracer
  └─ course.getStroke(char) → 缓存命中直接给；未命中后台下载；失败/无数据 → 跳过描红（现有 hasStroke 逻辑天然兼容）
音频 tts.js
  └─ 维持现状（manifest + 首播下载缓存），把 BASE 切到 CDN
```

API（已实现部分）：

```js
course.init()               // onLaunch 调用；有缓存时同步可用并后台静默更新，无缓存时联网拉取
course.ready()              // 页面守卫：await 后 ok=false 表示首次拉取失败，展示重试入口
course.retry()              // 加载失败后的重试
course.getLevels()          // 级别元信息（首页/进度页展示级别名与进度用）
course.loadChars()          // 同步取全量字表（数组顺序即学习顺序）
course.getChar(ch)          // 单字查询
course.hasStroke(ch)        // 同步判定有无笔顺数据（依据 manifest.strokes.chars）
course.getStroke(ch)        // Promise<{strokes,medians}|null>：笔顺按需下载 + 本地文件缓存
```

规划中未实现：`preload(level)`（下一级静默预载）。

存储布局：

- `wx.setStorageSync`：manifest 缓存 + 各级 contentVersion（几 KB）
- `USER_DATA_PATH/course/chars.L{n}.json`、`USER_DATA_PATH/course/strokes/<字>.json`：内容本体
- 音频沿用现有缓存；加一条**容量治理**：本地文件接近上限时按最久未用清理（当前学习级别不清）

降级链：CDN 新包 → 本地缓存旧版 → （仅首次启动无缓存时）提示联网重试。

## 4. 现状与边界

- `learn.js` 已改从 `course` 服务取字表（ready 守卫）；`data/chars.js` 不再被运行时引用，仅作 content-pipeline `publish` 的输入源。
- 尚未上线，不考虑老数据迁移：字表结构调整时直接整体替换即可。
- 笔顺已 CDN 化：旧 `data/strokes/`（本地 .json.js + 静态索引）已删除，`manifest.strokes.chars` 列出有数据的字，`course.getStroke` 按字下载并落 `USER_DATA_PATH/course/strokes/`；tracer 组件异步加载，数据到达前先画降级底字。
- `data/audio-manifest.js` 机制不变；音频已统一到 `learn-zh/audio/`（`services/audio-config.js` 的 BASE 已切到该地址，音频对象与课程包对象同桶隔离存放）。

## 5. 实施步骤

| 步骤 | 内容 | 状态 |
|---|---|---|
| S1 | content-pipeline 加 `syllabus.json`（级别定义 + 字序），publish 按 level 拆包 | ✅ 已完成（L1 定稿 300 字×12 单元；L2-L5 待定稿） |
| S2 | `publish` 命令：生成 dist 课程包（manifest + chars.L1.json） | ✅ 已完成并上线 |
| S3 | 笔顺批量转换脚本：hanzi-writer 开源数据 → dist/strokes/*.json | ✅ 已完成（`lib/strokes.js`，300 字全覆盖，已上线） |
| S4 | 小程序 `services/course.js` 线上化 + learn 页 ready 守卫与重试遮罩 | ✅ 已完成（字表已线上化；古诗/故事/笔顺仍本地，待 S3） |
| S5 | COS 上传（publish --upload，自动复用 audio-pipeline/.env 的 COS 凭证） | ✅ 已完成 |
| S6 | 容量治理 + preload 策略 | 待做，依赖 S4 |

## 6. 验收

- 首次启动（联网）：加载页 → 拉到 L1 包 → 正常学习
- 二次启动断网：用本地缓存正常学习，音频播已缓存的
- 改一个字的文案 → publish --upload → 客户端下次启动拿到新文案（不发版）
- 学完当前级末单元前，下一级包已静默预载完成
