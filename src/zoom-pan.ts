/** Cells visible along the largest grid axis at maximum zoom. */
const CELLS_AT_MAX_ZOOM = 10;

export function maxZoomForGrid(gridWidth: number, gridHeight: number): number {
    return Math.max(gridWidth, gridHeight) / CELLS_AT_MAX_ZOOM;
}

export interface Camera {
    offsetX: number;
    offsetY: number;
    zoom: number;
    maxZoom: number;
}

export function setupZoomPan(
    canvas: HTMLCanvasElement,
    camera: Camera,
    onUpdate: (cam: Camera) => void,
): void {
    function clampOffset() {
        const limit = 0.5 - 0.5 / camera.zoom;
        camera.offsetX = Math.max(-limit, Math.min(camera.offsetX, limit));
        camera.offsetY = Math.max(-limit, Math.min(camera.offsetY, limit));
    }

    // Wheel to zoom toward cursor
    canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const oldZoom = camera.zoom;
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(1.0, Math.min(camera.zoom * factor, camera.maxZoom));
        // Cursor position in UV space (0–1)
        const cursorU = e.offsetX / canvas.clientWidth;
        const cursorV = e.offsetY / canvas.clientHeight;
        // Adjust offset so the world point under the cursor stays fixed
        camera.offsetX += (cursorU - 0.5) * (1 / oldZoom - 1 / newZoom);
        camera.offsetY += (cursorV - 0.5) * (1 / oldZoom - 1 / newZoom);
        camera.zoom = newZoom;
        clampOffset();
        onUpdate(camera);
    }, { passive: false });

    // Drag to pan
    let dragging = false;
    let startX = 0;
    let startY = 0;

    canvas.addEventListener("mousedown", (e) => {
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
    });

    canvas.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const dx = (e.clientX - startX) / canvas.width / camera.zoom;
        const dy = (e.clientY - startY) / canvas.height / camera.zoom;
        camera.offsetX -= dx;
        camera.offsetY -= dy;
        startX = e.clientX;
        startY = e.clientY;
        clampOffset();
        onUpdate(camera);
    });

    const stopDrag = () => { dragging = false; };
    canvas.addEventListener("mouseup", stopDrag);
    canvas.addEventListener("mouseleave", stopDrag);

    // Touch: pinch to zoom, drag to pan
    let lastTouchDist = 0;
    let lastTouchCenter = { x: 0, y: 0 };

    canvas.addEventListener("touchstart", (e) => {
        if (e.touches.length === 1) {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            dragging = true;
        } else if (e.touches.length === 2) {
            dragging = false;
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            lastTouchDist = Math.hypot(dx, dy);
            lastTouchCenter = {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
            };
        }
    }, { passive: true });

    canvas.addEventListener("touchmove", (e) => {
        e.preventDefault();
        if (e.touches.length === 1 && dragging) {
            const dx = (e.touches[0].clientX - startX) / canvas.width / camera.zoom;
            const dy = (e.touches[0].clientY - startY) / canvas.height / camera.zoom;
            camera.offsetX -= dx;
            camera.offsetY -= dy;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            clampOffset();
            onUpdate(camera);
        } else if (e.touches.length === 2) {
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            const dist = Math.hypot(dx, dy);
            if (lastTouchDist > 0) {
                const oldZoom = camera.zoom;
                const newZoom = Math.max(1.0, Math.min(camera.zoom * (dist / lastTouchDist), camera.maxZoom));
                const rect = canvas.getBoundingClientRect();
                const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const cursorU = (cx - rect.left) / rect.width;
                const cursorV = (cy - rect.top) / rect.height;
                camera.offsetX += (cursorU - 0.5) * (1 / oldZoom - 1 / newZoom);
                camera.offsetY += (cursorV - 0.5) * (1 / oldZoom - 1 / newZoom);
                camera.zoom = newZoom;
                clampOffset();
                onUpdate(camera);
            }
            lastTouchDist = dist;
        }
    }, { passive: false });

    canvas.addEventListener("touchend", () => {
        dragging = false;
        lastTouchDist = 0;
    }, { passive: true });
}
