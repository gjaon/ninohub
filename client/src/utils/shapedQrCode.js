// Shaped QR code renderer — shape silhouette filled with QR pixels.
//
// A QR code's data grid cannot have modules removed without destroying it, so
// we can't just clip a QR into a heart. Instead we:
//   1. Render a complete, valid QR (error-correction H) as large as safely fits,
//      centered in the shape's widest region, with a true light quiet zone so a
//      scanner can isolate and read it cleanly.
//   2. Fill the rest of the silhouette with decorative QR-style modules on the
//      same grid, so the whole shape reads as "made of QR".
//   3. Clip the decorative fill to the outline, but draw the real QR UNCLIPPED
//      so its corners can never be trimmed away.
// The result looks like a heart filled with QR, and the embedded square code is
// a standards-compliant QR that scans reliably.

import QRCode from "qrcode";

export const MODULE_STYLES = [
  { id: "square", label: "Square" },
  { id: "rounded", label: "Rounded" },
  { id: "dots", label: "Dots" },
];

export const FRAME_SHAPES = [
  { id: "none", label: "None" },
  { id: "heart", label: "Heart" },
  { id: "circle", label: "Circle" },
  { id: "rounded-square", label: "Rounded square" },
  { id: "diamond", label: "Diamond" },
  { id: "star", label: "Star" },
];

// Per-shape: the silhouette outline colour, and the vertical band to search for
// the embedded QR's center (fractions of height). The exact square size and
// position are auto-fitted to the largest square that lies fully inside the
// outline, so the real QR is always contained (never clipped) and as large as
// possible for reliable scanning.
const SHAPE_CONFIG = {
  heart: { accent: "#ff2d55", centerBand: [0.36, 0.5] },
  circle: { accent: "#3b5bff", centerBand: [0.5, 0.5] },
  "rounded-square": { accent: "#059669", centerBand: [0.5, 0.5] },
  diamond: { accent: "#f59e0b", centerBand: [0.5, 0.5] },
  star: { accent: "#7c3aed", centerBand: [0.42, 0.5] },
};

const DEFAULTS = {
  size: 640,
  dark: "#111111",
  light: "#ffffff",
  moduleStyle: "square",
  frameShape: "heart",
  errorCorrectionLevel: "H",
  quietZone: 4, // modules of light margin around the real QR (spec minimum)
  fillDensity: 0.5, // fraction of decorative cells painted dark
};

const isFinderModule = (row, col, size) => {
  const inTopLeft = row < 7 && col < 7;
  const inTopRight = row < 7 && col >= size - 7;
  const inBottomLeft = row >= size - 7 && col < 7;
  return inTopLeft || inTopRight || inBottomLeft;
};

// Deterministic pseudo-random in [0,1) from grid coordinates — gives the
// decorative fill stable, QR-like texture without an external dependency.
// Uses Math.imul for true 32-bit mixing (a naive version collapses toward 0).
const hashRand = (a, b) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (b + 0x165667b1), 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

const roundedRectPath = (ctx, x, y, w, h, r) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const heartPath = (ctx, cx, cy, w, h) => {
  ctx.beginPath();
  const steps = 120;
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);
    const px = cx + (x / 32) * w;
    const py = cy - (y / 32) * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
};

const diamondPath = (ctx, cx, cy, w, h) => {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy);
  ctx.closePath();
};

const starPath = (ctx, cx, cy, w, h) => {
  const spikes = 5;
  const outerR = Math.min(w, h) / 2;
  const innerR = outerR * 0.45;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i += 1) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / spikes) * i - Math.PI / 2;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
};

// Builds the silhouette path on the context (does not fill/stroke it).
const traceShape = (ctx, shape, x, y, w, h) => {
  const cx = x + w / 2;
  const cy = y + h / 2;
  switch (shape) {
    case "heart":
      heartPath(ctx, cx, cy, w, h);
      break;
    case "circle":
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(w, h) / 2, 0, Math.PI * 2);
      ctx.closePath();
      break;
    case "rounded-square":
      roundedRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.16);
      break;
    case "diamond":
      diamondPath(ctx, cx, cy, w, h);
      break;
    case "star":
      starPath(ctx, cx, cy, w, h);
      break;
    default:
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.closePath();
  }
};

// True if an axis-aligned square (cx,cy,side) lies fully inside the current
// path. Samples the perimeter (corners + several points per edge) because
// shapes like the heart curve inward and a corners-only test would miss it.
const squareInsidePath = (ctx, cx, cy, side) => {
  const half = side / 2;
  const samples = 6;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const a = -half + side * t;
    // top, bottom, left, right edges
    if (!ctx.isPointInPath(cx + a, cy - half)) return false;
    if (!ctx.isPointInPath(cx + a, cy + half)) return false;
    if (!ctx.isPointInPath(cx - half, cy + a)) return false;
    if (!ctx.isPointInPath(cx + half, cy + a)) return false;
  }
  return true;
};

// Finds the largest centered square fully inside the shape, scanning a band of
// vertical centers. Returns { side, cy }. The path must already be traced.
const fitSquare = (ctx, shape, bx, by, bw, bh, band) => {
  const cx = bx + bw / 2;
  const [lo, hi] = band;
  const steps = lo === hi ? 0 : 8;
  let best = { side: 0, cy: by + bh / 2 };
  for (let s = 0; s <= steps; s += 1) {
    const frac = steps === 0 ? lo : lo + ((hi - lo) * s) / steps;
    const cy = by + bh * frac;
    let loSide = 0;
    let hiSide = Math.min(bw, bh);
    for (let iter = 0; iter < 18; iter += 1) {
      const mid = (loSide + hiSide) / 2;
      if (squareInsidePath(ctx, cx, cy, mid)) loSide = mid;
      else hiSide = mid;
    }
    if (loSide > best.side) best = { side: loSide, cy };
  }
  return best;
};

