// components/tracer/tracer.js —— 描红组件（canvas 2d 新接口）
//
// 用法：
//   <tracer id="tracer" char="大" size="{{600}}" />
// 外部流程：
//   1. 组件 ready 后自动画浅棕半透明底字；
//   2. 调用 playStrokes() 播笔顺动画（每笔 0.6s，无笔顺数据则只显示静态底字）；
//   3. 调用 startTrace() 进入描红，用户手指轨迹实时画深棕粗线；
//      不做书写完成度判定，是否进入下一个字完全由外部「完成练字」按钮决定；
//   4. clear() 清空重来；hasTrace() 查询是否已有笔迹。
//
// 字形一致性：笔顺数据（hanzi-writer 格式）同时带 strokes（SVG 笔画轮廓）和
// medians（笔画中线）。有轮廓数据时，底字按轮廓填充、笔顺演示用「轮廓裁剪 + 中线揭示」，
// 三者（底字/演示/描红轨迹）字形完全一致；无轮廓数据才退化为 KaiTi fillText 底字。
//
// 坐标说明：笔顺数据是 hanzi-writer 的 1024×1024 坐标系（y 轴朝上、基准偏移 900），
// 统一换算成 canvas 像素坐标后再使用：x' = x/1024*sizePx，y' = (900-y)/1024*sizePx。

var course = require('../../services/course.js');

var STROKE_MS = 600;      // 每笔动画时长
var TICK_MS = 16;         // 动画帧间隔
var TRACE_LINE_W = 26;    // 描红轨迹线宽（px）——加粗至26px，提升触控与视觉质感
var INK_COLOR = '#4A3428';// 深棕：已完成笔画与描红轨迹
var BASE_COLOR = 'rgba(122, 92, 66, 0.28)'; // 浅棕半透明底字


