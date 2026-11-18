// Time-based CSS-pixel navigation, independent of OS key-repeat and camera zoom.
export class KeyboardPan {
    constructor() {
        this.keys = new Set();
        this.fast = false;
        this.last = null;
    }

    get direction() {
        return {
            x: Number(this.keys.has("a")) - Number(this.keys.has("d")),
            y: Number(this.keys.has("w")) - Number(this.keys.has("s")),
        };
    }

    get moving() {
        const { x, y } = this.direction;
        return x !== 0 || y !== 0;
    }

    press(key, now) {
        if (!["w", "a", "s", "d"].includes(key) || this.keys.has(key)) return;
        const moving = this.moving;
        this.keys.add(key);
        if (!moving) this.last = now;
    }

    release(key, now) {
        const moving = this.moving;
        this.keys.delete(key);
        if (!this.moving) this.last = null;
        else if (!moving) this.last = now;
    }

    clear() {
        this.keys.clear();
        this.last = null;
        this.fast = false;
    }

    step(now) {
        if (!this.moving || !Number.isFinite(now)) {
            this.last = null;
            return { x: 0, y: 0 };
        }
        // A delayed/background frame must not produce a large camera jump.
        const seconds = this.last === null ? 0 : Math.min(50, Math.max(0, now - this.last)) / 1000;
        this.last = now;
        const { x, y } = this.direction;
        const distance = (this.fast ? 3000 : 600) * seconds / Math.hypot(x, y);
        return { x: x * distance, y: y * distance };
    }
}
