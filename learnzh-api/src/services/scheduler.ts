import { L1_CHARS } from '../data/syllabus-l1'

// 复习间隔（天）：streak=1 → +1 天（第 2 天），streak=2 → +1 天（第 3 天），
// streak=3 → +1 天（第 4 天），streak=4 → +3 天（第 7 天），streak=5 → 毕业
export const INTERVALS = [1, 1, 1, 3, 8]

// streak 满 5 永久毕业
export const MASTER_STREAK = 5

// 每组 5 个：3 复习 + 2 新
export const GROUP_SIZE = 5
export const GROUP_REVIEW_QUOTA = 3

export interface CharState {
  char: string
  streak: number
  mastered: boolean
  nextDue: string
  lastDoneDate: string
}

export interface GroupItem {
  char: string
  isReview: boolean
  streak: number
}

/** 东八区今天日期串 'YYYY-MM-DD' */
export const todayCN = (): string => {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** 日期串加 N 天，返回 'YYYY-MM-DD' */
export const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * report 状态流转（纯函数，today 为 'YYYY-MM-DD'）。
 * prev 为 null 表示新字首次 report。
 */
export const applyReport = (prev: CharState | null, char: string, known: boolean, today: string): CharState => {
  const streak = prev ? prev.streak : 0
  if (!known) {
    // 不认识：清零，明天再来；当天客户端会带老人重学，重学后会再 report(true)
    return {
      char,
      streak: 0,
      mastered: false,
      nextDue: addDays(today, 1),
      lastDoneDate: today,
    }
  }
  const newStreak = streak + 1
  if (newStreak >= MASTER_STREAK) {
    return {
      char,
      streak: newStreak,
      mastered: true,
      nextDue: '',
      lastDoneDate: today,
    }
  }
  return {
    char,
    streak: newStreak,
    mastered: false,
    nextDue: addDays(today, INTERVALS[newStreak - 1]),
    lastDoneDate: today,
  }
}

/**
 * 出组：5 个一组，3 复习 + 2 新（纯函数，today 为 'YYYY-MM-DD'）。
 * - 到期复习字：nextDue <= today 且 lastDoneDate != today 且未毕业，按 nextDue 升序（逾期最久优先）
 * - 新字：按 L1 字序跳过所有已有记录的字
 * - 配额：到期 0 个 → 5 新；1~2 个 → 复习全取 + 新字补齐；≥3 个 → 3 复习 + 2 新；
 *   新字不够时剩余位置用到期复习字补（最多凑 5）
 */
export const getNextGroup = (records: CharState[], today: string): GroupItem[] => {
  const syllabusIndex = new Map<string, number>(L1_CHARS.map((ch, i) => [ch, i]))

  const due = records
    .filter((r) => !r.mastered && r.nextDue !== '' && r.nextDue <= today && r.lastDoneDate !== today)
    .sort((a, b) => {
      if (a.nextDue !== b.nextDue) return a.nextDue < b.nextDue ? -1 : 1
      return (syllabusIndex.get(a.char) ?? 0) - (syllabusIndex.get(b.char) ?? 0)
    })

  const seen = new Set(records.map((r) => r.char))
  const fresh = L1_CHARS.filter((ch) => !seen.has(ch))

  const group: GroupItem[] = []

  const reviewTake = due.slice(0, GROUP_REVIEW_QUOTA)
  for (const r of reviewTake) {
    group.push({ char: r.char, isReview: true, streak: r.streak })
  }

  const newTake = fresh.slice(0, GROUP_SIZE - group.length)
  for (const ch of newTake) {
    group.push({ char: ch, isReview: false, streak: 0 })
  }

  // 新字不够时，用剩余的到期复习字补齐
  if (group.length < GROUP_SIZE) {
    for (const r of due.slice(GROUP_REVIEW_QUOTA)) {
      if (group.length >= GROUP_SIZE) break
      group.push({ char: r.char, isReview: true, streak: r.streak })
    }
  }

  return group
}

/** 进度统计 */
export const calcProgress = (records: CharState[], today: string) => {
  const masteredCount = records.filter((r) => r.mastered).length
  const learningCount = records.filter((r) => !r.mastered).length
  const totalLearned = records.length
  const todayGroupRemainder = getNextGroup(records, today).length
  return { masteredCount, learningCount, totalLearned, todayGroupRemainder }
}
