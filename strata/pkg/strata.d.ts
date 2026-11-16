/* tslint:disable */
/* eslint-disable */

/**
 * Browser-owned renderer. Dropping/freeing it releases its GPU resources.
 */
export class WebCanvas {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Begin a world-space brush stroke at canvas-local CSS coordinates.
     */
    begin_brush(x: number, y: number): boolean;
    cancel_drawing(): void;
    /**
     * Inspect stored world-space geometry, independent of camera navigation.
     */
    circles(): any;
    clear_drawing_cursor(): void;
    /**
     * Create a renderer, or reject with a diagnostic if WebGPU is unavailable
     * (including insecure contexts), adapter/device requests fail, or GPU setup
     * fails validation. This requires a canvas not owned by another renderer.
     */
    static create(canvas: HTMLCanvasElement): Promise<WebCanvas>;
    /**
     * Append a world-space circle at canvas-local CSS coordinates.
     */
    create_circle(x: number, y: number): boolean;
    drawing_move(x: number, y: number): void;
    drawing_status(): any;
    end_brush(x: number, y: number): boolean;
    finish_polyline(closed: boolean): boolean;
    /**
     * Drag content by CSS pixels (x right, y down).
     */
    pan(dx: number, dy: number): void;
    /**
     * Inspect CPU timings, not GPU completion times, without rendering.
     * Geometry subtimings are nested within stroke_prepare_ms, not additive.
     */
    performance_stats(): any;
    polyline_click(x: number, y: number): boolean;
    /**
     * Submit and present one frame. Transient acquisition failures return false;
     * lost/outdated surfaces are reconfigured for a subsequent call. Validation,
     * device loss, and uncaptured errors return Err. Asynchronous GPU errors are
     * reported on the next render call; true means submitted, not GPU-completed.
     */
    render(): boolean;
    reset(): void;
    /**
     * Clear the successful-frame counter and latest sample without rendering.
     */
    reset_performance_stats(): void;
    /**
     * Resize backing storage, never the canvas's CSS style. Invalid dimensions
     * or DPR are ignored atomically. CSS sizes must also be representable as
     * positive finite GPU floats. Backing dimensions are rounded and clamped to
     * the device limit; actual per-axis backing/CSS ratios are used for drawing.
     * Changing only DPR leaves all camera/world calculations unchanged.
     */
    resize(width: number, height: number, dpr: number): void;
    /**
     * Return `{ x, y }` in world metres (x right, y up).
     */
    screen_to_world(x: number, y: number): any;
    /**
     * Enable CPU-side frame profiling. Changing modes clears collected stats.
     */
    set_profiling(enabled: boolean): void;
    /**
     * Return center, pixels_per_meter, minor_step, major_step, scale_label,
     * scale_pixels, and circle_count. The scale represents one major grid interval; its pixel
     * length is in CSS pixels, independent of DPR and backing-store clamping.
     */
    status(): any;
    /**
     * All committed strokes, including closed polygon outlines, in world metres.
     */
    strokes(): any;
    undo_vertex(): void;
    /**
     * Convert world metres to canvas-local CSS pixels.
     */
    world_to_screen(x: number, y: number): any;
    /**
     * Zoom around a cursor position in canvas-local CSS pixels.
     */
    zoom(x: number, y: number, factor: number): void;
}

export function empty_editor_snapshot(): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_webcanvas_free: (a: number, b: number) => void;
    readonly empty_editor_snapshot: () => [number, number, number];
    readonly webcanvas_begin_brush: (a: number, b: number, c: number) => number;
    readonly webcanvas_cancel_drawing: (a: number) => void;
    readonly webcanvas_circles: (a: number) => any;
    readonly webcanvas_clear_drawing_cursor: (a: number) => void;
    readonly webcanvas_create: (a: any) => any;
    readonly webcanvas_create_circle: (a: number, b: number, c: number) => number;
    readonly webcanvas_drawing_move: (a: number, b: number, c: number) => void;
    readonly webcanvas_drawing_status: (a: number) => any;
    readonly webcanvas_end_brush: (a: number, b: number, c: number) => number;
    readonly webcanvas_finish_polyline: (a: number, b: number) => number;
    readonly webcanvas_pan: (a: number, b: number, c: number) => void;
    readonly webcanvas_performance_stats: (a: number) => any;
    readonly webcanvas_polyline_click: (a: number, b: number, c: number) => number;
    readonly webcanvas_render: (a: number) => [number, number, number];
    readonly webcanvas_reset: (a: number) => void;
    readonly webcanvas_reset_performance_stats: (a: number) => void;
    readonly webcanvas_resize: (a: number, b: number, c: number, d: number) => void;
    readonly webcanvas_screen_to_world: (a: number, b: number, c: number) => any;
    readonly webcanvas_set_profiling: (a: number, b: number) => [number, number];
    readonly webcanvas_status: (a: number) => any;
    readonly webcanvas_strokes: (a: number) => any;
    readonly webcanvas_undo_vertex: (a: number) => void;
    readonly webcanvas_world_to_screen: (a: number, b: number, c: number) => any;
    readonly webcanvas_zoom: (a: number, b: number, c: number, d: number) => void;
    readonly wasm_bindgen_ca0e378dedb338bd___convert__closures_____invoke___js_sys_be4515aa693f1072___Function_fn_wasm_bindgen_ca0e378dedb338bd___JsValue_____wasm_bindgen_ca0e378dedb338bd___sys__Undefined___js_sys_be4515aa693f1072___Function_fn_wasm_bindgen_ca0e378dedb338bd___JsValue_____wasm_bindgen_ca0e378dedb338bd___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_ca0e378dedb338bd___convert__closures_____invoke___wasm_bindgen_ca0e378dedb338bd___JsValue__core_d941ad8722425d2e___result__Result_____wasm_bindgen_ca0e378dedb338bd___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_ca0e378dedb338bd___convert__closures_____invoke___wasm_bindgen_ca0e378dedb338bd___sys__JsNullable_wgpu_8044788837d27cc0___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_d941ad8722425d2e___result__Result_____wasm_bindgen_ca0e378dedb338bd___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_ca0e378dedb338bd___convert__closures_____invoke___wasm_bindgen_ca0e378dedb338bd___sys__JsNullable_wgpu_8044788837d27cc0___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_d941ad8722425d2e___result__Result_____wasm_bindgen_ca0e378dedb338bd___JsError___true__30: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_ca0e378dedb338bd___convert__closures_____invoke___wasm_bindgen_ca0e378dedb338bd___sys__JsNullable_wgpu_8044788837d27cc0___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_d941ad8722425d2e___result__Result_____wasm_bindgen_ca0e378dedb338bd___JsError___true__31: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen_ca0e378dedb338bd___convert__closures_____invoke___wgpu_8044788837d27cc0___backend__webgpu__webgpu_sys__gen_GpuDeviceLostInfo__GpuDeviceLostInfo______true_: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen_ca0e378dedb338bd___convert__closures_____invoke___wgpu_8044788837d27cc0___backend__webgpu__webgpu_sys__gen_GpuDeviceLostInfo__GpuDeviceLostInfo______true__29: (a: number, b: number, c: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
