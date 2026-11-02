import { clamp } from '../utils/math.js';

// A* em grade, com cantos bloqueados para evitar atravessar paredes na diagonal.
export function findPath(start, end, bounds, obstacles, cell = 20) {
  const cols = Math.ceil(bounds.width / cell);
  const rows = Math.ceil(bounds.height / cell);
  const ix = p => ({ x: clamp(Math.floor(p.x / cell), 0, cols - 1), y: clamp(Math.floor(p.y / cell), 0, rows - 1) });
  const blocked = (x, y) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return true;
    const cx = x * cell + cell / 2, cy = y * cell + cell / 2;
    return obstacles.some(o => cx > o.x - 5 && cx < o.x + o.w + 5 && cy > o.y - 5 && cy < o.y + o.h + 5);
  };
  const s = ix(start), goal = ix(end);
  const key = (x,y) => `${x},${y}`;
  const h = (x,y) => Math.hypot(x - goal.x, y - goal.y);
  if (blocked(s.x,s.y) || blocked(goal.x,goal.y)) return [];
  const open = [{ x:s.x, y:s.y, g:0, f:h(s.x,s.y) }], visited = new Set(), best = new Map([[key(s.x,s.y),0]]), parents = new Map();
  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
  let iterations = 0;
  while (open.length && iterations++ < cols * rows * 2) {
    open.sort((a,b) => a.f-b.f);
    const n = open.shift(), k = key(n.x,n.y);
    if (visited.has(k)) continue;
    visited.add(k);
    if (n.x === goal.x && n.y === goal.y) {
      const cells = []; let c = k;
      while (c !== key(s.x,s.y)) {
        const [x,y] = c.split(',').map(Number);
        cells.push({ x: clamp(x*cell+cell/2,1,bounds.width-1), y: clamp(y*cell+cell/2,1,bounds.height-1) });
        c = parents.get(c);
        if (!c) return [];
      }
      cells.reverse();
      if (cells.length) cells[cells.length-1] = {x:end.x,y:end.y};
      return cells;
    }
    for (const [dx,dy] of dirs) {
      const nx=n.x+dx, ny=n.y+dy, nk=key(nx,ny);
      if (blocked(nx,ny) || visited.has(nk)) continue;
      if (dx && dy && (blocked(n.x+dx,n.y) || blocked(n.x,n.y+dy))) continue;
      const g=n.g+(dx && dy ? Math.SQRT2:1);
      if (g >= (best.get(nk)??Infinity)) continue;
      best.set(nk,g); parents.set(nk,k);
      open.push({x:nx,y:ny,g,f:g+h(nx,ny)});
    }
  }
  return [];
}
