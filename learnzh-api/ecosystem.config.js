/**
 * Learnzh API PM2 配置文件
 *
 * 使用方式：
 * - 启动：pm2 start ecosystem.config.js
 * - 重启：pm2 restart learnzh-api
 * - 停止：pm2 stop learnzh-api
 * - 查看日志：pm2 logs learnzh-api
 */

require('dotenv').config();

module.exports = {
  apps: [
    {
      name: 'learnzh-api',
      cwd: './',
      script: 'bun',
      args: 'run start',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3009,
        DATABASE_URL: process.env.DATABASE_URL,
        WX_APPID: process.env.WX_APPID,
        WX_SECRET: process.env.WX_SECRET,
        WX_MOCK_OPENID: process.env.WX_MOCK_OPENID,
        LOG_LEVEL: process.env.LOG_LEVEL || 'info'
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000
    }
  ]
};
