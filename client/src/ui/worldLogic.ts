// Movement and zone maths for the world scene. Deliberately free of Phaser, so it's easy to test.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Point {
  x: number;
  y: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**The index of the zone containing the point, or -1 if it's in none. Edges count as inside. */
export function zoneIndexAt(zones: readonly Rect[], x: number, y: number): number {
  return zones.findIndex((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
}

/**
 * Where a walker ends up after one frame. dx and dy are the held direction (-1, 0 or 1 each).
 * Diagonals are normalised so walking diagonally isn't faster, and the result stays in bounds.
 */
export function stepPosition(
  position: Point,
  dx: number,
  dy: number,
  speed: number,
  deltaMs: number,
  bounds: Bounds,
): Point {
  if (dx === 0 && dy === 0) return position;

  const length = Math.hypot(dx, dy);
  const step = (speed * deltaMs) / 1000;
  return {
    x: clamp(position.x + (dx / length) * step, bounds.minX, bounds.maxX),
    y: clamp(position.y + (dy / length) * step, bounds.minY, bounds.maxY),
  };
}