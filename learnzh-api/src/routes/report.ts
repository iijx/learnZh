import { Hono } from 'hono'
import prisma from '../utils/database'
import logger from '../utils/logger'
import { ReportSchema } from '../types'
import { applyReport, todayCN } from '../services/scheduler'

const report = new Hono()

// POST /api/report：上报某字学习结果 { char, known }
report.post('/', async (c) => {
  try {
    const openid = c.get('openid')
    const body = await c.req.json()
    const validatedData = ReportSchema.parse(body)
    const today = todayCN()

    const prev = await prisma.userChar.findUnique({
      where: { openid_char: { openid, char: validatedData.char } },
    })

    // 幂等：当天已上报过且已走完学习闭环的字，重复上报（断点续学/重复点击）不再累计 streak；
    // 例外：当天先 report(false) 清零后重学完成的 report(true) 必须放行（streak 0→1）
    if (prev && prev.lastDoneDate === today && (validatedData.known === false || prev.streak > 0 || prev.mastered)) {
      return c.json({
        success: true,
        message: '今日已上报',
        code: 200,
        data: {
          char: prev.char,
          streak: prev.streak,
          mastered: prev.mastered,
          nextDue: prev.nextDue === '' ? null : prev.nextDue,
        },
      })
    }

    const next = applyReport(prev, validatedData.char, validatedData.known, today)

    const saved = await prisma.userChar.upsert({
      where: { openid_char: { openid, char: validatedData.char } },
      create: { openid, ...next },
      update: next,
    })

    logger.info(`report-${openid}-${saved.char}-known=${validatedData.known}-streak=${saved.streak}`)
    return c.json({
      success: true,
      message: '上报成功',
      code: 200,
      data: {
        char: saved.char,
        streak: saved.streak,
        mastered: saved.mastered,
        nextDue: saved.nextDue === '' ? null : saved.nextDue,
      },
    })
  } catch (error) {
    logger.error('上报失败', { error: (error as Error).message })
    return c.json({ error: '上报失败' }, 400)
  }
})

export default report
