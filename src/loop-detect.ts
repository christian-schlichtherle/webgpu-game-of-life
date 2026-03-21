const WINDOW_SIZE = 30;

export class LoopDetector {
    private hashes: number[] = [];
    private pending = false;

    reset(): void {
        this.hashes = [];
        this.pending = false;
    }

    feed(hash: number): boolean {
        this.hashes.push(hash);
        if (this.hashes.length > WINDOW_SIZE) {
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
