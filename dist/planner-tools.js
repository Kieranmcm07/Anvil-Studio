import { itemName, itemIcon } from './data.js';
import { $, escape, gearIcon, enchantLabel } from './ui.js';
import { nodeEnchantments } from './planner-model.js';
import { reveal } from './motion.js';

export function tooltipAttributes(title, enchantments = []) {
  return `data-item-title="${escape(title)}" data-item-enchants="${escape(JSON.stringify(enchantments))}"`;
}
export function itemTooltip(item, title, enchantments = []) {
  return `<button type="button" class="item-inspect" ${tooltipAttributes(title, enchantments)} aria-label="View enchantments: ${escape(title)}">
    ${gearIcon(item)}</button>`;
}

export function cardDetails(plan, settings, completed = []) {
  return {
    title: itemName(settings.item),
    icon: itemIcon(settings.item === 'book' ? 'enchanted_book' : settings.item),
    enchantments: nodeEnchantments(plan, settings),
    edition: settings.profile.edition === 'java' ? 'Java' : 'Bedrock',
    version: settings.profile.label,
    total: plan.total,
    steps: plan.steps.length,
    status: plan.theoretical
      ? 'Theoretical build · requires commands or mods'
      : completed.length === plan.steps.length
        ? 'Finished item'
        : 'Planned item',
  };
}

