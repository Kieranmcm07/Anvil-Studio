// Exact subset dynamic programming. Keep the cheapest tree at each possible
// repair penalty: a locally cheap tree with a larger penalty can cost more later.
import { upgradedLevel } from './planner-model.js';

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
  existing = [],
  edition = 'java',
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
  if (!['java', 'bedrock'].includes(edition)) throw new Error('Unknown Minecraft edition.');
  if (
    !Array.isArray(existing) ||
    new Set(existing.map((e) => e.id)).size !== existing.length ||
    existing.some((e) => !Number.isInteger(e.level) || e.level < 1 || e.level > (e.max || 5))
  )
    throw new Error('Invalid existing enchantments.');
  const initial = Object.fromEntries(existing.map((e) => [e.id, e.level]));
  const bookOnly = item === 'book';
  if (bookOnly && existing.length) throw new Error('Book mode starts with separate books.');
  if (bookOnly && !books.length) throw new Error('Select at least one enchanted book.');
  const n = books.length + (bookOnly ? 0 : 1),
    limit = 1 << n;
  const gearSums = new Int32Array(limit);
  const sums = new Int32Array(limit),
    dp = new Array(limit);
  let mending = 0,
    infinity = 0;
  books.forEach((b, i) => {
    if (b.id === 'mending') mending = 1 << (i + (bookOnly ? 0 : 1));
    if (b.id === 'infinity') infinity = 1 << (i + (bookOnly ? 0 : 1));
  });
  if (!bookOnly) {
    if (initial.mending) mending |= 1;
    if (initial.infinity) infinity |= 1;
  }
  for (let mask = 1; mask < limit; mask++) {
    const bit = mask & -mask,
      index = 31 - Math.clz32(bit);
    const b = books[bookOnly ? index : index - 1];
    sums[mask] = sums[mask ^ bit] + (b ? b.level * b.cost : 0);
    const start = b ? initial[b.id] || 0 : 0;
    const finish = b ? upgradedLevel(start, b.level, b.max || 5) : 0;
    gearSums[mask] =
      gearSums[mask ^ bit] + (b ? (finish - (edition === 'bedrock' ? start : 0)) * b.cost : 0);
  }
  // Most candidate trees are discarded. Compare numbers before allocating a node.
  const better = (total, xp, old) =>
    !old ||
    (objective === 'xp' ? xp - old.xp || total - old.total : total - old.total || xp - old.xp) < 0;
  for (let i = 0; i < n; i++) {
    const b = bookOnly ? books[i] : i ? books[i - 1] : null,
      uses = b ? b.uses : itemUses;
    dp[1 << i] = [
      {
        mask: 1 << i,
        uses,
        total: 0,
        xp: 0,
        peak: 0,
        cost: 0,
        leaf: bookOnly ? i + 1 : i,
        label: b ? b.id : item,
      },
    ];
  }
  for (let mask = 1; mask < limit; mask++) {
    if (dp[mask]) continue;
    const states = [];
    for (let left = (mask - 1) & mask; left; left = (left - 1) & mask) {
      const right = mask ^ left;
      if (!right || (!bookOnly && right & 1)) continue; // Equipment stays in the left slot.
      // Java 1.11.1's one-direction bow exception: Infinity must be on the left.
      if (legacyBow && left & mending && right & infinity) continue;
      for (const a of dp[left] || [])
        for (const b of dp[right] || []) {
          if (!a || !b) continue;
          const cost =
            penalty(a.uses) +
            penalty(b.uses) +
            (!bookOnly && left & 1 ? gearSums[right] : sums[right]);
          if (survival && cost >= 40) continue;
          const uses = Math.max(a.uses, b.uses) + 1;
          const total = a.total + b.total + cost,
            xp = a.xp + b.xp + xpForLevel(cost);
          const old = states[uses];
          if (better(total, xp, old))
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
    existing,
    item,
  };
}
