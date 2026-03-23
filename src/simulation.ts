import computeShader from "./shaders/compute.wgsl?raw";
import renderShader from "./shaders/render.wgsl?raw";
import { createEmojiAtlas, TILE_SIZE, TILE_COUNT } from "./emoji-atlas";

// Uniform buffer layout (32 bytes):
// [0..4]   width: u32
// [4..8]   height: u32
// [8..12]  generation: u32
// [12..16] cell_aspect: f32
// [16..20] camera_x: f32
// [20..24] camera_y: f32
// [24..28] camera_zoom: f32
// [28..32] _pad: f32
const UNIFORM_SIZE = 32;
const ATOMIC_ZERO = new Uint32Array([0]);

// Cell buffers (cellsA, cellsB) store binary 0/1 (dead/alive).
// Visual states (0–5) go into the state buffer only, written by the visual pass.
// 0 = Void, 1 = Fresh, 2 = Cool, 3 = Party, 4 = OMG, 5 = Skull

export class Simulation {
    // Device-level resources (survive resize)
    readonly device: GPUDevice;
    private queue: GPUQueue;
    private context: GPUCanvasContext;
    private stepPipeline: GPUComputePipeline;
    private visualPipeline: GPUComputePipeline;
    private hashPipeline: GPUComputePipeline;
    private computeBGL: GPUBindGroupLayout;
    private renderPipeline: GPURenderPipeline;
    private renderBGL: GPUBindGroupLayout;
    private emojiTexture: GPUTexture;
    private emojiSampler: GPUSampler;

    // Grid-level resources (recreated on resize)
    private _width!: number;
    private _height!: number;
    private _generation = 0;
    private phase = 0;
    private uniformBuffer!: GPUBuffer;
    private cellsA!: GPUBuffer;
    private cellsB!: GPUBuffer;
    private stateBuffer!: GPUBuffer;
    private hashBuffer!: GPUBuffer;
    private popBuffer!: GPUBuffer;
    private readbackBuffer!: GPUBuffer;
    private computeBindGroups!: [GPUBindGroup, GPUBindGroup];
    private renderBindGroup!: GPUBindGroup;

    private constructor(
        device: GPUDevice,
        context: GPUCanvasContext,
        pipelines: {
            step: GPUComputePipeline;
            visual: GPUComputePipeline;
            hash: GPUComputePipeline;
            render: GPURenderPipeline;
        },
        layouts: {
            compute: GPUBindGroupLayout;
            render: GPUBindGroupLayout;
        },
        emoji: {
            texture: GPUTexture;
            sampler: GPUSampler;
        },
    ) {
        this.device = device;
        this.queue = device.queue;
        this.context = context;
        this.stepPipeline = pipelines.step;
        this.visualPipeline = pipelines.visual;
        this.hashPipeline = pipelines.hash;
        this.renderPipeline = pipelines.render;
        this.computeBGL = layouts.compute;
        this.renderBGL = layouts.render;
        this.emojiTexture = emoji.texture;
        this.emojiSampler = emoji.sampler;
    }

