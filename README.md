# Gesture DevTools

Inspect DOM elements, draw annotations, and measure distances — on any website, using real-time hand gesture recognition.

**Live demo:** https://gaspardcoche.github.io/gesture-control/

## Use on Any Website (Bookmarklet)

1. Go to the [live demo](https://gaspardcoche.github.io/gesture-control/)
2. Drag the **"Gesture DevTools"** button to your bookmarks bar
3. Navigate to any website
4. Click the bookmark — gesture control activates instantly

## 3 Modes, 5 Gestures

| Gesture | Action |
|---------|--------|
| **Point** (index finger) | Move cursor, hover-highlight elements |
| **Pinch** (thumb + index) | Select element / Draw / Set measure point |
| **Open hand** | Release / Deselect / End stroke |
| **Peace sign** | Switch to next mode |
| **Fist** (hold 1.5s) | Clear all annotations |

| Mode | What it does |
|------|-------------|
| **Inspect** | Point to highlight DOM elements, pinch to select and see styles |
| **Draw** | Pinch to draw freehand annotations on the page |
| **Measure** | Pinch twice to measure pixel distance between two points |

**Keyboard:** `1` `2` `3` switch modes, `C` clear, `Z` undo, `H` help, `Esc` quit

## Quick Start (Development)

```bash
npm install
npm run dev          # localhost:5173
```

## Chrome Extension

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `extension/` folder
4. Navigate to any website
5. Press **F9** to activate

## Deploy

```bash
npm run deploy       # builds + deploys to GitHub Pages
```

## Architecture

```
Webcam → MediaPipe HandLandmarker (GPU, 30fps)
  | 21 landmarks
Gesture Classifier (pinch, point, fist, peace, open)
  |
Mode Router (inspect / draw / measure)
  |── Canvas Overlay (pointer, drawings, measurements, element highlights)
  |── DOM Inspector (elementsFromPoint, computed styles panel)
  └── HUD (mode badge, gesture indicator, FPS counter, onboarding)
```

## Tech Stack

- @mediapipe/tasks-vision 0.10.x (WASM, GPU delegate)
- Canvas 2D (overlay rendering)
- Vite 6 + TypeScript
- Chrome Extension Manifest V3
- GitHub Pages (deployment)
