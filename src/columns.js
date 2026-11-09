import { useEffect, useState } from "react";

// Number of columns for the current window width, updated on resize. colsFor maps a width to a count.
export function useColumns(colsFor) {
  const [cols, setCols] = useState(() => colsFor(window.innerWidth));
  useEffect(() => {
    const onResize = () => setCols(colsFor(window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [colsFor]);
  return cols;
}

// Masonry: each photo goes into the currently shortest column (height relative to width), so photos keep
// their shape and the order still reads roughly left to right, top to bottom.
export function splitColumns(photos, n) {
  const cols = Array.from({ length: n }, () => []);
  const heights = new Array(n).fill(0);
  for (const p of photos) {
    const i = heights.indexOf(Math.min(...heights));
    cols[i].push(p);
    heights[i] += p.height / p.width + 0.02; // The small extra accounts for the gap.
  }
  return cols;
}
