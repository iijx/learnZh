import { Hono } from 'hono'
import prisma from '../utils/database'
import { calcProgress, todayCN } from '../services/scheduler'
import { L1_TOTAL } from '../data/syllabus-l1'

const progress = new Hono()

// GET /api/progress：学习进度统计
progress.get('/', async (c) => {
  const openid = c.get('openid')
  const today = todayCN()
  const records = await prisma.userChar.findMany({ where: { openid } })
  const stats = calcProgress(records, today)
  return c.json({
    success: true,
    message: '获取进度成功',
    code: 200,
    data: { ...stats, totalChars: L1_TOTAL },
  })
})

export default progress
