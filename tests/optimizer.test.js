import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { optimize, penalty, xpForLevel } from '../dist/optimizer.js';
import {
  PROFILES,
  enchantsFor,
  conflicts,
  itemsFor,
  minimumBookUses,
  itemIcon,
  ITEMS,
} from '../dist/data.js';

const raw = JSON.parse(
  readFileSync(new URL('../dist/vanilla-data.json', import.meta.url))
).enchantments;
const profile = (id) => PROFILES.find((p) => p.id === id);
const book = (id, level, cost, uses = 0) => ({ id, level, cost, uses });

// Independent exhaustive search over inventories of partial results. It chooses
// pairs at each step, rather than building subsets like the production solver.
function brute(books, itemUses, objective) {
  let best = null;
  const score = (r) =>
    objective === 'penalty'
      ? [r.penalty, r.total, r.xp]
      : objective === 'xp'
        ? [r.xp, r.total]
        : [r.total, r.xp];
  const less = (a, b) => {
    if (!b) return true;
    const x = score(a),
      y = score(b);
    for (let i = 0; i < x.length; i++) {
      if (x[i] !== y[i]) return x[i] < y[i];
    }
    return false;
  };
  function visit(parts, total, xp) {
    if (parts.length === 1) {
      const r = { total, xp, penalty: parts[0].penalty };
      if (less(r, best)) best = r;
      return;
    }
    for (let i = 0; i < parts.length; i++)
      for (let j = 0; j < parts.length; j++) {
        if (i === j || parts[j].gear) continue;
        const a = parts[i],
          b = parts[j],
          cost = a.penalty + b.penalty + b.value;
        if (cost >= 40) continue;
        const next = {
          gear: a.gear,
          value: a.value + b.value,
          penalty: 2 * Math.max(a.penalty, b.penalty) + 1,
        };
        visit(
          [...parts.filter((_, k) => k !== i && k !== j), next],
          total + cost,
          xp + xpForLevel(cost)
        );
      }
  }
  visit(
    [
      { gear: true, value: 0, penalty: penalty(itemUses) },
      ...books.map((b) => ({ gear: false, value: b.level * b.cost, penalty: penalty(b.uses) })),
    ],
    0,
    0
  );
  return best;
}

