(function () {
  "use strict";
  if (window.__gestureDevToolsActive) return;
  window.__gestureDevToolsActive = true;

  var MEDIAPIPE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  var MODES = ["inspect", "draw", "measure"];
  var MODE_META = {
    inspect: { label: "Inspect", color: "#6366f1", desc: "Point to highlight, pinch to select" },
    draw: { label: "Draw", color: "#f59e0b", desc: "Pinch to draw, open hand to stop" },
    measure: { label: "Measure", color: "#f472b6", desc: "Pinch to place measurement points" },
  };
  var mode = "inspect";
  var lastGesture = "NONE";
  var gestureStartTime = 0;
  var peaceDebounce = 0;
  var handLandmarker = null;

  var cursor = { x: 0, y: 0 };
  var smooth = { x: 0, y: 0 };
  var trail = [];
  var strokes = [];
  var currentStroke = [];
  var isDrawing = false;
  var measurePoints = [];
  var highlightRect = null;
  var highlightTag = "";
  var selectedElement = null;
  var frameCount = 0;
  var lastFpsTime = 0;
  var onboardVisible = true;

  var SMOOTHING = 0.22;
  var TRAIL_LEN = 14;
  var IGNORE_IDS = ["gdt-canvas", "gdt-hud", "gdt-inspector", "gdt-video"];

  var canvas = document.createElement("canvas");
  canvas.id = "gdt-canvas";
  canvas.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483640;pointer-events:none;";
  document.body.appendChild(canvas);
  var ctx = canvas.getContext("2d");

  function resizeCanvas() {
    var dpr = window.devicePixelRatio;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  var video = document.createElement("video");
  video.id = "gdt-video";
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.style.cssText =
    "position:fixed;bottom:12px;left:12px;width:160px;border-radius:10px;z-index:2147483641;" +
    "opacity:0.7;transform:scaleX(-1);border:2px solid rgba(99,102,241,0.4);pointer-events:none;";
  document.body.appendChild(video);

  var hud = document.createElement("div");
  hud.id = "gdt-hud";
  hud.style.cssText =
    "position:fixed;top:12px;right:12px;z-index:2147483642;pointer-events:none;" +
    "display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-family:system-ui,-apple-system,sans-serif;";
  hud.innerHTML =
    '<div id="gdt-mode" style="padding:8px 16px;border-radius:20px;background:rgba(0,0,0,0.75);backdrop-filter:blur(10px);font-size:14px;font-weight:700;color:#6366f1;border:1px solid rgba(99,102,241,0.3);">Inspect</div>' +
    '<div id="gdt-desc" style="padding:4px 12px;border-radius:12px;background:rgba(0,0,0,0.5);backdrop-filter:blur(8px);font-size:11px;color:#94a3b8;">Point to highlight, pinch to select</div>' +
    '<div id="gdt-gesture" style="padding:4px 12px;border-radius:16px;background:rgba(0,0,0,0.5);backdrop-filter:blur(8px);font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;">Show your hand</div>' +
    '<div id="gdt-fps" style="padding:3px 10px;border-radius:12px;background:rgba(0,0,0,0.3);font-size:10px;color:#475569;">-- fps</div>' +
    '<div id="gdt-onboard" style="margin-top:8px;padding:16px 20px;border-radius:14px;background:rgba(0,0,0,0.88);backdrop-filter:blur(16px);border:1px solid rgba(99,102,241,0.25);font-size:13px;color:#e2e8f0;line-height:2;max-width:260px;box-shadow:0 8px 32px rgba(0,0,0,0.4);">' +
    '<div style="font-weight:800;font-size:14px;margin-bottom:8px;color:#6366f1;">Quick Start</div>' +
    '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:22px;">&#9757;</span><span><b style="color:#22d3ee;">Point</b> = move cursor</span></div>' +
    '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:22px;">&#129295;</span><span><b style="color:#f59e0b;">Pinch</b> = action</span></div>' +
    '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:22px;">&#9995;</span><span><b style="color:#10b981;">Open</b> = release</span></div>' +
    '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:22px;">&#9996;</span><span><b style="color:#f472b6;">Peace</b> = next mode</span></div>' +
    '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:22px;">&#9994;</span><span><b style="color:#ef4444;">Fist</b> (hold) = clear</span></div>' +
    '<div style="margin-top:8px;font-size:10px;color:#64748b;">Keys: <b>1</b> Inspect <b>2</b> Draw <b>3</b> Measure | <b>C</b> clear <b>Z</b> undo <b>H</b> help <b>Esc</b> quit</div>' +
    '</div>';
  document.body.appendChild(hud);

  var inspectorPanel = document.createElement("div");
  inspectorPanel.id = "gdt-inspector";
  inspectorPanel.style.cssText =
    "position:fixed;bottom:16px;left:190px;width:340px;max-height:420px;" +
    "background:rgba(15,15,20,0.95);backdrop-filter:blur(12px);" +
    "border:1px solid rgba(99,102,241,0.3);border-radius:12px;" +
    "color:#e2e8f0;font-family:'SF Mono','Fira Code',monospace;font-size:12px;" +
    "z-index:2147483641;overflow-y:auto;padding:0;display:none;" +
    "pointer-events:none;box-shadow:0 8px 32px rgba(0,0,0,0.5);";
  document.body.appendChild(inspectorPanel);

  var modeEl = hud.querySelector("#gdt-mode");
  var descEl = hud.querySelector("#gdt-desc");
  var gestureEl = hud.querySelector("#gdt-gesture");
  var fpsEl = hud.querySelector("#gdt-fps");
  var onboardEl = hud.querySelector("#gdt-onboard");

  setTimeout(function () {
    if (!onboardVisible) return;
    onboardVisible = false;
    onboardEl.style.transition = "opacity 0.5s";
    onboardEl.style.opacity = "0";
    setTimeout(function () { onboardEl.style.display = "none"; }, 500);
  }, 15000);

  function setMode(m) {
    mode = m;
    var meta = MODE_META[m];
    modeEl.textContent = meta.label;
    modeEl.style.color = meta.color;
    modeEl.style.borderColor = meta.color + "60";
    descEl.textContent = meta.desc;
    highlightRect = null;
    selectElement(null);
  }

  function cycleMode() {
    var idx = MODES.indexOf(mode);
    setMode(MODES[(idx + 1) % MODES.length]);
  }

  function isOverlay(el) {
    var n = el;
    while (n) {
      if (IGNORE_IDS.indexOf(n.id) !== -1) return true;
      n = n.parentElement;
    }
    return false;
  }

  function getElementAt(x, y) {
    var els = document.elementsFromPoint(x, y);
    for (var i = 0; i < els.length; i++) {
      if (els[i] instanceof HTMLElement && !isOverlay(els[i])) return els[i];
    }
    return null;
  }

  function getTagLabel(el) {
    var label = el.tagName.toLowerCase();
    if (el.id) label += "#" + el.id;
    if (el.classList.length) label += "." + Array.prototype.join.call(el.classList, ".");
    return label.length > 50 ? label.slice(0, 47) + "..." : label;
  }

  function selectElement(el) {
    selectedElement = el;
    if (!el) { inspectorPanel.style.display = "none"; return; }
    var cs = getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    var styleKeys = [
      "display", "position", "width", "height", "margin", "padding", "border",
      "color", "background-color", "font-size", "font-weight",
      "flex-direction", "justify-content", "align-items", "gap",
      "grid-template-columns", "opacity", "z-index", "border-radius",
    ];
    var html = '<div style="padding:12px 14px;border-bottom:1px solid #27272a;">';
    html += '<span style="color:#a78bfa;font-weight:700;font-size:13px;">&lt;' + el.tagName.toLowerCase() + '&gt;</span>';
    if (el.id) html += '<div style="color:#6366f1;margin-top:4px;">#' + el.id + '</div>';
    if (el.classList.length) html += '<div style="color:#22d3ee;margin-top:2px;">.' + Array.prototype.join.call(el.classList, " .") + '</div>';
    html += '</div>';
    html += '<div style="padding:10px 14px;border-bottom:1px solid #27272a;">';
    html += '<div style="color:#64748b;font-size:10px;text-transform:uppercase;margin-bottom:6px;">Box Model</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;">';
    html += '<span>x: ' + Math.round(rect.x) + '</span><span>y: ' + Math.round(rect.y) + '</span>';
    html += '<span>w: ' + Math.round(rect.width) + '</span><span>h: ' + Math.round(rect.height) + '</span>';
    html += '</div></div>';
    html += '<div style="padding:10px 14px;">';
    html += '<div style="color:#64748b;font-size:10px;text-transform:uppercase;margin-bottom:6px;">Styles</div>';
    for (var i = 0; i < styleKeys.length; i++) {
      var key = styleKeys[i];
      var val = cs.getPropertyValue(key);
      if (val && val !== "none" && val !== "normal" && val !== "auto" && val !== "0px" && val !== "rgba(0, 0, 0, 0)") {
        html += '<div style="display:flex;justify-content:space-between;padding:1px 0;">';
        html += '<span style="color:#94a3b8;">' + key + '</span>';
        html += '<span style="color:#e2e8f0;">' + escapeHtml(val) + '</span>';
        html += '</div>';
      }
    }
    html += '</div>';
    inspectorPanel.innerHTML = html;
    inspectorPanel.style.display = "block";
  }

  function handleGesture(type, indexTip, confidence) {
    cursor.x = (1 - indexTip.x) * innerWidth;
    cursor.y = indexTip.y * innerHeight;
    smooth.x += (cursor.x - smooth.x) * SMOOTHING;
    smooth.y += (cursor.y - smooth.y) * SMOOTHING;
    trail.push({ x: smooth.x, y: smooth.y });
    if (trail.length > TRAIL_LEN) trail.shift();

    if (type !== lastGesture) {
      if (lastGesture === "PINCH" && mode === "draw") endStroke();
      gestureStartTime = Date.now();
    }

    if (onboardVisible && type !== "NONE") {
      onboardVisible = false;
      onboardEl.style.transition = "opacity 0.5s";
      onboardEl.style.opacity = "0";
      setTimeout(function () { onboardEl.style.display = "none"; }, 500);
    }

    switch (type) {
      case "POINT":
        if (mode === "inspect") {
          var el = getElementAt(smooth.x, smooth.y);
          if (el) {
            highlightRect = el.getBoundingClientRect();
            highlightTag = getTagLabel(el);
          } else {
            highlightRect = null;
          }
        }
        break;
      case "PINCH":
        if (mode === "inspect") {
          var el2 = getElementAt(smooth.x, smooth.y);
          if (el2) {
            selectElement(el2);
            highlightRect = el2.getBoundingClientRect();
            highlightTag = getTagLabel(el2);
          }
        }
        if (mode === "draw") {
          if (!isDrawing) { isDrawing = true; currentStroke = []; }
          currentStroke.push({ x: smooth.x, y: smooth.y });
        }
        if (mode === "measure" && type !== lastGesture) {
          if (measurePoints.length >= 2) measurePoints = [];
          measurePoints.push({ x: smooth.x, y: smooth.y });
        }
        break;
      case "FIST":
        if (Date.now() - gestureStartTime > 1200 && lastGesture === "FIST") {
          strokes = []; currentStroke = []; measurePoints = [];
          highlightRect = null; trail = []; selectElement(null);
          gestureStartTime = Date.now() + 5000;
        }
        break;
      case "OPEN":
        if (mode === "draw" && isDrawing) endStroke();
        if (mode === "inspect") { highlightRect = null; selectElement(null); }
        break;
      case "PEACE":
        if (Date.now() - peaceDebounce > 600) {
          cycleMode();
          peaceDebounce = Date.now();
        }
        break;
    }

    gestureEl.textContent = type === "NONE" ? "Show your hand" : type + " " + Math.round(confidence * 100) + "%";
    gestureEl.style.color = type === "NONE" ? "#475569" : "#94a3b8";
    lastGesture = type;
  }

  function endStroke() {
    if (currentStroke.length > 2) {
      strokes.push({ points: currentStroke.slice(), color: "#f59e0b", width: 3 });
    }
    currentStroke = [];
    isDrawing = false;
  }

  function drawStrokePath(pts, color, width) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) {
      var prev = pts[i - 1], cur = pts[i];
      ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + cur.x) / 2, (prev.y + cur.y) / 2);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function render() {
    var w = innerWidth, h = innerHeight;
    ctx.clearRect(0, 0, w, h);

    if (highlightRect) {
      var r = highlightRect;
      ctx.fillStyle = "rgba(99,102,241,0.08)";
      ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.strokeStyle = "#6366f1"; ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]); ctx.strokeRect(r.x, r.y, r.width, r.height); ctx.setLineDash([]);
      var dimText = Math.round(r.width) + " x " + Math.round(r.height);
      ctx.font = "11px system-ui,sans-serif";
      var tw = ctx.measureText(dimText).width;
      ctx.fillStyle = "rgba(99,102,241,0.9)";
      roundRect(ctx, r.x - 4, r.y - 22, tw + 8, 18, 4); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillText(dimText, r.x, r.y - 8);
      if (highlightTag) {
        var tagW = ctx.measureText(highlightTag).width;
        ctx.fillStyle = "rgba(30,30,46,0.9)";
        roundRect(ctx, r.x + r.width - tagW - 12, r.y + r.height + 4, tagW + 12, 18, 4); ctx.fill();
        ctx.fillStyle = "#a78bfa";
        ctx.fillText(highlightTag, r.x + r.width - tagW - 6, r.y + r.height + 17);
      }
      ctx.beginPath();
      ctx.moveTo(0, r.y); ctx.lineTo(w, r.y);
      ctx.moveTo(0, r.y + r.height); ctx.lineTo(w, r.y + r.height);
      ctx.moveTo(r.x, 0); ctx.lineTo(r.x, h);
      ctx.moveTo(r.x + r.width, 0); ctx.lineTo(r.x + r.width, h);
      ctx.strokeStyle = "rgba(99,102,241,0.12)"; ctx.lineWidth = 1; ctx.stroke();
    }

    for (var si = 0; si < strokes.length; si++) {
      drawStrokePath(strokes[si].points, strokes[si].color, strokes[si].width);
    }
    if (currentStroke.length > 1) drawStrokePath(currentStroke, "#f59e0b", 4);

    if (measurePoints.length >= 2) {
      var a = measurePoints[0], b = measurePoints[1];
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = "#f472b6"; ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      var pts = [a, b];
      for (var pi = 0; pi < pts.length; pi++) {
        ctx.beginPath(); ctx.arc(pts[pi].x, pts[pi].y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#f472b6"; ctx.fill();
      }
      var dist = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      var label = dist + "px";
      ctx.font = "bold 13px system-ui,sans-serif";
      var lw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(244,114,182,0.9)";
      roundRect(ctx, mx - lw / 2 - 6, my - 20, lw + 12, 22, 4); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillText(label, mx - lw / 2, my - 3);
    } else if (measurePoints.length === 1 && mode === "measure") {
      var p = measurePoints[0];
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = "#f472b6"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(smooth.x, smooth.y);
      ctx.strokeStyle = "rgba(244,114,182,0.4)"; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    }

    if (trail.length > 1) {
      ctx.beginPath(); ctx.moveTo(trail[0].x, trail[0].y);
      for (var ti = 1; ti < trail.length; ti++) ctx.lineTo(trail[ti].x, trail[ti].y);
      ctx.strokeStyle = "rgba(99,102,241,0.25)"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke();
    }

    if (trail.length > 0) {
      var x = smooth.x, y = smooth.y;
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fillStyle = mode === "draw" ? "rgba(245,158,11,0.15)" : mode === "measure" ? "rgba(244,114,182,0.15)" : "rgba(99,102,241,0.15)";
      ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = mode === "draw" ? "#f59e0b" : mode === "measure" ? "#f472b6" : "#6366f1";
      ctx.fill();
      if (lastGesture === "PINCH") {
        ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 2; ctx.stroke();
      }
    }

    frameCount++;
    var now = performance.now();
    if (now - lastFpsTime >= 1000) {
      fpsEl.textContent = frameCount + " fps";
      fpsEl.style.color = frameCount > 24 ? "#10b981" : frameCount > 15 ? "#f59e0b" : "#ef4444";
      frameCount = 0;
      lastFpsTime = now;
    }
  }

  function classifyGesture(lm, pinchDist) {
    if (pinchDist < 0.04) return "PINCH";
    var tips = [lm[8], lm[12], lm[16], lm[20]];
    var mcps = [lm[5], lm[9], lm[13], lm[17]];
    var extCount = 0;
    var indexExt = tips[0].y < mcps[0].y;
    var middleExt = tips[1].y < mcps[1].y;
    for (var i = 0; i < 4; i++) { if (tips[i].y < mcps[i].y) extCount++; }
    if (extCount === 0) return "FIST";
    if (extCount === 1 && indexExt) return "POINT";
    if (extCount === 2 && indexExt && middleExt) return "PEACE";
    if (extCount === 4) return "OPEN";
    return "NONE";
  }

  function onKeydown(e) {
    if (e.key === "1") setMode("inspect");
    if (e.key === "2") setMode("draw");
    if (e.key === "3") setMode("measure");
    if (e.key === "c" || e.key === "C") {
      strokes = []; currentStroke = []; measurePoints = [];
      highlightRect = null; trail = []; selectElement(null);
    }
    if (e.key === "z" || e.key === "Z") strokes.pop();
    if (e.key === "h" || e.key === "H") {
      onboardVisible = !onboardVisible;
      onboardEl.style.display = onboardVisible ? "block" : "none";
      onboardEl.style.opacity = onboardVisible ? "1" : "0";
    }
    if (e.key === "Escape") destroy();
  }
  document.addEventListener("keydown", onKeydown);

  function destroy() {
    window.__gestureDevToolsActive = false;
    document.removeEventListener("keydown", onKeydown);
    canvas.remove();
    video.remove();
    hud.remove();
    inspectorPanel.remove();
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(function (t) { t.stop(); });
    }
  }

  async function boot() {
    try {
      var stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      video.srcObject = stream;
      await video.play();
    } catch (err) {
      alert("Gesture DevTools: Camera access denied.\n" + err.message);
      destroy();
      return;
    }

    modeEl.textContent = "Loading...";

    var moduleCode =
      'import { FilesetResolver, HandLandmarker } from "' + MEDIAPIPE_CDN + '/vision_bundle.mjs";' +
      'const vision = await FilesetResolver.forVisionTasks("' + MEDIAPIPE_CDN + '/wasm");' +
      'const hl = await HandLandmarker.createFromOptions(vision, {' +
      '  baseOptions: {' +
      '    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",' +
      '    delegate: "GPU",' +
      '  },' +
      '  runningMode: "VIDEO",' +
      '  numHands: 1,' +
      '  minHandDetectionConfidence: 0.5,' +
      '  minTrackingConfidence: 0.5,' +
      '});' +
      'window.__gdtHandLandmarker = hl;' +
      'window.dispatchEvent(new Event("gdt-ready"));';

    var blob = new Blob([moduleCode], { type: "application/javascript" });
    var moduleScript = document.createElement("script");
    moduleScript.type = "module";
    moduleScript.src = URL.createObjectURL(blob);
    document.head.appendChild(moduleScript);

    window.addEventListener("gdt-ready", function () {
      handLandmarker = window.__gdtHandLandmarker;
      setMode("inspect");

      function loop() {
        if (!window.__gestureDevToolsActive) return;
        var now = performance.now();
        var results = handLandmarker.detectForVideo(video, now);

        if (results.landmarks.length > 0) {
          var lm = results.landmarks[0];
          var indexTip = lm[8];
          var thumbTip = lm[4];
          var pinchDist = Math.hypot(
            indexTip.x - thumbTip.x,
            indexTip.y - thumbTip.y,
            indexTip.z - thumbTip.z
          );
          var type = classifyGesture(lm, pinchDist);
          var confidence = results.handedness[0] && results.handedness[0][0] ? results.handedness[0][0].score : 0;
          handleGesture(type, indexTip, confidence);
        } else {
          if (lastGesture === "PINCH" && mode === "draw") endStroke();
          trail = [];
          lastGesture = "NONE";
          gestureEl.textContent = "Show your hand";
          gestureEl.style.color = "#475569";
        }

        render();
        requestAnimationFrame(loop);
      }
      loop();
    });
  }

  boot();
})();
