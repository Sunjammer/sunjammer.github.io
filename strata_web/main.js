import { PerformancePanel } from "./editor/performance.js";
import { GraphLabels } from "./editor/logic.js";
import { ImageLayer, ArtboardLayers, revokeAsset } from "./editor/artboard.js";
import { KeyboardPan } from "./editor/navigation.js";
import {
    beginBrowserProjectSave,
    openBrowserProjectFile,
    projectImageIds,
    saveBrowserProjectFile,
} from "./editor/browser-project.js";

const canvas = document.querySelector("#canvas");
const gridBackground = document.getElementById("grid-background");
const layersToggle = document.getElementById("layers-toggle");
const imageName = document.getElementById("image-name");
const frameImageButton = document.getElementById("frame-image");
const rulers = document.querySelector("#rulers");
const notice = document.querySelector("#notice");
const controls = ["zoom-in", "zoom-out", "reset"].map((id) =>
    document.getElementById(id),
);
const toolButtons = ["pan", "circle", "brush", "polyline", "node", "image"].map(
    (tool) => document.getElementById(`${tool}-tool`),
);
const performanceButton = document.getElementById("performance-toggle");
const projectName = document.getElementById("project-name");
const projectStatus = document.getElementById("project-status");
const newProjectButton = document.getElementById("new-project");
const openProjectButton = document.getElementById("open-project");
const saveProjectButton = document.getElementById("save-project");
const projectFile = document.getElementById("project-file");
const importImagesButton = document.getElementById("import-images");
const referenceImageButton = document.getElementById("reference-image");
const imageFiles = document.getElementById("image-files");
const imageControls = document.getElementById("image-controls");
const imageOpacity = document.getElementById("image-opacity");
const deleteImageButton = document.getElementById("delete-image");
const imageMessage = document.getElementById("image-message");
const imageUrlDialog = document.getElementById("image-url-dialog");
const allControls = [
    ...controls,
    ...toolButtons,
    performanceButton,
    newProjectButton,
    openProjectButton,
    saveProjectButton,
    importImagesButton,
    referenceImageButton,
    layersToggle,
];
const finishButton = document.getElementById("finish-path");
const closeButton = document.getElementById("close-path");
const cancelButton = document.getElementById("cancel-path");
const deleteNodeButton = document.getElementById("delete-node");
const graphNodeList = document.getElementById("graph-node-list");
const graphKeyboardControls = document.getElementById(
    "graph-keyboard-controls",
);
const graphConnectControls = document.getElementById("graph-connect-controls");
const graphOutputPort = document.getElementById("graph-output-port");
const graphInputPort = document.getElementById("graph-input-port");
const connectGraphPorts = document.getElementById("connect-graph-ports");
const imageKeyboardControls = document.getElementById(
    "image-keyboard-controls",
);
const graphLabels = new GraphLabels(document.getElementById("graph-labels"));
const graphSelection = document.getElementById("graph-selection");
const imageLayer = new ImageLayer(
    document.getElementById("image-layer"),
    document.getElementById("image-selection"),
);
const artboardLayers = new ArtboardLayers(
    document.getElementById("artboard-layers"),
    {
        select: (id) => {
            if (!renderer || failed) return;
            markInteractionIntent();
            setSpacePan(false);
            setTool("image", false);
            cancelImageGesture();
            renderer.select_image(id);
            invalidate();
        },
        frame: (id) => frameImage(id),
        visible: (id, visible) =>
            changeArtLayer(() => renderer.set_image_visible(id, visible)),
        locked: (id, locked) =>
            changeArtLayer(() => renderer.set_image_locked(id, locked)),
        reorder: (id, index) =>
            changeArtLayer(() => renderer.reorder_image(id, index)),
    },
);
const svgNS = "http://www.w3.org/2000/svg";
const events = new AbortController();
const on = (target, type, handler, options = {}) =>
    target.addEventListener(type, handler, {
        ...options,
        signal: events.signal,
    });
let projectBusy = false;
// Programmatic focus after toolbar clicks must not outline the entire canvas.
// Keep a visible focus indicator when navigating with the keyboard instead.
on(
    document,
    "keydown",
    (event) => {
        if (projectBusy) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        if (event.key === "Tab") canvas.classList.add("keyboard-focus");
    },
    { capture: true },
);
on(
    document,
    "pointerdown",
    (event) => {
        if (projectBusy) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        canvas.classList.remove("keyboard-focus");
    },
    { capture: true },
);
let renderer;
let pendingFrame = 0;
let retryCount = 0;
let failed = false;
let disposed = false;
let pointer = null;
let circleMode = false;
let selectedTool = "pan";
let spacePan = false;
const currentTool = () => (spacePan ? "pan" : selectedTool);
let brushPointer = null;
let graphPointer = null;
let graphGestureSize = null;
let imagePointer = null;
let imageGestureSize = null;
let imageLoading = 0;
let interactionGeneration = 0;
let graphFeedback = "";
let graphFeedbackTimer = 0;
const imageGestureWaiters = new Set();
let layersPinned = false;
let layersCollapsed = false;
let dprQuery;
let rulerCache = null;
const graphRows = new Map();
const pointers = new Map();
const keyboardPan = new KeyboardPan();
const performancePanel = new PerformancePanel({
    button: performanceButton,
    panel: document.getElementById("performance-panel"),
    readout: document.getElementById("performance-readout"),
    resetButton: document.getElementById("performance-reset"),
    getRenderer: () => renderer,
    invalidate,
    signal: events.signal,
});

