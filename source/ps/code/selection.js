/* Animate selection feedback only: keep document pixels and editing history untouched.
 * One pixel every 90 ms; reuse the editor's frame loop and pause when hidden.
 * WebGL changes one uniform. The canvas fallback reuses the cached outline/background.
 */
(function () {
  'use strict';
  var ui = window.OnlinePS;
  ui.installSelection = function (native) {
    var View = native.SelectionView, gl = native.GL;
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var cached = null, background = null;
    var renderOverlays = View.prototype.aLO;
    View.prototype.aLO = function () {
      // Rebuild the outline only when the editor redraws after a real edit / view change.
      cached = null;
      return renderOverlays.apply(this, arguments);
    };

    ui.prepareSelection = function (view, pixels, bounds, layers) {
      var gpu = gl.rQ && native.editorMode() === 0;
      var colors = new Uint32Array(pixels.buffer, pixels.byteOffset, bounds.r * bounds.B);
      var phase = View.senkouSelectionPhase || 0, points = [];
      for (var i = 0; i < colors.length; i++) {
        if ((colors[i] >>> 24) === 0) continue;
        var stripe = (i % bounds.r + Math.floor(i / bounds.r)) & 7;
        if (gpu) {
          // Blue=1 is reserved for selection feedback; red stores a small, precise stripe index.
          // Other overlays reserve blue=0 for inversion and use blue>=2 for ordinary colors.
          colors[i] = (0xff010000 | stripe) >>> 0;
        } else {
          points.push(i);
          colors[i] = ((stripe + phase) & 4) ? 0xffffffff : 0xff000000;
        }
      }
      cached = { view: view, mask: view.Ge.h, width: bounds.r, height: bounds.B, gpu: gpu, phase: phase };
      if (!gpu) {
        if (!background) background = document.createElement('canvas');
        if (background.width !== bounds.r || background.height !== bounds.B) {
          background.width = bounds.r; background.height = bounds.B;
        }
        var context = background.getContext('2d');
        context.clearRect(0, 0, bounds.r, bounds.B);
        context.drawImage(layers.UZ.canvas, 0, 0);
        cached.background = background;
        cached.points = new Uint32Array(points);
        cached.image = new ImageData(new Uint8ClampedArray(pixels), bounds.r, bounds.B);
        cached.colors = new Uint32Array(cached.image.data.buffer);
      }
    };

    function paintCanvas(frame, phase) {
      var points = frame.points, width = frame.width;
      for (var i = 0; i < points.length; i++) {
        var pixel = points[i];
        frame.colors[pixel] = ((pixel % width + Math.floor(pixel / width) + phase) & 4) ? 0xffffffff : 0xff000000;
      }
      var layers = View.iM, context = layers.UZ;
      layers.ash.putImageData(frame.image, 0, 0);
      context.save(); context.resetTransform();
      context.clearRect(0, 0, frame.width, frame.height);
      context.drawImage(frame.background, 0, 0);
      context.drawImage(layers.aGH, 0, 0);
      context.restore();
    }

    var tick = native.App.prototype.Ay;
    native.App.prototype.Ay = function () {
      var result = tick.apply(this, arguments);
      if (document.hidden || !cached) return result;
      var doc = this.xK(), view = this.XS.tB[this.as5];
      if (!doc || !doc.h || !this.j.ye || !this.j.iI.XA ||
          cached.view !== view || cached.mask !== doc.h || native.editorMode() !== 0) return result;
      var phase = reducedMotion.matches ? 0 : Math.floor(performance.now() / 90) % 8;
      if (phase === cached.phase) return result;
      View.senkouSelectionPhase = phase;
      if (cached.gpu) view.a5e(true);
      else paintCanvas(cached, phase);
      cached.phase = phase;
      return result;
    };
  };
}());
