import {
  PROFILES,
  itemName,
  itemIcon,
  enchantsFor,
  itemsFor,
  conflicts,
  minimumBookUses,
} from './data.js';
import { buildRequest, upgradedLevel } from './planner-model.js';
import { saveSession, readSession, clearSession } from './session.js';
import { setupPlannerTools, itemTooltip } from './planner-tools.js';
import { $, gearIcon } from './ui.js';
import { clearPlan, showPlan } from './plan-view.js';
import { renderPicker } from './enchantment-picker.js';
import { setupGithubLinks } from './config.js';
import { setupThemes } from './themes.js';
import { setupSounds, playSound } from './sounds.js';
import { setupDropdowns } from './dropdowns.js';
import { readSharedPlan, setupSharing } from './share.js';
import { reveal, setupMotion, motionEnabled } from './motion.js';

const defaults = () => ({
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
});
let state = defaults();
let raw = {};
let worker = null;
const profile = () => PROFILES.find((p) => p.id === state.version);
const available = () => enchantsFor(raw, profile(), state.item);
function cleanSelections() {
  const valid = available();
  const existing = {};
  for (const [id, level] of Object.entries(state.existing || {})) {
    const e = valid.find((e) => e.id === id);
    if (
      state.item !== 'book' &&
      e &&
      Number.isInteger(level) &&
      level > 0 &&
      level <= e.max &&
      (state.incompatible ||
        !Object.keys(existing).some((other) => conflicts(id, other, profile(), raw)))
    )
      existing[id] = level;
  }
  state.existing = existing;
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
      if (
        !Object.keys({ ...state.existing, ...keep }).some((other) =>
          conflicts(id, other, profile(), raw)
        )
      )
        keep[id] = v;
    state.selected = keep;
  }
  for (const [id, v] of Object.entries(state.selected)) {
    const initial = state.existing[id] || 0;
    if (initial && upgradedLevel(initial, v.level, valid.find((e) => e.id === id).max) <= initial)
      delete state.selected[id];
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
  $('#item-card img').src = itemIcon(state.item === 'book' ? 'enchanted_book' : state.item);
  $('#gear-icon').innerHTML = gearIcon(state.item);
  renderEnchantments();
}
function renderEnchantments() {
  renderPicker(available(), state, profile(), raw);
  $('#share').disabled = !Object.keys(state.selected).length && !Object.keys(state.existing).length;
  $('#gear-icon').innerHTML = itemTooltip(
    state.item,
    itemName(state.item),
    Object.entries(state.existing).map(([id, level]) => ({ id, level }))
  );
}
function notice(message) {
  $('#notice').textContent = message;
  $('#notice').hidden = !message;
  if (message) reveal($('#notice'));
}
function invalidate(message = '', options = {}) {
  worker?.terminate();
  worker = null;
  clearPlan(options);
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
      !Object.keys({ ...state.existing, ...state.selected }).some((id) =>
        conflicts(id, e.id, profile(), raw)
      ) &&
      e.max > (state.existing[e.id] || 0)
    )
      state.selected[e.id] = { level: e.max, uses: minimumBookUses(e.id, e.max) };
  invalidate();
  renderEnchantments();
}
function calculate({ progress, quiet = false } = {}) {
  let request;
  try {
    request = buildRequest(state, raw);
  } catch (error) {
    notice(error.message);
    return;
  }
  notice('');
  if (!quiet) playSound('enchant');
  const settings = structuredClone({ ...state, profile: profile() });
  $('#calculate').disabled = true;
  $('#calculate').firstElementChild.textContent = 'Calculating…';
  worker?.terminate();
  let job;
  try {
    job = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
    invalidate('The calculator could not start. Refresh the page and try again.');
    return;
  }
  worker = job;
  job.onmessage = ({ data }) => {
    if (worker !== job) return;
    job.terminate();
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
    showPlan({ ...data.result, theoretical: !request.survival }, settings, progress);
    $('#resume-banner').hidden = true;
    if (window.matchMedia('(max-width: 1100px)').matches) {
      $('.results').scrollIntoView({
        behavior: motionEnabled() ? 'smooth' : 'auto',
        block: 'start',
      });
    }
    if (!request.survival)
      notice('Theoretical plan: these enchantments conflict. It requires commands or mods.');
  };
  job.onerror = () => {
    if (worker !== job) return;
    job.terminate();
    worker = null;
    invalidate('The calculator could not start. Refresh the page and try again.');
  };
  job.postMessage(request);
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
  state.existing = {};
  state.itemUses = 0;
  $('#search').value = '';
  invalidate();
  renderControls();
});
$('#existing-enchantments').addEventListener('click', (event) => {
  const button = event.target.closest('[data-existing]');
  if (!button || button.disabled) return;
  const id = button.dataset.existing;
  const level = Number(button.dataset.existingLevel);
  if (state.existing[id] === level) delete state.existing[id];
  else state.existing[id] = level;
  cleanSelections();
  invalidate();
  renderEnchantments();
  document
    .querySelector('[data-existing="' + id + '"][data-existing-level="' + level + '"]')
    ?.focus({ preventScroll: true });
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
      uses: Math.max(
        state.bookHistory ? state.selected[id]?.uses || 0 : 0,
        minimumBookUses(id, level)
      ),
    };
  invalidate();
  renderEnchantments();
});
function updateBookUses(e) {
  const book = state.selected[e.target.dataset.bookUses];
  if (!book) return;
  const uses = e.target.value === '' ? NaN : Number(e.target.value);
  if (Object.is(book.uses, uses)) return;
  book.uses = uses;
  invalidate();
}
function updateItemUses(e) {
  const uses = e.target.value === '' ? NaN : Number(e.target.value);
  if (Object.is(state.itemUses, uses)) return;
  state.itemUses = uses;
  invalidate();
}
for (const event of ['input', 'change']) {
  $('#enchantments').addEventListener(event, updateBookUses);
  $('#item-uses').addEventListener(event, updateItemUses);
}
$('#search').addEventListener('input', renderEnchantments);
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
  clearSession();
  toolsUI.reset();
  $('#resume-banner').hidden = true;
  $('#search').value = '';
  invalidate('', { reset: true });
  if (window.location.hash.startsWith('#plan=')) {
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search
    );
  }
  renderControls();
});
$('#calculate').addEventListener('click', () => calculate());
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
    !document.activeElement.isContentEditable &&
    !document.querySelector('dialog[open]')
  ) {
    e.preventDefault();
    $('#search').focus();
  }
});

