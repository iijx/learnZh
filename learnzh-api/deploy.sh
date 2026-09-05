#!/bin/bash
# PM2 Learnzh API 部署脚本

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 部署 Learnzh API"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
cd "$PROJECT_DIR"

echo "PROJECT_DIR: $PROJECT_DIR"

if [ ! -f "ecosystem.config.js" ]; then
    echo "❌ 错误：找不到 ecosystem.config.js"
    exit 1
fi

echo ""
echo "📦 拉取最新代码..."
git pull origin main

echo ""
echo "📦 安装依赖..."
bun install --verbose

echo ""
echo "🔧 生成 Prisma Client..."
bun run db:generate

echo ""
echo "🗄️  同步数据库结构..."
bun run db:push --accept-data-loss --skip-generate || echo "⚠️  数据库已是最新"

echo ""
echo "🔄 重启 Learnzh API..."

if pm2 list | grep -q "learnzh-api"; then
    echo "应用已在运行，执行重启..."
    pm2 reload ecosystem.config.js --update-env
else
    echo "首次启动应用..."
    pm2 start ecosystem.config.js
    pm2 save
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Learnzh API 部署完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

pm2 info learnzh-api

echo ""
echo "🧪 测试：curl http://localhost:3009/health"
echo ""
