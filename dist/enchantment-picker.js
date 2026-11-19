import { conflicts, minimumBookUses, nameOf, ROMAN } from './data.js';
import { upgradedLevel } from './planner-model.js';
import { $, escape } from './ui.js';
import { updateCount } from './stats.js';

function levelButton(enchantment, level, selectedLevel, reason, initial = 0) {
  if (initial && upgradedLevel(initial, level, enchantment.max) <= initial)
    reason = 'Already on your item at this level or higher.';
  const label = `${enchantment.name} ${ROMAN[level]}`;
  return `
    <button data-enchant="${enchantment.id}" data-level="${level}"
      class="${level === selectedLevel ? 'selected' : ''}"
      aria-label="${escape(reason ? `${label}. ${reason}` : label)}"
      aria-pressed="${level === selectedLevel}" ${reason ? 'disabled' : ''}>
      ${ROMAN[level]}
    </button>`;
}

function windBurstRecipe(level) {
  if (level < 2) return '';
  const recipe =
    level === 3
      ? 'Combine four Wind Burst I books into two Wind Burst II books. Then combine those two to make Wind Burst III.'
      : 'Combine two Wind Burst I books to make Wind Burst II.';
  return `
    <details class="book-origin">
      <summary>Make your Wind Burst ${ROMAN[level]} book first</summary>
      <p>${recipe}</p>
      <p>The plan starts with that finished book. It accounts for the book’s anvil history,
        but doesn’t include the levels you spend making it.</p>
    </details>`;
}

function enchantmentRow(enchantment, state, profile, raw) {
  const picked = state.selected[enchantment.id];
  const conflictingId = Object.keys({ ...state.selected, ...state.existing }).find((id) =>
    conflicts(id, enchantment.id, profile, raw)
  );
  const reason =
    conflictingId && !state.incompatible ? `Remove ${nameOf(conflictingId)} to select this.` : '';
  const levels = Array.from({ length: enchantment.max }, (_, i) =>
    levelButton(enchantment, i + 1, picked?.level, reason, state.existing?.[enchantment.id])
  ).join('');
  const initial = state.existing?.[enchantment.id];
  const history =
    picked && state.bookHistory
      ? `
    <label class="book-uses">Book prior-work count
      <input type="number" min="${minimumBookUses(enchantment.id, picked.level)}" max="6"
        value="${picked.uses}" data-book-uses="${enchantment.id}"
        aria-label="${enchantment.name} book prior-work count">
    </label>`
      : '';

  return `
    <div class="enchant-row ${picked ? 'selected' : ''} ${reason ? 'conflicted' : ''}">
      <span class="enchant-name" title="${escape(reason || enchantment.name)}">
        <i class="selection-dot"></i>${enchantment.name}
      </span>
      <div class="level-buttons" role="group" aria-label="${enchantment.name}">${levels}</div>
      ${initial ? `<p class="existing-hint">On item: ${ROMAN[initial]}${picked ? ' · Result: ' + ROMAN[upgradedLevel(initial, picked.level, enchantment.max)] : ''}</p>` : ''}
      ${history}
      ${picked && enchantment.id === 'wind_burst' ? windBurstRecipe(picked.level) : ''}
    </div>`;
}

export function renderExisting(enchantments, state, profile, raw) {
  $('#existing-panel').hidden = state.item === 'book';
  $('#existing-count').textContent = String(Object.keys(state.existing || {}).length);
  $('#existing-enchantments').innerHTML = enchantments
    .filter((e) => !e.id.endsWith('_curse') || state.showCurses || state.existing?.[e.id])
    .map((e) => {
      const conflict =
        !state.incompatible &&
        Object.keys(state.existing || {}).some((id) => conflicts(id, e.id, profile, raw));
      return `<label>${escape(e.name)}<select data-existing="${e.id}" aria-label="${escape(e.name)} already on item" ${conflict ? 'disabled' : ''}>
      <option value="0">None</option>${Array.from({ length: e.max }, (_, i) => `<option value="${i + 1}" ${state.existing?.[e.id] === i + 1 ? 'selected' : ''}>${ROMAN[i + 1]}</option>`).join('')}
    </select></label>`;
    })
    .join('');
}

export function renderPicker(enchantments, state, profile, raw) {
  renderExisting(enchantments, state, profile, raw);
  const search = $('#search').value.toLowerCase().trim();
  const count = Object.keys(state.selected).length;
  const edition = profile.edition === 'java' ? 'Java' : 'Bedrock';
  updateCount($('#selection-count'), String(count));
  $('#gear-summary').textContent =
    `${count} enchantment${count === 1 ? '' : 's'} selected · ${edition} ${profile.label}`;

  const visible = enchantments.filter(
    (enchantment) =>
      enchantment.name.toLowerCase().includes(search) &&
      (!enchantment.id.endsWith('_curse') ||
        state.showCurses ||
        state.selected[enchantment.id] ||
        search)
  );
  $('#enchantments').innerHTML = visible.length
    ? visible.map((enchantment) => enchantmentRow(enchantment, state, profile, raw)).join('')
    : '<p class="muted">No matching enchantments.</p>';
}
