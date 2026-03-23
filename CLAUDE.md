# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev`
- **Type-check + build:** `npm run build`
- **Install deps:** `npm install`
- **Preview prod build:** `npm run preview`
- **Clean:** `npm run clean`

No test framework is configured.

## Deployment

The app is deployed to GitHub Pages via a GitHub Actions workflow (`.github/workflows/deploy.yml`). It triggers on pushes to `main`. Vite's `base` is set to `/webgpu-game-of-life/` to match the repo subpath on Pages. The Node version is pinned in `.node-version` and referenced by both the GHA workflow and local version managers.

## Architecture

This is a WebGPU-powered Conway's Game of Life running entirely on the GPU. The simulation and rendering both happen in WGSL shaders; TypeScript handles UI and GPU orchestration.

### Cell states and emoji rendering

The compute shader outputs visual state codes (not just alive/dead), derived from previous + current state + neighbor count:

| Code | State | Emoji | Condition |
|------|-------|-------|-----------|
| 0 | Void | 👻 | dead → dead (hidden) |
| 1 | Fresh | 😃 | dead → alive |
| 2 | Cool | 😎 | alive → alive, 2 neighbors in new gen |
| 3 | Party | 🥳 | alive → alive, 3 neighbors in new gen |
| 4 | OMG | 😳 | alive → alive, not 2 or 3 neighbors in new gen (doomed next step) |
| 5 | Skull | 💀 | alive → dead (50% opacity) |

Emoji are rendered to a canvas texture atlas (`emoji-atlas.ts`), uploaded as a GPU texture, and sampled in the fragment shader per cell.

### Ping-pong buffer design

Two cell buffers (`cellsA`, `cellsB`) store binary 0/1 (dead/alive) and alternate roles each generation:
- Phase 0: compute reads A → writes B
- Phase 1: compute reads B → writes A
- Two pre-allocated compute bind groups swap these roles in constant time
- A separate `stateBuffer` is written by compute every step — render always reads from this single buffer (no render-side swapping needed)
- Cell buffers only store binary 0/1; visual states live in the state buffer

### Uniform buffer layout (32 bytes, shared by both pipelines)

| Offset | Type | Field |
|--------|------|-------|
| 0 | u32 | width |
| 4 | u32 | height |
| 8 | u32 | generation |
| 12 | f32 | cell_aspect (viewport-to-grid aspect correction for square cells) |
| 16 | f32 | camera_x |
| 20 | f32 | camera_y |
| 24 | f32 | camera_zoom |
| 28 | f32 | padding |

Partial updates use `queue.writeBuffer()` with byte offsets — camera updates write 16 bytes at offset 16 without touching the grid dimensions.

### Key files

- `src/simulation.ts` — WebGPU device init, buffer creation, pipeline setup, `step()`, `prepareReadback()`, `render()`, and `resize()` methods; `step(count)` encodes compute passes into a pending encoder without submitting — visual + hash only on the final step; `prepareReadback()` appends readback copy to the pending encoder; `render()` appends the render pass and submits everything in a single `queue.submit()`; device-level resources (pipelines, emoji atlas) survive grid resize while grid-level resources (cell buffers, bind groups) are rebuilt
- `src/emoji-atlas.ts` — Renders 6 emoji to an offscreen canvas, uploaded as GPU texture atlas
- `src/shaders/compute.wgsl` — Three-pass compute: `step` (Conway rules, binary output), `visual` (state codes from prev/curr + neighbor count in new gen), `hash` (atomicXor board fingerprint for loop detection + atomicAdd population count), workgroup size 8×8
- `src/shaders/render.wgsl` — Fullscreen triangle, screen-level aspect letterboxing for square cells, emoji texture sampling per cell, camera transform (no tiling — out-of-grid UVs show background)
- `src/zoom-pan.ts` — Mouse/touch zoom-to-cursor and drag-to-pan with offset clamping (grid always fills viewport, max zoom scales with grid size so cells reach consistent pixel size)
- `src/patterns.ts` — Pattern presets and custom expression evaluation via `new Function()` with `row/col/rows/cols` variables
- `src/stats.ts` — Generation counter, population counter, GPS and FPS measurement (updates DOM elements once per second)
- `src/loop-detect.ts` — Generation-aware 3-entry hash window detecting period ≤ 2 loops (still lifes and blinker-class boards); only compares hashes within MAX_PERIOD generations of each other to avoid aliasing higher-period oscillators when steps are batched; higher-period oscillators run forever (ported from `electron-game-of-life`)
- `src/controls.ts` — UI event wiring (play/pause, step, GPS slider, grid size, pattern selector, keyboard shortcuts, device lost, window resize triggers grid rebuild)
- `src/main.ts` — Init, state setup, game loop with accumulator-based timing (GPS decoupled from render FPS, max 16 steps/frame), loop-triggered countdown + restart (readback only when `maxSteps === 1` to prevent aliasing), and visibility-based auto-pause (pauses when tab is hidden, resumes on return)

### Pattern expressions

Patterns are JavaScript boolean expressions evaluated per cell. Variables: `row`, `col`, `rows`, `cols`. Complex patterns use block syntax: `{let r=row%5; ... return condition}`. Ported from the sibling `electron-game-of-life` repository.
