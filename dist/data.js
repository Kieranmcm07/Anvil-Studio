// Version profiles and the small differences that cannot come from Java's data pack.
export const PROFILES = [
  { id: 'java-26.3', edition: 'java', label: '26.3', era: 26 },
  { id: 'java-1.21', edition: 'java', label: '1.21', era: 21 },
  { id: 'java-1.20', edition: 'java', label: '1.20', era: 20 },
  { id: 'java-1.14', edition: 'java', label: '1.14 – 1.14.2', era: 14, stackedProtection: true },
  {
    id: 'java-1.14.3-pre1',
    edition: 'java',
    label: '1.14.3 pre-release 1',
    era: 14,
    stackedProtection: true,
  },
  { id: 'java-1.11.1', edition: 'java', label: '1.11.1', era: 11.1, legacyBow: true },
  { id: 'java-1.11', edition: 'java', label: '1.11', era: 11, stackedBow: true },
  { id: 'java-1.9', edition: 'java', label: '1.9 – 1.10.2', era: 9, stackedBow: true },
  { id: 'bedrock-26.3', edition: 'bedrock', label: '26.3', era: 26 },
  { id: 'bedrock-1.21', edition: 'bedrock', label: '1.21', era: 21 },
];
export const ITEMS = [
  ['helmet', 'Helmet', 'armor'],
  ['chestplate', 'Chestplate', 'armor'],
  ['leggings', 'Leggings', 'armor'],
  ['boots', 'Boots', 'armor'],
  ['turtle_helmet', 'Turtle Shell', 'armor'],
  ['sword', 'Sword', 'weapons'],
  ['axe', 'Axe', 'tools'],
  ['pickaxe', 'Pickaxe', 'tools'],
  ['shovel', 'Shovel', 'tools'],
  ['hoe', 'Hoe', 'tools'],
  ['bow', 'Bow', 'weapons'],
  ['crossbow', 'Crossbow', 'weapons'],
  ['trident', 'Trident', 'weapons'],
  ['mace', 'Mace', 'weapons'],
  ['spear', 'Spear', 'weapons'],
  ['elytra', 'Elytra', 'utility'],
  ['shield', 'Shield', 'utility'],
  ['brush', 'Brush', 'tools'],
  ['book', 'Book', 'utility'],
  ['fishing_rod', 'Fishing rod', 'utility'],
  ['shears', 'Shears', 'utility'],
  ['flint_and_steel', 'Flint and steel', 'utility'],
  ['carrot_on_a_stick', 'Carrot on a stick', 'utility'],
  ['warped_fungus_on_a_stick', 'Warped fungus on a stick', 'utility'],
];
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export const nameOf = (id) =>
  ({
    binding_curse: 'Curse of Binding',
    vanishing_curse: 'Curse of Vanishing',
    sweeping_edge: 'Sweeping Edge',
  })[id] ||
  id
    .split('_')
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(' ');
export const itemName = (id) => ITEMS.find((i) => i[0] === id)?.[1] || nameOf(id);
export const itemIcon = (id) => {
  const diamond = [
    'helmet',
    'chestplate',
    'leggings',
    'boots',
    'sword',
    'axe',
    'pickaxe',
    'shovel',
    'hoe',
    'spear',
  ];
  const texture = diamond.includes(id)
    ? 'diamond_' + id
    : id === 'crossbow'
      ? 'crossbow_standby'
      : id;
  return `./assets/items/${texture}.png`;
};
// Wind Burst only generates at level I. Higher-level books have already been combined.
export const minimumBookUses = (id, level) => (id === 'wind_burst' ? level - 1 : 0);
const introduced = {
  mending: 9,
  frost_walker: 9,
  binding_curse: 11,
  vanishing_curse: 11,
  sweeping_edge: 11.1,
  loyalty: 13,
  impaling: 13,
  riptide: 13,
  channeling: 13,
  multishot: 14,
  quick_charge: 14,
  piercing: 14,
  soul_speed: 16,
  swift_sneak: 19,
  density: 21,
  breach: 21,
  wind_burst: 21,
  lunge: 26,
};
export function itemsFor(profile) {
  const since = {
    spear: 26,
    mace: 21,
    trident: 13,
    turtle_helmet: 13,
    brush: 20,
    crossbow: 14,
    warped_fungus_on_a_stick: 16,
  };
  return ITEMS.filter(([id]) => (since[id] || 0) <= profile.era);
}
export function enchantsFor(raw, profile, item) {
  return Object.entries(raw)
    .filter(([id, e]) => {
      if (
        (introduced[id] || 0) > profile.era ||
        (id === 'sweeping_edge' && profile.edition === 'bedrock')
      )
        return false;
      if (
        profile.era < 16 &&
        item === 'hoe' &&
        ['efficiency', 'fortune', 'silk_touch'].includes(id)
      )
        return false;
      // Bedrock has no weapon enchantments on axes in Survival.
      if (
        profile.edition === 'bedrock' &&
        item === 'axe' &&
        ['sharpness', 'smite', 'bane_of_arthropods'].includes(id)
      )
        return false;
      return item === 'book' || e.items.includes(item) || e.items.includes('diamond_' + item);
    })
    .map(([id, e]) => ({
      id,
      name: nameOf(id),
      ...e,
      bookCost: profile.edition === 'bedrock' && id === 'impaling' ? 1 : e.bookCost,
    }));
}
export function conflicts(a, b, profile, raw) {
  if (a === b) return false;
  const protections = [
    'protection',
    'fire_protection',
    'blast_protection',
    'projectile_protection',
  ];
  if (profile.stackedProtection && protections.includes(a) && protections.includes(b)) return false;
  if (
    (profile.stackedBow || profile.legacyBow) &&
    [a, b].includes('mending') &&
    [a, b].includes('infinity')
  )
    return false;
  return raw[a]?.excludes.includes(b) || raw[b]?.excludes.includes(a);
}
