// Text is an SVG overlay; node bodies, ports, and wires are WebGPU-rendered.
// Picking always uses Rust geometry, so this layer must never consume pointer input.
const ns = "http://www.w3.org/2000/svg";
const element = (name, attrs = {}, text) => {
    const node = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs))
        node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
};

export class GraphLabels {
    constructor(svg) {
        this.svg = svg;
        this.nodes = new Map();
        this.layoutSignature = "";
        this.defs = element("defs");
        svg.append(this.defs);
    }

    update(view) {
        const alive = new Set();
        let layoutSignature = `${this.svg.clientWidth}:${this.svg.clientHeight}|`;
        for (const {
            id,
            x,
            y,
            width,
            height,
            scale,
            opacity = 1,
        } of view.nodes)
            layoutSignature += `${id}:${x}:${y}:${width}:${height}:${scale}:${opacity};`;
        for (const node of view.nodes) {
            alive.add(node.id);
            let entry = this.nodes.get(node.id);
            if (!entry) {
                const clip = element("clipPath", {
                    id: `node-label-clip-${node.id}`,
                    clipPathUnits: "userSpaceOnUse",
                });
                const rect = element("rect");
                clip.append(rect);
                const mask = element("mask", {
                    id: `node-label-mask-${node.id}`,
                    maskUnits: "userSpaceOnUse",
                    maskContentUnits: "userSpaceOnUse",
                });
                this.defs.append(clip, mask);
                const group = element("g", { "data-node-id": node.id });
                const content = element("g", {
                    "clip-path": `url(#node-label-clip-${node.id})`,
                });
                group.append(content);
                this.svg.append(group);
                entry = {
                    clip,
                    mask,
                    rect,
                    group,
                    content,
                    signature: "",
                    occlusionSignature: "",
                };
                this.nodes.set(node.id, entry);
            }
            // No text DOM changes during ordinary hover or wire-preview movement.
            const signature = JSON.stringify(node);
            if (signature === entry.signature) continue;
            entry.signature = signature;
            entry.group.setAttribute("opacity", node.opacity ?? 1);
            entry.group.setAttribute(
                "transform",
                `translate(${node.x} ${node.y})`,
            );
            entry.rect.setAttribute("width", node.width);
            entry.rect.setAttribute("height", node.height);
            entry.rect.setAttribute("rx", 6 * node.scale);
            entry.group.setAttribute(
                "display",
                13 * node.scale >= 7 ? "inline" : "none",
            );
            const children = [
                element(
                    "text",
                    {
                        x: 14 * node.scale,
                        y: 21 * node.scale,
                        "font-size": 13 * node.scale,
                        "font-weight": 600,
                        class: "node-title",
                    },
                    node.title,
                ),
            ];
            if (11 * node.scale >= 7) {
                for (const port of node.ports) {
                    const input = port.direction === "input";
                    children.push(
                        element(
                            "text",
                            {
                                x: input
                                    ? 12 * node.scale
                                    : node.width - 12 * node.scale,
                                y: port.y - node.y + 4 * node.scale,
                                "text-anchor": input ? "start" : "end",
                                "font-size": 11 * node.scale,
                                class: "node-port-label",
                            },
                            port.name,
                        ),
                    );
                }
            }
            entry.content.replaceChildren(...children);
        }
        for (const [id, entry] of this.nodes) {
            if (alive.has(id)) continue;
            entry.group.remove();
            entry.clip.remove();
            entry.mask.remove();
            this.nodes.delete(id);
        }
        if (layoutSignature !== this.layoutSignature) {
            this.layoutSignature = layoutSignature;
            this.updateOcclusion(view.nodes);
        }
    }