test('known single book and two-book costs', () => {
  assert.equal(optimize({ books: [book('mending', 1, 2)] }).total, 2);
  assert.equal(optimize({ books: [book('thorns', 3, 4), book('mending', 1, 2)] }).total, 15);
  assert.equal(optimize({ books: [book('mending', 1, 2, 1)], itemUses: 2 }).total, 6);
});
test('survival accepts 39 and rejects 40, including books', () => {
  assert.equal(optimize({ books: [book('test', 4, 2)], itemUses: 5 }).total, 39);
  assert.equal(optimize({ books: [book('test', 3, 3)], itemUses: 5 }), null);
  assert.equal(optimize({ books: [book('mending', 1, 2, 6)] }), null);
  assert.equal(optimize({ books: [book('test', 3, 3)], itemUses: 5, survival: false }).total, 40);
});
test('XP boundaries use the game level curve', () => {
  for (const [level, xp] of [
    [0, 0],
    [1, 7],
    [16, 352],
    [17, 394],
    [30, 1395],
    [31, 1507],
    [32, 1628],
    [39, 2727],
  ])
    assert.equal(xpForLevel(level), xp);
});
test('all three objectives match independent exhaustive searches', () => {
  const cases = [
    [book('a', 4, 1), book('b', 3, 1), book('c', 1, 2)],
    [book('a', 3, 4), book('b', 3, 2), book('c', 4, 1), book('d', 1, 2)],
    [book('a', 5, 1, 1), book('b', 3, 2), book('c', 3, 1, 2), book('d', 1, 2)],
    [book('a', 3, 4, 2), book('b', 3, 4, 1), book('c', 4, 2)],
  ];
  for (const books of cases)
    for (const itemUses of [0, 2, 4])
      for (const objective of ['levels', 'xp', 'penalty']) {
        const expected = brute(books, itemUses, objective),
          actual = optimize({ books, itemUses, objective });
        assert.equal(actual === null, expected === null);
        if (actual) {
          assert.equal(actual.total, expected.total);
          assert.equal(actual.xp, expected.xp);
          if (objective === 'penalty') assert.equal(actual.finalPenalty, expected.penalty);
        }
      }
});
test('every result is executable in postorder and consumes every input once', () => {
  const books = [
    book('a', 3, 4),
    book('b', 3, 2),
    book('c', 4, 1),
    book('d', 1, 2),
    book('e', 3, 1),
    book('f', 1, 2),
  ];
  const r = optimize({ books });
  const available = new Set(Array.from({ length: books.length + 1 }, (_, i) => 1 << i));
  let total = 0;
  for (const s of r.steps) {
    assert(available.delete(s.left.mask));
    assert(available.delete(s.right.mask));
    assert(!(s.right.mask & 1));
    assert(s.cost < 40);
    assert.equal(s.uses, Math.max(s.left.uses, s.right.uses) + 1);
    total += s.cost;
    available.add(s.mask);
  }
  assert.equal(total, r.total);
  assert.deepEqual([...available], [r.root.mask]);
  assert.equal(r.steps.length, books.length);
});
test('lowest prior-work objective can differ from cheapest levels', () => {
  const books = [book('a', 4, 1), book('b', 3, 1), book('c', 1, 2)];
  const levels = optimize({ books }),
    work = optimize({ books, objective: 'penalty' });
  assert.equal(levels.total, 13);
  assert.equal(work.finalPenalty, 3);
  assert(work.finalPenalty < levels.finalPenalty);
});
test('Java and Bedrock profiles apply edition-specific availability and costs', () => {
  const java = profile('java-26.3'),
    bedrock = profile('bedrock-26.3');
  assert(enchantsFor(raw, java, 'sword').some((e) => e.id === 'sweeping_edge'));
  assert(!enchantsFor(raw, bedrock, 'sword').some((e) => e.id === 'sweeping_edge'));
  assert.equal(enchantsFor(raw, java, 'trident').find((e) => e.id === 'impaling').bookCost, 2);
  assert.equal(enchantsFor(raw, bedrock, 'trident').find((e) => e.id === 'impaling').bookCost, 1);
  assert(!enchantsFor(raw, bedrock, 'axe').some((e) => e.id === 'sharpness'));
});
test('historical protection and Mending/Infinity compatibility', () => {
  assert(conflicts('protection', 'blast_protection', profile('java-26.3'), raw));
  for (const id of ['java-1.14', 'java-1.14.3-pre1'])
    assert(!conflicts('protection', 'blast_protection', profile(id), raw));
  assert(conflicts('mending', 'infinity', profile('java-26.3'), raw));
  assert(!conflicts('mending', 'infinity', profile('java-1.9'), raw));
  assert(conflicts('frost_walker', 'depth_strider', profile('java-1.14'), raw));
  assert(conflicts('silk_touch', 'fortune', profile('java-26.3'), raw));
});
test('1.11.1 keeps Infinity on the left when adding Mending', () => {
  const books = [book('mending', 1, 2), book('infinity', 1, 4), book('power', 5, 1)];
  const r = optimize({ books, item: 'bow', legacyBow: true });
  assert(r);
  for (const s of r.steps) assert(!(s.left.mask & 2 && s.right.mask & 4));
});
test('later enchantments and equipment do not leak into old profiles', () => {
  assert(
    !itemsFor(profile('java-1.9')).some((i) =>
      ['crossbow', 'trident', 'mace', 'spear'].includes(i[0])
    )
  );
  assert(!enchantsFor(raw, profile('java-1.9'), 'helmet').some((e) => e.id === 'binding_curse'));
  assert(!enchantsFor(raw, profile('java-1.14'), 'boots').some((e) => e.id === 'soul_speed'));
  assert(!enchantsFor(raw, profile('java-1.14'), 'leggings').some((e) => e.id === 'swift_sneak'));
  assert(!enchantsFor(raw, profile('java-1.14'), 'hoe').some((e) => e.id === 'efficiency'));
  assert(!itemsFor(profile('java-1.21')).some((i) => i[0] === 'spear'));
  assert(enchantsFor(raw, profile('java-26.3'), 'spear').some((e) => e.id === 'lunge'));
});
test('reject malformed inputs and unsupported duplicate-book upgrading', () => {
  assert.throws(() => optimize({ books: [book('x', 0, 1)] }));
  assert.throws(() => optimize({ books: [book('x', 1, 1, -1)] }));
  assert.throws(() => optimize({ books: [book('x', 1, 1), book('x', 1, 1)] }));
  assert.throws(() =>
    optimize({ books: Array.from({ length: 14 }, (_, i) => book('e' + i, 1, 1)) })
  );
});
test('Wind Burst II and III carry their unavoidable preparation penalty', () => {
  assert.equal(minimumBookUses('wind_burst', 1), 0);
  assert.equal(minimumBookUses('wind_burst', 2), 1);
  assert.equal(minimumBookUses('wind_burst', 3), 2);
  assert.equal(
    optimize({ books: [book('wind_burst', 3, 2, minimumBookUses('wind_burst', 3))], item: 'mace' })
      .total,
    9
  );
});
test('13 enchantments are supported by the exact solver', () => {
  const r = optimize({ books: Array.from({ length: 13 }, (_, i) => book('e' + i, 1, 1)) });
  assert(r);
  assert.equal(r.steps.length, 13);
  assert(r.steps.every((s) => s.cost < 40));
});

