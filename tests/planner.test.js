import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { optimize, penalty, xpForLevel } from '../dist/optimizer.js';
import { buildRequest, nodeEnchantments, planSignature, bookKey } from '../dist/planner-model.js';
import { createShareUrl, readSharedPlan } from '../dist/share.js';
import { saveSession, readSession, clearSession } from '../dist/session.js';
import { cardDetails } from '../dist/planner-tools.js';
import { PROFILES } from '../dist/data.js';

const raw = JSON.parse(
  readFileSync(new URL('../dist/vanilla-data.json', import.meta.url))
).enchantments;
const state = (overrides = {}) => ({
  edition: 'java',
  version: 'java-26.3',
  item: 'helmet',
  selected: {},
  existing: {},
  itemUses: 0,
  objective: 'levels',
  incompatible: false,
  moreTen: false,
  bookHistory: false,
  showCurses: false,
  ...overrides,
});
const b = (level, uses = 0) => ({ level, uses });

test('equal-level existing upgrades use Java final level and Bedrock level difference', () => {
  for (const edition of ['java', 'bedrock']) {
    const settings = state({
      edition,
      version: edition + '-26.3',
      existing: { protection: 3 },
      selected: { protection: b(3) },
    });
    const result = optimize(buildRequest(settings, raw));
    assert.equal(result.total, edition === 'java' ? 4 : 1);
    assert.deepEqual(nodeEnchantments(result, settings), [{ id: 'protection', level: 4 }]);
    assert.deepEqual(nodeEnchantments(result, settings, result.root.left), [
      { id: 'protection', level: 3 },
    ]);
  }
});
test('existing enchantments are kept without charging for them again', () => {
  const settings = state({
    existing: { protection: 4, unbreaking: 3 },
    selected: { mending: b(1) },
    itemUses: 2,
  });
  const result = optimize(buildRequest(settings, raw));
  assert.equal(result.total, 5);
  assert.deepEqual(
    Object.fromEntries(nodeEnchantments(result, settings).map((e) => [e.id, e.level])),
    { protection: 4, unbreaking: 3, mending: 1 }
  );
});
test('invalid or ineffective upgrades and conflicts are rejected', () => {
  for (const input of [
    { existing: { protection: 4 }, selected: { protection: b(4) } },
    { existing: { protection: 3 }, selected: { protection: b(2) } },
    { existing: { protection: 4 }, selected: { fire_protection: b(4) } },
    { existing: { protection: 8 }, selected: { mending: b(1) } },
    { item: 'book', existing: { mending: 1 }, selected: { unbreaking: b(3) } },
  ])
    assert.throws(() => buildRequest(state(input), raw));
});
test('an existing-only item has zero steps and obeys historical compatibility', () => {
  const settings = state({ existing: { protection: 4 }, itemUses: 2 });
  const result = optimize(buildRequest(settings, raw));
  assert.equal(result.steps.length, 0);
  assert.equal(result.total, 0);
  assert.equal(result.finalPenalty, 3);
  const historical = state({
    version: 'java-1.14',
    existing: { protection: 4 },
    selected: { fire_protection: b(4) },
  });
  assert(optimize(buildRequest(historical, raw)));
  const bow = state({
    item: 'bow',
    version: 'java-1.11.1',
    existing: { infinity: 1 },
    selected: { mending: b(1) },
  });
  assert(optimize(buildRequest(bow, raw)));
  bow.existing = { mending: 1 };
  bow.selected = { infinity: b(1) };
  assert.equal(optimize(buildRequest(bow, raw)), null);
});