function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
}

function settleProjectGestures() {
    keyboardPan.clear();
    setSpacePan(false);
    if (brushPointer !== null) cancelDraft();
    if (graphPointer !== null) cancelGraphGesture();
    if (imagePointer !== null) cancelImageGesture();
    renderer?.cancel_drawing();
}

async function projectAction(label, action) {
    if (!renderer || failed || disposed || projectBusy) return;
    if (imageLoading) {
        setText(projectStatus, "Wait for image import");
        return;
    }
    projectBusy = true;
    document.body.classList.add("project-busy");
    for (const button of [
        newProjectButton,
        openProjectButton,
        saveProjectButton,
    ])
        button.disabled = true;
    setText(projectStatus, label);
    try {
        await action();
    } catch (error) {
        console.error(error);
        setText(projectStatus, error.message ?? String(error));
    } finally {
        projectBusy = false;
        document.body.classList.remove("project-busy");
        if (!failed && !disposed)
            for (const button of [
                newProjectButton,
                openProjectButton,
                saveProjectButton,
            ])
                button.disabled = false;
        invalidate();
    }
}

on(saveProjectButton, "click", () => {
    let destination;
    try {
        destination = beginBrowserProjectSave(projectName.value);
    } catch (error) {
        setText(projectStatus, error.message ?? String(error));
        return;
    }
    void projectAction("Saving…", async () => {
        const selected = await destination;
        if (!selected) {
            setText(projectStatus, "Save canceled");
            return;
        }
        if (selected.error) throw selected.error;
        settleProjectGestures();
        const state = renderer.export_browser_project();
        const assets = await imageLayer.snapshotAssets(projectImageIds(state));
        const result = await saveBrowserProjectFile(selected, state, assets);
        setText(
            projectStatus,
            result === "saved" ? "Saved to file" : "Download started",
        );
    });
});

on(openProjectButton, "click", () => {
    if (!confirm("Open this browser project? Unsaved changes will be lost."))
        return;
    void projectAction("Opening…", async () => {
        settleProjectGestures();
        const record = await openBrowserProjectFile(projectFile);
        if (!record) {
            setText(projectStatus, "Open canceled");
            return;
        }
        const imageIds = projectImageIds(record.state);
        const decoded = await imageLayer.decodeAssets(record.assets, imageIds, {
            signal: events.signal,
        });
        try {
            renderer.import_browser_project(record.state);
            imageLayer.replaceAssets(decoded);
            projectName.value = record.name;
            setText(projectStatus, "Opened file");
        } catch (error) {
            for (const { asset } of decoded) revokeAsset(asset);
            throw error;
        }
    });
});

on(newProjectButton, "click", () => {
    if (!confirm("Create a new browser project? Unsaved changes will be lost."))
        return;
    void projectAction("Creating…", async () => {
        settleProjectGestures();
        renderer.new_browser_project();
        imageLayer.replaceAssets([]);
        setText(projectStatus, "New project");
    });
});

function clearGraphFeedback() {
    if (!graphFeedback && !graphFeedbackTimer) return;
    graphFeedback = "";
    if (graphFeedbackTimer) clearTimeout(graphFeedbackTimer);
    graphFeedbackTimer = 0;
}

function showGraphFeedback(message, duration = 4000) {
    clearGraphFeedback();
    graphFeedback = message;
    graphFeedbackTimer = setTimeout(() => {
        graphFeedback = "";
        graphFeedbackTimer = 0;
        invalidate();
    }, duration);
    invalidate();
}

function markInteractionIntent() {
    interactionGeneration++;
    clearGraphFeedback();
}

function resolveImageGestureWaiters() {
    for (const resolve of imageGestureWaiters) resolve();
    imageGestureWaiters.clear();
}

function waitForImageGesture() {
    if (imagePointer === null) return Promise.resolve();
    return new Promise((resolve) => imageGestureWaiters.add(resolve));
}