test('the picker only lists enchantable equipment', () => {
  for (const p of PROFILES) {
    assert(!itemsFor(p).some(([id]) => id === 'horse_armor'));
    for (const [id] of itemsFor(p)) {
      assert(enchantsFor(raw, p, id).length > 0, `${id} has no enchantments in ${p.id}`);
    }
  }
});

test('every equipment and book icon is a local, source-verified Minecraft PNG', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../dist/assets/items/sources.json', import.meta.url))
  );
  for (const id of [...ITEMS.map(([id]) => id), 'enchanted_book']) {
    const relative = itemIcon(id);
    const file = new URL('../dist/' + relative, import.meta.url);
    assert(existsSync(file), 'Missing icon: ' + id);
    const bytes = readFileSync(file);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const name = relative.split('/').at(-1).replace('.png', '');
    const source = manifest[name].source;
    assert(
      id === 'shield'
        ? source.startsWith('https://raw.githubusercontent.com/TinyTank800/MinecraftAllImages/')
        : source.startsWith('https://raw.githubusercontent.com/misode/mcmeta/26.3-assets/')
    );
    assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest[name].sha256);
    if (id === 'shield')
      assert(bytes.readUInt32BE(16) > 16, 'Shield uses the full inventory render');
  }
});

test('turtle shells and brushes follow version and enchantment availability', () => {
  for (const id of ['java-26.3', 'bedrock-26.3']) {
    const p = profile(id);
    assert(enchantsFor(raw, p, 'turtle_helmet').some((e) => e.id === 'respiration'));
    assert.deepEqual(
      enchantsFor(raw, p, 'brush')
        .map((e) => e.id)
        .sort(),
      ['mending', 'unbreaking', 'vanishing_curse']
    );
  }
  assert(!itemsFor(profile('java-1.9')).some(([id]) => id === 'turtle_helmet'));
  assert(!itemsFor(profile('java-1.14')).some(([id]) => id === 'brush'));
});
test('book plans consume only the supplied enchanted books', () => {
  const single = optimize({ item: 'book', books: [book('mending', 1, 2)] });
  assert.equal(single.total, 0);
  assert.equal(single.steps.length, 0);
  const pair = optimize({ item: 'book', books: [book('mending', 1, 2), book('unbreaking', 3, 1)] });
  assert.equal(pair.total, 2);
  assert.equal(pair.steps.length, 1);
  const three = optimize({
    item: 'book',
    books: [book('mending', 1, 2), book('thorns', 3, 4), book('unbreaking', 3, 1)],
  });
  assert.equal(three.total, 6);
  assert.equal(three.steps.length, 2);
  assert.equal(three.root.mask, 7);
  assert.throws(() => optimize({ item: 'book', books: [] }));
});
