const ns = "http://www.w3.org/2000/svg";
const maxBytes = 32 * 1024 * 1024;
const maxSavedAssets = 512;
const maxSavedAssetBytes = 256 * 1024 * 1024;
const maxDimension = 32768;
const maxPixels = 64_000_000;
const imageTypes = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/avif",
    "image/bmp",
    "image/x-bmp",
    "image/x-ms-bmp",
    "image/svg+xml",
]);
const svgFallbackTypes = new Set([
    "",
    "application/octet-stream",
    "text/plain",
    "text/xml",
    "application/xml",
]);

const element = (document, name, attrs = {}) => {
    const node = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs))
        node.setAttribute(key, value);
    return node;
};

/** Release a descriptor that was not accepted by the model, or is no longer used. */
export function revokeAsset(asset) {
    if (asset?.url?.startsWith("blob:")) URL.revokeObjectURL(asset.url);
}

function aborted(signal) {
    if (signal?.aborted)
        throw (
            signal.reason ??
            new DOMException("Image import cancelled", "AbortError")
        );
}

async function decodeBlob(blob, name, { signal } = {}) {
    aborted(signal);
    if (!blob.size)
        throw new Error("The image is empty. Choose a non-empty image file.");
    if (blob.size > maxBytes)
        throw new Error(
            "Image exceeds the 32 MiB import limit. Choose a smaller image.",
        );
    let type = blob.type.split(";", 1)[0].trim().toLowerCase();
    if (/\.svg$/i.test(name) && svgFallbackTypes.has(type)) {
        type = "image/svg+xml";
        blob = blob.slice(0, blob.size, type);
    }
    if (!imageTypes.has(type)) {
        throw new Error(
            "Unsupported image type. Choose PNG, JPEG, WebP, GIF, AVIF, BMP, or SVG.",
        );
    }
    const url = URL.createObjectURL(blob);
    const image = new Image();
    let onAbort;
    try {
        // Supply the browser's conventional replaced-element size for dimensionless SVGs.
        if (type === "image/svg+xml") {
            image.width = 300;
            image.height = 150;
        }
        const cancellation = new Promise((_, reject) => {
            onAbort = () => {
                image.removeAttribute("src");
                reject(
                    signal.reason ??
                        new DOMException(
                            "Image import cancelled",
                            "AbortError",
                        ),
                );
            };
            signal?.addEventListener("abort", onAbort, { once: true });
        });
        aborted(signal);
        // SVG stays in image context: scripts and nested external references do not load.
        // Never inline imported markup, including through DOMParser.
        image.src = url;
        await Promise.race([image.decode(), cancellation]);
        aborted(signal);
        let width = image.naturalWidth;
        let height = image.naturalHeight;
        if (type === "image/svg+xml" && (!width || !height)) {
            width = width || 300;
            height = height || 150;
        }
        if (
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width <= 0 ||
            height <= 0
        ) {
            throw new Error(
                "The image has no usable dimensions. Export it with a valid size or SVG viewBox.",
            );
        }
        if (
            width > maxDimension ||
            height > maxDimension ||
            width * height > maxPixels
        ) {
            throw new Error(
                "Image dimensions exceed 32768 pixels per side or 64 million pixels. Resize it before importing.",
            );
        }
        return { url, width, height, name };
    } catch (error) {
        URL.revokeObjectURL(url);
        image.removeAttribute("src");
        aborted(signal);
        if (error?.name === "EncodingError") {
            throw new Error(
                "The browser could not decode this image. It may be damaged or unsupported; try exporting it as PNG or SVG.",
                { cause: error },
            );
        }
        throw error;
    } finally {
        signal?.removeEventListener("abort", onAbort);
    }
}

/** The caller owns the returned blob URL until add() transfers it to a layer. */
export async function loadImageFile(file, options = {}) {
    if (!(file instanceof Blob))
        throw new TypeError("Choose an image file to import.");
    return decodeBlob(file, file.name || "Imported image", options);
}

