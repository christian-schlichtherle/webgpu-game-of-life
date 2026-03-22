// Detect loops up to this period (still lifes + blinker-class oscillators).
// Window holds period + 1 entries, matching the electron-game-of-life approach.
const MAX_PERIOD = 2;

export class LoopDetector {
    private hashes: number[] = [];
    private pending = false;

    reset(): void {
        this.hashes = [];
        this.pending = false;
    }

    feed(hash: number): boolean {
        this.hashes.push(hash);
        if (this.hashes.length > MAX_PERIOD + 1) {
            this.hashes.shift();
        }
        return new Set(this.hashes).size < this.hashes.length;
    }

    get isPending(): boolean {
        return this.pending;
    }

    set isPending(v: boolean) {
        this.pending = v;
    }
}
