import { Hono } from 'hono'
import prisma from '../utils/database'
import logger from '../utils/logger'
import { getNextGroup, todayCN } from '../services/scheduler'

const group = new Hono()

// GET /api/group/next：今日学习组（5 个，3 复习 + 2 新）
group.get('/next', async (c) => {
  const openid = c.get('openid')
  const today = todayCN()
  const records = await prisma.userChar.findMany({ where: { openid } })
  const result = getNextGroup(records, today)
  logger.info(`出组-${openid}-${today}-${result.map((g) => g.char).join('')}`)
  return c.json({
    success: true,
    message: '获取学习组成功',
    code: 200,
    data: { group: result, date: today },
  })
})

export default group