    updateOcclusion(nodes) {
        // GPU cards cannot cover a separate text overlay. A viewport grid makes
        // sparse layouts output-sensitive instead of scanning every front node
        // for every label. Candidate storage is reused and no slice/filter/map
        // arrays are created per node.
        const viewportWidth = Math.max(0, this.svg.clientWidth);
        const viewportHeight = Math.max(0, this.svg.clientHeight);
        const cellSize = 256;
        const columns = Math.max(1, Math.ceil(viewportWidth / cellSize));
        const rows = Math.max(1, Math.ceil(viewportHeight / cellSize));
        const cells = new Array(columns * rows);
        for (let index = 0; index < nodes.length; index++) {
            const node = nodes[index];
            const left = Math.max(0, node.x);
            const top = Math.max(0, node.y);
            const right = Math.min(viewportWidth, node.x + node.width);
            const bottom = Math.min(viewportHeight, node.y + node.height);
            if (right <= left || bottom <= top) continue;
            const firstColumn = Math.min(
                columns - 1,
                Math.floor(left / cellSize),
            );
            const lastColumn = Math.min(
                columns - 1,
                Math.floor((right - Number.EPSILON) / cellSize),
            );
            const firstRow = Math.min(rows - 1, Math.floor(top / cellSize));
            const lastRow = Math.min(
                rows - 1,
                Math.floor((bottom - Number.EPSILON) / cellSize),
            );
            for (let row = firstRow; row <= lastRow; row++) {
                for (let column = firstColumn; column <= lastColumn; column++) {
                    const cell = row * columns + column;
                    (cells[cell] ??= []).push(index);
                }
            }
        }

        const seen = new Uint32Array(nodes.length);
        const candidates = [];
        let stamp = 0;
        for (let index = 0; index < nodes.length; index++) {
            const node = nodes[index];
            const entry = this.nodes.get(node.id);
            const x = Math.max(0, -node.x);
            const y = Math.max(0, -node.y);
            const width = Math.max(
                0,
                Math.min(node.width, viewportWidth - node.x) - x,
            );
            const height = Math.max(
                0,
                Math.min(node.height, viewportHeight - node.y) - y,
            );
            candidates.length = 0;
            stamp++;
            if (13 * node.scale >= 7 && width > 0 && height > 0) {
                const left = Math.max(0, node.x);
                const top = Math.max(0, node.y);
                const right = Math.min(viewportWidth, node.x + node.width);
                const bottom = Math.min(viewportHeight, node.y + node.height);
                const firstColumn = Math.min(
                    columns - 1,
                    Math.floor(left / cellSize),
                );
                const lastColumn = Math.min(
                    columns - 1,
                    Math.floor((right - Number.EPSILON) / cellSize),
                );
                const firstRow = Math.min(rows - 1, Math.floor(top / cellSize));
                const lastRow = Math.min(
                    rows - 1,
                    Math.floor((bottom - Number.EPSILON) / cellSize),
                );
                for (let row = firstRow; row <= lastRow; row++) {
                    for (
                        let column = firstColumn;
                        column <= lastColumn;
                        column++
                    ) {
                        const bucket = cells[row * columns + column];
                        if (!bucket) continue;
                        for (const frontIndex of bucket) {
                            if (
                                frontIndex <= index ||
                                seen[frontIndex] === stamp
                            )
                                continue;
                            seen[frontIndex] = stamp;
                            const front = nodes[frontIndex];
                            if (
                                front.x < node.x + node.width &&
                                front.x + front.width > node.x &&
                                front.y < node.y + node.height &&
                                front.y + front.height > node.y
                            )
                                candidates.push(frontIndex);
                        }
                    }
                }
                candidates.sort((a, b) => a - b);
            }

            let signature = `${x}:${y}:${width}:${height}|`;
            for (const frontIndex of candidates) {
                const front = nodes[frontIndex];
                signature += `${front.id}:${front.x}:${front.y}:${front.width}:${front.height}:${front.scale}:${front.opacity ?? 1};`;
            }
            if (signature === entry.occlusionSignature) continue;
            entry.occlusionSignature = signature;
            if (!candidates.length || width === 0 || height === 0) {
                entry.content.removeAttribute("mask");
                entry.mask.replaceChildren();
                continue;
            }

            entry.mask.setAttribute("x", x);
            entry.mask.setAttribute("y", y);
            entry.mask.setAttribute("width", width);
            entry.mask.setAttribute("height", height);
            entry.mask.replaceChildren(
                element("rect", {
                    width: node.width,
                    height: node.height,
                    fill: "white",
                }),
            );
            for (const frontIndex of candidates) {
                const front = nodes[frontIndex];
                entry.mask.append(
                    element("rect", {
                        x: front.x - node.x,
                        y: front.y - node.y,
                        width: front.width,
                        height: front.height,
                        rx: 6 * front.scale,
                        fill: "black",
                        opacity: front.opacity ?? 1,
                    }),
                );
            }
            entry.content.setAttribute(
                "mask",
                `url(#node-label-mask-${node.id})`,
            );
        }
    }
}
