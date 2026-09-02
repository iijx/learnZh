// components/tracer/tracer.js —— 描红组件（canvas 2d 新接口）
//
// 用法：
//   <tracer id="tracer" char="大" size="{{600}}" exam="{{writeExam}}" bind:pass="onPass" />
// 外部流程：
//   1. 组件 ready 后自动画浅棕半透明底字；
//   2. 调用 playStrokes() 播笔顺动画（每笔 0.6s，无笔顺数据则只显示静态底字）；
//   3. 调用 startTrace() 进入描红，用户手指轨迹实时画深棕粗线，
//      与笔顺中线做粗略覆盖度判定（judge.js，≥60% 即过；exam=false 时画满 40 点即过），
//      通过后 triggerEvent('pass')；
//   4. clear() 清空重来；hasTrace() 查询是否已有笔迹。
//
// 坐标说明：笔顺数据是 hanzi-writer 的 1024×1024 坐标系（y 轴朝上、基准偏移 900），
// 统一换算成 canvas 像素坐标后再使用：x' = x/1024*sizePx，y' = (900-y)/1024*sizePx。

var strokesIndex = require('../../data/strokes/index.js');
var judge = require('./judge.js');

var STROKE_MS = 600;      // 每笔动画时长
var TICK_MS = 16;         // 动画帧间隔
var TRACE_LINE_W = 26;    // 描红轨迹线宽（px）——加粗至26px，提升触控与视觉质感
var JUDGE_RADIUS = 45;    // 覆盖判定半径（px）——放宽至45px，适应老年人生理手抖
var JUDGE_THRESHOLD = 0.5;// 覆盖率阈值——宽松至50%即过
var MIN_TRACE_POINTS = 25;// 最少轨迹点数——降至25点，防慢速书写被卡


