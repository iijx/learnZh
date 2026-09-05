import { z } from 'zod'

export const WxLoginSchema = z.object({
  code: z.string().min(1, 'code 不能为空'),
})

export const ReportSchema = z.object({
  char: z.string().length(1, 'char 必须是单个汉字'),
  known: z.boolean(),
})

export type WxLoginInput = z.infer<typeof WxLoginSchema>
export type ReportInput = z.infer<typeof ReportSchema>
