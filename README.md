# WebGPU Game of Life

**[Try it live](https://christian-schlichtherle.github.io/webgpu-game-of-life/)**

Conway's Game of Life running entirely on the GPU with WebGPU. The simulation and rendering both happen in WGSL compute/fragment shaders — TypeScript only handles UI and GPU orchestration.

Cells are rendered as emoji rather than plain squares. The compute shader outputs visual state codes based on cell transitions:

| Emoji | Meaning | Transition |
|-------|---------|------------|
| 👻 | Void | stayed dead |
| 😃 | Fresh | just born |
| 😎 | Cool | alive, 2 neighbors |
| 🥳 | Party | alive, 3 neighbors |
| 😳 | OMG | alive but doomed (dies next step) |
| 💀 | Skull | just died |

Emoji are rendered to a texture atlas on the CPU, uploaded as a GPU texture, and sampled per cell in the fragment shader.

## Requirements

- A browser with WebGPU support: Chrome 113+, Edge 113+, Firefox 141+, or Safari 26+
- Node.js (version pinned in `.node-version`)

## Getting started

```sh
npm install
npm run dev
```

## Controls

- **Play / Pause** — start or stop the simulation (Space)
- **Step** — advance one generation (→)
- **GPS** — generations per second (1–120)
- **Grid** — base grid size (128–2048, columns/rows scaled to viewport aspect ratio, rebuilds on window resize)
- **Pattern** — preset patterns or custom JavaScript expressions
- **Zoom** — scroll to zoom toward cursor
- **Pan** — click and drag
- **Restart** — R key restarts the current pattern
- **Loop detection** — when the board settles into a still life or period-2 cycle, a 5-second countdown appears and the game restarts with a fresh pattern
- **Auto-pause** — simulation pauses when the tab is hidden to save GPU/CPU, and resumes on return

## Pattern expressions

Patterns are JavaScript boolean expressions evaluated per cell with variables `row`, `col`, `rows`, `cols`. Complex patterns use block syntax:

```js
{ let r = row % 5; return r === 0 || col % 7 === 0 }
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm run clean` | Remove `dist` and `node_modules` |

## Tech stack

- **WebGPU** + **WGSL** — compute and render pipelines
- **TypeScript** — UI and GPU orchestration
- **Vite** — dev server and bundler

## License

[MIT](LICENSE)