Component({
  properties: {
    char: { type: String, value: '' },
    // 画布边长，单位 rpx（默认 600rpx 见方）
    size: { type: Number, value: 600 },
    // 书写考核开关（外部从设置读 storage.getSettings().writeExam 传入）
    exam: { type: Boolean, value: true }
  },

  observers: {
    'char': function () {
      if (this._canvasReady) this._setup();
    }
  },

  lifetimes: {
    ready: function () {
      this._initCanvas();
    },
    detached: function () {
      this._cancelAnim();
    }
  },

  methods: {
    // ---------- 初始化 ----------

    _initCanvas: function () {
      var self = this;
      var sys = wx.getSystemInfoSync();
      this._dpr = sys.pixelRatio || 1;
      this._sizePx = this.data.size * sys.windowWidth / 750;

      this.createSelectorQuery()
        .in(this)
        .select('#traceCanvas')
        .fields({ node: true, size: true })
        .exec(function (res) {
          if (!res || !res[0] || !res[0].node) return;
          var canvas = res[0].node;
          canvas.width = self._sizePx * self._dpr;
          canvas.height = self._sizePx * self._dpr;
          var ctx = canvas.getContext('2d');
          ctx.scale(self._dpr, self._dpr);
          self._canvas = canvas;
          self._ctx = ctx;
          self._canvasReady = true;
          self._setup();
        });
    },

    // 加载当前字的笔顺数据并画底字（char 变化时也走这里）
    _setup: function () {
      this._cancelAnim();
      this._tracing = false;
      this._trace = [];
      this._strokeData = strokesIndex.getChar(this.data.char);
      this._mediansPx = this._toCanvasMedians(this._strokeData && this._strokeData.medians);
      this._drawBase();
    },

    // hanzi-writer 1024 坐标系 → canvas 像素坐标
    _toCanvasMedians: function (medians) {
      if (!medians) return null;
      var sizePx = this._sizePx;
      return medians.map(function (pts) {
        return pts.map(function (p) {
          return [p[0] / 1024 * sizePx, (900 - p[1]) / 1024 * sizePx];
        });
      });
    },

    // ---------- 绘制 ----------

    // 底字：浅棕半透明大字垫底；无系统字体 / fillText 不可用时静默兜底（只留米字格）
    _drawBase: function () {
      var ctx = this._ctx;
      if (!ctx) return;
      var sizePx = this._sizePx;
      ctx.clearRect(0, 0, sizePx, sizePx);
      if (!this.data.char) return;
      try {
        ctx.fillStyle = 'rgba(122, 92, 66, 0.28)'; // 浅棕半透明
        ctx.font = 'bold ' + Math.round(sizePx * 0.78) + 'px KaiTi,STKaiti,serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.data.char, sizePx / 2, sizePx / 2 + sizePx * 0.04);

        // 描红起笔引导：若在描红阶段且尚未下笔，在第一笔起点绘制金色圆点引导
        if (this._tracing && this._mediansPx && this._mediansPx.length && this._trace.length === 0) {
          var startPt = this._mediansPx[0][0];
          if (startPt) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(startPt[0], startPt[1], 10, 0, Math.PI * 2);
            ctx.fillStyle = '#D48806';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(startPt[0], startPt[1], 16, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(212, 136, 6, 0.6)';
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.restore();
          }
        }
      } catch (e) {
        console.warn('[tracer] 底字 fillText 失败，降级为空白米字格', e);
      }
    },

    // 画一条（部分）折线，深棕粗圆头线
    _strokePath: function (pts, width) {
      if (!pts || pts.length < 2) return;
      var ctx = this._ctx;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.strokeStyle = '#4A3428'; // 深棕
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    },

    // ---------- 笔顺动画 ----------

    // 按 medians 逐笔动画描画（每笔 0.6s，全部播完算一遍）；无数据则只显示静态底字
    playStrokes: function (onDone) {
      this._cancelAnim();
      this._tracing = false;
      this._trace = [];
      this._drawBase();

      var medians = this._mediansPx;
      if (!medians || !medians.length || !this._ctx) {
        if (onDone) onDone();
        return;
      }

      var self = this;
      var strokeW = Math.max(12, Math.round(this._sizePx * 0.055));
      var idx = 0; // 当前描到第几笔

      function playOne() {
        if (idx >= medians.length) {
          if (onDone) onDone();
          return;
        }
        var pts = medians[idx];
        var total = polylineLength(pts);
        var elapsed = 0;
        self._animTimer = setInterval(function () {
          elapsed += TICK_MS;
          var frac = Math.min(1, elapsed / STROKE_MS);
          // 重画：底字 + 已完成笔画 + 当前笔的已走部分
          self._drawBase();
          for (var s = 0; s < idx; s++) self._strokePath(medians[s], strokeW);
          self._strokePath(partialPolyline(pts, total * frac), strokeW);
          if (frac >= 1) {
            clearInterval(self._animTimer);
            self._animTimer = null;
            idx++;
            playOne();
          }
        }, TICK_MS);
      }
      playOne();
    },

    _cancelAnim: function () {
      if (this._animTimer) {
        clearInterval(this._animTimer);
        this._animTimer = null;
      }
    },

    // ---------- 描红 ----------

    // 进入描红模式：清掉动画痕迹，保留底字，开始采集手指轨迹
    startTrace: function () {
      this._cancelAnim();
      this._trace = [];
      this._tracing = true;
      this._passed = false;
      this._drawBase();
    },

    clear: function () {
      this._trace = [];
      this._drawBase();
    },

    // 是否已有描画笔迹（供外层弹层退出前确认用）
    hasTrace: function () {
      return !!(this._trace && this._trace.length);
    },

    onTouchStart: function (e) {
      if (!this._tracing || this._passed) return;
      var p = this._touchPoint(e);
      if (!p) return;
      this._trace.push(p);
      this._last = p;
    },

    onTouchMove: function (e) {
      if (!this._tracing || this._passed || !this._last) return;
      var p = this._touchPoint(e);
      if (!p) return;
      this._trace.push(p);
      this._strokePath([this._last, p], TRACE_LINE_W);
      this._last = p;
      // 每攒 5 个点判一次，避免每个 touchmove 都全量算
      if (this._trace.length % 5 === 0) this._checkPass();
    },

    onTouchEnd: function () {
      if (!this._tracing || this._passed) return;
      this._last = null;
      this._checkPass();
    },

    // canvas 2d 的 touch 事件里 touches[0].x/y 即相对画布左上角的像素坐标
    _touchPoint: function (e) {
      var t = e.touches && e.touches[0];
      if (!t) return null;
      return [t.x, t.y];
    },

    _checkPass: function () {
      if (this._passed) return;
      var pass = judge.judge({
        medians: this._mediansPx,
        trace: this._trace,
        exam: this.data.exam,
        radius: JUDGE_RADIUS,
        threshold: JUDGE_THRESHOLD,
        minPoints: MIN_TRACE_POINTS
      });
      if (!pass) return;
      this._passed = true;
      this._tracing = false;
      this.triggerEvent('pass', { char: this.data.char });
    }
  }
});

// 折线总长度
function polylineLength(pts) {
  var len = 0;
  for (var i = 1; i < pts.length; i++) {
    len += Math.sqrt(judge.dist2(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  }
  return len;
}

// 取折线上从起点走 targetLen 长度的部分（端点按段内插值）
function partialPolyline(pts, targetLen) {
  if (pts.length < 2) return pts.slice();
  var out = [pts[0]];
  var walked = 0;
  for (var i = 1; i < pts.length; i++) {
    var a = pts[i - 1];
    var b = pts[i];
    var seg = Math.sqrt(judge.dist2(a[0], a[1], b[0], b[1]));
    if (walked + seg >= targetLen) {
      var f = seg === 0 ? 0 : (targetLen - walked) / seg;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      return out;
    }
    out.push(b);
    walked += seg;
  }
  return out;
}
