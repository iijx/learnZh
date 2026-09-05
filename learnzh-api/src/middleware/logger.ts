import { Context, Next } from 'hono'
import logger from '../utils/logger'

export const loggerMiddleware = async (c: Context, next: Next) => {
  const start = Date.now()

  await next()

  const end = Date.now()
  const duration = end - start

  logger.info({
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration: `${duration}ms`,
    userAgent: c.req.header('user-agent')
  })
}
