import { cors } from 'hono/cors'
import { Hono } from 'hono'
import dotenv from 'dotenv'

import { loggerMiddleware } from './middleware/logger'
import { authMiddleware } from './middleware/auth'
import logger from './utils/logger'
import auth from './routes/auth'
import group from './routes/group'
import report from './routes/report'
import progress from './routes/progress'

// 加载环境变量
dotenv.config()

const app = new Hono()

// 中间件
app.use('*', cors())
app.use('*', loggerMiddleware)

// 需要登录的接口
app.use('/api/group/*', authMiddleware)
app.use('/api/report/*', authMiddleware)
app.use('/api/report', authMiddleware)
app.use('/api/progress', authMiddleware)
app.use('/api/progress/*', authMiddleware)

// 健康检查
app.get('/health', (c) => {
  logger.info('Health check requested')
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

app.route('/api/auth', auth)
app.route('/api/group', group)
app.route('/api/report', report)
app.route('/api/progress', progress)

// 错误处理
app.onError((err, c) => {
  logger.error({
    error: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method
  })

  return c.json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  }, 500)
})

// 404 处理
app.notFound((c) => {
  logger.warn(`404 Not Found: ${c.req.method} ${c.req.path}`)
  return c.json({ error: 'Not Found' }, 404)
})

const port = parseInt(process.env.PORT || '3009')

logger.info(`🚀 Learnzh API starting on port ${port}`)
logger.info(`🔮 Auth API: http://localhost:${port}/api/auth`)
logger.info(`🏥 Health Check: http://localhost:${port}/health`)

export default {
  port,
  fetch: app.fetch
}
