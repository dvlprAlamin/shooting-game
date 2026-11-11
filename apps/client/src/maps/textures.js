import * as THREE from 'three';

// Surfaces for block maps, painted on canvases when a map loads: nothing to download, and every texture
// tiles. Most are pale and neutral so a box's tint (its vertex colour) decides its colour.

const SIZE = 256;

// Small seeded random number generator (mulberry32), so a texture looks the same every time.
const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Calls draw(x, y) at (x, y) and at its copies across the edges that a radius r reaches, so marks tile.
const wrapped = (x, y, r, draw) => {
  for (const dx of [-SIZE, 0, SIZE]) {
    for (const dy of [-SIZE, 0, SIZE]) {
      const cx = x + dx;
      const cy = y + dy;
      if (cx + r > 0 && cx - r < SIZE && cy + r > 0 && cy - r < SIZE) draw(cx, cy);
    }
  }
};

// Fine grain: tiny light and dark squares.
const speckle = (ctx, rand, count, size, dark, light) => {
  for (let i = 0; i < count; i++) {
    const s = 1 + Math.floor(rand() * size);
    ctx.fillStyle = rand() < 0.5 ? `rgb(0 0 0 / ${dark * rand()})` : `rgb(255 255 255 / ${light * rand()})`;
    ctx.fillRect(Math.floor(rand() * SIZE), Math.floor(rand() * SIZE), s, s);
  }
};

