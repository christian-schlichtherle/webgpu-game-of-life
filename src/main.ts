import { Simulation } from "./simulation";
import { PATTERNS, evaluateExpression, countAlive } from "./patterns";
import { updateGeneration, updatePopulation, measureGps, measureFps, resetStats } from "./stats";
import { AppState, setupControls, computeGridSize } from "./controls";
import { LoopDetector } from "./loop-detect";
import { maxZoomForGrid } from "./zoom-pan";

const COUNTDOWN_SECONDS = 5;

async function main() {
    if (!navigator.gpu) {
        document.getElementById("no-webgpu")!.style.display = "flex";
        return;
    }

    const canvas = document.getElementById("canvas") as HTMLCanvasElement;
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;

    const [gridW, gridH] = computeGridSize(128, canvas);

    const state: AppState = {
        sim: await Simulation.create(canvas, gridW, gridH),
        canvas,
        gridWidth: gridW,
        gridHeight: gridH,
        playing: true,
        gps: 12,
        accumulator: 0,
        lastTime: 0,
        currentExpression: PATTERNS[0].expression,
        camera: { offsetX: 0, offsetY: 0, zoom: 1, maxZoom: maxZoomForGrid(gridW, gridH) },
    };

    const loopDetector = new LoopDetector();
    const timerEl = document.getElementById("timer")!;
    let countdownEnd = 0;

    setupControls(state, () => {
        loopDetector.reset();
        countdownEnd = 0;
        timerEl.style.display = "none";
    });

    function restart() {
        countdownEnd = 0;
        timerEl.style.display = "none";
        loopDetector.reset();
        const cells = evaluateExpression(state.currentExpression, state.gridWidth, state.gridHeight);
        state.sim.uploadCells(cells);
        resetStats();
        updatePopulation(countAlive(cells));
        state.accumulator = 0;
        state.lastTime = 0;
    }

    // Game loop
    function frame(time: DOMHighResTimeStamp) {
        if (state.lastTime === 0) state.lastTime = time;
        const dt = time - state.lastTime;
        state.lastTime = time;

        // Countdown active — show remaining seconds, then restart
        if (countdownEnd > 0) {
            const remaining = Math.ceil((countdownEnd - time) / 1000);
            if (remaining > 0) {
                timerEl.innerHTML = `<span>${remaining}</span>`;
                timerEl.style.display = "flex";
            } else {
                restart();
            }
            state.sim.render();
            measureFps();
            requestAnimationFrame(frame);
            return;
        }

        if (state.playing) {
            state.accumulator += dt;
            const stepTime = 1000 / state.gps;
            const maxSteps = Math.min(Math.floor(state.accumulator / stepTime), 100);
            let gen = 0;
            for (let i = 0; i < maxSteps; i++) {
                gen = state.sim.step();
                state.accumulator -= stepTime;
            }
            if (maxSteps > 0) {
                updateGeneration(gen);
                measureGps(gen);

                // Check for loops via async hash readback
                if (!loopDetector.isPending) {
                    loopDetector.isPending = true;
                    state.sim.prepareReadback();
                    state.sim.readStats().then(({ hash, pop }) => {
                        loopDetector.isPending = false;
                        updatePopulation(pop);
                        if (loopDetector.feed(hash) && countdownEnd === 0) {
                            countdownEnd = performance.now() + COUNTDOWN_SECONDS * 1000;
                        }
                    }).catch(() => { loopDetector.isPending = false; });
                }
            }
        }

        state.sim.render();
        measureFps();
        requestAnimationFrame(frame);
    }

    // Pause when tab/window is hidden to save GPU/CPU; resume on return
    let wasPlayingBeforeHidden = false;
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            wasPlayingBeforeHidden = state.playing;
            if (state.playing) {
                state.playing = false;
                document.getElementById("play-pause")!.textContent = "Play";
            }
        } else {
            if (wasPlayingBeforeHidden) {
                state.playing = true;
                document.getElementById("play-pause")!.textContent = "Pause";
            }
            state.lastTime = 0;
            state.accumulator = 0;
        }
    });

    state.sim.render();
    requestAnimationFrame(frame);
}

main().catch((err) => {
    console.error("Fatal:", err);
    document.getElementById("no-webgpu")!.style.display = "flex";
});
