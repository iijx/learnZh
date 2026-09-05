import { describe, it, expect } from 'vitest'
import {
  applyReport,
  getNextGroup,
  addDays,
  todayCN,
  type CharState,
} from '../services/scheduler'
import { L1_CHARS } from '../data/syllabus-l1'

const DAY1 = '2026-01-01'

// 内存版 user_chars，模拟 30 天
const makeStore = () => {
  const map = new Map<string, CharState>()
  return {
    records: () => [...map.values()],
    report: (char: string, known: boolean, today: string) => {
      const next = applyReport(map.get(char) ?? null, char, known, today)
      map.set(char, next)
      return next
    },
  }
}

const dueChar = (char: string, nextDue: string, streak = 1): CharState => ({
  char,
  streak,
  mastered: false,
  nextDue,
  lastDoneDate: '',
})

describe('日期工具', () => {
  it('addDays 加 N 天，跨年跨月正确', () => {
    expect(addDays('2026-01-01', 1)).toBe('2026-01-02')
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2025-12-31', 14)).toBe('2026-01-14')
  })

  it('todayCN 返回 YYYY-MM-DD 格式', () => {
    expect(todayCN()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('排期模拟 30 天', () => {
  it('第 1 天：无到期复习时出 5 个新字，report 后 streak=1、nextDue=明天', () => {
    const store = makeStore()
    const group = getNextGroup(store.records(), DAY1)

    expect(group).toHaveLength(5)
    expect(group.every((g) => !g.isReview)).toBe(true)
    expect(group.map((g) => g.char)).toEqual(L1_CHARS.slice(0, 5))

    for (const g of group) {
      const state = store.report(g.char, true, DAY1)
      expect(state.streak).toBe(1)
      expect(state.mastered).toBe(false)
      expect(state.nextDue).toBe(addDays(DAY1, 1))
      expect(state.lastDoneDate).toBe(DAY1)
    }
  })

  it('第 2 天：5 字到期，出组 = 3 复习 + 2 新；复习字 streak=2、nextDue=+1 天', () => {
    const store = makeStore()
    const day1Group = getNextGroup(store.records(), DAY1)
    for (const g of day1Group) store.report(g.char, true, DAY1)

    const day2 = addDays(DAY1, 1)
    const group = getNextGroup(store.records(), day2)

    expect(group).toHaveLength(5)
    const reviews = group.filter((g) => g.isReview)
    const fresh = group.filter((g) => !g.isReview)
    expect(reviews).toHaveLength(3)
    expect(fresh).toHaveLength(2)
    // 复习字来自第 1 天学的 5 个
    const day1Chars = new Set(day1Group.map((g) => g.char))
    expect(reviews.every((g) => day1Chars.has(g.char))).toBe(true)
    // 新字按 L1 字序接着来
    expect(fresh.map((g) => g.char)).toEqual(L1_CHARS.slice(5, 7))

    for (const g of reviews) {
      const state = store.report(g.char, true, day2)
      expect(state.streak).toBe(2)
      expect(state.nextDue).toBe(addDays(day2, 1))
    }
  })

  it('连续全部认识：字在第 2/3/4/7 天出现，第 7 天 report 后毕业，之后 30 天内不再出现', () => {
    // 只跟踪单个字，避免复习积压（每天最多 3 个复习位）干扰间隔断言
    const store = makeStore()
    const target = L1_CHARS[0]
    const appearances: string[] = []
    let masteredAt = ''

    store.report(target, true, DAY1) // 第 1 天首次学完

    for (let i = 0; i < 30; i++) {
      const today = addDays(DAY1, i)
      const group = getNextGroup(store.records(), today)
      const item = group.find((g) => g.char === target && g.isReview)
      if (item) {
        appearances.push(today)
        const state = store.report(target, true, today)
        if (state.mastered) masteredAt = today
      }
    }

    // INTERVALS=[1,1,1,3,8]：第 1 天学完 → 第 2 天(+1)、第 3 天(+1)、第 4 天(+1)、第 7 天(+3)，streak 满 5 毕业
    expect(appearances).toEqual([
      addDays(DAY1, 1),
      addDays(DAY1, 2),
      addDays(DAY1, 3),
      addDays(DAY1, 6),
    ])
    expect(masteredAt).toBe(addDays(DAY1, 6))
    const final = store.records().find((r) => r.char === target)!
    expect(final.mastered).toBe(true)
    expect(final.streak).toBe(5)
  })

  it('report known=false → streak 清零、nextDue=明天；当天重学后再 known=true → streak=1', () => {
    const store = makeStore()
    const char = L1_CHARS[0]
    store.report(char, true, DAY1) // streak=1
    store.report(char, true, addDays(DAY1, 1)) // streak=2

    const day4 = addDays(DAY1, 3)
    const failed = store.report(char, false, day4)
    expect(failed.streak).toBe(0)
    expect(failed.mastered).toBe(false)
    expect(failed.nextDue).toBe(addDays(day4, 1))
    expect(failed.lastDoneDate).toBe(day4)

    // 当天重学完成，再 report known=true：streak 0→1，nextDue=明天（预期行为）
    const relearned = store.report(char, true, day4)
    expect(relearned.streak).toBe(1)
    expect(relearned.nextDue).toBe(addDays(day4, 1))
  })

  it('lastDoneDate=今天的字当天再次出组时不出现', () => {
    const store = makeStore()
    const char = L1_CHARS[0]
    store.report(char, true, DAY1) // nextDue=第 2 天

    const day2 = addDays(DAY1, 1)
    const group = getNextGroup(store.records(), day2)
    expect(group.some((g) => g.char === char)).toBe(true)

    // 当天已学过后，再次出组不应出现
    store.report(char, true, day2)
    const again = getNextGroup(store.records(), day2)
    expect(again.some((g) => g.char === char)).toBe(false)
  })
})

describe('出组配额', () => {
  it('到期 0 个 → 5 新', () => {
    const group = getNextGroup([], DAY1)
    expect(group).toHaveLength(5)
    expect(group.every((g) => !g.isReview)).toBe(true)
  })

  it('到期 1 个 → 1 复习 + 4 新', () => {
    const records = [dueChar(L1_CHARS[0], DAY1)]
    const group = getNextGroup(records, DAY1)
    expect(group).toHaveLength(5)
    expect(group.filter((g) => g.isReview)).toHaveLength(1)
    expect(group.filter((g) => !g.isReview)).toHaveLength(4)
    expect(group[0]).toEqual({ char: L1_CHARS[0], isReview: true, streak: 1 })
  })

  it('到期 2 个 → 2 复习 + 3 新', () => {
    const records = [dueChar(L1_CHARS[0], DAY1), dueChar(L1_CHARS[1], DAY1)]
    const group = getNextGroup(records, DAY1)
    expect(group.filter((g) => g.isReview)).toHaveLength(2)
    expect(group.filter((g) => !g.isReview)).toHaveLength(3)
  })

  it('到期 10 个 → 3 复习 + 2 新，逾期最久优先', () => {
    const records = L1_CHARS.slice(0, 10).map((ch, i) =>
      dueChar(ch, addDays(DAY1, -i), 1) // 越靠前的逾期越久
    )
    const group = getNextGroup(records, DAY1)
    expect(group).toHaveLength(5)
    const reviews = group.filter((g) => g.isReview)
    expect(reviews).toHaveLength(3)
    expect(group.filter((g) => !g.isReview)).toHaveLength(2)
    // 逾期最久的 3 个优先（nextDue 升序）
    expect(reviews.map((g) => g.char)).toEqual([L1_CHARS[9], L1_CHARS[8], L1_CHARS[7]])
  })

  it('新字不够时，剩余位置用到期复习字补齐（最多凑 5）', () => {
    // 只剩 1 个新字，其余 299 字都有记录且毕业；另有 5 个到期复习字
    const mastered: CharState[] = L1_CHARS.slice(0, 294).map((ch) => ({
      char: ch,
      streak: 5,
      mastered: true,
      nextDue: '',
      lastDoneDate: '',
    }))
    const due = L1_CHARS.slice(294, 299).map((ch) => dueChar(ch, DAY1, 2))
    const group = getNextGroup([...mastered, ...due], DAY1)

    expect(group).toHaveLength(5)
    expect(group.filter((g) => !g.isReview)).toHaveLength(1) // 唯一的 L1_CHARS[299]
    expect(group.filter((g) => !g.isReview)[0].char).toBe(L1_CHARS[299])
    expect(group.filter((g) => g.isReview)).toHaveLength(4) // 3 配额 + 1 补齐
  })
})
