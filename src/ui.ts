import type { District, OverlayMode } from "./types";

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function colorRamp(t: number) {
  // 0 = bad (red), 1 = good (green)
  t = clamp01(t);
  const r = Math.round(lerp(190, 40, t));
  const g = Math.round(lerp(55, 210, t));
  const b = Math.round(lerp(60, 90, t));
  return `rgb(${r},${g},${b})`;
}

export interface RenderState {
  overlay: OverlayMode;
  selectedId: string | null;
  gridW: number;
  gridH: number;
}

export function render(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, districts: District[], state: RenderState) {
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const pad = 18;
  const gridW = state.gridW;
  const gridH = state.gridH;

  const cellW = Math.floor((w - pad * 2) / gridW);
  const cellH = Math.floor((h - pad * 2) / gridH);
  const cell = Math.min(cellW, cellH);

  // background grid frame
  ctx.fillStyle = "#0a0f1b";
  ctx.fillRect(0, 0, w, h);

  // title
  ctx.fillStyle = "#a7b1c7";
  ctx.font = "12px ui-sans-serif";
  ctx.fillText(`Overlay: ${state.overlay}`, pad, 14);

  for (const d of districts) {
    const x = pad + d.x * cell;
    const y = pad + d.y * cell;

    let t = 0.5;
    if (state.overlay === "satisfaction") t = d.satisfaction;
    if (state.overlay === "crime") t = 1 - d.outcomes.crimeRate; // invert
    if (state.overlay === "water") t = 1 - d.outcomes.waterOutages; // invert
    if (state.overlay === "roads") t = d.infrastructure.roadsCondition;

    ctx.fillStyle = colorRamp(t);
    ctx.fillRect(x, y, cell - 2, cell - 2);

    // district id
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(x + 6, y + 6, 34, 16);
    ctx.fillStyle = "#e8eefc";
    ctx.font = "11px ui-sans-serif";
    ctx.fillText(d.id, x + 10, y + 18);

    // selection border
    if (state.selectedId === d.id) {
      ctx.strokeStyle = "#7aa2ff";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1, y + 1, cell - 4, cell - 4);
    } else {
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 1, cell - 4, cell - 4);
    }
  }

  // legend
  const lx = w - 170;
  const ly = 14;
  ctx.fillStyle = "#121826";
  ctx.strokeStyle = "#24304a";
  ctx.lineWidth = 1;
  ctx.fillRect(lx, ly, 150, 52);
  ctx.strokeRect(lx, ly, 150, 52);

  ctx.fillStyle = "#a7b1c7";
  ctx.font = "11px ui-sans-serif";
  ctx.fillText("Bad", lx + 10, ly + 18);
  ctx.fillText("Good", lx + 110, ly + 18);

  for (let i = 0; i < 100; i++) {
    const t = i / 99;
    ctx.fillStyle = colorRamp(t);
    ctx.fillRect(lx + 10 + i, ly + 26, 1, 10);
  }
}

export function pickDistrictAt(
  canvas: HTMLCanvasElement,
  gridW: number,
  gridH: number,
  mx: number,
  my: number
): { x: number; y: number } | null {
  const pad = 18;
  const cellW = Math.floor((canvas.width - pad * 2) / gridW);
  const cellH = Math.floor((canvas.height - pad * 2) / gridH);
  const cell = Math.min(cellW, cellH);

  const gx = Math.floor((mx - pad) / cell);
  const gy = Math.floor((my - pad) / cell);

  if (gx < 0 || gy < 0 || gx >= gridW || gy >= gridH) return null;
  return { x: gx, y: gy };
}
