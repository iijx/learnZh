// services/review.js —— 遗忘曲线复习排期
// 规则（PRD 3.6）：每个字学完后的第 1 / 2 / 4 / 7 / 15 天进入复习队列；
// 复习答错的字 24 小时后再次出现。
// 全部数据基于 services/storage.js 的已学字表。
//
// 【未来替换为服务端 REST API】
// 排期在服务端计算、换设备不丢：
//   getTodayReview   -> GET /api/review/today
//   markReviewResult -> POST /api/review/result
//   rescheduleWrong  -> POST /api/review/reschedule

var storage = require('./storage.js');

// 复习间隔（天）：第 1/2/4/7/15 天
var REVIEW_DAYS = [1, 2, 4, 7, 15];

// 每日复习上限熔断阈值（防止后期复习量爆炸导致老人认知过载）
var MAX_DAILY_REVIEW = 6;

// 答错重排间隔：24 小时（毫秒）
var WRONG_RETRY_MS = 24 * 60 * 60 * 1000;

// 日期串转当天 0 点时间戳
function dayStart(dateStr) {
  if (!dateStr) return 0;
  var parts = dateStr.split('-');
  return new Date(+parts[0], +parts[1] - 1, +parts[2]).getTime();
}

// 算某个字的下次到期时间（时间戳）；已排完 5 轮的返回 null（不再复习）
function nextDueAt(info) {
  // 答错优先：24 小时后重排
  if (info.wrongAt) return info.wrongAt + WRONG_RETRY_MS;
  var stage = info.reviewStage || 0;
  if (stage >= REVIEW_DAYS.length) return null;
  return dayStart(info.learnDate) + REVIEW_DAYS[stage] * 86400000;
}

var review = {
  REVIEW_DAYS: REVIEW_DAYS,
  MAX_DAILY_REVIEW: MAX_DAILY_REVIEW,

  // 今日到期复习字列表（含 24 小时前答错重排回来的字）
  // 机制：
  // 1. 若断学 > 3 天，启动温和回归模式（最多挑选 3 个熟字温热信心，不惩罚不堆积）；
  // 2. 正常排期时按优先级（错字优先 -> 早期生字优先）排序；
  // 3. 严格限制每日上限不超过 MAX_DAILY_REVIEW (6字)，超额字自然顺延。
  getTodayReview: function () {
    var now = Date.now();
    var map = storage.getLearnedMap();
    var daysSince = storage.getDaysSinceLastStudy();

    var dueItems = [];
    for (var ch in map) {
      var info = map[ch];
      var t = nextDueAt(info);
      if (t !== null && t <= now) {
        dueItems.push({
          char: ch,
          isWrong: !!info.wrongAt,
          stage: info.reviewStage || 0,
          learnDate: info.learnDate || ''
        });
      }
    }

    // 断学回归温和模式（>3天断学）
    if (daysSince > 3 && dueItems.length > 0) {
      // 挑选至多 3 个已较为稳固的字或待复习字
      return dueItems.slice(0, 3).map(function (item) { return item.char; });
    }

    // 优先级排序：错字最优先 -> 阶段较小的新近字优先
    dueItems.sort(function (a, b) {
      if (a.isWrong && !b.isWrong) return -1;
      if (!a.isWrong && b.isWrong) return 1;
      return a.stage - b.stage;
    });

    // 每日上限熔断
    var capped = dueItems.slice(0, MAX_DAILY_REVIEW);
    return capped.map(function (item) { return item.char; });
  },

  // 记录一次复习结果：答对推进到下一档；答错进错字本并 24 小时后重排
  markReviewResult: function (ch, correct) {
    if (correct) {
      var map = storage.getLearnedMap();
      var info = map[ch];
      if (!info) return;
      storage.updateLearnedChar(ch, {
        reviewStage: (info.reviewStage || 0) + 1,
        wrongAt: 0
      });
      storage.removeWrongChar(ch);
    } else {
      this.rescheduleWrong(ch);
    }
  },

  // 答错重排：记入错字本，24 小时后再次进入复习队列
  rescheduleWrong: function (ch) {
    storage.addWrongChar(ch);
    storage.updateLearnedChar(ch, { wrongAt: Date.now() });
  }
};

module.exports = review;
