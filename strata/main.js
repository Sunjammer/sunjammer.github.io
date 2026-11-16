import { PerformancePanel } from "./performance.js";

const canvas = document.querySelector("#canvas");
const rulers = document.querySelector("#rulers");
const notice = document.querySelector("#notice");
const controls = ["zoom-in", "zoom-out", "reset"].map((id) =>
    document.getElementById(id),
);
const toolButtons = ["pan", "circle", "brush", "polyline"].map((tool) =>
    document.getElementById(`${tool}-tool`),
);
const performanceButton = document.getElementById("performance-toggle");
const allControls = [...controls, ...toolButtons, performanceButton];
const finishButton = document.getElementById("finish-path");
const closeButton = document.getElementById("close-path");
const cancelButton = document.getElementById("cancel-path");
const svgNS = "http://www.w3.org/2000/svg";
const events = new AbortController();
const on = (target, type, handler, options = {}) =>
    target.addEventListener(type, handler, {
        ...options,
        signal: events.signal,
    });
let renderer;
let pendingFrame = 0;
let retryCount = 0;
let failed = false;
let disposed = false;
let pointer = null;
let circleMode = false;
let activeTool = "pan";
let brushPointer = null;
let dprQuery;
const pointers = new Map();
const performancePanel = new PerformancePanel({
    button: performanceButton,
    panel: document.getElementById("performance-panel"),
    readout: document.getElementById("performance-readout"),
    resetButton: document.getElementById("performance-reset"),
    getRenderer: () => renderer,
    invalidate,
    signal: events.signal,
});

function showError(error) {
    failed = true;
    notice.hidden = false;
    notice.querySelector("strong").textContent = "Canvas unavailable";
    notice.querySelector("p").textContent =
        `${error}\n\nUse a WebGPU-capable browser on localhost or HTTPS. If the WASM module is missing, run python3 strata/build_web.py first.`;
    document.getElementById("renderer").textContent = "GPU UNAVAILABLE";
    allControls.forEach((button) => {
        button.disabled = true;
    });
    for (const button of [finishButton, closeButton, cancelButton])
        button.disabled = true;
    console.error(error);
}

function svgElement(name, attributes, text) {
    const element = document.createElementNS(svgNS, name);
    for (const [key, value] of Object.entries(attributes))
        element.setAttribute(key, value);
    if (text !== undefined) element.textContent = text;
    return element;
}

function updateRulers(status, width, height) {
    const fragment = document.createDocumentFragment();
    fragment.append(
        svgElement("rect", {
            x: 0,
            y: 0,
            width,
            height: 28,
            class: "ruler-background",
        }),
    );
    fragment.append(
        svgElement("rect", {
            x: 0,
            y: 0,
            width: 28,
            height,
            class: "ruler-background",
        }),
    );
    for (const tick of status.horizontal_ticks) {
        if (tick.pixel < 32) continue;
        fragment.append(
            svgElement("line", {
                x1: tick.pixel,
                x2: tick.pixel,
                y1: 22,
                y2: 28,
            }),
        );
        fragment.append(
            svgElement("text", { x: tick.pixel + 5, y: 15 }, tick.label),
        );
    }
    for (const tick of status.vertical_ticks) {
        if (tick.pixel < 32) continue;
        fragment.append(
            svgElement("line", {
                x1: 22,
                x2: 28,
                y1: tick.pixel,
                y2: tick.pixel,
            }),
        );
        fragment.append(
            svgElement(
                "text",
                { transform: `translate(15 ${tick.pixel - 5}) rotate(-90)` },
                tick.label,
            ),
        );
    }
    fragment.append(svgElement("text", { x: 8, y: 17 }, "m"));
    rulers.replaceChildren(fragment);
}