// Soft light and dark patches, so large surfaces don't look flat.
const blotches = (ctx, rand, count, minR, maxR, alpha, rgb = '0 0 0', lightRgb = '255 255 255') => {
  for (let i = 0; i < count; i++) {
    const r = minR + rand() * (maxR - minR);
    const c = rand() < 0.5 ? rgb : lightRgb;
    const a = alpha * (0.4 + rand() * 0.6);
    wrapped(rand() * SIZE, rand() * SIZE, r, (x, y) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgb(${c} / ${a})`);
      g.addColorStop(1, `rgb(${c} / 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
  }
};

const fill = (ctx, color) => {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SIZE, SIZE);
};

const PAINTERS = {
  asphalt(ctx, rand) {
    fill(ctx, '#5d5c59');
    blotches(ctx, rand, 10, 30, 90, 0.07);
    speckle(ctx, rand, 5000, 1, 0.22, 0.09);
  },

  // Cast concrete: a 2 m panel with its seams and form-tie holes.
  concrete(ctx, rand) {
    fill(ctx, '#d6d3cc');
    blotches(ctx, rand, 16, 20, 80, 0.08);
    speckle(ctx, rand, 2500, 2, 0.16, 0.14);
    ctx.fillStyle = 'rgb(0 0 0 / 0.22)';
    ctx.fillRect(0, 0, SIZE, 2);
    ctx.fillRect(0, 0, 2, SIZE);
    ctx.fillStyle = 'rgb(0 0 0 / 0.3)';
    for (const x of [0.25, 0.75]) {
      for (const y of [0.25, 0.75]) {
        ctx.beginPath();
        ctx.arc(x * SIZE, y * SIZE, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  sand(ctx, rand) {
    fill(ctx, '#cdb48a');
    blotches(ctx, rand, 16, 25, 80, 0.08, '120 80 40');
    speckle(ctx, rand, 5000, 1, 0.16, 0.12);
  },

  // Sandstone blocks in offset rows, with mortar between.
  stone(ctx, rand) {
    fill(ctx, '#ece5d8');
    const rows = 6;
    const perRow = 3;
    const h = SIZE / rows;
    const w = SIZE / perRow;
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 ? w / 2 : 0;
      for (let i = -1; i < perRow; i++) {
        const shade = (rand() - 0.5) * 0.16;
        ctx.fillStyle = shade < 0 ? `rgb(0 0 0 / ${-shade})` : `rgb(255 255 255 / ${shade})`;
        ctx.fillRect(i * w + offset, row * h, w, h);
      }
    }
    blotches(ctx, rand, 14, 15, 50, 0.08, '90 60 30');
    speckle(ctx, rand, 3000, 2, 0.18, 0.12);
    ctx.fillStyle = 'rgb(70 50 30 / 0.35)';
    for (let row = 0; row < rows; row++) {
      ctx.fillRect(0, row * h, SIZE, 3);
      const offset = row % 2 ? w / 2 : 0;
      for (let i = 0; i <= perRow; i++) ctx.fillRect(i * w + offset - 1.5, row * h, 3, h);
    }
  },

  // Corrugated sheet: vertical ribs, a little rust.
  corrugated(ctx, rand) {
    fill(ctx, '#e8e8e6');
    const ribs = 8;
    const w = SIZE / ribs;
    for (let i = 0; i < ribs; i++) {
      const g = ctx.createLinearGradient(i * w, 0, (i + 1) * w, 0);
      g.addColorStop(0, 'rgb(0 0 0 / 0.28)');
      g.addColorStop(0.3, 'rgb(255 255 255 / 0.18)');
      g.addColorStop(0.62, 'rgb(0 0 0 / 0)');
      g.addColorStop(1, 'rgb(0 0 0 / 0.28)');
      ctx.fillStyle = g;
      ctx.fillRect(i * w, 0, w, SIZE);
    }
    blotches(ctx, rand, 10, 10, 45, 0.1, '90 45 20');
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgb(110 50 20 / ${0.35 * rand()})`;
      ctx.fillRect(rand() * SIZE, rand() * SIZE, 1 + rand() * 2, 1 + rand() * 3);
    }
  },

  // Warehouse shelving, stocked: steel uprights and beams with cartons on three levels.
  shelf(ctx, rand) {
    fill(ctx, '#2b2f33');
    const levels = 3;
    const h = SIZE / levels;
    for (let level = 0; level < levels; level++) {
      let x = 10;
      while (x < SIZE - 24) {
        const w = 26 + rand() * 40;
        const top = 10 + rand() * 22;
        ctx.fillStyle = `hsl(${28 + rand() * 10} ${35 + rand() * 15}% ${48 + rand() * 14}%)`;
        ctx.fillRect(x, level * h + top, Math.min(w, SIZE - 12 - x), h - top - 8);
        ctx.fillStyle = 'rgb(0 0 0 / 0.18)';
        ctx.fillRect(x, level * h + top, 3, h - top - 8);
        x += w + 3 + rand() * 6;
      }
    }
    ctx.fillStyle = '#c8682a'; // beams
    for (let level = 0; level <= levels; level++) ctx.fillRect(0, Math.min(level * h, SIZE - 8), SIZE, 8);
    ctx.fillStyle = '#3d5d82'; // uprights
    ctx.fillRect(0, 0, 8, SIZE);
    ctx.fillRect(SIZE - 8, 0, 8, SIZE);
    speckle(ctx, rand, 800, 2, 0.15, 0.08);
  },

  steel(ctx, rand) {
    fill(ctx, '#80868c');
    blotches(ctx, rand, 10, 15, 50, 0.1);
    speckle(ctx, rand, 2000, 2, 0.2, 0.15);
    ctx.fillStyle = 'rgb(0 0 0 / 0.3)';
    ctx.fillRect(0, 0, SIZE, 4);
    ctx.fillRect(0, 0, 4, SIZE);
  },

  // A crate face: a frame of boards around horizontal planks.
  crate(ctx, rand) {
    fill(ctx, '#b48552');
    const planks = 5;
    const h = SIZE / planks;
    for (let i = 0; i < planks; i++) {
      ctx.fillStyle = `rgb(0 0 0 / ${rand() * 0.14})`;
      ctx.fillRect(0, i * h, SIZE, h);
      ctx.strokeStyle = 'rgb(60 30 10 / 0.12)';
      ctx.lineWidth = 1;
      for (let j = 0; j < 6; j++) {
        const y = i * h + 4 + rand() * (h - 8);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(SIZE / 3, y + (rand() - 0.5) * 6, (2 * SIZE) / 3, y + (rand() - 0.5) * 6, SIZE, y);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgb(40 20 5 / 0.5)';
      ctx.fillRect(0, i * h, SIZE, 2);
    }
    const frame = 22;
    ctx.fillStyle = 'rgb(70 40 15 / 0.35)';
    ctx.fillRect(0, 0, SIZE, frame);
    ctx.fillRect(0, SIZE - frame, SIZE, frame);
    ctx.fillRect(0, 0, frame, SIZE);
    ctx.fillRect(SIZE - frame, 0, frame, SIZE);
    ctx.fillStyle = 'rgb(30 15 5 / 0.55)';
    for (const at of [frame, SIZE - frame - 2]) {
      ctx.fillRect(0, at, SIZE, 2);
      ctx.fillRect(at, 0, 2, SIZE);
    }
    speckle(ctx, rand, 1200, 2, 0.15, 0.08);
  },
};

/**
 * How each material key in the map data looks. `tile`: metres one copy of the texture covers.
 * `uv`: 'world' lines the texture up across neighbouring boxes (ground, walls); 'local' starts it at each
 * box's corner (crates, containers), so planks and ribs line up with the edges.
 */
export const MATERIALS = {
  asphalt: { paint: 'asphalt', tile: 6, uv: 'world', roughness: 0.95 },
  concrete: { paint: 'concrete', tile: 2, uv: 'world', roughness: 0.9, tint: '#c2bdb3' },
  sand: { paint: 'sand', tile: 6, uv: 'world', roughness: 1 },
  stone: { paint: 'stone', tile: 2, uv: 'world', roughness: 0.95 },
  metal: { paint: 'corrugated', tile: 2.6, uv: 'local', roughness: 0.6 },
  roof: { paint: 'corrugated', tile: 2, uv: 'world', roughness: 0.7, tint: '#8f969c' },
  steel: { paint: 'steel', tile: 1.5, uv: 'local', roughness: 0.55 },
  shelf: { paint: 'shelf', tile: 3, uv: 'local', roughness: 0.8 },
  wood: { paint: 'crate', tile: 1.2, uv: 'local', roughness: 0.85 },
};

const textures = new Map(); // painter -> texture, shared by every map that uses it

/** The texture for a painter, painted the first time it's asked for. */
export const textureFor = (painter, anisotropy) => {
  let texture = textures.get(painter);
  if (!texture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const seed = [...painter].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);
    PAINTERS[painter](canvas.getContext('2d'), seeded(seed));
    texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.set(painter, texture);
  }
  texture.anisotropy = anisotropy;
  return texture;
};