Component({
  properties: {
    char: { type: String, value: '' },
    // 画布边长，单位 rpx（默认 600rpx 见方）
    size: { type: Number, value: 600 }
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
    // 笔顺数据走 course 服务（CDN + 本地缓存），异步到达；到达前先画降级底字
    _setup: function () {
      this._cancelAnim();
      this._tracing = false;
      this._trace = [];
      this._applyStrokeData(null);
      var self = this;
      var ch = this.data.char;
      this._dataReady = ch
        ? course.getStroke(ch).then(function (data) {
            if (self.data.char !== ch) return; // 期间字已切换，丢弃过期数据
            self._applyStrokeData(data);
          })
        : Promise.resolve();
    },

    _applyStrokeData: function (data) {
      this._strokeData = data;
      this._mediansPx = this._toCanvasMedians(data && data.medians);
      this._outlines = (data && data.strokes || []).map(parsePath);
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

    // 把解析后的笔画轮廓段回放到 ctx 路径（含坐标换算），供 fill / clip 使用
    _buildPath: function (segs) {
      var ctx = this._ctx;
      var sizePx = this._sizePx;
      function X(x) { return x / 1024 * sizePx; }
      function Y(y) { return (900 - y) / 1024 * sizePx; }
      ctx.beginPath();
      segs.forEach(function (s) {
        if (s.t === 'M') ctx.moveTo(X(s.x), Y(s.y));
        else if (s.t === 'L') ctx.lineTo(X(s.x), Y(s.y));
        else if (s.t === 'Q') ctx.quadraticCurveTo(X(s.cx), Y(s.cy), X(s.x), Y(s.y));
        else if (s.t === 'C') ctx.bezierCurveTo(X(s.c1x), Y(s.c1y), X(s.c2x), Y(s.c2y), X(s.x), Y(s.y));
        else if (s.t === 'Z') ctx.closePath();
      });
    },

    // ---------- 绘制 ----------

    // 底字：有笔画轮廓数据时按轮廓填充（与笔顺演示字形一致）；
    // 无数据时退化为 KaiTi fillText；fillText 不可用时静默兜底（只留米字格）
    _drawBase: function () {
      var ctx = this._ctx;
      if (!ctx) return;
      var sizePx = this._sizePx;
      ctx.clearRect(0, 0, sizePx, sizePx);
      if (!this.data.char) return;
      try {
        ctx.fillStyle = BASE_COLOR;
        if (this._outlines && this._outlines.length) {
          for (var i = 0; i < this._outlines.length; i++) {
            this._buildPath(this._outlines[i]);
            ctx.fill();
          }
        } else {
          ctx.font = 'bold ' + Math.round(sizePx * 0.78) + 'px KaiTi,STKaiti,serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(this.data.char, sizePx / 2, sizePx / 2 + sizePx * 0.04);
        }

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
        console.warn('[tracer] 底字绘制失败，降级为空白米字格', e);
      }
    },

    // 实心填充第 i 笔轮廓（演示中已完成的笔画）
    _fillStroke: function (i, color) {
      var ctx = this._ctx;
      if (!ctx || !this._outlines[i]) return;
      this._buildPath(this._outlines[i]);
      ctx.fillStyle = color || INK_COLOR;
      ctx.fill();
    },

    // 画一条（部分）折线，深棕粗圆头线
    _strokePath: function (pts, width) {
      if (!this._ctx || !pts || pts.length < 2) return;
      var ctx = this._ctx;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.strokeStyle = INK_COLOR; // 深棕
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    },

    // ---------- 笔顺动画 ----------

    // 按 medians 逐笔动画描画（每笔 0.6s，全部播完算一遍）；无数据则只显示静态底字。
    // 有轮廓数据时：已完成笔画实心填充，当前笔用「轮廓裁剪 + 中线揭示」——
    // 揭示出的就是真实字形，与底字/描红轨迹完全一致（hanzi-writer 同款做法）。
    // 笔顺数据可能还在下载中，等 _dataReady 再开播；canvas 未就绪时短暂重试
    playStrokes: function (onDone) {
      var self = this;
      (this._dataReady || Promise.resolve()).then(function () {
        if (self._canvasReady) { self._playStrokesNow(onDone); return; }
        var tries = 0;
        var t = setInterval(function () {
          if (self._canvasReady || ++tries > 30) {
            clearInterval(t);
            if (self._canvasReady) self._playStrokesNow(onDone);
            else if (onDone) onDone();
          }
        }, 100);
      });
    },

    _playStrokesNow: function (onDone) {
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
      // 揭示线宽要足够盖住轮廓（被裁掉的部分不可见，宁宽勿窄）；无轮廓时退化为中线动画
      var revealW = Math.max(24, Math.round(this._sizePx * 0.18));
      var strokeW = Math.max(12, Math.round(this._sizePx * 0.055));
      var idx = 0; // 当前描到第几笔

      function drawFrame(pts) {
        self._drawBase();
        for (var s = 0; s < idx; s++) self._fillStroke(s);
        if (self._outlines[idx]) {
          var ctx = self._ctx;
          ctx.save();
          self._buildPath(self._outlines[idx]);
          ctx.clip();
          self._strokePath(pts, revealW);
          ctx.restore();
        } else {
          self._strokePath(pts, strokeW);
        }
      }

      function playOne() {
        if (idx >= medians.length) {
          // 收尾：所有笔画实心填充，避免最后一笔端点留缺口
          self._drawBase();
          for (var s = 0; s < medians.length; s++) self._fillStroke(s);
          if (onDone) onDone();
          return;
        }
        var pts = medians[idx];
        var total = polylineLength(pts);
        var elapsed = 0;
        self._animTimer = setInterval(function () {
          elapsed += TICK_MS;
          var frac = Math.min(1, elapsed / STROKE_MS);
          drawFrame(partialPolyline(pts, total * frac));
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
      if (!this._tracing) return;
      var p = this._touchPoint(e);
      if (!p) return;
      this._trace.push(p);
      this._last = p;
    },

    onTouchMove: function (e) {
      if (!this._tracing || !this._last) return;
      var p = this._touchPoint(e);
      if (!p) return;
      this._trace.push(p);
      this._strokePath([this._last, p], TRACE_LINE_W);
      this._last = p;
    },

    onTouchEnd: function () {
      if (!this._tracing) return;
      this._last = null;
    },

    // canvas 2d 的 touch 事件里 touches[0].x/y 即相对画布左上角的像素坐标
    _touchPoint: function (e) {
      var t = e.touches && e.touches[0];
      if (!t) return null;
      return [t.x, t.y];
    }
  }
});

// hanzi-writer 笔画轮廓是 SVG path 字符串（M/L/Q/C/Z 绝对指令），解析成段数组，
// 由 _buildPath 用 canvas 原生曲线指令回放，保证底字与笔顺演示字形一致
function parsePath(d) {
  var segs = [];
  var tokens = String(d).match(/[MLQCZmlqcz]|-?\d+(\.\d+)?/g) || [];
  var i = 0, cmd = '';
  function num() { return parseFloat(tokens[i++]); }
  while (i < tokens.length) {
    if (/[MLQCZmlqcz]/.test(tokens[i])) { cmd = tokens[i++]; }
    // 数据实际只含绝对指令；相对指令按绝对处理（hanzi-writer 数据不出现）
    if (cmd === 'M' || cmd === 'm') { segs.push({ t: 'M', x: num(), y: num() }); cmd = 'L'; }
    else if (cmd === 'L' || cmd === 'l') { segs.push({ t: 'L', x: num(), y: num() }); }
    else if (cmd === 'Q' || cmd === 'q') { segs.push({ t: 'Q', cx: num(), cy: num(), x: num(), y: num() }); }
    else if (cmd === 'C' || cmd === 'c') { segs.push({ t: 'C', c1x: num(), c1y: num(), c2x: num(), c2y: num(), x: num(), y: num() }); }
    else if (cmd === 'Z' || cmd === 'z') { segs.push({ t: 'Z' }); cmd = ''; }
    else { i++; } // 容错：跳过无法解析的 token
  }
  return segs;
}

// 两点距离的平方
function dist2(x0, y0, x1, y1) {
  var dx = x1 - x0, dy = y1 - y0;
  return dx * dx + dy * dy;
}

// 折线总长度
function polylineLength(pts) {
  var len = 0;
  for (var i = 1; i < pts.length; i++) {
    len += Math.sqrt(dist2(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
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
    var seg = Math.sqrt(dist2(a[0], a[1], b[0], b[1]));
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