// Exhaust inventories independently, including the actual enchantments on each partial item.
function brute(request) {
  let best;
  const score = (r) =>
    request.objective === 'penalty'
      ? [r.uses, r.total, r.xp]
      : request.objective === 'xp'
        ? [r.xp, r.total]
        : [r.total, r.xp];
  const better = (r) =>
    !best ||
    score(r).some(
      (value, i, a) => a.slice(0, i).every((v, j) => v === score(best)[j]) && value < score(best)[i]
    );
  function visit(parts, total = 0, xp = 0) {
    if (parts.length === 1) {
      const result = { total, xp, uses: parts[0].uses };
      if (better(result)) best = result;
      return;
    }
    parts.forEach((left, i) =>
      parts.forEach((right, j) => {
        if (i === j || right.gear) return;
        const levels = { ...left.levels };
        let cost = penalty(left.uses) + penalty(right.uses);
        for (const [id, level] of Object.entries(right.levels)) {
          const book = request.books.find((b) => b.id === id);
          const start = levels[id] || 0;
          const finish = start === level ? Math.min(book.max, level + 1) : Math.max(start, level);
          cost += (finish - (request.edition === 'bedrock' ? start : 0)) * book.cost;
          levels[id] = finish;
        }
        if (cost >= 40) return;
        visit(
          [
            ...parts.filter((_, k) => k !== i && k !== j),
            { gear: left.gear, uses: Math.max(left.uses, right.uses) + 1, levels },
          ],
          total + cost,
          xp + xpForLevel(cost)
        );
      })
    );
  }
  visit([
    {
      gear: true,
      uses: request.itemUses,
      levels: Object.fromEntries(request.existing.map((e) => [e.id, e.level])),
    },
    ...request.books.map((b) => ({ gear: false, uses: b.uses, levels: { [b.id]: b.level } })),
  ]);
  return best;
}
test('existing-gear optimization matches exhaustive inventory search for both editions and all objectives', () => {
  for (const edition of ['java', 'bedrock'])
    for (const objective of ['levels', 'xp', 'penalty'])
      for (const itemUses of [0, 2, 5]) {
        const request = buildRequest(
          state({
            edition,
            version: edition + '-26.3',
            objective,
            itemUses,
            existing: { protection: 1, unbreaking: 2 },
            selected: { protection: b(4), unbreaking: b(2, 1), mending: b(1) },
          }),
          raw
        );
        const expected = brute(request),
          result = optimize(request);
        assert.equal(Boolean(result), Boolean(expected));
        if (result) {
          assert.equal(result.total, expected.total);
          assert.equal(result.xp, expected.xp);
          if (objective === 'penalty') assert.equal(result.finalPenalty, penalty(expected.uses));
        }
      }
});
test('old links remain compatible and new links preserve existing gear', () => {
  for (const settings of [
    state({ selected: { mending: b(1) } }),
    state({ existing: { protection: 3 }, selected: { protection: b(3), mending: b(1) } }),
    state({ existing: { protection: 4 } }),
  ]) {
    const url = createShareUrl(settings, 'https://anvil-studio.pages.dev/');
    const restored = readSharedPlan(new URL(url).hash, raw);
    assert.deepEqual(restored.existing, settings.existing);
    assert.deepEqual(restored.selected, settings.selected);
    assert.deepEqual(buildRequest(restored, raw), buildRequest(settings, raw));
  }
  assert.throws(() =>
    readSharedPlan(
      '#plan=' +
        encodeURIComponent(JSON.stringify([2, 'java-26.3', 'helmet', 0, 'levels', 0, [], null])),
      raw
    )
  );
});
test('resume stores only validated inputs and progress, and handles blocked storage', () => {
  const entries = new Map();
  globalThis.localStorage = {
    setItem: (k, v) => entries.set(k, v),
    getItem: (k) => entries.get(k),
    removeItem: (k) => entries.delete(k),
  };
  globalThis.window = { location: { href: 'https://anvil-studio.pages.dev/' } };
  const settings = state({ existing: { protection: 4 }, selected: { mending: b(1) } });
  const result = optimize(buildRequest(settings, raw));
  const progress = {
    completed: [1],
    gathered: result.books.map(bookKey),
    signature: planSignature(result),
  };
  assert(saveSession(settings, progress));
  assert.deepEqual(readSession(raw).progress, progress);
  clearSession();
  assert.equal(readSession(raw), null);
  entries.set('anvil-studio-session', '{broken');
  assert.equal(readSession(raw), null);
  globalThis.localStorage = {
    setItem() {
      throw new Error('Blocked');
    },
    getItem() {
      throw new Error('Blocked');
    },
    removeItem() {
      throw new Error('Blocked');
    },
  };
  assert.equal(saveSession(settings, progress), false);
  assert.equal(readSession(raw), null);
  assert.doesNotThrow(clearSession);
});
test('item-card data includes final upgraded enchantments and honest completion status', () => {
  const settings = state({ existing: { unbreaking: 2 }, selected: { unbreaking: b(2) } });
  settings.profile = PROFILES.find((p) => p.id === settings.version);
  const result = optimize(buildRequest(settings, raw));
  const card = cardDetails(result, settings);
  assert.deepEqual(card.enchantments, [{ id: 'unbreaking', level: 3 }]);
  assert.equal(card.status, 'Planned item');
  assert.equal(cardDetails(result, settings, [1]).status, 'Finished item');
  result.theoretical = true;
  assert.match(cardDetails(result, settings, [1]).status, /Theoretical/);
});
