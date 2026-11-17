import { PROFILES, itemName, enchantsFor, itemsFor, conflicts, minimumBookUses } from './data.js';
import { $, gearIcon } from './ui.js';
import { clearPlan, showPlan } from './plan-view.js';
import { renderPicker } from './enchantment-picker.js';
import { setupGithubLinks } from './config.js';
import { setupThemes } from './themes.js';
import { reveal, setupMotion, motionEnabled } from './motion.js';

const defaults = () => ({
  edition: 'java',
  version: 'java-26.3',
  item: 'helmet',
  selected: {},
  itemUses: 0,
  objective: 'levels',
  incompatible: false,
  moreTen: false,
  bookHistory: false,
  showCurses: false,
});
let state = defaults();
let raw = {};
let worker = null;
const profile = () => PROFILES.find((p) => p.id === state.version);
const available = () => enchantsFor(raw, profile(), state.item);
function cleanSelections() {
  const valid = available();
  state.selected = Object.fromEntries(
    Object.entries(state.selected).filter(
      ([id, v]) =>
        valid.some(
          (e) => e.id === id && Number.isInteger(v.level) && v.level > 0 && v.level <= e.max
        ) &&
        Number.isInteger(v.uses) &&
        v.uses >= 0 &&
        v.uses <= 6
    )
  );
  if (!state.incompatible) {
    const keep = {};
    for (const [id, v] of Object.entries(state.selected))
      if (!Object.keys(keep).some((other) => conflicts(id, other, profile(), raw))) keep[id] = v;
    state.selected = keep;
  }
  for (const [id, v] of Object.entries(state.selected))
    v.uses = Math.max(v.uses, minimumBookUses(id, v.level));
}
function renderControls() {
  document.querySelectorAll('[data-edition]').forEach((b) => {
    const active = b.dataset.edition === state.edition;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active);
  });
  $('#version').innerHTML = PROFILES.filter((p) => p.edition === state.edition)
    .map((p) => `<option value="${p.id}">${p.label}</option>`)
    .join('');
  $('#version').value = state.version;
  $('#item').innerHTML = itemsFor(profile())
    .map(([id, name]) => `<option value="${id}">${name}</option>`)
    .join('');
  $('#item').value = state.item;
  $('#item-uses').value = state.itemUses;
  $('#preset').hidden = state.item === 'book';
  $('#item-uses').closest('label').hidden = state.item === 'book';
  $('#item-uses').closest('label').nextElementSibling.hidden = state.item === 'book';
  $('#objective').value = state.objective;
  for (const [id, key] of [
    ['incompatible', 'incompatible'],
    ['more-ten', 'moreTen'],
    ['book-history', 'bookHistory'],
    ['show-curses', 'showCurses'],
  ])
    $('#' + id).checked = state[key];
  const p = profile();
  const note = p.stackedProtection
    ? 'Historical rule: protection types can stack in this version.'
    : p.stackedBow
      ? 'Historical rule: Mending and Infinity can coexist.'
      : p.legacyBow
        ? '1.11.1 exception: Infinity goes on the left when adding Mending.'
        : p.edition === 'bedrock'
          ? 'Bedrock rules: no Sweeping Edge; Impaling books cost less than in Java.'
          : '';
  $('#version-note').textContent = note;
  $('#version-note').hidden = !note;
  if (note) reveal($('#version-note'));
  $('#gear-name').textContent = itemName(state.item);
  $('#gear-icon').innerHTML = gearIcon(state.item);
  renderEnchantments();
}
function renderEnchantments() {
  renderPicker(available(), state, profile(), raw);
}
function notice(message) {
  $('#notice').textContent = message;
  $('#notice').hidden = !message;
  if (message) reveal($('#notice'));
}
function invalidate(message = '') {
  worker?.terminate();
  worker = null;
  clearPlan();
  $('#calculate').disabled = false;
  $('#calculate').firstElementChild.textContent = 'Show my steps';
  notice(message);
}
function applyPreset() {
  state.selected = {};
  const skip = new Set([
    'binding_curse',
    'vanishing_curse',
    'fire_protection',
    'blast_protection',
    'projectile_protection',
    'frost_walker',
    'silk_touch',
    'smite',
    'bane_of_arthropods',
    'breach',
    'riptide',
    'piercing',
    'infinity',
  ]);
  if (['axe', 'shovel'].includes(state.item)) {
    skip.delete('silk_touch');
    skip.add('fortune');
  }
  for (const e of available())
    if (
      !skip.has(e.id) &&
      !Object.keys(state.selected).some((id) => conflicts(id, e.id, profile(), raw))
    )
      state.selected[e.id] = { level: e.max, uses: minimumBookUses(e.id, e.max) };
  invalidate();
  renderEnchantments();
}
function calculate() {
  const entries = available(),
    selected = Object.entries(state.selected);
  if (!selected.length) {
    notice('Select at least one enchantment to create a plan.');
    return;
  }
  if (selected.length > (state.moreTen ? 13 : 10)) {
    notice(
      `You selected ${selected.length} enchantments. ${state.moreTen ? 'The exact-search limit is 13.' : 'Enable “Allow more than 10 enchantments” in Advanced options.'}`
    );
    return;
  }
  if (!Number.isInteger(state.itemUses) || state.itemUses < 0 || state.itemUses > 6) {
    notice('Item prior-work count must be a whole number between 0 and 6.');
    return;
  }
  const books = selected.map(([id, v]) => ({
    id,
    level: v.level,
    uses: v.uses,
    cost: entries.find((e) => e.id === id).bookCost,
  }));
  if (books.some((b) => !Number.isInteger(b.uses) || b.uses < 0 || b.uses > 6)) {
    notice('Each book’s prior-work count must be a whole number between 0 and 6.');
    return;
  }
  if (books.some((b) => b.uses < minimumBookUses(b.id, b.level))) {
    notice(
      'Wind Burst II/III must be prepared from level I books. Set its prior-work count to at least its level minus one.'
    );
    return;
  }
  const incompatible = selected.some(([id], i) =>
    selected.slice(i + 1).some(([other]) => conflicts(id, other, profile(), raw))
  );
  notice('');
  $('#calculate').disabled = true;
  $('#calculate').firstElementChild.textContent = 'Calculating…';
  worker?.terminate();
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    worker.terminate();
    worker = null;
    $('#calculate').disabled = false;
    $('#calculate').firstElementChild.textContent = 'Show my steps';
    if (data.error) {
      invalidate(data.error);
      return;
    }
    if (!data.result) {
      invalidate(
        'No survival-safe order exists for these inputs. Try fewer enchantments or use an item/books with lower prior-work counts.'
      );
      return;
    }
    showPlan({ ...data.result, theoretical: incompatible }, { ...state, profile: profile() });
    if (window.matchMedia('(max-width: 1100px)').matches) {
      $('.results').scrollIntoView({
        behavior: motionEnabled() ? 'smooth' : 'auto',
        block: 'start',
      });
    }
    if (incompatible)
      notice(
        'Theoretical plan: these enchantments conflict in the selected version. This result requires commands or mods and cannot be created in vanilla Survival.'
      );
  };
  worker.onerror = () => {
    worker?.terminate();
    worker = null;
    invalidate('The calculator could not start. Refresh the page and try again.');
  };
  worker.postMessage({
    books,
    item: state.item,
    itemUses: state.itemUses,
    objective: state.objective,
    survival: !incompatible,
    legacyBow: profile().legacyBow && !incompatible,
  });
}
document.querySelectorAll('[data-edition]').forEach((b) =>
  b.addEventListener('click', () => {
    if (state.edition === b.dataset.edition) return;
    state.edition = b.dataset.edition;
    state.version = state.edition + '-26.3';
    cleanSelections();
    invalidate();
    renderControls();
  })
);
$('#version').addEventListener('change', (e) => {
  state.version = e.target.value;
  if (!itemsFor(profile()).some((i) => i[0] === state.item)) state.item = 'helmet';
  cleanSelections();
  invalidate();
  renderControls();
});
$('#item').addEventListener('change', (e) => {
  state.item = e.target.value;
  state.selected = {};
  state.itemUses = 0;
  $('#search').value = '';
  invalidate();
  renderControls();
});
$('#enchantments').addEventListener('click', (e) => {
  const b = e.target.closest('[data-enchant]');
  if (!b) return;
  const id = b.dataset.enchant,
    level = Number(b.dataset.level);
  if (state.selected[id]?.level === level) delete state.selected[id];
  else
    state.selected[id] = {
      level,
      uses: Math.max(state.selected[id]?.uses || 0, minimumBookUses(id, level)),
    };
  invalidate();
  renderEnchantments();
});
$('#enchantments').addEventListener('change', (e) => {
  if (!e.target.dataset.bookUses) return;
  state.selected[e.target.dataset.bookUses].uses =
    e.target.value === '' ? NaN : Number(e.target.value);
  invalidate();
});
$('#search').addEventListener('input', renderEnchantments);
$('#item-uses').addEventListener('change', (e) => {
  state.itemUses = e.target.value === '' ? NaN : Number(e.target.value);
  invalidate();
});
$('#objective').addEventListener('change', (e) => {
  state.objective = e.target.value;
  invalidate();
});
$('#incompatible').addEventListener('change', (e) => {
  state.incompatible = e.target.checked;
  cleanSelections();
  invalidate();
  renderEnchantments();
});
$('#more-ten').addEventListener('change', (e) => {
  state.moreTen = e.target.checked;
  invalidate();
});
$('#book-history').addEventListener('change', (e) => {
  state.bookHistory = e.target.checked;
  if (!state.bookHistory)
    Object.entries(state.selected).forEach(([id, v]) => (v.uses = minimumBookUses(id, v.level)));
  invalidate();
  renderEnchantments();
});
$('#show-curses').addEventListener('change', (e) => {
  state.showCurses = e.target.checked;
  renderEnchantments();
});
$('#preset').addEventListener('click', applyPreset);
$('#reset').addEventListener('click', () => {
  state = defaults();
  $('#search').value = '';
  invalidate('');
  renderControls();
});
$('#calculate').addEventListener('click', calculate);
for (const id of ['help-button', 'sources-button'])
  $('#' + id).addEventListener('click', () => {
    $('#help').showModal();
    reveal($('#help'));
  });
$('#close-help').addEventListener('click', () => $('#help').close());
$('#help').addEventListener('click', (e) => {
  if (e.target === $('#help')) {
    const r = e.target.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      e.target.close();
  }
});
document.addEventListener('keydown', (e) => {
  if (
    e.key === '/' &&
    !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) &&
    !$('#help').open
  ) {
    e.preventDefault();
    $('#search').focus();
  }
});

setupGithubLinks();
setupThemes();
setupMotion();
clearPlan({ fresh: true });
// Older versions saved a loadout. Each visit now starts with a fresh planner.
try {
  localStorage.removeItem('anvil-studio-v1');
} catch {}

try {
  const response = await fetch(new URL('./vanilla-data.json', import.meta.url));
  if (!response.ok) throw new Error('Data could not load');
  raw = (await response.json()).enchantments;
  renderControls();
} catch {
  notice('The game data could not load. Refresh the page and try again.');
  $('#calculate').disabled = true;
}
