# Learnzh API（爸妈识字课 进度/排期后端）

「爸妈识字课」微信小程序的学习进度与复习排期后端。

## 架构

- 运行时：Bun（直接跑 TypeScript，无构建）
- 框架：Hono 4
- 数据库：PostgreSQL + Prisma 6（`learnzh_users` / `learnzh_user_chars`）
- 日志：pino / pino-pretty
- 校验：zod（schema 集中在 `src/types/index.ts`）
- 测试：vitest（排期核心为纯函数，见 `src/test/scheduler.test.ts`）
- 进程管理：PM2（`ecosystem.config.js`，端口 3009）

```
src/
├── index.ts              # Hono 入口：cors、请求日志、/health、路由、onError/notFound
├── data/syllabus-l1.ts   # L1 共 300 字的字序（自包含，不依赖外部文件）
├── services/scheduler.ts # 排期核心纯函数：日期工具、report 状态流转、getNextGroup 出组
├── routes/               # auth / group / report / progress（只做 IO）
├── middleware/           # logger.ts、auth.ts（x-openid 校验）
├── types/index.ts        # zod schema
└── utils/                # logger / database(Prisma 单例)
```

## 排期规则

- INTERVALS = [1, 1, 1, 3, 8]，streak 满 5 永久毕业（第 2/3/4/7 天复习，第 7 天毕业）
- report(known=true)：streak+1；满 5 → mastered，否则 nextDue = 今天 + INTERVALS[streak-1]
- report(known=false)：streak 清零，nextDue = 明天；当天重学后再 report(true) → streak=1（预期行为）
- 出组每组 5 个：3 复习（到期、逾期最久优先）+ 2 新；到期 0 个出 5 新，1~2 个复习全取+新字补齐，新字不够用剩余到期字补
- 日期均为东八区 'YYYY-MM-DD' 字符串

## API

统一响应：成功 `{ success: true, message, code: 200, data }`；失败 `{ error }` + 4xx/500。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | body `{ code }`，微信 jscode2session 换 openid 并 upsert 用户 |
| GET | `/api/group/next` | header `x-openid`，返回今日学习组 `{ group: [{char,isReview,streak}], date }` |
| POST | `/api/report` | header `x-openid`，body `{ char, known }`，返回该字最新状态 |
| GET | `/api/progress` | header `x-openid`，返回 `{ masteredCount, learningCount, totalLearned, todayGroupRemainder, totalChars }` |
| GET | `/health` | 健康检查 |

开发模式：`WX_MOCK_OPENID=true` 时 login 直接用 code 当 openid，不调微信接口。

## 部署

```bash
# 1. 安装 bun 与 pm2
curl -fsSL https://bun.sh/install | bash
npm i -g pm2

# 2. PostgreSQL 建库
createdb learnzh

# 3. 配置环境变量
cp .env.example .env   # 填 DATABASE_URL、WX_APPID、WX_SECRET 等

# 4. 部署（git pull → bun install → prisma generate → prisma db push → pm2 reload）
bash deploy.sh

# 5. nginx 反代 3009
# location / { proxy_pass http://127.0.0.1:3009; }
```

本地开发：`bun install && bun run dev`；测试：`bun run test`。
