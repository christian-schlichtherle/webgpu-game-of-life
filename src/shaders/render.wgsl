struct Uniforms {
    width: u32,
    height: u32,
    generation: u32,
    cell_aspect: f32,  // cell pixel width / cell pixel height (for square emoji)
    camera_x: f32,
    camera_y: f32,
    camera_zoom: f32,
    _pad2: f32,
};

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

// Visual states: 0=Void, 1=Fresh, 2=Cool, 3=Party, 4=OMG, 5=Skull

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> state: array<u32>;
@group(0) @binding(2) var emoji_texture: texture_2d<f32>;
@group(0) @binding(3) var emoji_sampler: sampler;

const TILE_COUNT: f32 = 6.0;
const BG: vec3f = vec3f(0.04, 0.04, 0.06);

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(vi & 1u)) * 4.0 - 1.0;
    let y = f32(i32(vi >> 1u)) * 4.0 - 1.0;
    out.position = vec4f(x, y, 0.0, 1.0);
    out.uv = vec2f((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    // Map screen UV to square grid UV, letterboxing the shorter axis
    let aspect = uniforms.cell_aspect;
    var screen_uv = in.uv;
    if (aspect > 1.0) {
        screen_uv.x = (screen_uv.x - 0.5) * aspect + 0.5;
    } else {
        screen_uv.y = (screen_uv.y - 0.5) / aspect + 0.5;
    }

    let zoom = max(uniforms.camera_zoom, 0.01);
    let uv = (screen_uv - 0.5) / zoom + 0.5 + vec2f(uniforms.camera_x, uniforms.camera_y);
    // Outside the grid → background (no tiling)
    if (uv.x < 0.0 || uv.x >= 1.0 || uv.y < 0.0 || uv.y >= 1.0) {
        return vec4f(BG, 1.0);
    }

    let col = min(u32(uv.x * f32(uniforms.width)), uniforms.width - 1u);
    let row = min(u32(uv.y * f32(uniforms.height)), uniforms.height - 1u);
    let i = row * uniforms.width + col;

    let cell_state = state[i];

    // Void: show background
    if (cell_state == 0u) {
        return vec4f(BG, 1.0);
    }

    // Cell UV within the tile (cells are now square, no per-cell correction needed)
    var cell_uv = fract(vec2f(uv.x * f32(uniforms.width), uv.y * f32(uniforms.height)));

    // Outside the square region → background
    if (cell_uv.x < 0.0 || cell_uv.x > 1.0 || cell_uv.y < 0.0 || cell_uv.y > 1.0) {
        return vec4f(BG, 1.0);
    }

    let tile_x = (f32(cell_state) + cell_uv.x) / TILE_COUNT;
    let tile_y = cell_uv.y;
    let emoji_color = textureSample(emoji_texture, emoji_sampler, vec2f(tile_x, tile_y));

    // If the emoji pixel is nearly transparent, show background
    if (emoji_color.a < 0.1) {
        return vec4f(BG, 1.0);
    }

    // Skull: 50% opacity blend with background
    if (cell_state == 5u) {
        let blended = mix(BG, emoji_color.rgb, 0.5 * emoji_color.a);
        return vec4f(blended, 1.0);
    }

    // Alive states: full emoji over background
    let blended = mix(BG, emoji_color.rgb, emoji_color.a);
    return vec4f(blended, 1.0);
}
