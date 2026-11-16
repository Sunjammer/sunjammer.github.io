import test from "node:test";
import assert from "node:assert/strict";
import { FrameHistory, PerformancePanel } from "./performance.js";

const sample = cpu_ms => ({ cpu_ms, wasm_call_ms: cpu_ms / 2, ui_ms: cpu_ms / 4, viewport_ms: cpu_ms / 4 });

test("rolling history is bounded and resettable", () => {
    const history = new FrameHistory();
    for (let i = 0; i < 1000; i++) assert.ok(history.add(sample(i)));
    assert.equal(history.length, 120);
    assert.equal(history.samples[0].cpu_ms, 880);
    assert.equal(history.latest.cpu_ms, 999);
    history.clear();
    assert.equal(history.length, 0);
    assert.deepEqual(history.summary(), { mean: 0, p50: 0, p95: 0 });
    assert.throws(() => new FrameHistory(0), RangeError);
});

test("summary uses sorted interpolated percentiles without reordering samples", () => {
    const history = new FrameHistory(4);
    for (const value of [4, 1, 3, 2]) history.add(sample(value));
    const result = history.summary();
    assert.equal(result.mean, 2.5);
    assert.equal(result.p50, 2.5);
    assert.ok(Math.abs(result.p95 - 3.85) < 1e-12);
    assert.deepEqual(history.samples.map(s => s.cpu_ms), [4, 1, 3, 2]);
    const one = new FrameHistory();
    one.add(sample(7));
    assert.deepEqual(one.summary(), { mean: 7, p50: 7, p95: 7 });
});

test("invalid intervals are rejected rather than polluting the window", () => {
    const history = new FrameHistory();
    for (const invalid of [NaN, Infinity, -1]) {
        for (const field of ["cpu_ms", "wasm_call_ms", "ui_ms", "viewport_ms"]) {
            assert.equal(history.add({ ...sample(1), [field]: invalid }), false);
        }
    }
    assert.equal(history.length, 0);
});

class Element extends EventTarget {
    dataset = {};
    attributes = new Map();
    hidden = true;
    textContent = "";
    setAttribute(name, value) { this.attributes.set(name, value); }
}

function stats() {
    const frame = {
        surface_ms: 0, uniform_ms: 0, circle_prepare_ms: 0, draft_prepare_ms: 0,
        stroke_prepare_ms: 0, buffer_upload_ms: 0, encode_ms: 0, submit_ms: 0, render_ms: 0,
        circles_scanned: 0, circles_uploaded: 0, scene_strokes: 0, draft_points: 0,
        uploaded_bytes: 96, buffers_created: 0, draw_calls: 1,
        geometry: {
            strokes_scanned: 0, raw_points: 0, control_points: 0,
            segments_generated: 0, segments_uploaded: 0, segments_culled: 0,
            reduce_ms: 0, tessellate_ms: 0, pack_ms: 0,
        },
    };
    return { enabled: true, frames: 1, latest: frame, build_profile: "debug" };
}

test("panel is opt-in, throttled, and cannot create a self-measuring render loop", () => {
    let redraws = 0;
    let resets = 0;
    const enabled = [];
    const elements = { button: new Element(), panel: new Element(), readout: new Element(), resetButton: new Element() };
    const renderer = { set_profiling: value => enabled.push(value), reset_performance_stats: () => resets++ };
    const panel = new PerformancePanel({ ...elements, getRenderer: () => renderer, invalidate: () => redraws++ });
    panel.record(sample(1), stats(), 0);
    assert.equal(panel.history.length, 0);
    assert.deepEqual(enabled, []);
    panel.toggle();
    assert.deepEqual(enabled, [true]);
    assert.equal(elements.panel.hidden, false);
    assert.equal(redraws, 1);
    panel.record(sample(4), stats(), 0);
    assert.equal(elements.readout.dataset.frames, "1");
    assert.match(elements.readout.textContent, /not GPU duration/);
    panel.record(sample(8), { ...stats(), frames: 2 }, 100);
    assert.equal(elements.readout.dataset.frames, "1", "refreshes are throttled");
    panel.record(sample(6), { ...stats(), frames: 3 }, 300);
    assert.equal(elements.readout.dataset.frames, "3");
    assert.equal(redraws, 1, "collecting and displaying samples never requests a render");
    panel.reset();
    assert.equal(resets, 1);
    assert.equal(panel.history.length, 0);
    assert.equal(elements.readout.dataset.frames, "0");
    assert.equal(redraws, 1, "reset waits for real activity");
    panel.toggle();
    panel.record(sample(1), stats(), 500);
    assert.deepEqual(enabled, [true, false]);
    assert.equal(elements.panel.hidden, true);
    assert.equal(panel.history.length, 0);
    assert.equal(redraws, 1);
});

test("an unavailable profiler does not throw into the canvas host", () => {
    const elements = { button: new Element(), panel: new Element(), readout: new Element(), resetButton: new Element() };
    const panel = new PerformancePanel({ ...elements, getRenderer: () => ({ set_profiling() { throw new Error("no clock"); } }), invalidate() { assert.fail("must not render"); } });
    assert.doesNotThrow(() => panel.toggle());
    assert.equal(panel.enabled, false);
    assert.match(elements.readout.textContent, /no clock/);
});
