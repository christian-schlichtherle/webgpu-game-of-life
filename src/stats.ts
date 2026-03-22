const genEl = document.getElementById("stat-gen")!;
const popEl = document.getElementById("stat-pop")!;
const gpsEl = document.getElementById("stat-gps")!;
const fpsEl = document.getElementById("stat-fps")!;

let lastGenTime = performance.now();
let lastGen = 0;
let frameCount = 0;
let lastFpsTime = performance.now();

export function updateGeneration(gen: number): void {
    genEl.textContent = `Gen: ${gen.toLocaleString()}`;
}

export function updatePopulation(pop: number): void {
    popEl.textContent = `Pop: ${pop.toLocaleString()}`;
}

export function measureGps(gen: number): void {
    const now = performance.now();
    const dt = now - lastGenTime;
    if (dt >= 1000) {
        const gps = ((gen - lastGen) / dt) * 1000;
        gpsEl.textContent = `GPS: ${Math.round(gps)}`;
        lastGenTime = now;
        lastGen = gen;
    }
}

export function measureFps(): void {
    frameCount++;
    const now = performance.now();
    const dt = now - lastFpsTime;
    if (dt >= 1000) {
        const fps = (frameCount / dt) * 1000;
        fpsEl.textContent = `FPS: ${Math.round(fps)}`;
        lastFpsTime = now;
        frameCount = 0;
    }
}

export function resetStats(): void {
    lastGenTime = performance.now();
    lastGen = 0;
    frameCount = 0;
    lastFpsTime = performance.now();
    genEl.textContent = "Gen: 0";
    popEl.textContent = "Pop: 0";
    gpsEl.textContent = "GPS: 0";
    fpsEl.textContent = "FPS: 0";
}
