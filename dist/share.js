import { buildRequest } from './planner-model.js';
import { PROFILES, itemsFor, enchantsFor, conflicts, minimumBookUses } from './data.js';

const fail = () => {
  throw new Error('This share link is incomplete or unsupported. Choose a setup to start again.');
};
export function readSharedPlan(hash, raw) {
  if (!hash.startsWith('#plan=')) return null;
  if (hash.length > 6000) return fail();
  let data;
  try {
    data = JSON.parse(decodeURIComponent(hash.slice(6)));
  } catch {
    return fail();
  }
  if (!Array.isArray(data) || ![7, 8].includes(data.length)) return fail();
  const [format, version, item, itemUses, objective, flags, books, initial = []] = data;
  const profile = PROFILES.find((p) => p.id === version);
  if (
    ![1, 2].includes(format) ||
    data.length !== (format === 1 ? 7 : 8) ||
    !profile ||
    !itemsFor(profile).some(([id]) => id === item) ||
    !Number.isInteger(itemUses) ||
    itemUses < 0 ||
    itemUses > 6 ||
    !['levels', 'xp', 'penalty'].includes(objective) ||
    !Number.isInteger(flags) ||
    flags < 0 ||
    flags > 15 ||
    !Array.isArray(initial) ||
    !Array.isArray(books) ||
    (!books.length && !initial.length) ||
    books.length > (flags & 2 ? 13 : 10)
  )
    return fail();
  const available = enchantsFor(raw, profile, item);
  const selected = {};
  for (const book of books) {
    if (!Array.isArray(book) || book.length !== 3) return fail();
    const [id, level, uses] = book;
    const enchantment = available.find((e) => e.id === id);
    if (
      !enchantment ||
      Object.hasOwn(selected, id) ||
      !Number.isInteger(level) ||
      level < 1 ||
      level > enchantment.max ||
      !Number.isInteger(uses) ||
      uses < minimumBookUses(id, level) ||
      uses > 6 ||
      (!(flags & 1) && Object.keys(selected).some((other) => conflicts(id, other, profile, raw)))
    )
      return fail();
    selected[id] = { level, uses };
  }
  const existing = {};
  if (!Array.isArray(initial) || initial.length > available.length) return fail();
  for (const entry of initial) {
    if (!Array.isArray(entry) || entry.length !== 2) return fail();
    const [id, level] = entry;
    if (!available.some((e) => e.id === id) || Object.hasOwn(existing, id)) return fail();
    existing[id] = level;
  }
  const state = {
    existing,
    edition: profile.edition,
    version,
    item,
    itemUses,
    objective,
    selected,
    incompatible: Boolean(flags & 1),
    moreTen: Boolean(flags & 2),
    bookHistory: Boolean(flags & 4) || books.some(([, , uses]) => uses > 0),
    showCurses: Boolean(flags & 8) || books.some(([id]) => id.endsWith('_curse')),
  };
  try {
    buildRequest(state, raw);
  } catch {
    return fail();
  }
  return state;
}
export function createShareUrl(state, base = window.location.href) {
  const flags =
    Number(state.incompatible) |
    (Number(state.moreTen) << 1) |
    (Number(state.bookHistory) << 2) |
    (Number(state.showCurses) << 3);
  const books = Object.entries(state.selected).map(([id, b]) => [id, b.level, b.uses]);
  const url = new URL(base);
  url.hash =
    'plan=' +
    encodeURIComponent(
      JSON.stringify(
        Object.keys(state.existing || {}).length
          ? [
              2,
              state.version,
              state.item,
              state.itemUses,
              state.objective,
              flags,
              books,
              Object.entries(state.existing),
            ]
          : [1, state.version, state.item, state.itemUses, state.objective, flags, books]
      )
    );
  return url.href;
}
export function setupSharing(getState, getRaw, notify) {
  const dialog = document.querySelector('#share-dialog');
  const field = document.querySelector('#share-url');
  const feedback = document.querySelector('#share-feedback');
  async function copy(url) {
    if (!window.navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await window.navigator.clipboard.writeText(url);
  }
  document.querySelector('#share').addEventListener('click', async () => {
    let url;
    try {
      url = createShareUrl(getState());
      readSharedPlan(new URL(url).hash, getRaw());
    } catch {
      notify('Choose valid enchantments and prior-work counts before sharing.');
      return;
    }
    try {
      if (window.matchMedia('(pointer: coarse)').matches && window.navigator.share) {
        await window.navigator.share({ title: 'Anvil Studio enchantment plan', url });
      } else {
        await copy(url);
        notify('Link copied. It opens this setup, ready to calculate.');
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      field.value = url;
      feedback.textContent = 'Copy this link to share your setup.';
      dialog.showModal();
      field.focus();
      field.select();
    }
  });
  document.querySelector('#copy-share').addEventListener('click', async () => {
    try {
      await copy(field.value);
      feedback.textContent = 'Link copied.';
    } catch {
      field.focus();
      field.select();
      feedback.textContent = 'Select and copy the link above.';
    }
  });
  document.querySelector('#close-share').addEventListener('click', () => dialog.close());
}