async function readImageBody(response, signal) {
    const type = response.headers.get("content-type") || "";
    if (!response.body) return new Blob([], { type });
    const reader = response.body.getReader();
    const cancel = () => reader.cancel().catch(() => {});
    const onAbort = () => {
        void cancel();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
        const chunks = [];
        let size = 0;
        while (true) {
            aborted(signal);
            const { done, value } = await reader.read();
            aborted(signal);
            if (done) break;
            // Fetch exposes decompressed bytes; Content-Length may be absent or compressed.
            size += value.byteLength;
            if (size > maxBytes) {
                throw new Error(
                    "Image exceeds the 32 MiB import limit. Choose a smaller image.",
                );
            }
            chunks.push(value);
        }
        return new Blob(chunks, { type });
    } catch (error) {
        await cancel();
        aborted(signal);
        throw error;
    } finally {
        signal?.removeEventListener("abort", onAbort);
        reader.releaseLock();
    }
}

export async function loadImageUrl(input, { signal } = {}) {
    aborted(signal);
    let url;
    try {
        url = new URL(input, document.baseURI);
    } catch {
        throw new Error("Enter a valid HTTP or HTTPS image URL.");
    }
    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Only HTTP and HTTPS image URLs are supported.");
    }
    if (url.username || url.password)
        throw new Error("Image URLs must not contain credentials.");
    let response;
    try {
        response = await fetch(url.href, {
            mode: "cors",
            credentials: "omit",
            signal,
        });
    } catch (error) {
        aborted(signal);
        throw new Error(
            "Could not fetch the image. Check the URL and ensure the server allows cross-origin (CORS) access, or download and import the file instead.",
            { cause: error },
        );
    }
    if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new Error(
            `Image request failed (HTTP ${response.status}). Check the URL or import a local file.`,
        );
    }
    if (Number(response.headers.get("content-length")) > maxBytes) {
        await response.body?.cancel().catch(() => {});
        throw new Error(
            "Image exceeds the 32 MiB import limit. Choose a smaller image.",
        );
    }
    let name =
        new URL(response.url || url.href).pathname.split("/").pop() ||
        "Imported image";
    try {
        name = decodeURIComponent(name);
    } catch {
        /* Keep malformed escaped filenames readable. */
    }
    const blob = await readImageBody(response, signal);
    return decodeBlob(blob, name, { signal });
}

export class ImageLayer {
    constructor(svg, selectionSvg = svg) {
        this.svg = svg;
        this.assets = new Map();
        this.nodes = new Map();
        this.pending = new Set();
        this.disposed = false;
        this.images = element(svg.ownerDocument, "g", {
            "pointer-events": "none",
        });
        this.selection = element(svg.ownerDocument, "g", {
            "pointer-events": "none",
            stroke: "#72a7ff",
            "stroke-width": 1.5,
            fill: "white",
            display: "none",
        });
        this.outline = element(svg.ownerDocument, "polygon", { fill: "none" });
        this.stem = element(svg.ownerDocument, "line");
        this.handles = Array.from({ length: 4 }, () =>
            element(svg.ownerDocument, "rect", { width: 8, height: 8 }),
        );
        this.rotate = element(svg.ownerDocument, "circle", { r: 5 });
        this.selection.append(
            this.outline,
            this.stem,
            ...this.handles,
            this.rotate,
        );
        svg.append(this.images);
        selectionSvg.append(this.selection);
        this.selectionSignature = "";
    }

    async load(loader, input, { signal } = {}) {
        if (this.disposed)
            throw new Error("This image layer has been disposed.");
        const controller = new AbortController();
        const timeout = setTimeout(
            () =>
                controller.abort(
                    new Error(
                        "Image loading timed out after 30 seconds. Try a local file or another URL.",
                    ),
                ),
            30_000,
        );
        const cancel = () => controller.abort(signal.reason);
        signal?.addEventListener("abort", cancel, { once: true });
        if (signal?.aborted) cancel();
        this.pending.add(controller);
        let asset;
        try {
            asset = await loader(input, { signal: controller.signal });
            aborted(controller.signal);
            return asset;
        } catch (error) {
            if (asset) revokeAsset(asset);
            throw error;
        } finally {
            clearTimeout(timeout);
            this.pending.delete(controller);
            signal?.removeEventListener("abort", cancel);
        }
    }

    loadFile(file, options) {
        return this.load(loadImageFile, file, options);
    }
    loadUrl(url, options) {
        return this.load(loadImageUrl, url, options);
    }

