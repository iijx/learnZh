// lib/validate.js —— 单字文案的机器校验（syllabus.md §6 规则 4 的文案部分）
// errors 阻断 apply；warnings 只提醒，由人工审校定夺。

function hanziCount(s) {
  var m = String(s || '').match(/[一-鿿]/g);
  return m ? m.length : 0;
}

function validate(char, d) {
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
  }

  return { errors: errors, warnings: warnings };
}

module.exports = { validate: validate, hanziCount: hanziCount };
