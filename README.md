# Gesture Control — MediaPipe + Three.js + Google Meet Extension

Hand gesture recognition for live presentations, 3D manipulation, and code interaction.

## Components

### 1. Three.js Playground (`/`)
Interactive 3D scene controlled by hand gestures. 5 gestures mapped to actions (grab, move, zoom, rotate, release).

```bash
npm run dev          # localhost:5173
npm run bridge       # WebSocket bridge on port 8765
```

### 2. Google Meet Extension (`/extension/`)
Chrome extension that overlays gesture-based annotations on Google Meet calls.

**Features:**
- **Pointer** — point with index finger to show a cursor visible to all (screen share)
- **Draw** — pinch to draw freehand annotations on screen
- **Spotlight** — pinch to create a focus spotlight, spread to resize
- **Shapes** — peace sign to cycle modes
- **Clear** — hold fist for 1.5s or press C

**Install:**
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `extension/` folder
4. Join a Google Meet call
5. Press **F9** to activate

**Keyboard shortcuts:**
| Key | Action |
|-----|--------|
| F9 | Toggle on/off |
| 1 | Pointer mode |
| 2 | Draw mode |
| 3 | Spotlight mode |
| C | Clear all annotations |
| Z | Undo last stroke |

**Gestures:**
| Gesture | Action |
|---------|--------|
| Point (index up) | Move cursor |
| Pinch (index+thumb) | Draw / grab spotlight |
| Peace (index+middle) | Cycle modes |
| Spread (all fingers wide) | Zoom spotlight |
| Fist (hold 1.5s) | Clear all |
| Open hand | Release / reset |

## Architecture

```
Webcam → MediaPipe HandLandmarker (GPU, 30fps)
  ↓ 21 landmarks
Gesture Classifier (pinch, point, fist, peace, spread, open)
  ↓
Action Router
  ├── Canvas Overlay (pointer, drawings, spotlight)
  ├── WebSocket Bridge (port 8765) → external tools
  └── Chrome Extension UI (HUD badges, mode indicator)
```

## Tech Stack
- @mediapipe/tasks-vision 0.10.x (WASM, GPU delegate)
- Three.js 0.170+ (playground)
- Vite 6 + TypeScript (dev)
- Chrome Extension Manifest V3

## Requirements
- Chrome 120+ (for MediaPipe WASM + GPU)
- Webcam access
- macOS / Windows / Linux
