// components/char-card/char-card.js —— 听音选字 4 选 1 卡片组
//
// 用法：
//   <char-card options="{{['大','小','上','下']}}" answer="大"
//              bind:correct="onCorrect" bind:wrong="onWrong" />
// 外部流程：
//   1. 页面设置 options / answer 后调用 this.selectComponent('#cc').start()
//      播报题目「听一听，找一找：<answer>」，再读一遍 answer；
//      也可 start('自定义提示语')。
//   2. 用户点卡片 → 读该字 → 答对变墨绿放大 + triggerEvent('correct')；
//      答错变砖红描边抖动 + 播「没关系，再听一遍」并重读题目 + triggerEvent('wrong', {char})。
//   3. 下一题前调用 reset() 复位。
// 原则：答错永不显示 ×，只温柔提示再来一次。

var tts = require('../../services/tts.js');

Component({
  properties: {
    // 4 个候选字
    options: { type: Array, value: [] },
    // 正确答案（options 中的一个字）
    answer: { type: String, value: '' },
    // 外部置 true 时锁定点击（如已答对等待跳下一步）
    disabled: { type: Boolean, value: false }
  },

  data: {
    result: '',      // '' | 'correct'（当前局是否已答对）
    wrongChar: ''    // 最近一次答错的字（触发抖动动画用）
  },

  methods: {
    // 播报题目。promptText 可选，默认「听一听，找一找」；随后把答案读两遍
    start: function (promptText) {
      var answer = this.data.answer;
      this.setData({ result: '', wrongChar: '' });
      tts.speakSequence([promptText || '听一听，找一找', answer, answer]);
    },

    // 复位：清掉对错状态（不播报）
    reset: function () {
      this.setData({ result: '', wrongChar: '' });
    },

    onCardTap: function (e) {
      if (this.data.disabled || this.data.result === 'correct') return;
      var char = this.data.options[e.currentTarget.dataset.index];
      if (!char) return;

      if (char === this.data.answer) {
        this.setData({ result: 'correct', wrongChar: '' });
        tts.speak(char);
        this.triggerEvent('correct', { char: char });
      } else {
        var self = this;
        // 先读点错的字，再温柔提示并重读题目
        this.setData({ wrongChar: char });
        tts.speakSequence([char, '没关系，再听一遍', this.data.answer, this.data.answer], function () {
          // 动画结束后清掉 wrongChar，便于下次再错同一字时重新触发抖动
          self.setData({ wrongChar: '' });
        });
        this.triggerEvent('wrong', { char: char });
      }
    }
  }
});
