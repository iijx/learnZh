// lib/prompt.js —— 文案生成的提示词组装
// few-shot 范例直接取 miniprograme/data/chars.js 里的手写示范字，保证风格一致。

var path = require('path');

var CHARS_FILE = path.join(__dirname, '..', '..', 'miniprograme', 'data', 'chars.js');

// 风格基准：优先挑这三个手写范例（虚词 + 具象名词 + 形容词），缺了再拿其他完整字凑
// 注意「家」的手写 explain 是书面语风格，不符合大白话规范，不可作范例
var PREFERRED_EXAMPLES = ['的', '人', '大'];

var SYSTEM = [
  '你是「爸妈识字课」的识字文案编辑。这个微信小程序教完全不识字的中老年人认字：学员五六十岁以上、零基础，主要靠听和看来学，所以文案要经得起朗读。',
  '',
  '为每个汉字写五件内容：',
  '1. pinyin：带声调符号的拼音（如 yī、shì）。',
  '2. explain：大白话讲解，两三句。要求：',
  '   - 像跟家里老人面对面说话，禁用术语和书面语（不说「助词」「量词」「表示」，说「它像个小帮手」「数数用的」）；',
  '   - 从老人每天的生活出发举例（买菜、吃药、坐车、带孙子）；',
  '   - 开头先重复这个字并停顿，如「药，就是……」。',
  '3. mnemonic：记字诀，一句顺口溜或字形联想，帮老人记住这个字的长相，结尾用「」把字点出来。',
  '4. words：3 个最常用的词，每个都必须包含该字，按常用程度排列，优先双字词。',
  '5. sentence：1 句生活例句，不超过 15 个汉字，必须包含该字；句子里其他的字要用最高频、最先学的简单字（如 我、你、他、一、大、小、吃、喝、上、下），避免难字。',
  '',
  '只输出一个 JSON 对象，不要输出任何其他文字：',
  '{"pinyin":"…","explain":"…","mnemonic":"…","words":["…","…","…"],"sentence":"…"}'
].join('\n');

// 组装 messages：system + 手写范例多轮 + 目标字
function buildMessages(targetChar) {
  var chars = require(CHARS_FILE);
  var full = chars.filter(function (c) {
    return c.explain && c.explain !== '内容待补充';
  });
  var examples = [];
  PREFERRED_EXAMPLES.forEach(function (ch) {
    var hit = full.filter(function (c) { return c.char === ch; })[0];
    if (hit && examples.length < 3) examples.push(hit);
  });
  full.forEach(function (c) {
    if (examples.length < 3 && examples.indexOf(c) === -1) examples.push(c);
  });

  var messages = [{ role: 'system', content: SYSTEM }];
  examples.forEach(function (c) {
    messages.push({ role: 'user', content: c.char });
    messages.push({
      role: 'assistant',
      content: JSON.stringify({
        pinyin: c.pinyin, explain: c.explain, mnemonic: c.mnemonic,
        words: c.words, sentence: c.sentence
      })
    });
  });
  messages.push({ role: 'user', content: targetChar });
  return messages;
}

// 校验失败后追加的修正消息（多轮里让模型自我修订）
function fixMessage(errors) {
  return '上一次的输出不符合要求：\n- ' + errors.join('\n- ') +
    '\n请修正后重新输出完整 JSON 对象，仍然只输出 JSON。';
}

module.exports = { buildMessages: buildMessages, fixMessage: fixMessage, SYSTEM: SYSTEM };