function loadBuild(settings) {
  state = structuredClone(settings);
  state.existing ||= {};
  $('#search').value = '';
  cleanSelections();
  invalidate();
  renderControls();
  calculate();
}
const toolsUI = setupPlannerTools(loadBuild);
for (const eventName of ['planchange', 'planprogress']) {
  document.addEventListener(eventName, (event) => {
    if (event.detail) saveSession(event.detail.settings, event.detail.progress);
  });
}
$('#resume-plan').addEventListener('click', () => {
  const saved = readSession(raw);
  if (!saved) {
    $('#resume-banner').hidden = true;
    notice('That saved plan is no longer available. Choose your enchantments to start again.');
    return;
  }
  state = saved.state;
  $('#search').value = '';
  invalidate();
  renderControls();
  calculate({ progress: saved.progress, quiet: true });
});
$('#forget-plan').addEventListener('click', () => {
  clearSession();
  $('#resume-banner').hidden = true;
});
setupGithubLinks();
setupThemes();
setupMotion();
setupSounds();
setupDropdowns(() => playSound('click'));
setupSharing(
  () => state,
  () => raw,
  notice
);
clearPlan({ fresh: true });
// Older versions saved a loadout. Each visit now starts with a fresh planner.
try {
  localStorage.removeItem('anvil-studio-v1');
} catch {}

try {
  const response = await fetch(new URL('./vanilla-data.json', import.meta.url));
  if (!response.ok) throw new Error('Data could not load');
  raw = (await response.json()).enchantments;
  loadSharedSetup();
  renderControls();
  const saved = readSession(raw);
  $('#resume-banner').hidden = !saved;
  if (saved)
    $('#resume-summary').textContent =
      itemName(saved.state.item) +
      ' · ' +
      saved.progress.completed.length +
      ' steps checked. Stored on this device.';
} catch {
  notice('The game data could not load. Refresh the page and try again.');
  $('#calculate').disabled = true;
}

function loadSharedSetup() {
  try {
    const shared = readSharedPlan(window.location.hash, raw);
    if (!shared) return;
    state = shared;
    $('#search').value = '';
    invalidate('Shared setup loaded. Click “Show my steps” when you’re ready.');
    renderControls();
  } catch (error) {
    notice(error.message);
  }
}
window.addEventListener('hashchange', loadSharedSetup);
