// Generates a 1024x1024 source PNG for `tauri icon`.
// Design: light-blue rounded rectangle with a subtle 3D look (top-lit
// gradient + gloss + soft inner shade) and a large white uppercase "D".
//
// Dependency-free: uses a minimal RGBA PNG encoder + software rasterization
// with supersampled anti-aliasing.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 1024;
const SS = 3; // supersampling factor (SS x SS sub-samples per pixel)

// ── minimal PNG encoder (RGBA, 8-bit) ─────────────────────────
function crc32(buf) {
  let c;
  if (!crc32.table) {
    crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc32.table[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crc32.table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, pixelFn) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const o = y * stride + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ── rounded-rect geometry ──────────────────────────────────────
const M = 40; // margin (inset)
const S_ = SIZE - 2 * M; // inner square side
const RR = 190; // corner radius

function inRoundedRect(px, py) {
  if (px < M || py < M || px > M + S_ || py > M + S_) return false;
  const left = px < M + RR;
  const right = px > M + S_ - RR;
  const top = py < M + RR;
  const bottom = py > M + S_ - RR;
  if ((left || right) && (top || bottom)) {
    const ccx = left ? M + RR : M + S_ - RR;
    const ccy = top ? M + RR : M + S_ - RR;
    const dx = px - ccx, dy = py - ccy;
    return dx * dx + dy * dy <= RR * RR;
  }
  return true;
}

// ── "D" glyph (geometric bold) ────────────────────────────────
// Outer silhouette = left stem rectangle + right half of outer ellipse.
// Counter (hole)   = right half of a smaller inner ellipse.
const D = {
  y0: 272, y1: 752, cy: 512, // vertical extent (centered)
  x0: 320,                   // stem left edge
  ecx: 445,                  // stem right edge (ellipse left diameter)
  rxO: 275, ryO: 240,        // outer bowl semi-axes  (outer right = 720)
  rxI: 160, ryI: 128,        // inner (counter) semi-axes (inner right = 605)
};

function inD(px, py) {
  const { y0, y1, cy, x0, ecx, rxO, ryO, rxI, ryI } = D;
  if (py < y0 || py > y1) return false;
  const inStem = px >= x0 && px <= ecx;
  const exo = (px - ecx) / rxO, eyo = (py - cy) / ryO;
  const inOuterBowl = px >= ecx && exo * exo + eyo * eyo <= 1;
  if (!(inStem || inOuterBowl)) return false;
  const exi = (px - ecx) / rxI, eyi = (py - cy) / ryI;
  const inCounter = px >= ecx && exi * exi + eyi * eyi <= 1;
  return !inCounter;
}

// ── sampling / shading helpers ─────────────────────────────────
function coverage(isInside, x, y) {
  let n = 0;
  for (let i = 0; i < SS; i++) {
    for (let j = 0; j < SS; j++) {
      if (isInside(x + (i + 0.5) / SS, y + (j + 0.5) / SS)) n++;
    }
  }
  return n / (SS * SS);
}

const TOP = [173, 216, 245];   // light blue (top)
const BOT = [96, 158, 214];    // deeper blue (bottom)
const GLOSS = [255, 255, 255];
const SHADE = [20, 70, 120];
const D_SHADOW = [25, 60, 100];
const SOFF = 14; // "D" drop-shadow offset (down)

function baseColor(py) {
  const t = (py - M) / S_;
  return [TOP[0] + (BOT[0] - TOP[0]) * t, TOP[1] + (BOT[1] - TOP[1]) * t, TOP[2] + (BOT[2] - TOP[2]) * t];
}

function highlightAlpha(py) {
  const t = (py - M) / S_;
  if (t >= 0.42) return 0;
  return 0.4 * (1 - t / 0.42); // soft top gloss
}

function bottomShadeAlpha(py) {
  const t = (py - M) / S_;
  if (t <= 0.8) return 0;
  return 0.16 * ((t - 0.8) / 0.2); // subtle inner shade at the base
}

function pixel(x, y) {
  const rectCov = coverage(inRoundedRect, x, y);
  if (rectCov <= 0) return [0, 0, 0, 0];

  const py = y + 0.5;
  let [r, g, b] = baseColor(py);

  // top gloss
  const ha = highlightAlpha(py) * rectCov;
  r += (GLOSS[0] - r) * ha; g += (GLOSS[1] - g) * ha; b += (GLOSS[2] - b) * ha;

  // bottom inner shade
  const sa = bottomShadeAlpha(py) * rectCov;
  r += (SHADE[0] - r) * sa; g += (SHADE[1] - g) * sa; b += (SHADE[2] - b) * sa;

  // "D" drop shadow (only where the letter is NOT present)
  const dCov = coverage(inD, x, y);
  const shCov = coverage((px, p) => inD(px, p - SOFF), x, y);
  const shOnly = Math.max(0, shCov - dCov) * 0.3;
  r += (D_SHADOW[0] - r) * shOnly; g += (D_SHADOW[1] - g) * shOnly; b += (D_SHADOW[2] - b) * shOnly;

  // "D" (white) on top
  r += (255 - r) * dCov; g += (255 - g) * dCov; b += (255 - b) * dCov;

  return [Math.round(r), Math.round(g), Math.round(b), Math.round(255 * rectCov)];
}

const out = encodePng(SIZE, SIZE, pixel);
const dir = dirname(fileURLToPath(import.meta.url));
const dest = `${dir}/icon-source.png`;
writeFileSync(dest, out);
console.log(`wrote ${dest} (${out.length} bytes)`);