    static async create(canvas: HTMLCanvasElement, width: number, height: number): Promise<Simulation> {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("No GPU adapter found");

        const device = await adapter.requestDevice({
            requiredLimits: {
                maxStorageBufferBindingSize: Math.max(
                    adapter.limits.maxStorageBufferBindingSize,
                    width * height * 4,
                ),
                maxBufferSize: Math.max(
                    adapter.limits.maxBufferSize,
                    width * height * 4,
                ),
            },
        });

        const context = canvas.getContext("webgpu")!;
        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({ device, format, alphaMode: "premultiplied" });

        // Create emoji texture atlas
        const atlasSource = createEmojiAtlas();
        const emojiTexture = device.createTexture({
            label: "emoji_atlas",
            size: [TILE_SIZE * TILE_COUNT, TILE_SIZE],
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        device.queue.copyExternalImageToTexture(
            { source: atlasSource },
            { texture: emojiTexture },
            [TILE_SIZE * TILE_COUNT, TILE_SIZE],
        );
        const emojiSampler = device.createSampler({
            label: "emoji_sampler",
            magFilter: "linear",
            minFilter: "linear",
        });

        // --- Compute pipelines ---
        const computeModule = device.createShaderModule({ label: "compute", code: computeShader });

        const computeBGL = device.createBindGroupLayout({
            label: "compute_bgl",
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
            ],
        });

        const computeLayout = device.createPipelineLayout({ bindGroupLayouts: [computeBGL] });

        const stepPipeline = device.createComputePipeline({
            label: "step_pipeline",
            layout: computeLayout,
            compute: { module: computeModule, entryPoint: "step" },
        });
        const visualPipeline = device.createComputePipeline({
            label: "visual_pipeline",
            layout: computeLayout,
            compute: { module: computeModule, entryPoint: "visual" },
        });
        const hashPipeline = device.createComputePipeline({
            label: "hash_pipeline",
            layout: computeLayout,
            compute: { module: computeModule, entryPoint: "hash" },
        });

        // --- Render pipeline ---
        const renderModule = device.createShaderModule({ label: "render", code: renderShader });

        const renderBGL = device.createBindGroupLayout({
            label: "render_bgl",
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
                { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            ],
        });

        const renderPipeline = device.createRenderPipeline({
            label: "render_pipeline",
            layout: device.createPipelineLayout({ bindGroupLayouts: [renderBGL] }),
            vertex: { module: renderModule, entryPoint: "vs_main" },
            fragment: {
                module: renderModule,
                entryPoint: "fs_main",
                targets: [{ format }],
            },
            primitive: { topology: "triangle-list" },
        });

        const sim = new Simulation(
            device, context,
            { step: stepPipeline, visual: visualPipeline, hash: hashPipeline, render: renderPipeline },
            { compute: computeBGL, render: renderBGL },
            { texture: emojiTexture, sampler: emojiSampler },
        );
        sim.buildGrid(canvas, width, height);
        return sim;
    }

    resize(canvas: HTMLCanvasElement, width: number, height: number): void {
        this.destroyGrid();
        this.buildGrid(canvas, width, height);
    }

    private buildGrid(canvas: HTMLCanvasElement, width: number, height: number): void {
        this._width = width;
        this._height = height;
        this._generation = 0;
        this.phase = 0;

        const cellCount = width * height;
        const bufferSize = cellCount * 4;

        this.uniformBuffer = this.device.createBuffer({
            label: "uniforms",
            size: UNIFORM_SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.cellsA = this.device.createBuffer({
            label: "cells_a",
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.cellsB = this.device.createBuffer({
            label: "cells_b",
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.stateBuffer = this.device.createBuffer({
            label: "state",
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.hashBuffer = this.device.createBuffer({
            label: "hash",
            size: 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });
        this.popBuffer = this.device.createBuffer({
            label: "pop",
            size: 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });
        this.readbackBuffer = this.device.createBuffer({
            label: "readback",
            size: 8,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        // Write initial uniforms
        const uniformData = new ArrayBuffer(UNIFORM_SIZE);
        const u32 = new Uint32Array(uniformData);
        const f32 = new Float32Array(uniformData);
        const cellAspect = (canvas.width / width) / (canvas.height / height);
        u32[0] = width;
        u32[1] = height;
        u32[2] = 0;               // generation
        f32[3] = cellAspect;      // cell_aspect (read by render shader)
        f32[4] = 0;               // camera_x
        f32[5] = 0;               // camera_y
        f32[6] = 1;               // camera_zoom
        f32[7] = 0;
        this.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

        // Phase 0: read A → write B. Phase 1: read B → write A. Both write to state.
        this.computeBindGroups = [
            this.device.createBindGroup({
                label: "compute_bg0",
                layout: this.computeBGL,
                entries: [
                    { binding: 0, resource: { buffer: this.uniformBuffer } },
                    { binding: 1, resource: { buffer: this.cellsA } },
                    { binding: 2, resource: { buffer: this.cellsB } },
                    { binding: 3, resource: { buffer: this.stateBuffer } },
                    { binding: 4, resource: { buffer: this.hashBuffer } },
                    { binding: 5, resource: { buffer: this.popBuffer } },
                ],
            }),
            this.device.createBindGroup({
                label: "compute_bg1",
                layout: this.computeBGL,
                entries: [
                    { binding: 0, resource: { buffer: this.uniformBuffer } },
                    { binding: 1, resource: { buffer: this.cellsB } },
                    { binding: 2, resource: { buffer: this.cellsA } },
                    { binding: 3, resource: { buffer: this.stateBuffer } },
                    { binding: 4, resource: { buffer: this.hashBuffer } },
                    { binding: 5, resource: { buffer: this.popBuffer } },
                ],
            }),
        ];

        // Render reads from the state buffer (always the latest state, no ping-pong needed)
        this.renderBindGroup = this.device.createBindGroup({
            label: "render_bg",
            layout: this.renderBGL,
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: this.stateBuffer } },
                { binding: 2, resource: this.emojiTexture.createView() },
                { binding: 3, resource: this.emojiSampler },
            ],
        });
    }

    private destroyGrid(): void {
        this.uniformBuffer.destroy();
        this.cellsA.destroy();
        this.cellsB.destroy();
        this.stateBuffer.destroy();
        this.hashBuffer.destroy();
        this.popBuffer.destroy();
        this.readbackBuffer.destroy();
    }

    uploadCells(cells: Uint32Array): void {
        this.queue.writeBuffer(this.cellsA, 0, cells.buffer);
        const zeros = new ArrayBuffer(cells.byteLength);
        this.queue.writeBuffer(this.cellsB, 0, zeros);
        this.queue.writeBuffer(this.stateBuffer, 0, cells.buffer);
        this._generation = 0;
        this.phase = 0;

        const genData = new Uint32Array([0]);
        this.queue.writeBuffer(this.uniformBuffer, 8, genData.buffer);
    }

    step(): number {
        this._generation++;

        const genData = new Uint32Array([this._generation]);
        this.queue.writeBuffer(this.uniformBuffer, 8, genData.buffer);

        // Clear atomic buffers before compute
        this.queue.writeBuffer(this.hashBuffer, 0, ATOMIC_ZERO.buffer);
        this.queue.writeBuffer(this.popBuffer, 0, ATOMIC_ZERO.buffer);

        const wgX = Math.ceil(this._width / 8);
        const wgY = Math.ceil(this._height / 8);
        const bg = this.computeBindGroups[this.phase];

        const encoder = this.device.createCommandEncoder();

        // Pass 1: Conway's rules — write binary alive/dead to cells_out
        const stepPass = encoder.beginComputePass();
        stepPass.setPipeline(this.stepPipeline);
        stepPass.setBindGroup(0, bg);
        stepPass.dispatchWorkgroups(wgX, wgY);
        stepPass.end();

        // Pass 2: Visual states — compare prev vs curr, count neighbors in curr
        const visualPass = encoder.beginComputePass();
        visualPass.setPipeline(this.visualPipeline);
        visualPass.setBindGroup(0, bg);
        visualPass.dispatchWorkgroups(wgX, wgY);
        visualPass.end();

        // Pass 3: Hash cells_out for loop detection
        const hashPass = encoder.beginComputePass();
        hashPass.setPipeline(this.hashPipeline);
        hashPass.setBindGroup(0, bg);
        hashPass.dispatchWorkgroups(wgX, wgY);
        hashPass.end();

        this.queue.submit([encoder.finish()]);

        this.phase = 1 - this.phase;
        return this._generation;
    }

    /** Copy hash + population to the readback staging buffer. Call only when readbackBuffer is unmapped. */
    prepareReadback(): void {
        const encoder = this.device.createCommandEncoder();
        encoder.copyBufferToBuffer(this.hashBuffer, 0, this.readbackBuffer, 0, 4);
        encoder.copyBufferToBuffer(this.popBuffer, 0, this.readbackBuffer, 4, 4);
        this.queue.submit([encoder.finish()]);
    }

    async readStats(): Promise<{ hash: number; pop: number }> {
        await this.readbackBuffer.mapAsync(GPUMapMode.READ);
        const data = new Uint32Array(this.readbackBuffer.getMappedRange());
        const hash = data[0];
        const pop = data[1];
        this.readbackBuffer.unmap();
        return { hash, pop };
    }

    render(): void {
        const textureView = this.context.getCurrentTexture().createView();
        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                loadOp: "clear",
                storeOp: "store",
                clearValue: { r: 0.04, g: 0.04, b: 0.06, a: 1 },
            }],
        });
        pass.setPipeline(this.renderPipeline);
        pass.setBindGroup(0, this.renderBindGroup);
        pass.draw(3);
        pass.end();
        this.queue.submit([encoder.finish()]);
    }

    setCamera(offsetX: number, offsetY: number, zoom: number): void {
        const data = new Float32Array([offsetX, offsetY, zoom, 0]);
        this.queue.writeBuffer(this.uniformBuffer, 16, data.buffer);
    }

    updateCellAspect(canvasWidth: number, canvasHeight: number): void {
        const aspect = (canvasWidth / this._width) / (canvasHeight / this._height);
        const data = new Float32Array([aspect]);
        this.queue.writeBuffer(this.uniformBuffer, 12, data.buffer);
    }

    get width(): number { return this._width; }
    get height(): number { return this._height; }
    get generation(): number { return this._generation; }

    destroy(): void {
        this.destroyGrid();
        this.emojiTexture.destroy();
    }
}
