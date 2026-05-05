(() => {
  "use strict";

  const MODES = ["inspect", "draw", "measure"];
  const OVERLAY_IDS = new Set([
    "gesture-presenter-overlay", "gesture-presenter-canvas",
    "gesture-presenter-hud", "gesture-inspector-panel",
  ]);

  let enabled = false;
  let mode = "inspect";
  let isDrawing = false;
  let drawPaths = [];
  let currentPath = [];
  let trail = [];
  let cursor = { x: 0, y: 0 };
  let smoothCursor = { x: 0, y: 0 };
  let measurePoints = [];
  let highlightRect = null;
  let highlightTag = "";
  let canvas = null;
  let ctx = null;
  let animFrameId = null;
  let lastGesture = "NONE";
  let gestureStartTime = 0;
  let peaceDebounce = 0;

  const SMOOTHING = 0.25;
  const TRAIL_LEN = 12;

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
    let html = '<div style="padding:10px 12px;border-bottom:1px solid #27272a;">';
    html += '<span style="color:#a78bfa;font-weight:700;">&lt;' + el.tagName.toLowerCase() + '&gt;</span>';
    if (el.id) html += ' <span style="color:#6366f1;">#' + el.id + '</span>';
    if (el.classList.length) html += ' <span style="color:#22d3ee;">.' + [...el.classList].join(".") + '</span>';
    html += '</div><div style="padding:8px 12px;font-size:11px;">';
    html += Math.round(r.width) + "x" + Math.round(r.height) + " at (" + Math.round(r.x) + ", " + Math.round(r.y) + ")<br>";
    const props = ["display","position","color","background-color","font-size","padding","margin","border-radius"];
    for (const p of props) {
      const v = cs.getPropertyValue(p);
      if (v && v !== "none" && v !== "normal" && v !== "0px" && v !== "rgba(0, 0, 0, 0)") {
        html += '<div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">' + p + '</span><span>' + v + '</span></div>';
      }
    }
    html += '</div>';
    panel.innerHTML = html;
    panel.style.display = "block";
  }

  function onGestureData(data) {
    if (!enabled) return;
    if (data.status === "ready") { updateStatus("Ready"); startRenderLoop(); return; }
    if (data.status === "loaded") { updateStatus("MediaPipe loaded..."); return; }
    if (data.status === "error") { updateStatus("Error: " + data.error); return; }

    const gesture = data.gesture;
    if (!gesture || gesture === "NONE") { handleNoHand(); return; }

    if (data.indexTip) {
      cursor.x = (1 - data.indexTip.x) * window.innerWidth;
      cursor.y = data.indexTip.y * window.innerHeight;
      smoothCursor.x += (cursor.x - smoothCursor.x) * SMOOTHING;
      smoothCursor.y += (cursor.y - smoothCursor.y) * SMOOTHING;
      trail.push({ x: smoothCursor.x, y: smoothCursor.y });
      if (trail.length > TRAIL_LEN) trail.shift();
    }

    if (gesture !== lastGesture) {
      gestureStartTime = Date.now();
      if (lastGesture === "PINCH" && isDrawing) {
        isDrawing = false;
        if (currentPath.length > 2) drawPaths.push(currentPath.slice());
        currentPath = [];
      }
    }

    switch (gesture) {
      case "POINT":
        if (mode === "inspect") {
          const el = getElementAt(smoothCursor.x, smoothCursor.y);
          if (el) { highlightRect = el.getBoundingClientRect(); highlightTag = getTagLabel(el); }
          else highlightRect = null;
        }
        break;
      case "PINCH":
        if (mode === "inspect") {
          const el = getElementAt(smoothCursor.x, smoothCursor.y);
          if (el) {
            highlightRect = el.getBoundingClientRect();
            highlightTag = getTagLabel(el);
            showInspectorPanel(el);
          }
        }
        if (mode === "draw") { isDrawing = true; currentPath.push({ x: smoothCursor.x, y: smoothCursor.y }); }
        if (mode === "measure" && gesture !== lastGesture) {
          if (measurePoints.length >= 2) measurePoints = [];
          measurePoints.push({ x: smoothCursor.x, y: smoothCursor.y });
        }
        break;
      case "PEACE":
        if (Date.now() - peaceDebounce > 600) {
          const idx = MODES.indexOf(mode);
          mode = MODES[(idx + 1) % MODES.length];
          peaceDebounce = Date.now();
          highlightRect = null;
          showInspectorPanel(null);
        }
        break;
      case "FIST":
        if (Date.now() - gestureStartTime > 1500 && lastGesture === "FIST") {
          clearAnnotations();
          gestureStartTime = Date.now() + 5000;
        }
        break;
      case "OPEN":
        if (mode === "draw" && isDrawing) {
          isDrawing = false;
          if (currentPath.length > 2) drawPaths.push(currentPath.slice());
          currentPath = [];
        }
        if (mode === "inspect") { highlightRect = null; showInspectorPanel(null); }
        break;
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
    measurePoints = []; highlightRect = null;
    showInspectorPanel(null);
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
      const r = highlightRect;
      ctx.fillStyle = "rgba(99,102,241,0.08)";
      ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.strokeStyle = "#6366f1"; ctx.lineWidth = 2; ctx.setLineDash([6, 3]);
      ctx.strokeRect(r.x, r.y, r.width, r.height); ctx.setLineDash([]);
      ctx.font = "11px system-ui";
      const dimText = Math.round(r.width) + "x" + Math.round(r.height);
      ctx.fillStyle = "rgba(99,102,241,0.9)";
      ctx.fillRect(r.x - 2, r.y - 20, ctx.measureText(dimText).width + 8, 17);
      ctx.fillStyle = "#fff"; ctx.fillText(dimText, r.x + 2, r.y - 7);
      if (highlightTag) {
        const tagW = ctx.measureText(highlightTag).width;
        ctx.fillStyle = "rgba(30,30,46,0.9)";
        ctx.fillRect(r.x + r.width - tagW - 10, r.y + r.height + 3, tagW + 10, 17);
        ctx.fillStyle = "#a78bfa";
        ctx.fillText(highlightTag, r.x + r.width - tagW - 5, r.y + r.height + 16);
      }
    }

    for (const path of drawPaths) renderPath(path, "#f59e0b", 4);
    if (currentPath.length > 1) renderPath(currentPath, "#f59e0b", 5);

    if (measurePoints.length >= 2) {
      const [a, b] = measurePoints;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = "#f472b6"; ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      for (const p of [a, b]) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#f472b6"; ctx.fill();
      }
      const dist = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
      ctx.font = "bold 13px system-ui"; ctx.fillStyle = "#f472b6";
      ctx.fillText(dist + "px", (a.x + b.x) / 2 + 8, (a.y + b.y) / 2 - 8);
    }

    if (trail.length > 1) {
      ctx.beginPath(); ctx.moveTo(trail[0].x, trail[0].y);
      for (let j = 1; j < trail.length; j++) ctx.lineTo(trail[j].x, trail[j].y);
      ctx.strokeStyle = "rgba(99,102,241,0.3)"; ctx.lineWidth = 3;
      ctx.lineCap = "round"; ctx.stroke();
    }
    if (trail.length > 0) {
      const cx = smoothCursor.x, cy = smoothCursor.y;
      ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(99,102,241,0.15)"; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fillStyle = mode === "draw" ? "#f59e0b" : mode === "measure" ? "#f472b6" : "#6366f1";
      ctx.fill();
      if (lastGesture === "PINCH") {
        ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2);
        ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 2; ctx.stroke();
      }
    }
  }

  function renderPath(path, color, width) {
    if (path.length < 2) return;
    ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1], curr = path[i];
      ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) / 2, (prev.y + curr.y) / 2);
    }
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
  }

  function updateStatus(text) {
    const el = document.getElementById("gp-status");
    if (el) el.textContent = text;
  }

  function updateHud(gesture) {
    const statusEl = document.getElementById("gp-status");
    const modeEl = document.getElementById("gp-mode");
    if (!statusEl) return;
    statusEl.textContent = gesture === "NONE" ? "Waiting for hand..." : "Gesture: " + gesture;
    if (modeEl) { modeEl.textContent = "Mode: " + mode; modeEl.className = "gp-badge " + mode; }
  }

  function toggle() {
    enabled = !enabled;
    const modeEl = document.getElementById("gp-mode");
    if (enabled) {
      if (modeEl) modeEl.classList.remove("gp-hidden");
      updateStatus("Starting...");
      window.postMessage({ source: "gesture-presenter-control", action: "start" }, "*");
    } else {
      window.postMessage({ source: "gesture-presenter-control", action: "stop" }, "*");
      stopRenderLoop(); clearAnnotations(); trail = [];
      if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (modeEl) modeEl.classList.add("gp-hidden");
      updateStatus("Gesture DevTools: OFF — F9");
    }
  }

  document.addEventListener("keydown", function(e) {
    if (e.key === "F9") { e.preventDefault(); toggle(); }
    if (!enabled) return;
    if (e.key === "1") mode = "inspect";
    if (e.key === "2") mode = "draw";
    if (e.key === "3") mode = "measure";
    if (e.key === "c" || e.key === "C") clearAnnotations();
    if (e.key === "z" && drawPaths.length > 0) drawPaths.pop();
    if (e.key === "h" || e.key === "H") {
      highlightRect = null;
      showInspectorPanel(null);
    }
  });

  window.addEventListener("message", function(e) {
    if (e.data && e.data.source === "gesture-presenter-detector") onGestureData(e.data);
  });

  chrome.runtime.onMessage.addListener(function(msg) {
    if (msg.action === "toggle") toggle();
    if (msg.action === "setMode" && MODES.includes(msg.mode)) mode = msg.mode;
    if (msg.action === "clear") clearAnnotations();
  });

  createOverlay();
  injectDetector();
  console.log("[Gesture DevTools] Loaded. Press F9 to toggle.");
})();
