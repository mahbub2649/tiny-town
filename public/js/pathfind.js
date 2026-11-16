// A* pathfinding on the world's walkability grid (4-directional).
export function findPath(W, sx, sy, tx, ty, maxNodes = 6000) {
  sx |= 0; sy |= 0; tx |= 0; ty |= 0;
  if (!W.walkable(tx, ty)) {
    const n = W.nearestWalkable(tx, ty);
    tx = n.x; ty = n.y;
  }
  if (sx === tx && sy === ty) return [];
  const w = W.w, start = sy * w + sx, goal = ty * w + tx;
  const g = new Map([[start, 0]]), came = new Map();
  const heap = [[Math.abs(tx - sx) + Math.abs(ty - sy), start]];
  const closed = new Set();
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  let expanded = 0;
  while (heap.length && expanded < maxNodes) {
    const [, cur] = pop();
    if (cur === goal) {
      const path = []; let c = cur;
      while (c !== start) { path.push({ x: c % w, y: (c / w) | 0 }); c = came.get(c); }
      return path.reverse();
    }
    if (closed.has(cur)) continue;
    closed.add(cur); expanded++;
    const cx = cur % w, cy = (cur / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!W.walkable(nx, ny)) continue;
      const ni = ny * w + nx, ng = g.get(cur) + 1;
      if (ng < (g.get(ni) ?? Infinity)) {
        g.set(ni, ng); came.set(ni, cur);
        push([ng + Math.abs(tx - nx) + Math.abs(ty - ny), ni]);
      }
    }
  }
  return null;
}
