(() => {
  "use strict";

  const CONFIG = {
    POINTER_SIZE: 16,
    POINTER_TRAIL_LENGTH: 12,
    DRAW_LINE_WIDTH: 4,
    SPOTLIGHT_RADIUS: 120,
    SMOOTHING: 0.25,
    COLORS: {
      pointer: "#6366f1",
      pointerGlow: "rgba(99, 102, 241, 0.3)",
      draw: "#f59e0b",
      spotlight: "rgba(0, 0, 0, 0.6)",
      measure: "#f472b6",
      highlight: "rgba(99, 102, 241, 0.08)",
      highlightBorder: "#6366f1",
    },
  };

  const MODES = ["inspect", "draw", "spotlight", "console", "measure"];
  const OVERLAY_IDS = new Set([
    "gesture-presenter-overlay", "gesture-presenter-canvas",
    "gesture-presenter-hud", "gesture-inspector-panel", "gesture-console-panel",
  ]);

  let enabled = false;
  let mode = "inspect";
  let isDrawing = false;
  let drawPaths = [];
  let currentPath = [];
  let trail = [];
  let cursor = { x: 0, y: 0 };
  let smoothCursor = { x: 0, y: 0 };
  let spotlightCenter = null;
  let spotlightScale = 1;
  let measurePoints = [];
  let highlightRect = null;
  let highlightTag = "";
  let selectedElement = null;
  let debugBorders = false;
  let debugSpacing = false;
  let canvas = null;
  let ctx = null;
  let animFrameId = null;
  let lastGesture = "NONE";
  let gestureStartTime = 0;
  let peaceDebounce = 0;
  let detectorReady = false;

  function injectDetector() {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("src/page-detector.js");
    script.type = "module";
    document.head.appendChild(script);
  }

  function createOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "gesture-presenter-overlay";
    overlay.innerHTML = '<canvas id="gesture-presenter-canvas"></canvas>';
    document.body.appendChild(overlay);

    const hud = document.createElement("div");
    hud.id = "gesture-presenter-hud";
    hud.innerHTML =
      '<div class="gp-badge" id="gp-status">Gesture DevTools: OFF — F9</div>' +
      '<div class="gp-badge gp-hidden" id="gp-mode">Mode: inspect</div>';
    document.body.appendChild(hud);

    const inspPanel = document.createElement("div");
    inspPanel.id = "gesture-inspector-panel";
    inspPanel.style.cssText =
      "position:fixed;bottom:16px;left:16px;width:320px;max-height:400px;" +
      "background:rgba(15,15,20,0.95);backdrop-filter:blur(12px);" +
      "border:1px solid rgba(99,102,241,0.3);border-radius:12px;" +
      "color:#e2e8f0;font-family:'SF Mono',monospace;font-size:12px;" +
      "z-index:1000001;overflow-y:auto;display:none;pointer-events:none;" +
      "box-shadow:0 8px 32px rgba(0,0,0,0.5);";
    document.body.appendChild(inspPanel);

    const consPanel = document.createElement("div");
    consPanel.id = "gesture-console-panel";
    consPanel.style.cssText =
      "position:fixed;bottom:16px;right:16px;width:400px;height:300px;" +
      "background:rgba(10,10,15,0.95);backdrop-filter:blur(12px);" +
      "border:1px solid rgba(34,211,238,0.3);border-radius:12px;" +
      "color:#e2e8f0;font-family:'SF Mono',monospace;font-size:11px;" +
      "z-index:1000001;display:none;pointer-events:none;" +
      "box-shadow:0 8px 32px rgba(0,0,0,0.5);overflow:hidden;flex-direction:column;";
    consPanel.innerHTML =
      '<div style="padding:8px 14px;border-bottom:1px solid #27272a;display:flex;justify-content:space-between;">' +
      '<span style="color:#22d3ee;font-weight:700;">Console</span>' +
      '<span style="color:#475569;font-size:10px;" id="gp-console-count">0</span></div>' +
      '<div id="gp-console-list" style="flex:1;overflow-y:auto;padding:4px 0;"></div>';
    document.body.appendChild(consPanel);

    canvas = document.getElementById("gesture-presenter-canvas");
    ctx = canvas.getContext("2d");
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
  }

  function resizeCanvas() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function getElementAt(x, y) {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      if (el instanceof HTMLElement && !isOverlayEl(el)) return el;
    }
    return null;
  }

  function isOverlayEl(el) {
    let node = el;
    while (node) {
      if (OVERLAY_IDS.has(node.id)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function getTagLabel(el) {
    let label = el.tagName.toLowerCase();
    if (el.id) label += "#" + el.id;
    if (el.classList.length) label += "." + [...el.classList].slice(0, 2).join(".");
    return label.length > 45 ? label.slice(0, 42) + "..." : label;
  }

  function showInspectorPanel(el) {
    const panel = document.getElementById("gesture-inspector-panel");
    if (!el) { panel.style.display = "none"; return; }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const id = el.id ? "#" + el.id : "";
    const cls = el.classList.length ? "." + [...el.classList].join(".") : "";
    let html = '<div style="padding:10px 12px;border-bottom:1px solid #27272a;">';
    html += '<span style="color:#a78bfa;font-weight:700;">&lt;' + tag + '&gt;</span>';
    if (id) html += ' <span style="color:#6366f1;">' + id + '</span>';
    if (cls) html += ' <span style="color:#22d3ee;">' + cls + '</span>';
    html += '</div><div style="padding:8px 12px;font-size:11px;">';
    html += Math.round(r.width) + "x" + Math.round(r.height) + " at (" + Math.round(r.x) + ", " + Math.round(r.y) + ")<br>";
    var props = ["display","position","color","background-color","font-size","padding","margin","border-radius"];
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      var v = cs.getPropertyValue(p);
      if (v && v !== "none" && v !== "normal" && v !== "0px" && v !== "rgba(0, 0, 0, 0)") {
        html += '<div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">' + p + '</span><span>' + v + '</span></div>';
      }
    }
    html += '</div>';
    panel.innerHTML = html;
    panel.style.display = "block";
  }

  function logToConsole(msg) {
    var list = document.getElementById("gp-console-list");
    var count = document.getElementById("gp-console-count");
    if (!list) return;
    var div = document.createElement("div");
    div.style.cssText = "padding:2px 12px;border-bottom:1px solid #1e1e2e;";
    var t = new Date().toLocaleTimeString("en", { hour12: false });
    div.innerHTML = '<span style="color:#475569;">' + t + '</span> <span style="color:#10b981;">' + msg + '</span>';
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
    if (count) count.textContent = list.children.length;
  }

  function onGestureData(data) {
    if (!enabled) return;
    if (data.status === "ready") { detectorReady = true; updateStatus("Ready"); startRenderLoop(); return; }
    if (data.status === "loaded") { updateStatus("MediaPipe loaded..."); return; }
    if (data.status === "error") { updateStatus("Error: " + data.error); return; }

    var gesture = data.gesture;
    if (!gesture || gesture === "NONE") { handleNoHand(); return; }

    if (data.indexTip) {
      cursor.x = (1 - data.indexTip.x) * window.innerWidth;
      cursor.y = data.indexTip.y * window.innerHeight;
      smoothCursor.x += (cursor.x - smoothCursor.x) * CONFIG.SMOOTHING;
      smoothCursor.y += (cursor.y - smoothCursor.y) * CONFIG.SMOOTHING;
      trail.push({ x: smoothCursor.x, y: smoothCursor.y });
      if (trail.length > CONFIG.POINTER_TRAIL_LENGTH) trail.shift();
    }

    if (gesture !== lastGesture) {
      gestureStartTime = Date.now();
      if (lastGesture === "PINCH" && isDrawing) {
        isDrawing = false;
        if (currentPath.length > 2) drawPaths.push(currentPath.slice());
        currentPath = [];
      }
    }

    if (gesture === "POINT") {
      if (mode === "inspect") {
        var el = getElementAt(smoothCursor.x, smoothCursor.y);
        if (el) { highlightRect = el.getBoundingClientRect(); highlightTag = getTagLabel(el); }
        else { highlightRect = null; }
      }
      if (mode === "spotlight") spotlightCenter = { x: smoothCursor.x, y: smoothCursor.y };
    }

    if (gesture === "PINCH") {
      if (mode === "inspect") {
        var el2 = getElementAt(smoothCursor.x, smoothCursor.y);
        if (el2) {
          selectedElement = el2;
          highlightRect = el2.getBoundingClientRect();
          highlightTag = getTagLabel(el2);
          showInspectorPanel(el2);
          logToConsole("Selected " + getTagLabel(el2));
        }
      }
      if (mode === "draw") { isDrawing = true; currentPath.push({ x: smoothCursor.x, y: smoothCursor.y }); }
      if (mode === "spotlight") spotlightCenter = { x: smoothCursor.x, y: smoothCursor.y };
      if (mode === "measure" && gesture !== lastGesture) {
        if (measurePoints.length >= 2) measurePoints = [];
        measurePoints.push({ x: smoothCursor.x, y: smoothCursor.y });
      }
      if (mode === "console" && gesture !== lastGesture) {
        debugBorders = !debugBorders;
        document.body.classList.toggle("gesture-debug-borders", debugBorders);
        logToConsole("Debug borders: " + (debugBorders ? "ON" : "OFF"));
      }
    }

    if (gesture === "PEACE" && Date.now() - peaceDebounce > 600) {
      var idx = MODES.indexOf(mode);
      mode = MODES[(idx + 1) % MODES.length];
      peaceDebounce = Date.now();
      highlightRect = null;
      showInspectorPanel(null);
      document.getElementById("gesture-console-panel").style.display = mode === "console" ? "flex" : "none";
      logToConsole("Mode: " + mode);
    }

    if (gesture === "SPREAD") {
      if (mode === "spotlight" && spotlightCenter) spotlightScale = Math.min(3, spotlightScale + 0.02);
      if (mode === "console" && gesture !== lastGesture) {
        debugSpacing = !debugSpacing;
        document.body.classList.toggle("gesture-debug-spacing", debugSpacing);
        logToConsole("Debug spacing: " + (debugSpacing ? "ON" : "OFF"));
      }
    }

    if (gesture === "FIST" && Date.now() - gestureStartTime > 1500 && lastGesture === "FIST") {
      clearAnnotations();
      gestureStartTime = Date.now() + 5000;
    }

    if (gesture === "OPEN") {
      if (mode === "draw" && isDrawing) {
        isDrawing = false;
        if (currentPath.length > 2) drawPaths.push(currentPath.slice());
        currentPath = [];
      }
      if (mode === "spotlight") { spotlightCenter = null; spotlightScale = 1; }
      if (mode === "inspect") { highlightRect = null; showInspectorPanel(null); }
    }

    lastGesture = gesture;
    updateHud(gesture);
  }

  function handleNoHand() {
    if (isDrawing) {
      isDrawing = false;
      if (currentPath.length > 2) drawPaths.push(currentPath.slice());
      currentPath = [];
    }
    trail = [];
    lastGesture = "NONE";
    updateHud("NONE");
  }

  function clearAnnotations() {
    drawPaths = []; currentPath = [];
    spotlightCenter = null; spotlightScale = 1;
    measurePoints = []; highlightRect = null;
    selectedElement = null;
    showInspectorPanel(null);
    logToConsole("Cleared all");
  }

  function startRenderLoop() {
    if (animFrameId) return;
    (function frame() { render(); animFrameId = requestAnimationFrame(frame); })();
  }

  function stopRenderLoop() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  }

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (!enabled) return;

    if (highlightRect) {
      var r = highlightRect;
      ctx.fillStyle = CONFIG.COLORS.highlight;
      ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.strokeStyle = CONFIG.COLORS.highlightBorder;
      ctx.lineWidth = 2; ctx.setLineDash([6, 3]);
      ctx.strokeRect(r.x, r.y, r.width, r.height); ctx.setLineDash([]);
      ctx.font = "11px system-ui";
      var dimText = Math.round(r.width) + "x" + Math.round(r.height);
      ctx.fillStyle = "rgba(99,102,241,0.9)";
      ctx.fillRect(r.x - 2, r.y - 20, ctx.measureText(dimText).width + 8, 17);
      ctx.fillStyle = "#fff"; ctx.fillText(dimText, r.x + 2, r.y - 7);
      if (highlightTag) {
        var tagW = ctx.measureText(highlightTag).width;
        ctx.fillStyle = "rgba(30,30,46,0.9)";
        ctx.fillRect(r.x + r.width - tagW - 10, r.y + r.height + 3, tagW + 10, 17);
        ctx.fillStyle = "#a78bfa";
        ctx.fillText(highlightTag, r.x + r.width - tagW - 5, r.y + r.height + 16);
      }
    }

    for (var i = 0; i < drawPaths.length; i++) renderPath(drawPaths[i], CONFIG.COLORS.draw, CONFIG.DRAW_LINE_WIDTH);
    if (currentPath.length > 1) renderPath(currentPath, CONFIG.COLORS.draw, CONFIG.DRAW_LINE_WIDTH + 1);

    if (mode === "spotlight" && spotlightCenter) {
      var sx = spotlightCenter.x, sy = spotlightCenter.y, sr = CONFIG.SPOTLIGHT_RADIUS * spotlightScale;
      ctx.fillStyle = CONFIG.COLORS.spotlight;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 2; ctx.stroke();
    }

    if (measurePoints.length >= 2) {
      var a = measurePoints[0], b = measurePoints[1];
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = CONFIG.COLORS.measure; ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      [a, b].forEach(function(p) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = CONFIG.COLORS.measure; ctx.fill();
      });
      var dist = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
      ctx.font = "bold 13px system-ui"; ctx.fillStyle = CONFIG.COLORS.measure;
      ctx.fillText(dist + "px", (a.x + b.x) / 2 + 8, (a.y + b.y) / 2 - 8);
    }

    if (trail.length > 1) {
      ctx.beginPath(); ctx.moveTo(trail[0].x, trail[0].y);
      for (var j = 1; j < trail.length; j++) ctx.lineTo(trail[j].x, trail[j].y);
      ctx.strokeStyle = CONFIG.COLORS.pointerGlow; ctx.lineWidth = 3;
      ctx.lineCap = "round"; ctx.stroke();
    }
    if (trail.length > 0) {
      var cx = smoothCursor.x, cy = smoothCursor.y;
      ctx.beginPath(); ctx.arc(cx, cy, CONFIG.POINTER_SIZE + 4, 0, Math.PI * 2);
      ctx.fillStyle = CONFIG.COLORS.pointerGlow; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, CONFIG.POINTER_SIZE / 2, 0, Math.PI * 2);
      ctx.fillStyle = mode === "draw" ? CONFIG.COLORS.draw : mode === "measure" ? CONFIG.COLORS.measure : CONFIG.COLORS.pointer;
      ctx.fill();
      if (lastGesture === "PINCH") {
        ctx.beginPath(); ctx.arc(cx, cy, CONFIG.POINTER_SIZE + 8, 0, Math.PI * 2);
        ctx.strokeStyle = CONFIG.COLORS.draw; ctx.lineWidth = 2; ctx.stroke();
      }
    }
  }

  function renderPath(path, color, width) {
    if (path.length < 2) return;
    ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
    for (var i = 1; i < path.length; i++) {
      var prev = path[i - 1], curr = path[i];
      ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) / 2, (prev.y + curr.y) / 2);
    }
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
  }

  function updateStatus(text) {
    var el = document.getElementById("gp-status");
    if (el) el.textContent = text;
  }

  function updateHud(gesture) {
    var statusEl = document.getElementById("gp-status");
    var modeEl = document.getElementById("gp-mode");
    if (!statusEl) return;
    statusEl.textContent = gesture === "NONE" ? "Waiting for hand..." : "Gesture: " + gesture;
    statusEl.className = gesture === "NONE" ? "gp-badge" : "gp-badge active";
    if (modeEl) { modeEl.textContent = "Mode: " + mode; modeEl.className = "gp-badge " + mode; }
  }

  function toggle() {
    enabled = !enabled;
    var modeEl = document.getElementById("gp-mode");
    if (enabled) {
      if (modeEl) modeEl.classList.remove("gp-hidden");
      updateStatus("Starting...");
      window.postMessage({ source: "gesture-presenter-control", action: "start" }, "*");
    } else {
      window.postMessage({ source: "gesture-presenter-control", action: "stop" }, "*");
      stopRenderLoop(); clearAnnotations(); trail = [];
      if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (modeEl) modeEl.classList.add("gp-hidden");
      var cp = document.getElementById("gesture-console-panel");
      if (cp) cp.style.display = "none";
      updateStatus("Gesture DevTools: OFF — F9");
    }
  }

  document.addEventListener("keydown", function(e) {
    if (e.key === "F9") { e.preventDefault(); toggle(); }
    if (!enabled) return;
    if (e.key === "1") mode = "inspect";
    if (e.key === "2") mode = "draw";
    if (e.key === "3") mode = "spotlight";
    if (e.key === "4") { mode = "console"; document.getElementById("gesture-console-panel").style.display = "flex"; }
    if (e.key === "5") mode = "measure";
    if (e.key === "c" || e.key === "C") clearAnnotations();
    if (e.key === "z" && drawPaths.length > 0) drawPaths.pop();
    if (e.key === "d" || e.key === "D") {
      debugBorders = !debugBorders;
      document.body.classList.toggle("gesture-debug-borders", debugBorders);
    }
  });

  window.addEventListener("message", function(e) {
    if (e.data && e.data.source === "gesture-presenter-detector") onGestureData(e.data);
  });

  chrome.runtime.onMessage.addListener(function(msg) {
    if (msg.action === "toggle") toggle();
    if (msg.action === "setMode") {
      mode = msg.mode;
      var cp = document.getElementById("gesture-console-panel");
      if (cp) cp.style.display = mode === "console" ? "flex" : "none";
    }
    if (msg.action === "clear") clearAnnotations();
  });

  createOverlay();
  injectDetector();
  console.log("[Gesture DevTools] Loaded. Press F9 to toggle.");
})();
