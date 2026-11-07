// The table's grid, found in the image itself: its lines are the rows and
// the columns where dark pixels run across most of the table (projections),
// so the cells are cut where the drawing puts them — no position written in
// the code, a planning drawn a little differently still reads.

export interface GrayImage {
  data: Uint8Array;
  width: number;
  height: number;
}

/** Centres of the runs of a profile that reach `min` (a line a few pixels thick is one line). */
export function runs(profile: number[], min: number): number[] {
  const out: number[] = [];
  let start = -1;
  for (let i = 0; i <= profile.length; i++) {
    const on = i < profile.length && profile[i] >= min;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      out.push(Math.round((start + i - 1) / 2));
      start = -1;
    }
  }
  return out;
}

/** Lines closer than `gap` pixels are one (a double border, anti-aliasing). */
export function merge(lines: number[], gap: number): number[] {
  const out: number[] = [];
  for (const l of lines) {
    if (out.length && l - out[out.length - 1] < gap) out[out.length - 1] = Math.round((out[out.length - 1] + l) / 2);
    else out.push(l);
  }
  return out;
}

const isDark = (v: number, dark: number) => v < dark;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The longest run of indexes whose value reaches `min`, short gaps (a table's lines) allowed inside. */
function longestRun(values: number[], min: number, maxGap = 8): [number, number] | null {
  let best: [number, number] | null = null;
  let start = -1;
  let lastOn = -1;
  const close = () => {
    if (start >= 0 && (!best || lastOn + 1 - start > best[1] - best[0])) best = [start, lastOn + 1];
    start = -1;
  };
  for (let i = 0; i < values.length; i++) {
    if (values[i] >= min) {
      if (start < 0) start = i;
      lastOn = i;
    } else if (start >= 0 && i - lastOn > maxGap) close();
  }
  close();
  return best;
}

/**
 * The slide itself in the image: the largest light area. A capture of the
 * published page has the viewer's black around it; the slide's image may
 * have a margin.
 */
export function contentBox(img: GrayImage, light = 150): Box {
  const { data, width, height } = img;
  const rowMean = Array.from({ length: height }, (_, y) => {
    let s = 0;
    for (let x = 0; x < width; x++) s += data[y * width + x];
    return s / width;
  });
  const ys = longestRun(rowMean, light) ?? [0, height];
  const colMean = Array.from({ length: width }, (_, x) => {
    let s = 0;
    for (let y = ys[0]; y < ys[1]; y++) s += data[y * width + x];
    return s / (ys[1] - ys[0]);
  });
  const xs = longestRun(colMean, light) ?? [0, width];
  return { x: xs[0], y: ys[0], w: xs[1] - xs[0], h: ys[1] - ys[0] };
}

/** A part of the image, as its own image. */
export function crop(img: GrayImage, box: Box): GrayImage {
  const data = new Uint8Array(box.w * box.h);
  for (let y = 0; y < box.h; y++) data.set(img.data.subarray((box.y + y) * img.width + box.x, (box.y + y) * img.width + box.x + box.w), y * box.w);
  return { data, width: box.w, height: box.h };
}

/**
 * Each value added to its neighbour's: a line drawn across two pixels at half
 * intensity (an image scaled down) counts as one line.
 */
function pairs(profile: number[], max: number): number[] {
  return profile.map((v, i) => Math.min(max, v + Math.max(profile[i - 1] ?? 0, profile[i + 1] ?? 0) * (v > 0 ? 1 : 0)));
}

/** A table that touches the image's edge has no line there: the edge is its border. */
function withEdges(lines: number[], size: number, min = 15): number[] {
  if (!lines.length) return lines;
  const out = [...lines];
  if (out[0] > min) out.unshift(0);
  if (size - 1 - out[out.length - 1] > min) out.push(size - 1);
  return out;
}

export interface Grid {
  /** y of each horizontal line, top to bottom. */
  rows: number[];
  /** x of each vertical line, left to right. */
  cols: number[];
}

/**
 * The lines of the table: a row of pixels is a line when its dark pixels
 * cover most of the widest such row (the table may not fill the image), a
 * column the same over the table's height. Merged cells interrupt a few
 * vertical lines: they still cover most of the height.
 */
export function findGrid(img: GrayImage, dark = 150, share = 0.6): Grid {
  const { data, width, height } = img;
  const across: number[] = new Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = 0; x < width; x++) if (isDark(data[y * width + x], dark)) n++;
    across[y] = n;
  }
  const rows = withEdges(merge(runs(across, Math.max(...across) * share), 4), height);
  if (rows.length < 2) return { rows, cols: [] };
  const top = rows[0];
  const bottom = rows[rows.length - 1];
  const down: number[] = new Array(width).fill(0);
  for (let x = 0; x < width; x++) {
    let n = 0;
    for (let y = top; y <= bottom; y++) if (isDark(data[y * width + x], dark)) n++;
    down[x] = n;
  }
  const cols = withEdges(merge(runs(pairs(down, bottom - top + 1), (bottom - top) * share), 4), width);
  return { rows, cols };
}


/** The inside of a cell (its borders left out). */
export function cellBox(grid: Grid, row: number, col: number, inset = 2): Box | null {
  const y0 = grid.rows[row];
  const y1 = grid.rows[row + 1];
  const x0 = grid.cols[col];
  const x1 = grid.cols[col + 1];
  if (y0 === undefined || y1 === undefined || x0 === undefined || x1 === undefined) return null;
  const box = { x: x0 + inset, y: y0 + inset, w: x1 - x0 - 2 * inset, h: y1 - y0 - 2 * inset };
  return box.w > 3 && box.h > 3 ? box : null;
}

/** Dark pixels in a box: an empty cell (or one only filled grey) has almost none. */
export function inkIn(img: GrayImage, box: Box, dark = 128): number {
  let n = 0;
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) if (isDark(img.data[y * img.width + x], dark)) n++;
  return n;
}
