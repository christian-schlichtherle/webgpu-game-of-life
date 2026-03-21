// Cell states matching the electron-game-of-life:
// 0 = Void  (👻, hidden — show background)
// 1 = Fresh (😃, just born)
// 2 = Cool  (😎, surviving with 2 neighbors)
// 3 = Party (🥳, surviving with 3 neighbors)
// 4 = OMG   (😳, alive but doomed — not 2 or 3 neighbors, dies next step)
// 5 = Skull (💀, just died, 50% opacity)

export const EMOJI = ["👻", "😃", "😎", "🥳", "😳", "💀"];
export const TILE_COUNT = EMOJI.length;
export const TILE_SIZE = 64;

export function createEmojiAtlas(): ImageBitmap | HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = TILE_SIZE * TILE_COUNT;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext("2d")!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${TILE_SIZE - 8}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    EMOJI.forEach((emoji, i) => {
        ctx.fillText(emoji, i * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE / 2 + 2);
    });

    return canvas;
}
