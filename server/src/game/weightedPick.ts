/**
 * Picks one item at random, with probability proportional to its weight.
 * `rng` must return a number in [0, 1); it's injectable so tests are deterministic.
 */
export function pickWeighted<T extends { weight: number }>(
  items: readonly T[],
  rng: () => number = Math.random,
): T {
  if (items.length === 0) {
    throw new Error('pickWeighted: no items to pick from');
  }

  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (!(total > 0)) {
    throw new Error('pickWeighted: total weight must be positive');
  }

  // Walk the list, subtracting weights until the roll lands inside an item's slice.
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }

  // Only reachable through floating-point rounding; the last item is the right answer.
  return items[items.length - 1];
}