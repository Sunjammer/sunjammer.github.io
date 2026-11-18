// CPU observations only. Sampling piggybacks on existing draws; no timer drives frames.
export class FrameHistory {
    constructor(limit = 120) {
        if (!Number.isInteger(limit) || limit < 1)
            throw new RangeError("History limit must be a positive integer");
        this.limit = limit;
        this.samples = [];
    }

    clear() {
        this.samples.length = 0;
    }
    get length() {
        return this.samples.length;
    }
    get latest() {
        return this.samples.at(-1);
    }

    add(sample) {
        if (
            ![
                sample.cpu_ms,
                sample.wasm_call_ms,
                sample.ui_ms,
                sample.viewport_ms,
            ].every((value) => Number.isFinite(value) && value >= 0)
        )
            return false;
        if (this.samples.length === this.limit) this.samples.shift();
        this.samples.push(sample);
        return true;
    }

    mean(select) {
        if (!this.length) return 0;
        return (
            this.samples.reduce(
                (sum, sample) => sum + (select(sample) || 0),
                0,
            ) / this.length
        );
    }

    summary() {
        if (!this.length) return { mean: 0, p50: 0, p95: 0 };
        const sorted = this.samples
            .map((sample) => sample.cpu_ms)
            .sort((a, b) => a - b);
        const percentile = (fraction) => {
            const position = (sorted.length - 1) * fraction;
            const lower = Math.floor(position);
            const upper = Math.ceil(position);
            return (
                sorted[lower] +
                (sorted[upper] - sorted[lower]) * (position - lower)
            );
        };
        return {
            mean: this.mean((sample) => sample.cpu_ms),
            p50: percentile(0.5),
            p95: percentile(0.95),
        };
    }
}

const ms = (value) => `${value.toFixed(2)} ms`;
const count = (value) => value.toLocaleString();
const bytes = (value) =>
    value < 1024
        ? `${value} B`
        : value < 1024 * 1024
          ? `${(value / 1024).toFixed(1)} KiB`
          : `${(value / (1024 * 1024)).toFixed(1)} MiB`;

export class PerformancePanel {
    constructor({
        button,
        panel,
        readout,
        resetButton,
        getRenderer,
        invalidate,
        signal,
    }) {
        Object.assign(this, {
            button,
            panel,
            readout,
            resetButton,
            getRenderer,
            invalidate,
        });
        this.enabled = false;
        this.history = new FrameHistory();
        this.lastUpdate = -Infinity;
        this.stats = null;
        button.addEventListener("click", () => this.toggle(), { signal });
        resetButton.addEventListener("click", () => this.reset(), { signal });
    }

    toggle() {
        const renderer = this.getRenderer();
        if (!renderer) return;
        try {
            renderer.set_profiling(!this.enabled);
            this.enabled = !this.enabled;
            this.history.clear();
            this.stats = null;
            this.lastUpdate = -Infinity;
            this.button.setAttribute("aria-pressed", String(this.enabled));
            this.panel.hidden = !this.enabled;
            this.readout.textContent =
                "No profiled frames yet. Move, pan, or draw to sample.";
            this.readout.dataset.frames = "0";
            this.readout.dataset.samples = "0";
            if (this.enabled) this.invalidate();
        } catch (error) {
            // Profiling failure must not disable an otherwise usable canvas.
            this.panel.hidden = false;
            this.readout.textContent = `CPU profiling unavailable: ${error}`;
        }
    }

    reset() {
        if (!this.enabled) return;
        this.getRenderer()?.reset_performance_stats();
        this.history.clear();
        this.stats = null;
        this.lastUpdate = -Infinity;
        this.readout.dataset.frames = "0";
        this.readout.dataset.samples = "0";
        this.readout.textContent =
            "No profiled frames yet. Move, pan, or draw to sample.";
        // Do not redraw just to measure the redraw: wait for the next real action.
    }

    record(sample, stats, now) {
        if (!this.enabled || !stats.enabled || !stats.latest) return;
        if (!this.history.add({ ...sample, frame: stats.latest })) return;
        this.stats = stats;
        if (this.history.length === 1 || now - this.lastUpdate >= 250) {
            this.lastUpdate = now;
            this.update();
        }
    }

    update() {
        const summary = this.history.summary();
        const last = this.history.latest.frame;
        const geometry = last.geometry;
        const average = (key) =>
            ms(this.history.mean((sample) => sample.frame[key]));
        const geometryAverage = (key) =>
            ms(this.history.mean((sample) => sample.frame.geometry[key]));
        const row = (label, value) => `${label.padEnd(24)} ${value}`;
        this.readout.dataset.frames = String(this.stats.frames);
        this.readout.dataset.samples = String(this.history.length);
        this.panel.dataset.buildProfile = this.stats.build_profile;
        this.readout.textContent = [
            `Build: ${this.stats.build_profile} · window: ${this.history.length}/${this.history.limit} submitted frames`,
            row("CPU callback mean", ms(summary.mean)),
            row(
                "CPU callback p50 / p95",
                `${ms(summary.p50)} / ${ms(summary.p95)}`,
            ),
            "",
            "Mean CPU stages (not GPU duration)",
            row(
                "Viewport / resize",
                ms(this.history.mean((sample) => sample.viewport_ms)),
            ),
            row(
                "WASM render call",
                ms(this.history.mean((sample) => sample.wasm_call_ms)),
            ),
            row("  Rust render body", average("render_ms")),
            row("  Surface acquisition", average("surface_ms")),
            row("  Uniform preparation", average("uniform_ms")),
            row("  Circle preparation", average("circle_prepare_ms")),
            row("  Draft clone", average("draft_prepare_ms")),
            row("  Graph preparation", average("graph_prepare_ms")),
            row("  Stroke preparation", average("stroke_prepare_ms")),
            row("    Sample reduction", geometryAverage("reduce_ms")),
            row("    Tessellation", geometryAverage("tessellate_ms")),
            row("    Segment packing", geometryAverage("pack_ms")),
            row("  Buffer create / upload", average("buffer_upload_ms")),
            row("  Command encoding", average("encode_ms")),
            row("  Submit / present CPU", average("submit_ms")),
            row(
                "UI / status / rulers",
                ms(this.history.mean((sample) => sample.ui_ms)),
            ),
            "",
            `Latest submitted frame #${this.stats.frames}`,
            row(
                "Scene circles / strokes",
                `${count(last.circles_scanned)} / ${count(last.scene_strokes)}`,
            ),
            row(
                "Scanned strokes",
                `${count(geometry.strokes_scanned)} (includes draft)`,
            ),
            row(
                "Raw / control points",
                `${count(geometry.raw_points)} / ${count(geometry.control_points)}`,
            ),
            row("Draft preview points", count(last.draft_points)),
            row(
                "Capsules emitted / sent",
                `${count(geometry.segments_generated)} / ${count(geometry.segments_uploaded)}`,
            ),
            row("Packing rejects", count(geometry.segments_culled)),
            row("Circle instances sent", count(last.circles_uploaded)),
            row(
                "Graph nodes / links",
                `${count(last.graph_nodes ?? 0)} / ${count(last.graph_connections ?? 0)}`,
            ),
            row("Graph wire segments", count(last.graph_wire_segments ?? 0)),
            row("CPU-supplied GPU bytes", bytes(last.uploaded_bytes)),
            row(
                "New buffers / draws",
                `${last.buffers_created} / ${last.draw_calls}`,
            ),
        ].join("\n");
    }
}
