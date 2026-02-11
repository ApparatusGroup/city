// Deterministic RNG (Mulberry32)
export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(r: () => number, min: number, max: number) {
  return min + (max - min) * r();
}

export function randNormish(r: () => number) {
  // average of uniforms ≈ bell curve
  return (r() + r() + r() + r()) / 4;
}
