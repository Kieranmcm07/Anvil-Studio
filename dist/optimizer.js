// Exact subset dynamic programming. Keep the cheapest tree at each possible
// repair penalty: a locally cheap tree with a larger penalty can cost more later.
export const penalty = (uses) => 2 ** uses - 1;
export function xpForLevel(level) {
  if (level <= 16) return level * level + 6 * level;
  if (level <= 31) return (5 * level * level - 81 * level + 720) / 2;
  return (9 * level * level - 325 * level + 4440) / 2;
}
export function optimize({
  books,
  item = 'helmet',
  itemUses = 0,
  objective = 'levels',
  survival = true,
  legacyBow = false,
}) {
  if (!Number.isInteger(itemUses) || itemUses < 0 || itemUses > 6)
    throw new Error('Item prior-work count must be between 0 and 6.');
  if (!['levels', 'xp', 'penalty'].includes(objective))
    throw new Error('Unknown optimization objective.');
  if (books.length > 13) throw new Error('Use at most 13 enchantments for an exact search.');
  if (new Set(books.map((b) => b.id)).size !== books.length)
    throw new Error('Choose one book per enchantment; duplicate-book upgrading is not supported.');
  for (const b of books)
    if (
      !Number.isInteger(b.level) ||
      b.level < 1 ||
      b.level > 5 ||
      !Number.isInteger(b.cost) ||
      b.cost < 1 ||
      !Number.isInteger(b.uses) ||
      b.uses < 0 ||
      b.uses > 6
    )
      throw new Error('Invalid book level, cost, or prior-work count.');
  const n = books.length + 1,
    limit = 1 << n;
  const sums = new Int32Array(limit),
    dp = new Array(limit);
  let mending = 0,
    infinity = 0;
  books.forEach((b, i) => {
    if (b.id === 'mending') mending = 1 << (i + 1);
    if (b.id === 'infinity') infinity = 1 << (i + 1);
  });
  for (let mask = 1; mask < limit; mask++) {
    const bit = mask & -mask,
      index = 31 - Math.clz32(bit);
    sums[mask] = sums[mask ^ bit] + (index ? books[index - 1].level * books[index - 1].cost : 0);
  }
  const better = (a, b) =>
    !b ||
    (objective === 'xp' ? a.xp - b.xp || a.total - b.total : a.total - b.total || a.xp - b.xp) < 0;
  for (let i = 0; i < n; i++) {
    const b = i ? books[i - 1] : null,
      uses = b ? b.uses : itemUses;
    dp[1 << i] = [
      { mask: 1 << i, uses, total: 0, xp: 0, peak: 0, cost: 0, leaf: i, label: b ? b.id : item },
    ];
  }
  for (let mask = 1; mask < limit; mask++) {
    if (dp[mask]) continue;
    const states = [];
    for (let left = (mask - 1) & mask; left; left = (left - 1) & mask) {
      const right = mask ^ left;
      if (!right || right & 1) continue; // Gear must always occupy the left slot.
      // Java 1.11.1's one-direction bow exception: Infinity must be on the left.
      if (legacyBow && left & mending && right & infinity) continue;
      for (const a of dp[left] || [])
        for (const b of dp[right] || []) {
          if (!a || !b) continue;
          const cost = penalty(a.uses) + penalty(b.uses) + sums[right];
          if (survival && cost >= 40) continue;
          const uses = Math.max(a.uses, b.uses) + 1;
          const total = a.total + b.total + cost,
            xp = a.xp + b.xp + xpForLevel(cost);
          const old = states[uses];
          if (better({ total, xp }, old))
            states[uses] = {
              mask,
              uses,
              total,
              xp,
              peak: Math.max(a.peak, b.peak, cost),
              cost,
              left: a,
              right: b,
            };
        }
    }
    dp[mask] = states.filter(Boolean);
  }
  const options = dp[limit - 1];
  if (!options?.length) return null;
  options.sort(
    (a, b) =>
      (objective === 'penalty' ? a.uses - b.uses : 0) ||
      (objective === 'xp' ? a.xp - b.xp || a.total - b.total : a.total - b.total || a.xp - b.xp)
  );
  const root = options[0],
    steps = [];
  const walk = (node) => {
    if (node.leaf !== undefined) return;
    walk(node.left);
    walk(node.right);
    node.step = steps.length + 1;
    steps.push(node);
  };
  walk(root);
  return {
    root,
    steps,
    total: root.total,
    xp: root.xp,
    peak: root.peak,
    finalPenalty: penalty(root.uses),
    books,
    item,
  };
}
