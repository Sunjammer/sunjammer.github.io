// Optional browser integration test; see ../README.md. No server is left running.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(
    process.argv[2]
        ? pathToFileURL(resolve(process.argv[2])).href
        : "playwright"
);
const root = dirname(fileURLToPath(import.meta.url));
const types = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".wasm": "application/wasm",
};
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(
            new URL(request.url, "http://localhost").pathname,
        );
        const file = resolve(
            root,
            `.${pathname === "/" ? "/index.html" : pathname}`,
        );
        if (!file.startsWith(root + sep)) throw new Error("Invalid path");
        const bytes = await readFile(file);
        response.writeHead(200, {
            "Content-Type": types[extname(file)] || "application/octet-stream",
        });
        response.end(bytes);
    } catch {
        response.writeHead(404);
        response.end();
    }
});
let browser;
try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({
        headless: true,
        channel: "chromium",
        args: [
            "--no-sandbox",
            "--enable-unsafe-webgpu",
            "--use-angle=swiftshader",
            "--use-webgpu-adapter=swiftshader",
            "--enable-features=Vulkan",
            "--use-vulkan=swiftshader",
            "--disable-vulkan-surface",
        ],
    });
    const context = await browser.newContext({
        viewport: { width: 1200, height: 800 },
        deviceScaleFactor: 2,
        hasTouch: true,
    });

    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(url);
    await page.waitForFunction(
        () => document.querySelector("#notice").hidden,
        null,
        {
            timeout: 30_000,
        },
    );
    assert.equal(await page.locator("#zoom").textContent(), "100%");
    assert.equal(await page.locator("#scale-label").textContent(), "1 m");
    assert.ok((await page.locator("#rulers text").count()) > 6);
    const backing = await page
        .locator("#canvas")
        .evaluate((c) => ({ width: c.width, css: c.clientWidth }));
    assert.equal(backing.width, backing.css * 2);

    // The world point under the pointer stays fixed while zooming.
    await page.mouse.move(730, 330);
    await page.waitForTimeout(100);
    const anchor = await page.locator("#coordinates").textContent();
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(250);
    assert.equal(await page.locator("#coordinates").textContent(), anchor);
    assert.notEqual(
        await page.locator("#zoom").textContent(),
        "100%",
        JSON.stringify({
            errors,
            notice: await page.locator("#notice").textContent(),
            coordinates: anchor,
        }),
    );
    const zoom = await page.locator("#zoom").textContent();
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#zoom").textContent(), zoom);

    await page.locator("#reset").click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#zoom").textContent(), "100%");
    await page.mouse.move(500, 350);
    await page.mouse.down();
    await page.mouse.move(600, 400, { steps: 5 });
    await page.mouse.up();
    // Move outside the canvas so the HUD reports the camera center.
    await page.mouse.move(500, 20);
    await page.waitForTimeout(100);
    assert.match(
        await page.locator("#coordinates").textContent(),
        /X -1\.000 m\s+Y 0\.500 m/,
    );

    await page.locator("#canvas").focus();
    await page.keyboard.press("0");
    await page.waitForTimeout(100);
    assert.match(
        await page.locator("#coordinates").textContent(),
        /X 0\.000 m\s+Y 0\.000 m/,
    );
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(100);
    assert.match(
        await page.locator("#coordinates").textContent(),
        /X 0\.400 m/,
    );
    await page.locator("#help").click();
    assert.ok(await page.locator("#help-dialog").evaluate((d) => d.open));
    await page.getByRole("button", { name: "Back to canvas" }).click();
    await page.waitForFunction(
        () => document.querySelector("#canvas") === document.activeElement,
    );

    // Exercise touch pinch through browser input, not synthetic pointer events.
    await page.keyboard.press("0");
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
            { x: 400, y: 300, id: 1 },
            { x: 600, y: 300, id: 2 },
        ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
            { x: 350, y: 300, id: 1 },
            { x: 650, y: 300, id: 2 },
        ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
    });
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#zoom").textContent(), "150%");
    assert.deepEqual(errors, []);

    // C is a held tool, not a toggle; creation must not initiate a pan.
    await page.keyboard.press("0");
    await page.mouse.click(700, 320);
    await page.waitForTimeout(100);
    assert.equal(
        await page.locator("#object-count").textContent(),
        "0 circles",
    );

    await page.keyboard.down("c");
    assert.ok(
        await page
            .locator("#canvas")
            .evaluate((c) => c.classList.contains("creating")),
    );
    await page.mouse.click(700, 320);
    await page.waitForFunction(
        () =>
            document.querySelector("#object-count").textContent === "1 circle",
    );

    await page.keyboard.down("c"); // Key repeat alone cannot create objects.
    await page.mouse.move(800, 400);
    await page.mouse.down();
    await page.mouse.move(850, 450);
    await page.mouse.up();
    await page.keyboard.up("c");
    await page.mouse.move(500, 20);
    await page.waitForTimeout(100);
    assert.equal(
        await page.locator("#object-count").textContent(),
        "2 circles",
    );
    assert.match(
        await page.locator("#coordinates").textContent(),
        /X 0\.000 m\s+Y 0\.000 m/,
    );
    assert.equal(
        await page
            .locator("#canvas")
            .evaluate((c) => c.classList.contains("creating")),
        false,
    );
    await page.mouse.click(700, 320);
    await page.waitForTimeout(100);
    assert.equal(
        await page.locator("#object-count").textContent(),
        "2 circles",
    );
    assert.deepEqual(errors, []);
    for (
        let attempt = 0;
        attempt < 12 &&
        (await page.locator("#scale-label").textContent()) !== "10 m";
        attempt++
    ) {
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(100);
    }
    assert.deepEqual(errors, []);
    assert.equal(await page.locator("#scale-label").textContent(), "10 m");
    await page.waitForFunction(
        () => document.querySelector("#scale-label").textContent === "10 m",
    );
    await page.keyboard.down("c");
    await page.mouse.click(700, 320);
    await page.keyboard.up("c");
    await page.waitForFunction(
        () =>
            document.querySelector("#object-count").textContent === "3 circles",
    );
    // Losing focus clears a held tool even if its keyup never arrives.
    await page.keyboard.down("c");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    assert.equal(
        await page
            .locator("#canvas")
            .evaluate((c) => c.classList.contains("creating")),
        false,
    );
    await page.keyboard.up("c");

    // Every primitive can be selected and completed from the toolbar.
    await page.locator("#circle-tool").click();
    await page.mouse.click(650, 350);
    await page.waitForFunction(
        () =>
            document.querySelector("#object-count").textContent === "4 circles",
    );
    await page.locator("#pan-tool").click();
    await page.locator("#reset").click();
    const waitObjects = async (open, closed) => {
        const expected = `4 circles · ${open} ${open === 1 ? "stroke" : "strokes"} · ${closed} ${closed === 1 ? "polygon" : "polygons"}`;
        await page.waitForFunction(
            (text) =>
                document.querySelector("#object-count").textContent === text,
            expected,
        );
    };
    await page.locator("#zoom-in").click();
    await page.locator("#brush-tool").click();
    assert.equal(
        await page.locator("#brush-tool").getAttribute("aria-pressed"),
        "true",
    );
    await page.mouse.move(400, 400);
    await page.mouse.down();
    await page.mouse.move(550, 450, { steps: 8 });
    await page.keyboard.press("b"); // Reselecting the active tool must keep its draft.
    const brushZoom = await page.locator("#zoom").textContent();
    await page.keyboard.press("-");
    await page.keyboard.press("0");
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#zoom").textContent(), brushZoom);
    await page.waitForFunction(
        () => !document.querySelector("#cancel-path").disabled,
    );
    assert.equal(
        await page.locator("#object-count").textContent(),
        "4 circles",
        "draft is not a scene object",
    );
    await page.mouse.up();
    await waitObjects(1, 0);
    await page.locator("#reset").click();
    await page.mouse.click(600, 450); // Single-point strokes are dots.
    await waitObjects(2, 0);
    await page.mouse.move(400, 400);
    await page.mouse.down();
    await page.mouse.move(550, 450);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await waitObjects(2, 0);
    await page.mouse.move(500, 20);
    await page.waitForTimeout(100);
    assert.match(
        await page.locator("#coordinates").textContent(),
        /X 0\.000 m\s+Y 0\.000 m/,
    );

    await page.locator("#polyline-tool").click();
    await page.mouse.click(400, 400);
    await page.mouse.click(550, 400);
    await page.waitForFunction(
        () => !document.querySelector("#finish-path").disabled,
    );
    await page.keyboard.press("Backspace");
    await page.waitForFunction(
        () => document.querySelector("#finish-path").disabled,
    );
    await page.mouse.click(550, 400);
    await page.keyboard.press("p");
    await page.locator("#polyline-tool").click(); // Reselecting also preserves the draft.
    await page.mouse.move(600, 500); // Hover isn't an additional committed vertex.
    await page.locator("#finish-path").click();
    await waitObjects(3, 0);
    await page.mouse.click(400, 400);
    await page.mouse.click(550, 400);
    await page.mouse.click(550, 500);
    await page.mouse.click(405, 405); // Close by clicking near the first vertex.
    await waitObjects(3, 1);
    await page.mouse.click(400, 400);
    await page.mouse.click(550, 400);
    await page.mouse.click(550, 500);
    await page.locator("#close-path").click();
    await waitObjects(3, 2);
    await page.mouse.click(400, 400);
    await page.mouse.click(550, 400);
    await page.locator("#cancel-path").click();
    await waitObjects(3, 2);
    await page.mouse.click(400, 400);
    await page.mouse.click(550, 400);
    await page.locator("#pan-tool").click(); // Switching tools discards only the draft.
    await page.waitForFunction(
        () => document.querySelector("#cancel-path").disabled,
    );
    await waitObjects(3, 2);
    assert.deepEqual(errors, []);

    // Read pixels directly from the surface: headless software compositors can
    // return black canvas screenshots even when WebGPU renders correctly.
    const geometry = await page.evaluate(async () => {
        const { WebCanvas } = await import("./pkg/strata.js");
        const canvas = document.createElement("canvas");
        const view = await WebCanvas.create(canvas);
        try {
            view.resize(800, 600, 2);
            const context = canvas.getContext("webgpu");
            const configuration = context.getConfiguration();
            const device = configuration.device;
            context.configure({
                ...configuration,
                usage:
                    GPUTextureUsage.RENDER_ATTACHMENT |
                    GPUTextureUsage.COPY_SRC,
            });
            const pixel = async (x = 1000, y = 550) => {
                view.render();
                const buffer = device.createBuffer({
                    size: 256,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                });
                const encoder = device.createCommandEncoder();
                encoder.copyTextureToBuffer(
                    {
                        texture: context.getCurrentTexture(),
                        origin: { x, y },
                    },
                    { buffer, bytesPerRow: 256 },
                    { width: 1, height: 1 },
                );
                device.queue.submit([encoder.finish()]);
                await buffer.mapAsync(GPUMapMode.READ);
                const rgba = [
                    ...new Uint8Array(buffer.getMappedRange()).slice(0, 4),
                ];
                buffer.unmap();
                buffer.destroy();
                return rgba;
            };
            const before = await pixel();
            view.create_circle(450, 275);
            const after = await pixel();
            const first = view.circles();
            view.zoom(400, 300, 0.1);
            view.create_circle(300, 350);
            const both = view.circles();
            view.pan(50, -20);
            view.reset();
            const afterReset = view.circles();
            const beforeStroke = await pixel(1100, 800);
            view.begin_brush(450, 400);
            view.drawing_move(650, 400);
            const previewPixel = await pixel(1100, 800);
            const draftCount = view.strokes().length;
            view.cancel_drawing();
            const cancelledPixel = await pixel(1100, 800);
            view.begin_brush(450, 400);
            view.drawing_move(650, 400);
            view.end_brush(650, 400);
            const strokePixel = await pixel(1100, 800);
            const strokes = view.strokes();
            view.zoom(400, 300, 0.25);
            view.pan(20, -10);
            const afterNavigation = view.strokes();
            view.reset();
            view.polyline_click(400, 300);
            view.polyline_click(500, 300);
            view.polyline_click(500, 200);
            view.polyline_click(404, 304);
            const polygon = view.strokes()[1];
            const beforeSmooth = await pixel(1100, 650);
            const beforeControl = await pixel(1100, 600);
            view.begin_brush(450, 400);
            view.drawing_move(550, 300);
            view.end_brush(650, 400);
            const smoothPixel = await pixel(1100, 650);
            const controlPixel = await pixel(1100, 600);
            const smoothSource = view.strokes()[2];
            view.zoom(550, 325, 4);
            const zoomedSmoothPixel = await pixel(1100, 650);
            const zoomedSmoothSource = view.strokes()[2];
            view.reset();
            view.zoom(500, 412.5, 16);
            const stairOutsideBefore = await pixel(1000, 882);
            const stairCenterBefore = await pixel(1000, 825);
            view.reset();
            view.begin_brush(450, 400);
            for (let i = 1; i <= 100; i++) {
                view.drawing_move(450 + 2 * i, 400 + Math.round(0.5 * i));
            }
            view.end_brush(650, 450);
            const staircaseSource = view.strokes()[3];
            view.zoom(500, 412.5, 16);
            const stairOutsideAfter = await pixel(1000, 882);
            const stairCenterAfter = await pixel(1000, 825);
            const profilingOff = view.performance_stats();
            view.set_profiling(true);
            const profilingEmpty = view.performance_stats();
            view.render();
            const profilingFrame = view.performance_stats();
            const profilingRead = view.performance_stats();
            view.reset_performance_stats();
            const profilingReset = view.performance_stats();
            view.begin_brush(400, 300);
            view.render();
            const profilingDraft = view.performance_stats();
            view.cancel_drawing();
            view.set_profiling(false);
            view.render();
            const profilingDisabled = view.performance_stats();
            return {
                first,
                both,
                afterReset,
                before,
                after,
                beforeStroke,
                previewPixel,
                cancelledPixel,
                strokePixel,
                draftCount,
                strokes,
                afterNavigation,
                polygon,
                beforeSmooth,
                beforeControl,
                smoothPixel,
                controlPixel,
                smoothSource,
                zoomedSmoothPixel,
                zoomedSmoothSource,
                stairOutsideBefore,
                stairOutsideAfter,
                stairCenterBefore,
                stairCenterAfter,
                staircaseSource,
                profilingOff,
                profilingEmpty,
                profilingFrame,
                profilingRead,
                profilingReset,
                profilingDraft,
                profilingDisabled,
            };
        } finally {
            view.free();
        }
    });
    assert.deepEqual(geometry.first, [
        { center: { x: 0.5, y: 0.25 }, diameter: 1 },
    ]);
    assert.deepEqual(geometry.both[1], {
        center: { x: -10, y: -5 },
        diameter: 10,
    });
    assert.deepEqual(geometry.afterReset, geometry.both);
    assert.equal(geometry.draftCount, 0);
    assert.notDeepEqual(
        geometry.previewPixel,
        geometry.beforeStroke,
        "draft must render",
    );
    assert.deepEqual(
        geometry.cancelledPixel,
        geometry.beforeStroke,
        "cancelling restores the scene",
    );
    assert.notDeepEqual(
        geometry.strokePixel,
        geometry.beforeStroke,
        "committed segment must render",
    );
    assert.deepEqual(geometry.strokes, [
        {
            points: [
                { x: 0.5, y: -1 },
                { x: 2.5, y: -1 },
            ],
            width: 0.03,
            closed: false,
            interpolation: "smooth",
        },
    ]);
    assert.deepEqual(geometry.afterNavigation, geometry.strokes);
    assert.deepEqual(geometry.polygon, {
        points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
        ],
        width: 0.03,
        closed: true,
        interpolation: "linear",
    });
    assert.notDeepEqual(
        geometry.smoothPixel,
        geometry.beforeSmooth,
        "brush draws the smooth curve, not the sample chords",
    );
    assert.deepEqual(
        geometry.controlPixel,
        geometry.beforeControl,
        "smooth brush does not force a kink through its middle sample",
    );
    assert.deepEqual(
        geometry.zoomedSmoothPixel,
        geometry.smoothPixel,
        "curve stays under the zoom anchor",
    );
    assert.deepEqual(geometry.zoomedSmoothSource, geometry.smoothSource);
    assert.equal(
        geometry.staircaseSource.points.length,
        101,
        "noise reduction must retain the raw samples",
    );
    assert.notDeepEqual(
        geometry.stairCenterAfter,
        geometry.stairCenterBefore,
        "denoised stroke must render at 16x zoom",
    );
    assert.deepEqual(
        geometry.stairOutsideAfter,
        geometry.stairOutsideBefore,
        "quantized sample steps must not bulge the magnified contour",
    );
    assert.deepEqual(geometry.smoothSource, {
        points: [
            { x: 0.5, y: -1 },
            { x: 1.5, y: 0 },
            { x: 2.5, y: -1 },
        ],
        width: 0.03,
        closed: false,
        interpolation: "smooth",
    });
    assert.notDeepEqual(
        geometry.before,
        geometry.after,
        "circle outline must change rendered pixels",
    );

    assert.deepEqual(errors, []);

    assert.equal(geometry.profilingOff.enabled, false);
    assert.equal(geometry.profilingOff.frames, 0);
    assert.equal(geometry.profilingOff.latest, null);
    assert.equal(geometry.profilingEmpty.latest, null);
    assert.equal(geometry.profilingFrame.frames, 1);
    assert.equal(
        geometry.profilingRead.frames,
        1,
        "reading metrics cannot render or advance the counter",
    );
    assert.equal(geometry.profilingReset.frames, 0);
    assert.equal(geometry.profilingReset.latest, null);
    assert.equal(geometry.profilingDisabled.frames, 0);
    assert.equal(geometry.profilingDisabled.latest, null);
    const measured = geometry.profilingFrame.latest;
    assert.equal(measured.scene_strokes, 4);
    assert.equal(measured.circles_scanned, 2);
    assert.equal(measured.geometry.strokes_scanned, 4);
    assert.equal(measured.geometry.raw_points, 109);
    assert.equal(measured.geometry.control_points, 10);
    assert.equal(
        measured.geometry.segments_generated,
        measured.geometry.segments_uploaded + measured.geometry.segments_culled,
    );
    assert.equal(
        measured.uploaded_bytes,
        96 +
            measured.circles_uploaded * 16 +
            measured.geometry.segments_uploaded * 32,
    );
    assert.equal(measured.draw_calls, 1 + measured.buffers_created);
    assert.equal(geometry.profilingDraft.latest.draft_points, 1);
    assert.equal(geometry.profilingDraft.latest.geometry.raw_points, 110);
    assert.equal(geometry.profilingDraft.latest.geometry.strokes_scanned, 5);
    for (const stage of [measured, measured.geometry]) {
        for (const [name, value] of Object.entries(stage)) {
            if (name.endsWith("_ms"))
                assert.ok(
                    Number.isFinite(value) && value >= 0,
                    `${name} is a finite CPU duration`,
                );
        }
    }

    // Profiling is opt-in, bounded, resettable, and does not keep an idle canvas drawing.
    assert.equal(await page.locator("#performance-panel").isVisible(), false);
    await page.locator("#performance-toggle").click();
    await page.waitForFunction(
        () =>
            Number(
                document.querySelector("#performance-readout").dataset.samples,
            ) > 0,
    );
    assert.equal(await page.locator("#performance-panel").isVisible(), true);
    assert.match(
        await page.locator("#performance-readout").textContent(),
        /CPU callback p50 \/ p95/,
    );
    assert.match(
        await page.locator("#performance-readout").textContent(),
        /Sample reduction/,
    );
    assert.doesNotMatch(
        await page.locator("#performance-readout").textContent(),
        /NaN|Infinity/,
    );
    const idleFrames = await page
        .locator("#performance-readout")
        .getAttribute("data-frames");
    await page.waitForTimeout(700);
    assert.equal(
        await page.locator("#performance-readout").getAttribute("data-frames"),
        idleFrames,
    );
    await page.mouse.move(250, 500);
    await page.waitForFunction(
        (frames) =>
            Number(
                document.querySelector("#performance-readout").dataset.frames,
            ) > Number(frames),
        idleFrames,
    );
    await page.locator("#performance-reset").hover();
    await page.waitForTimeout(100);
    await page.locator("#performance-reset").click();
    assert.equal(
        await page.locator("#performance-readout").getAttribute("data-samples"),
        "0",
    );
    await page.locator("#performance-toggle").click();
    assert.equal(await page.locator("#performance-panel").isVisible(), false);
    assert.equal(
        await page.locator("#performance-toggle").getAttribute("aria-pressed"),
        "false",
    );
    assert.deepEqual(errors, []);

    // The unsupported path must show a useful notice rather than a blank viewport.
    const unsupported = await context.newPage();
    await unsupported.addInitScript(() =>
        Object.defineProperty(navigator, "gpu", { get: () => undefined }),
    );
    await unsupported.goto(url);
    await unsupported.waitForFunction(
        () =>
            document.querySelector("#notice strong").textContent ===
            "Canvas unavailable",
    );
    assert.match(await unsupported.locator("#notice").textContent(), /WebGPU/);
    assert.equal(await unsupported.locator("#zoom-in").isDisabled(), true);
    console.log(
        "Browser smoke passed: WebGPU init, HiDPI, rulers, anchored zoom, resize, drag, keyboard, help, touch pinch, circle creation/rendering/world scale, toolbar, brush/path/polygon drafts and rendering, adaptive smooth brush curves, magnified sample-noise reduction, opt-in CPU metrics/counters/reset/idle behavior, unavailable-GPU notice.",
    );
} finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
}