function showError(error) {
    keyboardPan.clear();
    failed = true;
    notice.hidden = false;
    setText(notice.querySelector("strong"), "Canvas unavailable");
    setText(
        notice.querySelector("p"),
        `${error}\n\nUse a WebGPU-capable browser on localhost or HTTPS. If the WASM module is missing, run python3 strata/build_web.py first.`,
    );
    setText(document.getElementById("renderer"), "GPU UNAVAILABLE");
    allControls.forEach((button) => {
        button.disabled = true;
    });
    for (const button of [
        finishButton,
        closeButton,
        cancelButton,
        deleteNodeButton,
        deleteImageButton,
        imageOpacity,
        imageName,
        frameImageButton,
    ])
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
    const horizontal = status.horizontal_ticks;
    const vertical = status.vertical_ticks;
    const unchanged =
        rulerCache?.width === width &&
        rulerCache?.height === height &&
        rulerCache.horizontal.length === horizontal.length &&
        rulerCache.vertical.length === vertical.length &&
        horizontal.every(
            (tick, index) =>
                tick.pixel === rulerCache.horizontal[index].pixel &&
                tick.label === rulerCache.horizontal[index].label,
        ) &&
        vertical.every(
            (tick, index) =>
                tick.pixel === rulerCache.vertical[index].pixel &&
                tick.label === rulerCache.vertical[index].label,
        );
    if (unchanged) return;
    rulerCache = {
        width,
        height,
        horizontal: horizontal.map(({ pixel, label }) => ({ pixel, label })),
        vertical: vertical.map(({ pixel, label }) => ({ pixel, label })),
    };
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

function updateLayerPanelVisibility() {
    imageControls.hidden =
        layersCollapsed ||
        ((!layersPinned || circleMode) &&
            !["image", "node"].includes(currentTool()));
    layersToggle.setAttribute("aria-pressed", String(!imageControls.hidden));
}

on(layersToggle, "click", () => {
    if (!renderer || failed) return;
    if (imageControls.hidden) {
        layersCollapsed = false;
        layersPinned = true;
    } else {
        layersCollapsed = true;
        layersPinned = false;
    }
    updateLayerPanelVisibility();
    invalidate();
});

function changeArtLayer(change) {
    if (!renderer || failed) return;
    cancelImageGesture();
    change();
    invalidate();
}

function frameImage(id) {
    if (!renderer || failed || id === null || id === undefined) return;
    keyboardPan.clear();
    setSpacePan(false);
    if (brushPointer !== null) cancelDraft();
    cancelGraphGesture();
    cancelImageGesture();
    const { width, height } = canvas.getBoundingClientRect();
    renderer.resize(width, height, window.devicePixelRatio || 1);
    renderer.frame_image(id);
    canvas.focus({ preventScroll: true });
    invalidate();
}

on(frameImageButton, "click", () =>
    frameImage(renderer?.image_status().selected),
);
on(imageName, "change", () => {
    if (!renderer || failed) return;
    const id = renderer.image_status().selected;
    if (id === null) return;
    if (!renderer.rename_image(id, imageName.value)) {
        imageFeedback("Layer names must contain 1–256 characters.", true);
    }
    imageName.value = renderer.image_status().name ?? "";
    invalidate();
});

function imageFeedback(message, error = false) {
    setText(imageMessage, message);
    imageMessage.dataset.error = String(error);
}

async function importMedia(inputs, load, drop = null) {
    if (!renderer || failed || disposed || !inputs.length) return;
    if (imageLoading) {
        imageFeedback("An import is already in progress. Please wait.");
        return;
    }
    setSpacePan(false);
    setTool("image");
    cancelImageGesture();
    const importGeneration = interactionGeneration;
    const { width, height } = canvas.getBoundingClientRect();
    renderer.resize(width, height, window.devicePixelRatio || 1);
    const location = drop ?? { x: width / 2, y: height / 2 };
    const world = renderer.screen_to_world(location.x, location.y);
    imageLoading++;
    invalidate();
    const errors = [];
    let imported = 0;
    try {
        for (const input of inputs) {
            imageFeedback(
                `Loading ${typeof input === "string" ? "image URL" : input.name}…`,
            );
            let asset;
            try {
                asset = await load(input, { signal: events.signal });
                if (disposed || failed) {
                    revokeAsset(asset);
                    return;
                }
                // Never let delayed decoding cancel a newer image gesture. Wait for
                // that gesture to settle, then place against the current camera.
                await waitForImageGesture();
                if (disposed || failed || !renderer) {
                    revokeAsset(asset);
                    return;
                }
                const staleIntent = interactionGeneration !== importGeneration;
                const selectedBefore = staleIntent
                    ? renderer.image_status().selected
                    : null;
                const projected = renderer.world_to_screen(world.x, world.y);
                const id = renderer.add_image(
                    asset.name,
                    asset.width,
                    asset.height,
                    projected.x + imported * 24,
                    projected.y + imported * 24,
                );
                if (id === undefined || id === null)
                    throw new Error(
                        "Cannot place this image at the current camera position.",
                    );
                imageLayer.add(id, asset);
                asset = null; // Ownership transferred to the layer.
                // add_image selects its result. Restore a newer explicit image
                // selection without changing the user's newer tool choice.
                if (selectedBefore !== null)
                    renderer.select_image(selectedBefore);
                imported++;
                invalidate();
            } catch (error) {
                revokeAsset(asset);
                if (disposed) return;
                errors.push(
                    `${typeof input === "string" ? "Image URL" : input.name}: ${error.message ?? error}`,
                );
            }
        }
        imageFeedback(
            errors.length
                ? `${imported ? `Imported ${imported}.\n` : ""}${errors.join("\n")}`
                : `Imported ${imported} ${imported === 1 ? "image" : "images"}. Drag to move; use the round handle to rotate.`,
            errors.length > 0,
        );
    } finally {
        imageLoading--;
        invalidate();
    }
}

on(importImagesButton, "click", () => imageFiles.click());
on(imageFiles, "change", () => {
    const files = Array.from(imageFiles.files ?? []);
    imageFiles.value = "";
    void importMedia(files, (file, options) =>
        imageLayer.loadFile(file, options),
    );
});
on(canvas, "dragover", (event) => {
    if (!Array.from(event.dataTransfer?.types ?? []).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect =
        renderer && !failed && !imageLoading ? "copy" : "none";
});
on(canvas, "drop", (event) => {
    if (!Array.from(event.dataTransfer?.types ?? []).includes("Files")) return;
    event.preventDefault();
    void importMedia(
        Array.from(event.dataTransfer.files),
        (file, options) => imageLayer.loadFile(file, options),
        localPoint(event),
    );
});
on(referenceImageButton, "click", () => {
    if (!renderer || failed) return;
    setSpacePan(false);
    cancelImageGesture();
    imageUrlDialog.showModal();
    document.getElementById("image-url").focus();
});
on(document.getElementById("image-url-cancel"), "click", () =>
    imageUrlDialog.close(),
);
on(imageUrlDialog, "close", () => canvas.focus({ preventScroll: true }));
on(document.getElementById("image-url-form"), "submit", (event) => {
    event.preventDefault();
    const url = document.getElementById("image-url").value.trim();
    if (!url) return;
    imageUrlDialog.close();
    void importMedia([url], (value, options) =>
        imageLayer.loadUrl(value, options),
    );
});

function updateGraphSelection() {
    const activeTool = currentTool();
    const hidden = activeTool !== "node" || circleMode;
    graphSelection.toggleAttribute("hidden", hidden);
    if (hidden) {
        graphSelection.replaceChildren();
        return;
    }
    // Rust supplies projected CSS-pixel bounds; no viewBox or zoom transform is
    // used here, so handles stay screen-sized and picking stays entirely in Rust.
    const { bounds, marquee } = renderer.graph_selection_view();
    const elements = [];
    if (bounds) {
        elements.push(
            svgElement("rect", {
                ...bounds,
                class: "selection-bounds",
            }),
        );
        for (const x of [bounds.x, bounds.x + bounds.width]) {
            for (const y of [bounds.y, bounds.y + bounds.height]) {
                elements.push(
                    svgElement("rect", {
                        x: x - 4,
                        y: y - 4,
                        width: 8,
                        height: 8,
                        class: "selection-handle",
                    }),
                );
            }
        }
    }
    if (marquee) {
        elements.push(
            svgElement("rect", {
                ...marquee,
                class: "selection-marquee",
            }),
        );
    }
    graphSelection.replaceChildren(...elements);
}

function selectGraphNode(id) {
    if (!renderer || failed) return;
    markInteractionIntent();
    setSpacePan(false);
    setTool("node", false);
    cancelGraphGesture();
    if (!renderer.select_graph_node(id))
        showGraphFeedback("That node is no longer available.");
    invalidate();
}

function updatePortSelect(select, nodes, direction) {
    const previous = select.value;
    let signature = "";
    for (const node of nodes) {
        const ports =
            node.contract[direction === "output" ? "outputs" : "inputs"] ?? [];
        for (let index = 0; index < ports.length; index++)
            signature += `${node.id}:${index}:${node.title}:${ports[index].name};`;
    }
    if (select.dataset.signature === signature) return;
    select.dataset.signature = signature;
    const fragment = document.createDocumentFragment();
    for (const node of nodes) {
        const ports =
            node.contract[direction === "output" ? "outputs" : "inputs"] ?? [];
        for (let index = 0; index < ports.length; index++) {
            const option = document.createElement("option");
            option.value = `${node.id}:${index}`;
            option.textContent = `${node.title} — ${ports[index].name}`;
            fragment.append(option);
        }
    }
    select.replaceChildren(fragment);
    if ([...select.options].some((option) => option.value === previous))
        select.value = previous;
}

function updateGraphNavigator(nodes, status) {
    const present = new Set();
    let position = 0;
    for (const node of nodes) {
        const id = String(node.id);
        present.add(id);
        let entry = graphRows.get(id);
        if (!entry) {
            const row = document.createElement("li");
            row.className = "graph-node-row";
            row.dataset.nodeId = id;
            const button = document.createElement("button");
            button.type = "button";
            row.append(button);
            graphRows.set(id, (entry = { row, button }));
        }
        const label = `${node.title}, ${node.contract.inputs?.length ?? 0} inputs, ${node.contract.outputs?.length ?? 0} outputs`;
        setText(entry.button, label);
        entry.button.setAttribute(
            "aria-current",
            String(status.selected === node.id),
        );
        const next = graphNodeList.children[position] || null;
        if (next !== entry.row) graphNodeList.insertBefore(entry.row, next);
        position++;
    }
    for (const [id, entry] of graphRows) {
        if (present.has(id)) continue;
        entry.row.remove();
        graphRows.delete(id);
    }
    graphKeyboardControls.disabled = status.selected === null;
    updatePortSelect(graphOutputPort, nodes, "output");
    updatePortSelect(graphInputPort, nodes, "input");
    graphConnectControls.disabled =
        graphOutputPort.options.length === 0 ||
        graphInputPort.options.length === 0;
}

on(graphNodeList, "click", (event) => {
    const row = event.target.closest?.("[data-node-id]");
    if (row && graphNodeList.contains(row))
        selectGraphNode(Number(row.dataset.nodeId));
});

function transformSelectedGraph(action) {
    const status = renderer?.graph_status();
    if (!renderer || failed || status.selected === null) return;
    markInteractionIntent();
    setTool("node", false);
    cancelGraphGesture();
    if (["left", "right", "up", "down"].includes(action)) {
        const delta = {
            left: [-10, 0],
            right: [10, 0],
            up: [0, -10],
            down: [0, 10],
        }[action];
        renderer.nudge_selected_graph_nodes(delta[0], delta[1]);
    } else {
        renderer.scale_selected_graph_nodes(action === "larger" ? 1.1 : 0.9);
    }
    invalidate();
}

for (const button of document.querySelectorAll("[data-graph-action]"))
    on(button, "click", () =>
        transformSelectedGraph(button.dataset.graphAction),
    );

on(connectGraphPorts, "click", () => {
    if (!renderer || failed) return;
    const [outputId, outputIndex] = graphOutputPort.value
        .split(":")
        .map(Number);
    const [inputId, inputIndex] = graphInputPort.value.split(":").map(Number);
    markInteractionIntent();
    setTool("node", false);
    cancelGraphGesture();
    try {
        const connected = renderer.connect_graph_nodes(
            outputId,
            outputIndex,
            inputId,
            inputIndex,
        );
        showGraphFeedback(connected ? "Connected" : "Already connected", 2500);
    } catch (error) {
        showGraphFeedback(
            error instanceof Error ? error.message : String(error),
        );
    }
    invalidate();
});

function transformSelectedImage(action) {
    if (!renderer || failed) return;
    const status = renderer.image_status();
    if (status.selected === null || status.locked || !status.visible) return;
    markInteractionIntent();
    setTool("image", false);
    cancelImageGesture();
    if (["left", "right", "up", "down"].includes(action)) {
        const delta = {
            left: [-10, 0],
            right: [10, 0],
            up: [0, -10],
            down: [0, 10],
        }[action];
        renderer.nudge_selected_image(delta[0], delta[1]);
    } else if (action === "smaller" || action === "larger") {
        renderer.scale_selected_image(action === "larger" ? 1.1 : 0.9);
    } else {
        // The model uses CCW world radians; SVG screen rotation has the
        // opposite sign, so a screen-right turn is a negative world delta.
        const step = Math.PI / 12;
        renderer.rotate_selected_image(
            action === "rotate-right" ? -step : step,
        );
    }
    invalidate();
}

for (const button of document.querySelectorAll("[data-image-action]"))
    on(button, "click", () =>
        transformSelectedImage(button.dataset.imageAction),
    );

function keyboardNavigationAllowed() {
    return (
        document.activeElement === canvas &&
        !document.hidden &&
        !document.querySelector("dialog[open]") &&
        brushPointer === null &&
        graphPointer === null &&
        imagePointer === null &&
        pointers.size === 0
    );
}

function draw(timestamp) {
    const activeTool = currentTool();
    pendingFrame = 0;
    if (failed || disposed || !renderer) return;
    const measuring = performancePanel.enabled;
    const frameStarted = measuring ? performance.now() : 0;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height || document.hidden) {
        keyboardPan.clear();
        return;
    }
    try {
        if (
            imagePointer !== null &&
            imageGestureSize &&
            (imageGestureSize.width !== width ||
                imageGestureSize.height !== height)
        ) {
            cancelImageGesture();
        }
        if (
            graphPointer !== null &&
            graphGestureSize &&
            (graphGestureSize.width !== width ||
                graphGestureSize.height !== height)
        ) {
            cancelGraphGesture();
        }
        renderer.resize(width, height, window.devicePixelRatio || 1);
        if (!keyboardNavigationAllowed()) keyboardPan.clear();
        const movement = keyboardPan.step(timestamp);
        if (movement.x || movement.y) {
            renderer.pan(movement.x, movement.y);
            if (pointer) renderer.drawing_move(pointer.x, pointer.y);
        }
        const renderStarted = measuring ? performance.now() : 0;
        const presented = renderer.render();
        const renderEnded = measuring ? performance.now() : 0;
        const status = renderer.status();
        setText(
            document.getElementById("zoom"),
            `${status.pixels_per_meter.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`,
        );
        setText(document.getElementById("scale-label"), status.scale_label);
        document.getElementById("scale-line").style.width =
            `${status.scale_pixels}px`;
        setText(
            document.getElementById("grid-label"),
            `Grid ${status.minor_step.toLocaleString(undefined, { maximumSignificantDigits: 2 })} m`,
        );
        const point = pointer
            ? renderer.screen_to_world(pointer.x, pointer.y)
            : status.center;
        setText(
            document.getElementById("coordinates"),
            `X ${point.x.toFixed(3)} m   Y ${point.y.toFixed(3)} m`,
        );
        const circleCount = `${status.circle_count} ${status.circle_count === 1 ? "circle" : "circles"}`;
        const openCount = status.stroke_count - status.polygon_count;
        setText(
            document.getElementById("object-count"),
            status.stroke_count
                ? `${circleCount} · ${openCount} ${openCount === 1 ? "stroke" : "strokes"} · ${status.polygon_count} ${status.polygon_count === 1 ? "polygon" : "polygons"}`
                : circleCount,
        );
        const draft = renderer.drawing_status();
        const graph = renderer.graph_status();
        const graphView = graph.node_count
            ? renderer.graph_view()
            : { nodes: [] };
        const graphSnapshot = graph.node_count
            ? renderer.graph_snapshot().nodes
            : [];
        graphLabels.update(graphView);
        updateGraphSelection();
        const images = renderer.image_status();
        imageLayer.update(renderer.image_view(), {
            editing: activeTool === "image" && !circleMode,
        });
        updateLayerPanelVisibility();
        artboardLayers.update(
            renderer.image_snapshot(),
            images,
            (id) => imageLayer.assets.get(id)?.url,
        );
        updateGraphNavigator(graphSnapshot, graph);
        setText(
            document.getElementById("board-summary"),
            `Front: Logic board · ${graph.node_count} nodes / ${graph.connection_count} links\nMiddle: Sketchboard · ${status.circle_count + status.stroke_count} shapes / strokes\nBack: Artboard · ${images.count} assets`,
        );
        const imageCount = document.getElementById("image-count");
        imageCount.hidden = images.count === 0;
        setText(
            imageCount,
            `${images.count} ${images.count === 1 ? "image" : "images"}`,
        );
        setText(
            document.getElementById("image-selection-name"),
            images.name
                ? `${images.name}${images.locked ? " · locked" : ""}${!images.visible ? " · hidden" : ""}`
                : "No image selected",
        );
        imageName.disabled = images.selected === null;
        frameImageButton.disabled = images.selected === null;
        if (document.activeElement !== imageName)
            imageName.value = images.name ?? "";
        const imageEditing = activeTool === "image" && !circleMode;
        deleteImageButton.disabled =
            !imageEditing || images.selected === null || images.locked;
        imageOpacity.disabled =
            !imageEditing ||
            images.selected === null ||
            images.active ||
            images.locked;
        imageOpacity.value = images.opacity ?? 1;
        imageKeyboardControls.disabled =
            !imageEditing ||
            images.selected === null ||
            images.locked ||
            !images.visible;
        importImagesButton.disabled = imageLoading > 0;
        referenceImageButton.disabled = imageLoading > 0;
        const graphCount = document.getElementById("graph-count");
        graphCount.hidden = graph.node_count === 0;
        setText(
            graphCount,
            `${graph.node_count} nodes · ${graph.connection_count} links`,
        );
        setText(
            document.getElementById("graph-message"),
            graphFeedback || graph.message,
        );
        deleteNodeButton.disabled =
            activeTool !== "node" || circleMode || graph.selected_count === 0;
        setText(
            deleteNodeButton,
            graph.selected_count
                ? `Delete ${graph.selected_count === 1 ? "node" : `nodes (${graph.selected_count})`}`
                : "Delete nodes",
        );
        finishButton.disabled =
            draft.kind !== "polyline" || draft.point_count < 2;
        closeButton.disabled =
            draft.kind !== "polyline" || draft.point_count < 3;
        cancelButton.disabled =
            !draft.active && !graph.active && !images.active;
        const creationHint = spacePan
            ? "Temporary Pan · release Space to restore tool"
            : circleMode || activeTool === "circle"
              ? `Click to create · Ø ${status.scale_label}`
              : activeTool === "brush"
                ? "Drag to draw · Esc cancels · middle-drag pans"
                : activeTool === "polyline"
                  ? draft.active
                      ? `${draft.point_count} vertices · Enter finish · click start to close · Esc cancel`
                      : "Click to place vertices · Enter finish · Shift+Enter close"
                  : activeTool === "node"
                    ? graph.gesture === "wire"
                        ? "Release on a compatible port · Esc cancels"
                        : graph.gesture === "scale"
                          ? "Drag to scale uniformly · Alt at start uses center · Esc cancels"
                          : graph.gesture === "marquee"
                            ? "Drag to select nodes · release empty click to place · Esc cancels"
                            : graph.gesture === "node"
                              ? "Drag to move selection · Esc restores positions"
                              : `${graph.selected_count} selected · Click to place · Shift-click toggles · drag empty to select · corners scale (Alt: center)`
                    : activeTool === "image"
                      ? "Import or drop files · drag to move · corners scale · round handle rotates"
                      : graph.node_count
                        ? "Drag to pan · N selects, moves, scales, and connects nodes"
                        : "Hold C + click · B brush · P path · N node";
        setText(document.getElementById("creation-hint"), creationHint);
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
        // Keep the canvas demand-driven: only held, non-opposing WASD keys
        // request another frame, never an idle profiler or a released key.
        if (keyboardPan.moving && presented) invalidate();
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
    if (
        !renderer ||
        failed ||
        brushPointer !== null ||
        graphPointer !== null ||
        imagePointer !== null
    )
        return;
    renderer.zoom(canvas.clientWidth / 2, canvas.clientHeight / 2, factor);
    invalidate();
}

function reset() {
    if (
        !renderer ||
        failed ||
        brushPointer !== null ||
        graphPointer !== null ||
        imagePointer !== null
    )
        return;
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
    const activeTool = currentTool();
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
        graphPointer !== null ||
        imagePointer !== null ||
        ((activeTool !== "pan" || circleMode) &&
            event.pointerType === "touch" &&
            !event.isPrimary)
    )
        return;
    event.preventDefault();
    markInteractionIntent();
    keyboardPan.clear();
    canvas.focus({ preventScroll: true });
    pointer = localPoint(event);
    if (
        !spacePan &&
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
        (!circleMode || spacePan) &&
        event.button === 0 &&
        !event.ctrlKey &&
        !event.metaKey &&
        (!event.altKey || activeTool === "node" || activeTool === "image") &&
        !pointers.size
    ) {
        const { width, height } = canvas.getBoundingClientRect();
        renderer.resize(width, height, window.devicePixelRatio || 1);
        if (activeTool === "node") {
            if (
                renderer.graph_pointer_begin(
                    pointer.x,
                    pointer.y,
                    event.shiftKey,
                    event.altKey,
                )
            ) {
                graphPointer = event.pointerId;
                graphGestureSize = { width, height };
                canvas.setPointerCapture(event.pointerId);
                canvas.classList.toggle(
                    "graph-dragging",
                    ["node", "scale"].includes(renderer.graph_status().gesture),
                );
                invalidate();
                return;
            }
            return;
        }
        if (activeTool === "image") {
            if (renderer.image_begin(pointer.x, pointer.y, event.altKey)) {
                imagePointer = event.pointerId;
                imageGestureSize = { width, height };
                canvas.setPointerCapture(event.pointerId);
                canvas.classList.add("image-dragging");
            }
            invalidate();
            return;
        }
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
    if (imagePointer === event.pointerId) {
        renderer.image_move(pointer.x, pointer.y, event.shiftKey);
        invalidate();
        return;
    }
    if (graphPointer === event.pointerId) {
        renderer.graph_move(pointer.x, pointer.y);
        invalidate();
        return;
    }
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
    if (imagePointer === event.pointerId) {
        imagePointer = null;
        imageGestureSize = null;
        const point = localPoint(event);
        renderer.image_end(point.x, point.y, event.shiftKey);
        canvas.classList.remove("image-dragging");
        if (canvas.hasPointerCapture(event.pointerId))
            canvas.releasePointerCapture(event.pointerId);
        resolveImageGestureWaiters();
        invalidate();
        return;
    }
    if (graphPointer === event.pointerId) {
        graphPointer = null;
        graphGestureSize = null;
        const point = localPoint(event);
        renderer.graph_end(point.x, point.y);
        canvas.classList.remove("graph-dragging");
        if (canvas.hasPointerCapture(event.pointerId))
            canvas.releasePointerCapture(event.pointerId);
        invalidate();
        return;
    }
    if (brushPointer !== event.pointerId) return;
    brushPointer = null;
    const point = localPoint(event);
    renderer.end_brush(point.x, point.y);
    if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
    invalidate();
});
const releasePointer = (event) => {
    if (imagePointer === event.pointerId) cancelImageGesture();
    if (graphPointer === event.pointerId) cancelGraphGesture();
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
function cancelImageGesture() {
    const id = imagePointer;
    imagePointer = null;
    imageGestureSize = null;
    renderer?.cancel_image_gesture();
    if (id !== null && canvas.hasPointerCapture(id))
        canvas.releasePointerCapture(id);
    canvas.classList.remove("image-dragging");
    resolveImageGestureWaiters();
    invalidate();
}

function deleteSelectedImage() {
    if (!renderer || failed || currentTool() !== "image" || circleMode) return;
    cancelImageGesture();
    const id = renderer.delete_selected_image();
    if (id !== undefined && id !== null) imageLayer.remove(id);
    canvas.focus({ preventScroll: true });
    invalidate();
}
on(deleteImageButton, "click", deleteSelectedImage);
on(imageOpacity, "input", () => {
    if (renderer && !failed && currentTool() === "image") {
        renderer.set_image_opacity(Number(imageOpacity.value));
        invalidate();
    }
});

function cancelGraphGesture() {
    const id = graphPointer;
    graphPointer = null;
    graphGestureSize = null;
    renderer?.cancel_graph_gesture();
    if (id !== null && canvas.hasPointerCapture(id))
        canvas.releasePointerCapture(id);
    canvas.classList.remove("graph-dragging");
    invalidate();
}
function deleteSelectedNode() {
    if (!renderer || failed || currentTool() !== "node" || circleMode) return;
    cancelGraphGesture();
    renderer.delete_selected_node();
    canvas.focus({ preventScroll: true });
    invalidate();
}
on(deleteNodeButton, "click", deleteSelectedNode);
function cancelDraft() {
    const id = brushPointer;
    brushPointer = null;
    renderer?.cancel_drawing();
    if (id !== null && canvas.hasPointerCapture(id))
        canvas.releasePointerCapture(id);
    invalidate();
}
function updateToolAppearance() {
    updateLayerPanelVisibility();
    const tool = currentTool();
    canvas.classList.toggle("drawing-tool", tool !== "pan");
    canvas.classList.toggle("creating", circleMode && !spacePan);
    toolButtons.forEach((button) =>
        button.setAttribute(
            "aria-pressed",
            String(button.id === `${tool}-tool`),
        ),
    );
}

function setSpacePan(active) {
    if (spacePan === active) return;
    markInteractionIntent();
    if (active) {
        setCircleMode(false);
        if (brushPointer !== null) cancelDraft();
        if (graphPointer !== null) cancelGraphGesture();
        if (imagePointer !== null) cancelImageGesture();
    }
    // Never let an in-progress navigation drag spill into the restored tool.
    for (const id of pointers.keys())
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    pointers.clear();
    canvas.classList.remove("dragging");
    spacePan = active;
    updateToolAppearance();
    invalidate();
}

function setTool(tool, focusCanvas = true) {
    if (!renderer || failed) return;
    markInteractionIntent();
    if (tool === "image") {
        layersCollapsed = false;
        updateLayerPanelVisibility();
    }
    if (tool === selectedTool && !circleMode) {
        if (focusCanvas) canvas.focus({ preventScroll: true });
        return;
    }
    cancelDraft();
    cancelGraphGesture();
    cancelImageGesture();
    setCircleMode(false);
    selectedTool = tool;
    updateToolAppearance();
    if (focusCanvas) canvas.focus({ preventScroll: true });
    invalidate();
}
for (const tool of ["pan", "circle", "brush", "polyline", "node", "image"]) {
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
    cancelGraphGesture();
    cancelImageGesture();
    canvas.focus({ preventScroll: true });
});
function setCircleMode(active) {
    circleMode = active;
    updateToolAppearance();
    invalidate();
}
on(canvas, "blur", () => keyboardPan.clear());
on(window, "keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) keyboardPan.clear();
    else keyboardPan.fast = event.shiftKey;
    if (event.code === "Space" || event.key === " ") {
        if (
            !renderer ||
            failed ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            document.querySelector("dialog[open]") ||
            event.target !== canvas
        )
            return;
        event.preventDefault();
        if (!event.repeat) setSpacePan(true);
        return;
    }
    if (spacePan) return;
    if (
        !["c", "b", "p", "v", "n", "i"].includes(event.key.toLowerCase()) ||
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
    } else
        setTool(
            { b: "brush", p: "polyline", v: "pan", n: "node", i: "image" }[key],
        );
});
on(window, "keyup", (event) => {
    keyboardPan.release(event.key.toLowerCase(), performance.now());
    keyboardPan.fast = event.shiftKey;
    if (keyboardPan.moving) invalidate();
    if (event.code === "Space" || event.key === " ") {
        if (spacePan) event.preventDefault();
        setSpacePan(false);
    }
    if (event.key.toLowerCase() === "c" || event.code === "KeyC")
        setCircleMode(false);
});
on(window, "blur", () => {
    keyboardPan.clear();
    setSpacePan(false);
    setCircleMode(false);
    if (brushPointer !== null) cancelDraft();
    renderer?.clear_drawing_cursor();
    if (graphPointer !== null) cancelGraphGesture();
    if (imagePointer !== null) cancelImageGesture();
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
        if (
            brushPointer !== null ||
            graphPointer !== null ||
            imagePointer !== null
        )
            return;
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
    const activeTool = currentTool();
    if (!renderer || failed) return;
    if (
        event.key !== "Escape" &&
        (event.ctrlKey || event.metaKey || event.altKey)
    )
        return;
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d"].includes(key)) {
        event.preventDefault();
        if (!keyboardNavigationAllowed()) return;
        keyboardPan.fast = event.shiftKey;
        if (!event.repeat) keyboardPan.press(key, performance.now());
        if (keyboardPan.moving) invalidate();
        return;
    }
    const step = event.shiftKey ? 200 : 40;
    const pan = {
        ArrowLeft: [step, 0],
        ArrowRight: [-step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
    }[event.key];
    if (event.key === "Escape") {
        keyboardPan.clear();
        cancelDraft();
        cancelGraphGesture();
        cancelImageGesture();
        setSpacePan(false);
        setCircleMode(false);
    } else if (event.key === "Enter" && activeTool === "polyline")
        finishPolyline(event.shiftKey);
    else if (event.key === "Backspace" && activeTool === "polyline")
        renderer.undo_vertex();
    else if (event.key === "Delete" && activeTool === "node")
        deleteSelectedNode();
    else if (event.key === "Delete" && activeTool === "image")
        deleteSelectedImage();
    else if (
        pan &&
        brushPointer === null &&
        graphPointer === null &&
        imagePointer === null
    )
        renderer.pan(...pan);
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
    setSpacePan(false);
    setCircleMode(false);
    if (brushPointer !== null) cancelDraft();
    if (graphPointer !== null) cancelGraphGesture();
    if (imagePointer !== null) cancelImageGesture();
    renderer?.clear_drawing_cursor();
    help.showModal();
});
on(help, "close", () => canvas.focus({ preventScroll: true }));

const observer = new ResizeObserver(invalidate);
observer.observe(canvas);
on(document, "visibilitychange", () => {
    if (document.hidden) {
        keyboardPan.clear();
        setSpacePan(false);
        setCircleMode(false);
        if (brushPointer !== null) cancelDraft();
        if (graphPointer !== null) cancelGraphGesture();
        if (imagePointer !== null) cancelImageGesture();
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
    keyboardPan.clear();
    if (event.persisted) return;
    disposed = true;
    clearGraphFeedback();
    resolveImageGestureWaiters();
    cancelAnimationFrame(pendingFrame);
    observer.disconnect();
    dprQuery?.removeEventListener("change", watchDpr);
    events.abort();
    artboardLayers.dispose();
    imageLayer.dispose();
    renderer?.free();
});

try {
    const { default: init, WebCanvas } = await import("./pkg/strata.js");
    await init();
    const created = await WebCanvas.create_layered(canvas, gridBackground);
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
