// lib/validate.js —— 单字文案的机器校验（syllabus.md §6 规则 4 的文案部分）
// errors 阻断 apply；warnings 只提醒，由人工审校定夺。
//
// ctx（可选）= { position, posOf }：position 为该字在学习顺序中的位置（1 起），
// posOf 为 字→位置 映射。提供后启用「例句已学字」提醒——只作 warning 不作 error：
// 例句主要靠 TTS 朗读消费，且前 50 字几乎没有已学字可组句，故位置 ≤50 跳过检查。

var EARLY_EXEMPT = 50;  // 学习位置 ≤ 此值的字不检查例句生字
var MAX_LATER = 2;      // 例句中"更晚才学的字"超过此数才提醒

function hanziOf(s) {
  return String(s || '').match(/[一-鿿]/g) || [];
}

function hanziCount(s) {
  return hanziOf(s).length;
}

function validate(char, d, ctx) {
  var errors = [];
  var warnings = [];
  d = d || {};

  if (!d.pinyin || !String(d.pinyin).trim()) {
    errors.push('pinyin 为空');
  } else if (!/^[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+$/i.test(String(d.pinyin).trim())) {
    errors.push('pinyin 含非法字符：「' + d.pinyin + '」');
  }

  var explain = String(d.explain || '').trim();
  if (!explain || explain === '内容待补充') {
    errors.push('explain 为空');
  } else {
    if (explain.indexOf(char) === -1) errors.push('explain 没有包含该字');
    if (hanziCount(explain) < 10) errors.push('explain 太短（不足 10 字），讲解不到位');
    if (hanziCount(explain) > 160) warnings.push('explain 超过 160 字，老人听着累，建议精简');
    if (/[a-zA-Z]/.test(explain)) warnings.push('explain 含英文字母');
  }

  var mnemonic = String(d.mnemonic || '').trim();
  if (!mnemonic || mnemonic === '内容待补充') {
    errors.push('mnemonic 为空');
  } else if (mnemonic.indexOf(char) === -1) {
    warnings.push('mnemonic 没有点出该字，记字诀结尾建议用「」带出字形');
  }

  var words = d.words;
  if (!Array.isArray(words) || words.length < 2 || words.length > 3) {
    errors.push('words 必须是 2-3 个词');
  } else {
    words.forEach(function (w) {
      w = String(w || '').trim();
      if (!w || w === '内容待补充') errors.push('words 存在空词');
      else {
        if (w.indexOf(char) === -1) errors.push('组词「' + w + '」不包含该字');
        if (hanziCount(w) > 4) warnings.push('组词「' + w + '」超过 4 字，偏书面');
      }
    });
  }

  var sentence = String(d.sentence || '').trim();
  if (!sentence || sentence === '内容待补充') {
    errors.push('sentence 为空');
  } else {
    if (sentence.indexOf(char) === -1) errors.push('sentence 没有包含该字');
    var n = hanziCount(sentence);
    if (n > 15) errors.push('sentence 超过 15 个汉字（' + n + ' 字），超出大纲上限');
    if (n < 4) warnings.push('sentence 不足 4 字，语境太少');

    if (ctx && ctx.position > EARLY_EXEMPT) {
      var later = [];
      hanziOf(sentence).forEach(function (ch) {
        if (ch !== char && (!ctx.posOf[ch] || ctx.posOf[ch] > ctx.position) && later.indexOf(ch) === -1) {
          later.push(ch);
        }
      });
      if (later.length > MAX_LATER) {
        warnings.push('sentence 含 ' + later.length + ' 个更晚才学的字（' + later.join('') +
          '），建议换用更简单的字重写例句');
      }
    }
  }

  return { errors: errors, warnings: warnings };
}

module.exports = { validate: validate, hanziCount: hanziCount };