    async snapshotAssets(expectedIds) {
        const entries = [...this.assets];
        const actualIds = new Set(entries.map(([id]) => id));
        if (
            actualIds.size !== expectedIds.size ||
            [...expectedIds].some((id) => !actualIds.has(id))
        )
            throw new Error("Image metadata and assets changed during save.");
        const records = [];
        let totalBytes = 0;
        for (const [id, asset] of entries) {
            const response = await fetch(asset.url);
            if (!response.ok)
                throw new Error(`Could not read image asset ${id}.`);
            const blob = await response.blob();
            totalBytes += blob.size;
            if (totalBytes > maxSavedAssetBytes)
                throw new Error("Project image assets exceed 256 MiB.");
            records.push({ id, name: asset.name, blob });
        }
        return records;
    }

    async decodeAssets(records, expectedIds, { signal } = {}) {
        if (!Array.isArray(records) || records.length > maxSavedAssets)
            throw new Error("Saved project has too many image assets.");
        const totalBytes = records.reduce(
            (total, record) => total + (record?.blob?.size ?? 0),
            0,
        );
        if (totalBytes > maxSavedAssetBytes)
            throw new Error("Saved project image assets exceed 256 MiB.");
        const recordIds = new Set(records.map((record) => record?.id));
        if (
            recordIds.size !== records.length ||
            recordIds.size !== expectedIds.size ||
            [...expectedIds].some((id) => !recordIds.has(id))
        )
            throw new Error("Saved image metadata and assets do not match.");
        const decoded = [];
        const ids = new Set();
        try {
            for (const record of records ?? []) {
                if (!Number.isSafeInteger(record?.id) || record.id < 0)
                    throw new Error("Saved image asset has an invalid ID.");
                if (ids.has(record.id))
                    throw new Error(
                        `Saved image asset ${record.id} is duplicated.`,
                    );
                ids.add(record.id);
                if (!(record.blob instanceof Blob))
                    throw new Error(
                        `Saved image asset ${record.id} is missing.`,
                    );
                const asset = await decodeBlob(
                    record.blob,
                    record.name || "Saved image",
                    { signal },
                );
                asset.name = record.name || asset.name;
                decoded.push({ id: record.id, asset });
            }
            return decoded;
        } catch (error) {
            for (const { asset } of decoded) revokeAsset(asset);
            throw error;
        }
    }

    replaceAssets(decoded) {
        for (const asset of this.assets.values()) revokeAsset(asset);
        this.assets.clear();
        for (const entry of this.nodes.values()) entry.node.remove();
        this.nodes.clear();
        for (const { id, asset } of decoded) this.add(id, asset);
    }

    /** Takes ownership of the descriptor; culling never releases this asset. */
    add(id, asset) {
        if (this.disposed)
            throw new Error("This image layer has been disposed.");
        if (!asset?.url?.startsWith("blob:"))
            throw new TypeError(
                "Image assets must use a locally loaded blob URL.",
            );
        const previous = this.assets.get(id);
        this.assets.set(id, asset);
        if (previous && previous.url !== asset.url) this.release(previous);
    }

    release(asset) {
        if (![...this.assets.values()].some((other) => other.url === asset.url))
            revokeAsset(asset);
    }

    remove(id) {
        const asset = this.assets.get(id);
        this.assets.delete(id);
        this.nodes.get(id)?.node.remove();
        this.nodes.delete(id);
        if (asset) this.release(asset);
    }

