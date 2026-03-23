// Detect loops up to this period (still lifes + blinker-class oscillators).
// Higher-period oscillators (pulsars etc.) run forever.
const MAX_PERIOD = 2;

interface HashEntry { hash: number; gen: number; }

export class LoopDetector {
    private entries: HashEntry[] = [];
    private pending = false;

    reset(): void {
        this.entries = [];
        this.pending = false;
    }

    /** Feed a hash with its generation. Returns true if a loop of period ≤ MAX_PERIOD is detected. */
    feed(hash: number, gen: number): boolean {
        for (const e of this.entries) {
            if (e.hash === hash && gen - e.gen <= MAX_PERIOD) {
                return true;
            }
        }
        this.entries.push({ hash, gen });
        if (this.entries.length > MAX_PERIOD + 1) {
            this.entries.shift();
        }
        return false;
    }

    get isPending(): boolean {
        return this.pending;
    }

    set isPending(v: boolean) {
        this.pending = v;
    }
}