export async function drawItemCard(card) {
  const sprite = new window.Image();
  await new Promise((resolve, reject) => {
    sprite.onload = resolve;
    sprite.onerror = () => reject(new Error('The item image could not load. Try again.'));
    sprite.src = card.icon;
  });
  const fonts = window.getComputedStyle(document.documentElement);
  const bodyFont =
    fonts.getPropertyValue('--body').trim() ||
    window.getComputedStyle(document.body).fontFamily ||
    'Segoe UI, sans-serif';
  const titleFont = fonts.getPropertyValue('--display').trim() || bodyFont;
  if (document.fonts?.load) {
    await Promise.all([
      document.fonts.load('600 30px ' + titleFont),
      document.fonts.load('24px ' + bodyFont),
    ]).catch(() => {});
  }
  const canvas = document.createElement('canvas');
  canvas.width = 864;
  canvas.height = 340 + card.enchantments.length * 38;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot create the image. Try another browser.');
  ctx.fillStyle = '#100914';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#6b32b3';
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  ctx.strokeStyle = '#301348';
  ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
  ctx.imageSmoothingEnabled = false;
  const ratio = Math.min(96 / sprite.naturalWidth, 96 / sprite.naturalHeight);
  const width = sprite.naturalWidth * ratio,
    height = sprite.naturalHeight * ratio;
  ctx.drawImage(sprite, 58 + (96 - width) / 2, 58 + (96 - height) / 2, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 30px ' + titleFont;
  ctx.fillText(card.title, 184, 92, 620);
  ctx.font = '18px ' + bodyFont;
  ctx.fillStyle = '#c4a4e7';
  ctx.fillText(card.edition + ' ' + card.version, 184, 126, 620);
  ctx.fillStyle = '#bab0bf';
  ctx.fillText(card.status, 58, 191, 748);
  let y = 238;
  for (const enchantment of card.enchantments) {
    ctx.fillStyle = enchantment.id.endsWith('_curse') ? '#ff6262' : '#c4a4e7';
    ctx.font = '24px ' + bodyFont;
    ctx.fillText(enchantLabel(enchantment.id, enchantment.level), 58, y, 748);
    y += 38;
  }
  ctx.font = '18px ' + bodyFont;
  ctx.fillStyle = '#a6df75';
  ctx.fillText(card.total + ' levels · ' + card.steps + ' anvil steps', 58, y + 20, 748);
  ctx.fillStyle = '#aaa0b0';
  ctx.font = '16px ' + bodyFont;
  ctx.fillText('ANVIL STUDIO · anvil-studio.pages.dev', 58, canvas.height - 44, 748);
  return canvas;
}

function setupTooltips() {
  const tooltip = document.createElement('div');
  tooltip.id = 'item-tooltip';
  tooltip.className = 'minecraft-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);
  let target = null,
    pinned = false;
  function hide() {
    target?.removeAttribute('aria-describedby');
    target = null;
    pinned = false;
    tooltip.hidden = true;
  }
  function show(next) {
    if (!next || (target === next && !tooltip.hidden)) return;
    hide();
    target = next;
    const enchants = JSON.parse(next.dataset.itemEnchants || '[]');
    tooltip.innerHTML =
      `<strong>${escape(next.dataset.itemTitle)}</strong>` +
      (enchants.length
        ? enchants
            .map(
              (e) =>
                `<span class="${e.id.endsWith('_curse') ? 'curse' : ''}">${escape(enchantLabel(e.id, e.level))}</span>`
            )
            .join('')
        : '<span>No enchantments yet</span>');
    (next.closest('dialog') || document.body).append(tooltip);
    tooltip.hidden = false;
    next.setAttribute('aria-describedby', tooltip.id);
    const rect = next.getBoundingClientRect();
    tooltip.style.left =
      Math.max(8, Math.min(rect.left, window.innerWidth - tooltip.offsetWidth - 8)) + 'px';
    const below = rect.bottom + 8;
    tooltip.style.top =
      Math.max(
        8,
        below + tooltip.offsetHeight <= window.innerHeight
          ? below
          : rect.top - tooltip.offsetHeight - 8
      ) + 'px';
    reveal(tooltip, { fadeOnly: true, duration: 150 });
  }
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'touch' && !pinned) show(e.target.closest('[data-item-title]'));
  });
  document.addEventListener('pointerout', (e) => {
    if (
      !pinned &&
      target &&
      !target.contains(e.relatedTarget) &&
      !tooltip.contains(e.relatedTarget)
    )
      hide();
  });
  document.addEventListener('focusin', (e) => show(e.target.closest('[data-item-title]')));
  document.addEventListener('focusout', (e) => {
    if (!pinned && e.target === target) hide();
  });
  document.addEventListener('click', (e) => {
    const next = e.target.closest('[data-item-title]');
    if (!next) {
      if (!tooltip.contains(e.target)) hide();
      return;
    }
    if (next === target && pinned) hide();
    else {
      show(next);
      pinned = true;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  document.addEventListener('planchange', hide);
  document.addEventListener('input', hide);
  document.addEventListener('change', hide);
}

export function setupPlannerTools(loadBuild) {
  setupTooltips();
  let current = null;
  const builds = { a: null, b: null };
  const labels = (build) => nodeEnchantments(build.result, build.settings);
  function renderComparison() {
    for (const key of ['a', 'b']) {
      $('#capture-' + key).disabled = !current;
      const build = builds[key];
      $('#build-' + key).innerHTML = build
        ? `
        <p>${escape(itemName(build.settings.item))} · ${escape(build.settings.profile.edition)} ${escape(build.settings.profile.label)}</p>
        <dl><div><dt>Total levels</dt><dd>${build.result.total}</dd></div>
        <div><dt>Highest step</dt><dd>${build.result.peak}</dd></div>
        <div><dt>Anvil steps</dt><dd>${build.result.steps.length}</dd></div>
        <div><dt>XP from level 0 per step</dt><dd>${build.result.xp}</dd></div></dl>
        ${build.result.theoretical ? '<p>Theoretical · requires commands or mods</p>' : ''}
        <ul>${labels(build)
          .map((e) => `<li>${escape(enchantLabel(e.id, e.level))}</li>`)
          .join('')}</ul>
        <button type="button" data-use-build="${key}">Use build ${key.toUpperCase()}</button>`
        : '<p class="muted">No build saved here yet.</p>';
    }
    const a = builds.a,
      b = builds.b;
    let message = '';
    if (a && b) {
      const difference = a.result.total - b.result.total;
      message =
        difference === 0
          ? 'Both builds use the same total levels.'
          : `Build ${difference < 0 ? 'A' : 'B'} uses ${Math.abs(difference)} fewer total levels.`;
      if (
        a.settings.version !== b.settings.version ||
        a.settings.item !== b.settings.item ||
        a.settings.objective !== b.settings.objective ||
        a.result.theoretical ||
        b.result.theoretical
      )
        message +=
          ' These builds use different settings or overridden rules; compare their details.';
    }
    $('#compare-difference').textContent = message;
  }
  document.addEventListener('planchange', (event) => {
    current = event.detail;
    $('#item-card').disabled = !current;
    if (current) $('#compare-panel').hidden = false;
    renderComparison();
  });
  document.addEventListener('planprogress', (event) => {
    current = event.detail;
  });
  for (const key of ['a', 'b'])
    $('#capture-' + key).addEventListener('click', () => {
      if (!current) return;
      builds[key] = structuredClone(current);
      renderComparison();
      reveal($('#build-' + key));
    });
  $('#compare-panel').addEventListener('click', (event) => {
    const key = event.target.closest('[data-use-build]')?.dataset.useBuild;
    if (builds[key]) loadBuild(builds[key].settings);
  });
  let card = null;
  const dialog = $('#item-card-dialog');
  $('#item-card').addEventListener('click', () => {
    if (!current) return;
    card = cardDetails(current.result, current.settings, current.progress.completed);
    $('#item-card-preview').innerHTML =
      `<div class="card-preview-heading">${gearIcon(current.settings.item === 'book' ? 'enchanted_book' : current.settings.item)}<div><h3>${escape(card.title)}</h3><p>${escape(card.edition + ' ' + card.version)}</p></div></div>
      <p>${escape(card.status)}</p><ul>${card.enchantments.map((e) => `<li class="${e.id.endsWith('_curse') ? 'curse' : ''}">${escape(enchantLabel(e.id, e.level))}</li>`).join('')}</ul>
      <p>${card.total} levels · ${card.steps} anvil steps</p>`;
    $('#item-card-status').textContent = 'Save a PNG to share your gear.';
    dialog.showModal();
    reveal(dialog);
  });
  $('#close-item-card').addEventListener('click', () => dialog.close());
  $('#download-item-card').addEventListener('click', async () => {
    if (!card) return;
    const snapshot = card;
    const button = $('#download-item-card');
    button.disabled = true;
    $('#item-card-status').textContent = 'Making your image…';
    try {
      const canvas = await drawItemCard(snapshot);
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('The image could not be saved. Try again.'))),
          'image/png'
        )
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'anvil-' + snapshot.title.toLowerCase().replaceAll(' ', '-') + '.png';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      $('#item-card-status').textContent = 'Your PNG is ready.';
    } catch (error) {
      $('#item-card-status').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  return {
    reset() {
      builds.a = builds.b = current = null;
      $('#compare-panel').hidden = true;
      $('#compare-panel').open = false;
      renderComparison();
    },
  };
}