function draw() {
    pendingFrame = 0;
    if (failed || disposed || !renderer) return;
    const measuring = performancePanel.enabled;
    const frameStarted = measuring ? performance.now() : 0;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height || document.hidden) return;
    try {
        renderer.resize(width, height, window.devicePixelRatio || 1);
        const renderStarted = measuring ? performance.now() : 0;
        const presented = renderer.render();
        const renderEnded = measuring ? performance.now() : 0;
        const status = renderer.status();
        document.getElementById("zoom").textContent =
            `${status.pixels_per_meter.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
        document.getElementById("scale-label").textContent = status.scale_label;
        document.getElementById("scale-line").style.width =
            `${status.scale_pixels}px`;
        document.getElementById("grid-label").textContent =
            `Grid ${status.minor_step.toLocaleString(undefined, { maximumSignificantDigits: 2 })} m`;
        const point = pointer
            ? renderer.screen_to_world(pointer.x, pointer.y)
            : status.center;
        document.getElementById("coordinates").textContent =
            `X ${point.x.toFixed(3)} m   Y ${point.y.toFixed(3)} m`;
        const circleCount = `${status.circle_count} ${status.circle_count === 1 ? "circle" : "circles"}`;
        const openCount = status.stroke_count - status.polygon_count;
        document.getElementById("object-count").textContent =
            status.stroke_count
                ? `${circleCount} · ${openCount} ${openCount === 1 ? "stroke" : "strokes"} · ${status.polygon_count} ${status.polygon_count === 1 ? "polygon" : "polygons"}`
                : circleCount;
        const draft = renderer.drawing_status();
        finishButton.disabled =
            draft.kind !== "polyline" || draft.point_count < 2;
        closeButton.disabled =
            draft.kind !== "polyline" || draft.point_count < 3;
        cancelButton.disabled = !draft.active;
        document.getElementById("creation-hint").textContent =
            circleMode || activeTool === "circle"
                ? `Click to create · Ø ${status.scale_label}`
                : activeTool === "brush"
                  ? "Drag to draw · Esc cancels · middle-drag pans"
                  : activeTool === "polyline"
                    ? draft.active
                        ? `${draft.point_count} vertices · Enter finish · click start to close · Esc cancel`
                        : "Click to place vertices · Enter finish · Shift+Enter close"
                    : "Hold C + click to create · B brush · P polyline";
        updateRulers(status, width, height);
        if (measuring && presented) {
            const stats = renderer.performance_stats();
            const ended = performance.now();
            performancePanel.record(
                {
                    cpu_ms: ended - frameStarted,
                    viewport_ms: renderStarted - frameStarted,
                    wasm_call_ms: renderEnded - renderStarted,
                    ui_ms: ended - renderEnded,
                },
                stats,
                ended,
            );
        }
        if (presented) {
            retryCount = 0;
            notice.hidden = true;
        } else if (++retryCount <= 30) {
            invalidate();
        }
    } catch (error) {
        showError(error);
    }
}

function invalidate() {
    if (!pendingFrame && !failed && !disposed)
        pendingFrame = requestAnimationFrame(draw);
}

function localPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function zoomCenter(factor) {
    if (!renderer || failed || brushPointer !== null) return;
    renderer.zoom(canvas.clientWidth / 2, canvas.clientHeight / 2, factor);
    invalidate();
}

function reset() {
    if (!renderer || failed || brushPointer !== null) return;
    renderer.reset();
    invalidate();
}

function pairGeometry(points) {
    const [a, b] = [...points.values()];
    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
    };
}

on(canvas, "pointerdown", (event) => {
    if (
        !renderer ||
        failed ||
        (event.pointerType === "mouse" &&
            event.button !== 0 &&
            event.button !== 1)
    )
        return;
    // Drawing tools use one contact; only Pan treats two fingers as navigation.
    if (
        brushPointer !== null ||
        ((activeTool !== "pan" || circleMode) &&
            event.pointerType === "touch" &&
            !event.isPrimary)
    )
        return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    pointer = localPoint(event);
    if (
        (circleMode || activeTool === "circle") &&
        event.button === 0 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !pointers.size
    ) {
        const { width, height } = canvas.getBoundingClientRect();
        renderer.resize(width, height, window.devicePixelRatio || 1);
        renderer.create_circle(pointer.x, pointer.y);
        invalidate();
        return;
    }

    if (
        !circleMode &&
        event.button === 0 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !pointers.size
    ) {
        const { width, height } = canvas.getBoundingClientRect();
        renderer.resize(width, height, window.devicePixelRatio || 1);
        if (activeTool === "brush") {
            if (renderer.begin_brush(pointer.x, pointer.y)) {
                brushPointer = event.pointerId;
                canvas.setPointerCapture(event.pointerId);
            }
            invalidate();
            return;
        }
        if (activeTool === "polyline") {
            renderer.polyline_click(pointer.x, pointer.y);
            invalidate();
            return;
        }
    }
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, localPoint(event));
    canvas.classList.add("dragging");
});
on(canvas, "pointermove", (event) => {
    if (!renderer || failed) return;
    pointer = localPoint(event);
    if (brushPointer === event.pointerId) {
        const samples = event.getCoalescedEvents?.() || [];
        for (const sample of samples) {
            const point = localPoint(sample);
            renderer.drawing_move(point.x, point.y);
        }
        renderer.drawing_move(pointer.x, pointer.y);
        invalidate();
        return;
    }
    const previous = pointers.get(event.pointerId);
    if (previous) {
        const oldPair = pointers.size >= 2 ? pairGeometry(pointers) : null;
        pointers.set(event.pointerId, pointer);
        if (oldPair) {
            const next = pairGeometry(pointers);
            renderer.pan(next.x - oldPair.x, next.y - oldPair.y);
            if (oldPair.distance > 0 && next.distance > 0)
                renderer.zoom(next.x, next.y, next.distance / oldPair.distance);
        } else {
            renderer.pan(pointer.x - previous.x, pointer.y - previous.y);
        }
    }
    if (brushPointer === null) renderer.drawing_move(pointer.x, pointer.y);
    invalidate();
});
on(canvas, "pointerup", (event) => {
    if (brushPointer !== event.pointerId) return;
    brushPointer = null;
    const point = localPoint(event);
    renderer.end_brush(point.x, point.y);
    if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
    invalidate();
});
const releasePointer = (event) => {
    if (brushPointer === event.pointerId) cancelDraft();
    pointers.delete(event.pointerId);
    if (!pointers.size) canvas.classList.remove("dragging");
};
for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    on(canvas, type, releasePointer);
on(canvas, "pointerleave", () => {
    if (!pointers.size) {
        pointer = null;
        renderer?.clear_drawing_cursor();
        invalidate();
    }
});
function cancelDraft() {
    const id = brushPointer;
    brushPointer = null;
    renderer?.cancel_drawing();
    if (id !== null && canvas.hasPointerCapture(id))
        canvas.releasePointerCapture(id);
    invalidate();
}
function setTool(tool) {
    if (!renderer || failed) return;
    if (tool === activeTool && !circleMode) {
        canvas.focus({ preventScroll: true });
        return;
    }
    cancelDraft();
    setCircleMode(false);
    activeTool = tool;
    canvas.classList.toggle("drawing-tool", tool !== "pan");
    toolButtons.forEach((button) =>
        button.setAttribute(
            "aria-pressed",
            String(button.id === `${tool}-tool`),
        ),
    );
    canvas.focus({ preventScroll: true });
    invalidate();
}
for (const tool of ["pan", "circle", "brush", "polyline"]) {
    on(document.getElementById(`${tool}-tool`), "click", () => setTool(tool));
}
function finishPolyline(closed) {
    if (!renderer || failed) return;
    renderer.finish_polyline(closed);
    canvas.focus({ preventScroll: true });
    invalidate();
}
on(finishButton, "click", () => finishPolyline(false));
on(closeButton, "click", () => finishPolyline(true));
on(cancelButton, "click", () => {
    cancelDraft();
    canvas.focus({ preventScroll: true });
});
function setCircleMode(active) {
    circleMode = active;
    canvas.classList.toggle("creating", active);
    invalidate();
}
on(window, "keydown", (event) => {
    if (
        !["c", "b", "p", "v"].includes(event.key.toLowerCase()) ||
        !renderer ||
        failed ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        document.querySelector("dialog[open]") ||
        event.target.closest?.(
            "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
        )
    )
        return;
    event.preventDefault();
    const key = event.key.toLowerCase();
    if (event.repeat) return;
    if (key === "c") {
        setTool("pan");
        setCircleMode(true);
    } else setTool({ b: "brush", p: "polyline", v: "pan" }[key]);
});
on(window, "keyup", (event) => {
    if (event.key.toLowerCase() === "c" || event.code === "KeyC")
        setCircleMode(false);
});
on(window, "blur", () => {
    setCircleMode(false);
    if (brushPointer !== null) cancelDraft();
    renderer?.clear_drawing_cursor();
    for (const id of pointers.keys())
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    pointers.clear();
    canvas.classList.remove("dragging");
});
on(
    canvas,
    "wheel",
    (event) => {
        if (!renderer || failed) return;
        event.preventDefault();
        pointer = localPoint(event);
        if (brushPointer !== null) return;
        const unit =
            event.deltaMode === 1
                ? 16
                : event.deltaMode === 2
                  ? canvas.clientHeight
                  : 1;
        const dx = event.deltaX * unit;
        const dy = event.deltaY * unit;
        if (event.shiftKey && !event.ctrlKey)
            renderer.pan(-dx || -dy, dx ? -dy : 0);
        else
            renderer.zoom(
                pointer.x,
                pointer.y,
                Math.exp(
                    Math.max(
                        -2,
                        Math.min(2, -dy * (event.ctrlKey ? 0.01 : 0.0015)),
                    ),
                ),
            );
        renderer.drawing_move(pointer.x, pointer.y);
        invalidate();
    },
    { passive: false },
);
on(canvas, "keydown", (event) => {
    if (!renderer || failed || event.ctrlKey || event.metaKey || event.altKey)
        return;
    const step = event.shiftKey ? 200 : 40;
    const pan = {
        ArrowLeft: [step, 0],
        ArrowRight: [-step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
    }[event.key];
    if (event.key === "Escape") {
        cancelDraft();
        setCircleMode(false);
    } else if (event.key === "Enter" && activeTool === "polyline")
        finishPolyline(event.shiftKey);
    else if (event.key === "Backspace" && activeTool === "polyline")
        renderer.undo_vertex();
    else if (pan && brushPointer === null) renderer.pan(...pan);
    else if (event.key === "+" || event.key === "=") zoomCenter(1.25);
    else if (event.key === "-" || event.key === "_") zoomCenter(0.8);
    else if (event.key === "0" || event.key === "Home") reset();
    else return;
    event.preventDefault();
    invalidate();
});
on(controls[0], "click", () => zoomCenter(1.25));
on(controls[1], "click", () => zoomCenter(0.8));
on(controls[2], "click", reset);
const help = document.getElementById("help-dialog");
on(document.getElementById("help"), "click", () => {
    setCircleMode(false);
    if (brushPointer !== null) cancelDraft();
    renderer?.clear_drawing_cursor();
    help.showModal();
});
on(help, "close", () => canvas.focus({ preventScroll: true }));

const observer = new ResizeObserver(invalidate);
observer.observe(canvas);
on(document, "visibilitychange", () => {
    if (document.hidden) {
        setCircleMode(false);
        if (brushPointer !== null) cancelDraft();
        renderer?.clear_drawing_cursor();
    }
    invalidate();
});
function watchDpr() {
    dprQuery?.removeEventListener("change", watchDpr);
    dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprQuery.addEventListener("change", watchDpr, { once: true });
    invalidate();
}
watchDpr();
on(window, "pagehide", (event) => {
    if (event.persisted) return;
    disposed = true;
    cancelAnimationFrame(pendingFrame);
    observer.disconnect();
    dprQuery?.removeEventListener("change", watchDpr);
    events.abort();
    renderer?.free();
});

try {
    const { default: init, WebCanvas } = await import("./pkg/strata.js");
    await init();
    const created = await WebCanvas.create(canvas);
    if (disposed) created.free();
    else {
        renderer = created;
        allControls.forEach((button) => {
            button.disabled = false;
        });
        invalidate();
        canvas.focus({ preventScroll: true });
    }
} catch (error) {
    if (!disposed) showError(error);
}
