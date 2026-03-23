import {Simulation} from "./simulation";
import {countAlive, evaluateExpression, setupPatternSelector} from "./patterns";
import {resetStats, updateGeneration, updatePopulation} from "./stats";
import {Camera, maxZoomForGrid, setupZoomPan} from "./zoom-pan";

export interface AppState {
    sim: Simulation;
    canvas: HTMLCanvasElement;
    gridWidth: number;
    gridHeight: number;
    playing: boolean;
    gps: number;
    accumulator: number;
    lastTime: number;
    currentExpression: string;
    camera: Camera;
}

export function computeGridSize(baseSize: number, canvas: HTMLCanvasElement): [number, number] {
    const aspect = canvas.clientWidth / canvas.clientHeight;
    if (aspect >= 1) {
        return [Math.round(baseSize * aspect), baseSize];
    }
    return [baseSize, Math.round(baseSize / aspect)];
}

export function setupControls(state: AppState, onPatternChange?: () => void): void {
    const errorEl = document.getElementById("pattern-error")!;
    const playPauseBtn = document.getElementById("play-pause")!;
    const stepBtn = document.getElementById("step")!;
    const gpsSlider = document.getElementById("gps") as HTMLInputElement;
    const gpsValue = document.getElementById("gps-value")!;
    const gridSelect = document.getElementById("grid-size") as HTMLSelectElement;

    function applyPattern() {
        errorEl.textContent = "";
        try {
            const cells = evaluateExpression(state.currentExpression, state.gridWidth, state.gridHeight);
            state.sim.uploadCells(cells);
            resetStats();
            updatePopulation(countAlive(cells));
        } catch (e) {
            errorEl.textContent = (e as Error).message;
            return;
        }
        state.accumulator = 0;
        state.lastTime = 0;
        onPatternChange?.();
    }

    function togglePlay() {
        state.playing = !state.playing;
        playPauseBtn.textContent = state.playing ? "Pause" : "Play";
        if (!state.playing) onPatternChange?.();
    }

    let popPending = false;

    function stepOnce() {
        const gen = state.sim.step();
        updateGeneration(gen);
        state.sim.render();
        if (!popPending) {
            popPending = true;
            state.sim.prepareReadback();
            state.sim.readStats().then(({ pop }) => {
                popPending = false;
                updatePopulation(pop);
            }).catch(() => { popPending = false; });
        }
    }

    playPauseBtn.addEventListener("click", togglePlay);

    stepBtn.addEventListener("click", stepOnce);

    gpsSlider.addEventListener("input", () => {
        state.gps = Number(gpsSlider.value);
        gpsValue.textContent = String(state.gps);
    });

    function updateGridLabels() {
        for (const option of gridSelect.options) {
            const [w, h] = computeGridSize(Number(option.value), state.canvas);
            option.textContent = `${w} \u00d7 ${h}`;
        }
    }
    updateGridLabels();

    gridSelect.addEventListener("change", () => {
        const base = Number(gridSelect.value);
        [state.gridWidth, state.gridHeight] = computeGridSize(base, state.canvas);
        state.sim.resize(state.canvas, state.gridWidth, state.gridHeight);
        state.camera.offsetX = 0;
        state.camera.offsetY = 0;
        state.camera.zoom = 1;
        state.camera.maxZoom = maxZoomForGrid(state.gridWidth, state.gridHeight);
        state.sim.setCamera(0, 0, 1);
        applyPattern();
    });

    setupPatternSelector((expr) => {
        state.currentExpression = expr;
        applyPattern();
    });

    setupZoomPan(state.canvas, state.camera, (cam) => {
        state.sim.setCamera(cam.offsetX, cam.offsetY, cam.zoom);
    });

    window.addEventListener("resize", () => {
        state.canvas.width = window.innerWidth * devicePixelRatio;
        state.canvas.height = window.innerHeight * devicePixelRatio;
        const base = Number(gridSelect.value);
        [state.gridWidth, state.gridHeight] = computeGridSize(base, state.canvas);
        state.sim.resize(state.canvas, state.gridWidth, state.gridHeight);
        state.camera.offsetX = 0;
        state.camera.offsetY = 0;
        state.camera.zoom = 1;
        state.camera.maxZoom = maxZoomForGrid(state.gridWidth, state.gridHeight);
        state.sim.setCamera(0, 0, 1);
        updateGridLabels();
        applyPattern();
    });

    document.addEventListener("keydown", (e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
        if (e.code === "Space") {
            e.preventDefault();
            togglePlay();
        } else if (e.code === "ArrowRight") {
            stepOnce();
        } else if (e.code === "KeyR") {
            applyPattern();
        }
    });

    function handleDeviceLost(info: GPUDeviceLostInfo) {
        if (info.reason === "destroyed") return;
        console.error("GPU device lost:", info.message);
        state.playing = false;
        playPauseBtn.textContent = "Play";
        document.getElementById("no-webgpu")!.style.display = "flex";
    }
    state.sim.device.lost.then(handleDeviceLost);

    applyPattern();
}
