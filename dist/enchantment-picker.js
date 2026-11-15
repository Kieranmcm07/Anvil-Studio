import { conflicts, minimumBookUses, nameOf, ROMAN } from './data.js';
import { $, escape } from './ui.js';

function levelButton(enchantment, level, selectedLevel, reason) {
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
  const conflictingId = Object.keys(state.selected).find((id) =>
    conflicts(id, enchantment.id, profile, raw)
  );
  const reason =
    conflictingId && !state.incompatible ? `Remove ${nameOf(conflictingId)} to select this.` : '';
  const levels = Array.from({ length: enchantment.max }, (_, i) =>
    levelButton(enchantment, i + 1, picked?.level, reason)
  ).join('');
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
      ${history}
      ${picked && enchantment.id === 'wind_burst' ? windBurstRecipe(picked.level) : ''}
    </div>`;
}

export function renderPicker(enchantments, state, profile, raw) {
  const search = $('#search').value.toLowerCase().trim();
  const count = Object.keys(state.selected).length;
  const edition = profile.edition === 'java' ? 'Java' : 'Bedrock';
  $('#selection-count').textContent = String(count);
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