    update(view, { editing = false } = {}) {
        if (this.disposed) return;
        const alive = new Set();
        let position = 0;
        for (const item of view.images ?? []) {
            const asset = this.assets.get(item.id);
            if (!asset) continue;
            alive.add(item.id);
            let entry = this.nodes.get(item.id);
            if (!entry) {
                entry = {
                    node: element(this.svg.ownerDocument, "image", {
                        preserveAspectRatio: "xMidYMid meet",
                    }),
                    signature: "",
                };
                this.nodes.set(item.id, entry);
            }
            const signature = JSON.stringify([
                asset.url,
                item.x,
                item.y,
                item.width,
                item.height,
                item.angle,
                item.opacity,
            ]);
            if (entry.signature !== signature) {
                entry.signature = signature;
                const attrs = {
                    href: asset.url,
                    x: -item.width / 2,
                    y: -item.height / 2,
                    width: item.width,
                    height: item.height,
                    transform: `translate(${item.x} ${item.y}) rotate(${item.angle ?? 0})`,
                    opacity: item.opacity ?? 1,
                };
                for (const [key, value] of Object.entries(attrs))
                    entry.node.setAttribute(key, value);
            }
            // Preserve Rust's stacking order without moving unchanged keyed nodes.
            const next = this.images.children[position];
            if (next !== entry.node)
                this.images.insertBefore(entry.node, next || null);
            position++;
        }
        for (const [id, entry] of this.nodes) {
            if (!alive.has(id)) {
                entry.node.remove();
                this.nodes.delete(id);
            }
        }
        const selection = editing ? view.selection : null;
        const signature = JSON.stringify(selection ?? null);
        if (signature === this.selectionSignature) return;
        this.selectionSignature = signature;
        this.selection.setAttribute("display", selection ? "inline" : "none");
        if (!selection) return;
        const { corners, rotate } = selection;
        this.outline.setAttribute(
            "points",
            corners.map((p) => `${p.x},${p.y}`).join(" "),
        );
        corners.forEach((p, index) => {
            this.handles[index].setAttribute("x", p.x - 4);
            this.handles[index].setAttribute("y", p.y - 4);
        });
        this.stem.setAttribute("x1", (corners[0].x + corners[1].x) / 2);
        this.stem.setAttribute("y1", (corners[0].y + corners[1].y) / 2);
        this.stem.setAttribute("x2", rotate.x);
        this.stem.setAttribute("y2", rotate.y);
        this.rotate.setAttribute("cx", rotate.x);
        this.rotate.setAttribute("cy", rotate.y);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const controller of this.pending) controller.abort();
        for (const url of new Set(
            [...this.assets.values()].map((asset) => asset.url),
        ))
            revokeAsset({ url });
        this.assets.clear();
        this.nodes.clear();
        this.images.remove();
        this.selection.remove();
    }
}

// Artboard layer ordering and list controls.
const dragType = "application/x-strata-art-layer";

/** Convert a visual row edge to a native index after removing the source. */
export function layerDropIndex(ids, sourceId, targetId, before) {
    const source = ids.indexOf(sourceId);
    if (source < 0 || !ids.includes(targetId)) return -1;
    if (sourceId === targetId) return source;
    const remaining = ids.filter((id) => id !== sourceId);
    return remaining.indexOf(targetId) + (before ? 1 : 0);
}

export class ArtboardLayers {
    constructor(listElement, callbacks) {
        this.list = listElement;
        this.callbacks = callbacks;
        this.rows = new Map();
        this.ids = [];
        this.dragId = null;
        this.indicator = null;
        this.disposed = false;
        this.listeners = new Map();
        for (const type of [
            "click",
            "dblclick",
            "dragstart",
            "dragover",
            "drop",
            "dragend",
            "dragleave",
        ]) {
            const listener = (event) => this.handle(type, event);
            this.listeners.set(type, listener);
            this.list.addEventListener(type, listener);
        }
    }

    update(images, status, assetUrlFn) {
        if (this.disposed) return;
        this.ids = images.map((image) => String(image.id));
        const present = new Set(this.ids);
        for (const [id, entry] of this.rows) {
            if (present.has(id)) continue;
            entry.row.remove();
            this.rows.delete(id);
        }
        if (this.dragId !== null && !present.has(this.dragId)) this.endDrag();
        if (this.indicator && !present.has(this.indicator.dataset.imageId))
            this.clearIndicator();

        for (let index = 0; index < images.length; index++) {
            const image = images[index];
            const id = String(image.id);
            let entry = this.rows.get(id);
            if (!entry) {
                entry = this.createRow(id);
                this.rows.set(id, entry);
            }
            entry.id = image.id;
            entry.visible = image.visible;
            entry.locked = image.locked;
            const selected =
                status?.selected != null && String(status.selected) === id;
            entry.row.classList.toggle("is-selected", selected);
            if (selected) entry.row.setAttribute("aria-current", "true");
            else entry.row.removeAttribute("aria-current");
            if (entry.name.textContent !== image.name)
                entry.name.textContent = image.name;
            const url = assetUrlFn(image.id);
            if (url == null || url === "") {
                if (entry.thumbnail.hasAttribute("src"))
                    entry.thumbnail.removeAttribute("src");
            } else if (entry.thumbnail.getAttribute("src") !== url) {
                entry.thumbnail.setAttribute("src", url);
            }
            this.label(
                entry.visibleButton,
                image.visible ? "Hide" : "Show",
                image.name,
            );
            this.label(
                entry.lockButton,
                image.locked ? "Unlock" : "Lock",
                image.name,
            );
            this.label(entry.raise, "Raise", image.name);
            this.label(entry.lower, "Lower", image.name);
            entry.raise.disabled = index === images.length - 1;
            entry.lower.disabled = index === 0;
        }

        // Leave already ordered nodes attached, preserving keyboard focus each frame.
        for (
            let visualIndex = 0;
            visualIndex < this.ids.length;
            visualIndex++
        ) {
            const id = this.ids[this.ids.length - 1 - visualIndex];
            const row = this.rows.get(id).row;
            const next = this.list.children[visualIndex] || null;
            if (next !== row) this.list.insertBefore(row, next);
        }
    }

