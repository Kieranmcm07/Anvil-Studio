import { PROFILES, enchantsFor, itemsFor, conflicts, minimumBookUses } from './data.js';

export function upgradedLevel(initial, book, max = 5) {
  return initial === book ? Math.min(max, book + 1) : Math.max(initial, book);
}

export function buildRequest(state, raw) {
  const profile = PROFILES.find((p) => p.id === state.version);
  if (!profile || !itemsFor(profile).some(([id]) => id === state.item))
    throw new Error('Choose an available version and item.');
  const available = enchantsFor(raw, profile, state.item);
  const existing = Object.entries(state.existing || {}).map(([id, level]) => {
    const enchantment = available.find((e) => e.id === id);
    if (!enchantment || !Number.isInteger(level) || level < 1 || level > enchantment.max)
      throw new Error('Check the enchantments already on your item.');
    return { id, level, max: enchantment.max };
  });
  if (state.item === 'book' && existing.length)
    throw new Error('In Book mode, select the separate enchanted books to combine.');
  if (!Number.isInteger(state.itemUses) || state.itemUses < 0 || state.itemUses > 6)
    throw new Error('Item prior-work count must be a whole number between 0 and 6.');
  if (!['levels', 'xp', 'penalty'].includes(state.objective))
    throw new Error('Choose an optimization option.');
  const selected = Object.entries(state.selected);
  if (!selected.length && !existing.length)
    throw new Error('Select at least one enchantment to create a plan.');
  if (selected.length > (state.moreTen ? 13 : 10))
    throw new Error(
      state.moreTen
        ? 'The exact-search limit is 13 books.'
        : 'Enable “Allow more than 10 enchantments” in More options.'
    );
  const books = selected.map(([id, b]) => {
    const e = available.find((entry) => entry.id === id);
    if (!e || !Number.isInteger(b.level) || b.level < 1 || b.level > e.max)
      throw new Error('Choose valid enchantment levels.');
    if (!Number.isInteger(b.uses) || b.uses < minimumBookUses(id, b.level) || b.uses > 6)
      throw new Error(
        'Check each book’s prior-work count. Wind Burst II/III needs at least its level minus one.'
      );
    const initial = state.existing?.[id] || 0;
    if (initial && upgradedLevel(initial, b.level, e.max) <= initial)
      throw new Error(
        e.name + ' is already at that level or higher. Remove that book or choose an upgrade.'
      );
    return { id, level: b.level, uses: b.uses, cost: e.bookCost, max: e.max };
  });
  const ids = [...new Set([...existing.map((e) => e.id), ...books.map((b) => b.id)])];
  const incompatible = ids.some((id, i) =>
    ids.slice(i + 1).some((other) => conflicts(id, other, profile, raw))
  );
  if (incompatible && !state.incompatible)
    throw new Error('A selected book conflicts with an enchantment already on the item.');
  return {
    books,
    existing,
    edition: profile.edition,
    item: state.item,
    itemUses: state.itemUses,
    objective: state.objective,
    survival: !incompatible,
    legacyBow: profile.legacyBow && !incompatible,
  };
}

export function nodeEnchantments(result, settings, node = result.root) {
  const gear = settings.item !== 'book' && Boolean(node.mask & 1);
  const levels = gear ? { ...(settings.existing || {}) } : {};
  result.books.forEach((book, i) => {
    if (node.mask & (1 << (i + (settings.item === 'book' ? 0 : 1))))
      levels[book.id] = upgradedLevel(levels[book.id] || 0, book.level, book.max || 5);
  });
  return Object.entries(levels).map(([id, level]) => ({ id, level }));
}

export const bookKey = (book) => [book.id, book.level, book.uses].join(':');
export const planSignature = (plan) =>
  JSON.stringify([
    plan.item,
    plan.existing || [],
    plan.books.map(bookKey),
    plan.steps.map((s) => [s.left.mask, s.right.mask, s.cost]),
  ]);
