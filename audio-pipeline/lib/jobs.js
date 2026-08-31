// lib/jobs.js —— 从字表构建待合成任务清单
// key 规则与 miniprograme/tools/README.md 第 1 节一致：
//   单字读音 <字>（读两遍）；讲解 explain_<字>；组词 word_<字>_<i>；例句 sentence_<字>

var PLACEHOLDER = '内容待补充';

// chars：miniprograme/data/chars.js 的字表数组
// opts.all = true 时纳入 explain 为占位的字（只合成单字读音，讲解/组词/例句跳过）
function buildJobs(chars, opts) {
  var jobs = [];
  (chars || []).forEach(function (c) {
    var full = c.explain && c.explain !== PLACEHOLDER;
    if (!full && !opts.all) return;

    jobs.push({ key: c.char, char: c.char, text: c.char + '，' + c.char });
    if (!full) return;

    jobs.push({ key: 'explain_' + c.char, char: c.char, text: c.explain + '。记字诀：' + c.mnemonic });
    (c.words || []).forEach(function (w, i) {
      if (w !== PLACEHOLDER) jobs.push({ key: 'word_' + c.char + '_' + i, char: c.char, text: w });
    });
    if (c.sentence && c.sentence !== PLACEHOLDER) {
      jobs.push({ key: 'sentence_' + c.char, char: c.char, text: c.sentence });
    }
  });
  return jobs;
}

module.exports = { buildJobs: buildJobs };
