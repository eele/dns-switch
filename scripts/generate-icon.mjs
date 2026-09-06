// Generates a 1024x1024 source PNG for `tauri icon`.
// Draws a rounded blue square with a white "DNS switch" glyph (two arrows).
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 1024;

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

// ── icon drawing ───────────────────────────────────────────────
const R = 220; // corner radius
function inRoundedRect(x, y) {
  // rounded square inset 40..984
  const m = 40, s = SIZE - 2 * m;
  if (x < m || x >= m + s || y < m || y >= m + s) return 0;
  const cx = Math.max(m + R, Math.min(x, m + s - R));
  const cy = Math.max(m + R, Math.min(y, m + s - R));
  const dx = x - cx, dy = y - cy;
  // distance to the rounded-rect boundary region
  const inSquare = x >= m + R && x <= m + s - R ? true : y >= m + R && y <= m + s - R ? true : false;
  if (inSquare) return 1;
  return dx * dx + dy * dy <= R * R ? 1 : 0;
}

function drawArrow(x, y, angleDeg, len, thick) {
  // diamond arrow (two triangles) centered at (x,y)
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  // local coords: arrow points +x
  const local = (lx, ly) => [x + lx * cos - ly * sin, y + lx * sin + ly * cos];
  const tip = local(len / 2, 0);
  const tailL = local(-len / 2, -thick);
  const tailR = local(-len / 2, thick);
  const notch = local(-len / 2 + thick * 0.9, 0);
  // point-in-polygon (bowtie = two triangles tip-notch-tailL and tip-notch-tailR)
  const inTri = (p, a1, b, c) => {
    const sign = (u, v, w) => (u[0] - w[0]) * (v[1] - w[1]) - (v[0] - w[0]) * (u[1] - w[1]);
    const d1 = sign(p, a1, b), d2 = sign(p, b, c), d3 = sign(p, c, a1);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  };
  const p = [x, y];
  return inTri(p, tip, notch, tailL) || inTri(p, tip, tailR, notch);
}

function pixel(x, y) {
  const rr = inRoundedRect(x, y);
  if (!rr) return [0, 0, 0, 0];
  // vertical blue gradient
  const t = y / SIZE;
  let r = Math.round(37 + (30 - 37) * t);
  let g = Math.round(99 + (118 - 99) * t);
  let b = Math.round(235 + (249 - 235) * t);
  // white switch arrows
  const c = SIZE / 2;
  const inArrow =
    drawArrow(x, y, 45, 460, 90) || drawArrow(x, y, 225, 460, 90);
  if (inArrow) {
    r = 255; g = 255; b = 255;
  }
  return [r, g, b, 255];
}

const out = encodePng(SIZE, SIZE, pixel);
const dir = dirname(fileURLToPath(import.meta.url));
const dest = `${dir}/icon-source.png`;
writeFileSync(dest, out);
console.log(`wrote ${dest} (${out.length} bytes)`);
