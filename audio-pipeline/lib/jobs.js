// lib/jobs.js —— 从字表构建待合成任务清单
// key 规则与 miniprograme/tools/README.md 第 1 节一致：
//   单字读音 <字>；组词 word_<字>_<i>；例句 sentence_<字>；讲解 explain_<字>
//   里程碑朗读：童谣 poem_<id>_<行号>；故事 story_<id>_<行号>
// 讲解文本与客户端 learn.js 的播报文案保持一致：「这个字念X，X。<explain>」

var PLACEHOLDER = '内容待补充';

// chars：miniprograme/data/chars.js 的字表数组
// opts.all = true 时纳入 explain 为占位的字（只合成单字读音，组词/例句跳过）
// opts.poems / opts.stories：里程碑内容（poems.js / stories.js），逐行合成
function buildJobs(chars, opts) {
  var jobs = [];
  (chars || []).forEach(function (c) {
    var full = c.explain && c.explain !== PLACEHOLDER;
    if (!full && !opts.all) return;

    jobs.push({ key: c.char, char: c.char, text: c.char });
    if (!full) return;

    (c.words || []).forEach(function (w, i) {
      if (w !== PLACEHOLDER) jobs.push({ key: 'word_' + c.char + '_' + i, char: c.char, text: w });
    });
    if (c.sentence && c.sentence !== PLACEHOLDER) {
      jobs.push({ key: 'sentence_' + c.char, char: c.char, text: c.sentence });
    }
    // 讲解：不识字的学员主要靠听，讲解必须可播
    jobs.push({ key: 'explain_' + c.char, char: c.char, text: '这个字念' + c.char + '，' + c.char + '。' + c.explain });
  });

  // 里程碑：童谣/故事逐行朗读音频（占位行跳过）
  [['poem', opts.poems], ['story', opts.stories]].forEach(function (pair) {
    (pair[1] || []).forEach(function (item) {
      (item.lines || []).forEach(function (line, i) {
        if (line && line.indexOf(PLACEHOLDER) === -1) {
          jobs.push({ key: pair[0] + '_' + item.id + '_' + i, text: line });
        }
      });
    });
  });
  return jobs;
}

module.exports = { buildJobs: buildJobs };