// Paints a single dark module in the chosen style. Finder modules are always
// solid squares — scanners lock onto them first, so crispness matters most.
const paintModule = (ctx, x, y, cell, style, finder) => {
  if (style === "square" || finder) {
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(cell), Math.ceil(cell));
  } else if (style === "rounded") {
    roundedRectPath(ctx, x, y, cell, cell, cell * 0.35);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(x + cell / 2, y + cell / 2, cell * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
};

// Draws the square QR matrix into [px, py, side]; quiet zone included in side.
const drawSquareMatrix = (ctx, modules, px, py, side, opts, quiet) => {
  const { size, data } = modules;
  const cell = side / (size + quiet * 2);
  const originX = px + quiet * cell;
  const originY = py + quiet * cell;
  ctx.fillStyle = opts.dark;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!data[row * size + col]) continue;
      paintModule(
        ctx,
        originX + col * cell,
        originY + row * cell,
        cell,
        opts.moduleStyle,
        isFinderModule(row, col, size)
      );
    }
  }
};

export const renderShapedQrToCanvas = (text, options = {}) => {
  const opts = { ...DEFAULTS, ...options };
  const { size } = opts;

  const canvas =
    options.canvas ||
    (typeof document !== "undefined" ? document.createElement("canvas") : null);
  if (!canvas) throw new Error("Canvas is not available in this environment");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  const qr = QRCode.create(text, {
    errorCorrectionLevel: opts.errorCorrectionLevel,
  });
  const qrSize = qr.modules.size;

  const shape = opts.frameShape in SHAPE_CONFIG ? opts.frameShape : "none";

  // Plain styled QR on a white rounded card.
  if (shape === "none") {
    ctx.fillStyle = opts.light;
    roundedRectPath(ctx, 0, 0, size, size, size * 0.06);
    ctx.fill();
    drawSquareMatrix(ctx, qr.modules, 0, 0, size, opts, opts.quietZone);
    return canvas;
  }

  const cfg = SHAPE_CONFIG[shape];
  // No light quiet-zone margin in shaped mode: the code is rendered edge-to-edge
  // so it blends into the surrounding QR texture (set quietZone > 0 to trade a
  // visible light ring for more scan reliability).
  const quiet = 0;

  // Shape bounding box.
  const margin = size * 0.03;
  const bx = margin;
  const by = margin;
  const bw = size - margin * 2;
  const bh = size - margin * 2;

  // Auto-fit the largest square that sits fully inside the silhouette, so the
  // embedded QR touches the shape's borders and is never clipped.
  traceShape(ctx, shape, bx, by, bw, bh);
  const fit = fitSquare(ctx, shape, bx, by, bw, bh, cfg.centerBand);
  const qrSide = fit.side;
  const cell = qrSide / qrSize;
  const qrLeft = bx + bw / 2 - qrSide / 2;
  const qrTop = fit.cy - qrSide / 2;
  // With no quiet zone the data modules start at the square's edge.
  const contentLeft = qrLeft;
  const contentTop = qrTop;

  // Decorative grid aligned to the real QR's module lattice so the fill reads
  // as one continuous QR. Snap the grid origin onto the data lattice.
  const gridLeft = contentLeft - Math.ceil((contentLeft - bx) / cell) * cell;
  const gridTop = contentTop - Math.ceil((contentTop - by) / cell) * cell;
  const cols = Math.ceil((bx + bw - gridLeft) / cell) + 1;
  const rows = Math.ceil((by + bh - gridTop) / cell) + 1;

  // 1) Light silhouette background.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.16)";
  ctx.shadowBlur = size * 0.025;
  ctx.shadowOffsetY = size * 0.01;
  ctx.fillStyle = opts.light;
  traceShape(ctx, shape, bx, by, bw, bh);
  ctx.fill();
  ctx.restore();

  // 2) Decorative module fill, clipped to the silhouette. Skip the real-QR
  //    allocation (data + quiet ring) so the embedded code stays isolated.
  ctx.save();
  traceShape(ctx, shape, bx, by, bw, bh);
  ctx.clip();
  ctx.fillStyle = opts.dark;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = gridLeft + c * cell;
      const y = gridTop + r * cell;
      const mcol = Math.round((x - contentLeft) / cell);
      const mrow = Math.round((y - contentTop) / cell);
      // Inside the real QR's data area? Leave it to the matrix draw below so the
      // decorative fill abuts the code with no gap.
      const inQrData =
        mcol >= 0 && mcol < qrSize && mrow >= 0 && mrow < qrSize;
      if (inQrData) continue;
      if (hashRand(r + 1, c + 1) < opts.fillDensity) {
        paintModule(ctx, x, y, cell, opts.moduleStyle, false);
      }
    }
  }
  ctx.restore();

  // 3) The real, scannable QR — drawn UNCLIPPED so corners are never trimmed,
  //    edge-to-edge so it blends straight into the surrounding texture.
  drawSquareMatrix(ctx, qr.modules, qrLeft, qrTop, qrSide, opts, quiet);

  // 4) Crisp silhouette outline so the shape stays legible on any background.
  ctx.save();
  ctx.lineWidth = Math.max(2, size * 0.006);
  ctx.strokeStyle = cfg.accent;
  ctx.lineJoin = "round";
  traceShape(ctx, shape, bx, by, bw, bh);
  ctx.stroke();
  ctx.restore();

  return canvas;
};

export const renderShapedQrDataUrl = (text, options = {}) =>
  renderShapedQrToCanvas(text, options).toDataURL("image/png");

export default renderShapedQrDataUrl;
