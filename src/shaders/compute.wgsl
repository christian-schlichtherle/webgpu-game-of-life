struct Uniforms {
    width: u32,
    height: u32,
    generation: u32,
    _pad: u32,
};

// Visual states (matching emoji atlas tiles):
// 0 = Void  (dead → dead)
// 1 = Fresh (dead → alive)
// 2 = Cool  (alive → alive, 2 neighbors in new gen)
// 3 = Party (alive → alive, 3 neighbors in new gen)
// 4 = OMG   (alive → alive, not 2 or 3 neighbors in new gen — doomed next step)
// 5 = Skull (alive → dead)

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> cells_in: array<u32>;
@group(0) @binding(2) var<storage, read_write> cells_out: array<u32>;
@group(0) @binding(3) var<storage, read_write> state: array<u32>;
@group(0) @binding(4) var<storage, read_write> hash_out: atomic<u32>;

fn idx(row: u32, col: u32) -> u32 {
    let r = (row + uniforms.height) % uniforms.height;
    let c = (col + uniforms.width) % uniforms.width;
    return r * uniforms.width + c;
}

fn count_in(row: u32, col: u32) -> u32 {
    return cells_in[idx(row - 1u, col - 1u)]
         + cells_in[idx(row - 1u, col)]
         + cells_in[idx(row - 1u, col + 1u)]
         + cells_in[idx(row,      col - 1u)]
         + cells_in[idx(row,      col + 1u)]
         + cells_in[idx(row + 1u, col - 1u)]
         + cells_in[idx(row + 1u, col)]
         + cells_in[idx(row + 1u, col + 1u)];
}

fn count_out(row: u32, col: u32) -> u32 {
    return cells_out[idx(row - 1u, col - 1u)]
         + cells_out[idx(row - 1u, col)]
         + cells_out[idx(row - 1u, col + 1u)]
         + cells_out[idx(row,      col - 1u)]
         + cells_out[idx(row,      col + 1u)]
         + cells_out[idx(row + 1u, col - 1u)]
         + cells_out[idx(row + 1u, col)]
         + cells_out[idx(row + 1u, col + 1u)];
}

// Pass 1: Conway's rules — read cells_in (0/1), write cells_out (0/1)
@compute @workgroup_size(8, 8)
fn step(@builtin(global_invocation_id) gid: vec3u) {
    let col = gid.x;
    let row = gid.y;
    if (col >= uniforms.width || row >= uniforms.height) {
        return;
    }

    let alive = cells_in[row * uniforms.width + col];
    let neighbors = count_in(row, col);

    cells_out[row * uniforms.width + col] = select(
        select(0u, 1u, neighbors == 3u),
        select(0u, 1u, neighbors == 2u || neighbors == 3u),
        alive == 1u
    );
}

// Pass 2: Visual states — compare prev (cells_in) vs curr (cells_out),
// count neighbors in cells_out for alive→alive cells
@compute @workgroup_size(8, 8)
fn visual(@builtin(global_invocation_id) gid: vec3u) {
    let col = gid.x;
    let row = gid.y;
    if (col >= uniforms.width || row >= uniforms.height) {
        return;
    }

    let i = row * uniforms.width + col;
    let was_alive = cells_in[i];
    let now_alive = cells_out[i];

    var v: u32;
    if (was_alive == 0u && now_alive == 0u) {
        v = 0u; // Void
    } else if (was_alive == 1u && now_alive == 0u) {
        v = 5u; // Skull
    } else if (was_alive == 0u && now_alive == 1u) {
        v = 1u; // Fresh
    } else {
        // alive → alive: check neighbor count in new generation
        let neighbors = count_out(row, col);
        if (neighbors == 2u) {
            v = 2u; // Cool
        } else if (neighbors == 3u) {
            v = 3u; // Party
        } else {
            v = 4u; // OMG (not 2 or 3 — doomed next generation)
        }
    }

    state[i] = v;
}

// Pass 3: Hash cells_out into a single u32 for loop detection
@compute @workgroup_size(8, 8)
fn hash(@builtin(global_invocation_id) gid: vec3u) {
    let col = gid.x;
    let row = gid.y;
    if (col >= uniforms.width || row >= uniforms.height) {
        return;
    }
    let i = row * uniforms.width + col;
    if (cells_out[i] == 1u) {
        atomicXor(&hash_out, i * 0x9e3779b9u);
    }
}
