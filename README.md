# Gesture DevTools

Inspect DOM elements, draw annotations, measure distances, and control DevTools — all through real-time hand gesture recognition.

**Live demo:** https://gaspardcoche.github.io/gesture-control/

## Features

| Mode | Gesture | Action |
|------|---------|--------|
| **Inspect** | Point | Hover-highlight DOM elements |
| | Pinch | Select element, show computed styles and dimensions |
| | Open | Deselect |
| **Draw** | Pinch | Freehand annotations on the page |
| | Open | End stroke |
| **Spotlight** | Point | Position spotlight |
| | Pinch | Grab spotlight |
| | Spread | Resize spotlight |
| **Console** | Pinch | Toggle debug borders |
| | Spread | Toggle spacing visualization |
| **Measure** | Pinch | Set measurement points (shows pixel distance) |

**Universal gestures:**
- **Peace sign** — cycle to next mode
- **Fist** (hold 1.5s) — clear all annotations
- **Keyboard:** `1-5` modes, `C` clear, `Z` undo, `H` help, `D` debug borders

## Quick Start

```bash
npm install
npm run dev          # localhost:5173
```

## Chrome Extension (any website)

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" -> select `extension/` folder
4. Navigate to any website
5. Press **F9** to activate

## Deploy

```bash
npm run deploy       # builds + deploys to GitHub Pages
```

## Architecture

```
Webcam -> MediaPipe HandLandmarker (GPU, 30fps)
  | 21 landmarks
Gesture Classifier (pinch, point, fist, peace, spread, open)
  |
Mode Router (inspect / draw / spotlight / console / measure)
  |-- Canvas Overlay (pointer, drawings, spotlight, measurements, element highlights)
  |-- DOM Inspector (elementsFromPoint, computed styles panel)
  |-- Console Panel (intercepted logs, debug actions)
  |-- HUD (mode badge, gesture indicator, FPS counter)
  +-- WebSocket Bridge (port 8765) -> external tools
```

## Tech Stack

- @mediapipe/tasks-vision 0.10.x (WASM, GPU delegate)
- Canvas 2D (overlay rendering)
- Vite 6 + TypeScript
- Chrome Extension Manifest V3
- GitHub Pages (deployment)
