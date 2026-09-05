import { Hono } from 'hono'
import { WxLoginSchema } from '../types'
import prisma from '../utils/database'
import logger from '../utils/logger'

const auth = new Hono()

// jscode2session：appid/secret 走 env，不硬编码。
// session_key 不保存：本项目用不到解密手机号等场景，如将来需要再加缓存存储
const jscode2session = async (code: string) => {
  const appid = process.env.WX_APPID || ''
  const secret = process.env.WX_SECRET || ''
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`
  const res = await fetch(url)
  return await res.json() as { openid?: string; session_key?: string; errcode?: number; errmsg?: string }
}

auth.post('/login', async (c) => {
  try {
    const body = await c.req.json()
    const validatedData = WxLoginSchema.parse(body)

    let openid = ''

    if (process.env.WX_MOCK_OPENID === 'true') {
      // 开发模式：直接用 code 当 openid，方便无微信环境测试
      openid = validatedData.code
      logger.info(`微信登录(mock)-${openid}`)
    } else {
      const wxRes = await jscode2session(validatedData.code)
      logger.info(`微信登录-${JSON.stringify(wxRes)}`)
      if (!wxRes || !wxRes.openid) {
        return c.json({ error: '微信登录失败' }, 400)
      }
      openid = wxRes.openid
    }

    const user = await prisma.user.upsert({
      where: { openid },
      create: { openid },
      update: {},
    })

    return c.json({ success: true, message: '登录成功', code: 200, data: { openid: user.openid } })
  } catch (error) {
    logger.error('微信登录失败', { error: (error as Error).message })
    return c.json({ error: '微信登录失败' }, 400)
  }
})

export default auth