    label(button, action, name) {
        if (button.textContent !== action) button.textContent = action;
        button.setAttribute("aria-label", `${action} ${name}`);
    }

    createRow(id) {
        const document = this.list.ownerDocument;
        const row = document.createElement("li");
        row.className = "art-layer";
        row.dataset.imageId = id;
        row.draggable = true;
        const thumbnail = document.createElement("img");
        thumbnail.alt = "";
        thumbnail.width = 32;
        thumbnail.height = 24;
        thumbnail.draggable = false;
        row.append(thumbnail);
        const button = (className) => {
            const node = document.createElement("button");
            node.type = "button";
            node.className = className;
            row.append(node);
            return node;
        };
        return {
            row,
            thumbnail,
            name: button("art-layer-name"),
            visibleButton: button("art-layer-visible"),
            lockButton: button("art-layer-lock"),
            raise: button("art-layer-raise"),
            lower: button("art-layer-lower"),
        };
    }

    entryFor(node) {
        while (node && node !== this.list) {
            const entry = this.rows.get(node.dataset?.imageId);
            if (entry?.row === node && node.parentElement === this.list)
                return entry;
            node = node.parentElement;
        }
        return null;
    }

    clearIndicator() {
        this.indicator?.classList.remove("drop-before", "drop-after");
        this.indicator = null;
    }

    endDrag() {
        this.clearIndicator();
        this.dragId = null;
    }

    handle(type, event) {
        if (type === "dragend") return this.endDrag();
        if (type === "dragleave") {
            if (!this.list.contains(event.relatedTarget)) this.clearIndicator();
            return;
        }
        const entry = this.entryFor(event.target);
        if (type === "click" || type === "dblclick") {
            if (!entry) return;
            const target = event.target;
            if (
                target === entry.name ||
                target === entry.thumbnail ||
                target === entry.row
            ) {
                this.callbacks[type === "click" ? "select" : "frame"](entry.id);
            } else if (type === "click" && !target.disabled) {
                if (target === entry.visibleButton)
                    this.callbacks.visible(entry.id, !entry.visible);
                else if (target === entry.lockButton)
                    this.callbacks.locked(entry.id, !entry.locked);
                else if (target === entry.raise || target === entry.lower) {
                    const index = this.ids.indexOf(String(entry.id));
                    this.callbacks.reorder(
                        entry.id,
                        index + (target === entry.raise ? 1 : -1),
                    );
                }
            }
            return;
        }
        if (type === "dragstart") {
            // The row is draggable, but the thumbnail must never start a browser image drag.
            if (
                !entry ||
                event.target === entry.thumbnail ||
                !event.dataTransfer
            ) {
                event.preventDefault();
                return;
            }
            this.endDrag();
            this.dragId = String(entry.id);
            event.dataTransfer.setData(dragType, this.dragId);
            event.dataTransfer.effectAllowed = "move";
            return;
        }
        if (
            this.dragId === null ||
            !entry ||
            !event.dataTransfer ||
            !Array.from(event.dataTransfer.types).includes(dragType)
        ) {
            this.clearIndicator();
            return;
        }
        const rect = entry.row.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        if (type === "dragover") {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            this.clearIndicator();
            this.indicator = entry.row;
            entry.row.classList.add(before ? "drop-before" : "drop-after");
        } else if (type === "drop") {
            event.preventDefault();
            const sourceId = this.dragId;
            const payload = event.dataTransfer.getData(dragType);
            this.endDrag();
            if (payload !== sourceId) return;
            const index = layerDropIndex(
                this.ids,
                sourceId,
                String(entry.id),
                before,
            );
            if (index >= 0 && index !== this.ids.indexOf(sourceId))
                this.callbacks.reorder(this.rows.get(sourceId).id, index);
        }
    }

    dispose() {
        for (const [type, listener] of this.listeners)
            this.list.removeEventListener(type, listener);
        this.listeners.clear();
        this.endDrag();
        this.rows.clear();
        this.disposed = true;
    }
}
