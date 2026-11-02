export class SeededRandom {
  constructor(seed = 2026) { this.state = (seed >>> 0) || 1; }
  next() {
    let x = this.state;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x100000000;
  }
  range(min, max) { return min + (max - min) * this.next(); }
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
  pick(items) { return items[Math.floor(this.next() * items.length)]; }
}
