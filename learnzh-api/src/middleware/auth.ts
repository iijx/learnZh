import { Context, Next } from 'hono'
import prisma from '../utils/database'

// 校验 x-openid header，查无用户 → 401
export const authMiddleware = async (c: Context, next: Next) => {
  const openid = c.req.header('x-openid')
  if (!openid) {
    return c.json({ error: '未登录' }, 401)
  }
  const user = await prisma.user.findUnique({ where: { openid } })
  if (!user) {
    return c.json({ error: '未登录' }, 401)
  }
  c.set('openid', openid)
  await next()
}
