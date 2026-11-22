import { itemName, itemIcon, nameOf, enchantsFor, conflicts, minimumBookUses } from './data.js';
import { $, escape, gearIcon, enchantLabel } from './ui.js';
import { nodeEnchantments, buildRequest } from './planner-model.js';
import { reveal } from './motion.js';
import { cardAppearance, mountCardScenery, loadCardImage, sceneryImage } from './card-theme.js';

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
  const appearance = card.appearance || cardAppearance();
  const sprite = await loadCardImage(card.icon);
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
  ctx.fillStyle = appearance.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const [scenery, ...mobs] = await Promise.all([
    sceneryImage(appearance, canvas.width, canvas.height),
    ...appearance.mobs.map(loadCardImage),
  ]);
  ctx.drawImage(scenery, 0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  mobs.forEach((mob, i) => {
    const scale = Math.min(210 / mob.naturalWidth, 230 / mob.naturalHeight);
    const width = mob.naturalWidth * scale,
      height = mob.naturalHeight * scale;
    ctx.globalAlpha = i ? 0.16 : 0.28;
    ctx.drawImage(
      mob,
      canvas.width - width - 50 - i * 60,
      canvas.height - height - 95 - i * 155,
      width,
      height
    );
  });
  ctx.globalAlpha = 1;
  ctx.strokeStyle = appearance.border;
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  const ratio = Math.min(96 / sprite.naturalWidth, 96 / sprite.naturalHeight);
  const width = sprite.naturalWidth * ratio,
    height = sprite.naturalHeight * ratio;
  ctx.drawImage(sprite, 58 + (96 - width) / 2, 58 + (96 - height) / 2, width, height);
  ctx.fillStyle = appearance.text;
  ctx.font = '600 30px ' + titleFont;
  ctx.fillText(card.title, 184, 92, 620);
  ctx.font = '18px ' + bodyFont;
  ctx.fillStyle = appearance.muted;
  ctx.fillText(card.edition + ' ' + card.version, 184, 126, 620);
  ctx.fillStyle = appearance.muted;
  ctx.fillText(card.status, 58, 191, 748);
  let y = 238;
  for (const enchantment of card.enchantments) {
    ctx.fillStyle = enchantment.id.endsWith('_curse') ? '#ff7777' : appearance.text;
    ctx.font = '24px ' + bodyFont;
    ctx.fillText(enchantLabel(enchantment.id, enchantment.level), 58, y, 748);
    y += 38;
  }
  ctx.font = '18px ' + bodyFont;
  ctx.fillStyle = appearance.accent;
  ctx.fillText(card.total + ' levels · ' + card.steps + ' anvil steps', 58, y + 20, 748);
  ctx.fillStyle = appearance.muted;
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

export function comparisonAlternatives(settings, raw) {
  const pairs = [
    ['silk_touch', 'fortune'],
    ['infinity', 'mending'],
    ['depth_strider', 'frost_walker'],
    ['sharpness', 'smite'],
    ['density', 'breach'],
    ['multishot', 'piercing'],
  ];
  const available = enchantsFor(raw, settings.profile, settings.item);
  const options = [];
  for (const pair of pairs) {
    const from = pair.find((id) => settings.selected[id]);
    const to = pair.find((id) => id !== from);
    const enchantment = available.find((e) => e.id === to);
    if (!from || !enchantment) continue;
    const next = structuredClone(settings);
    for (const id of Object.keys(next.selected))
      if (id === from || conflicts(id, to, settings.profile, raw)) delete next.selected[id];
    next.selected[to] = { level: enchantment.max, uses: minimumBookUses(to, enchantment.max) };
    try {
      buildRequest(next, raw);
      options.push({ label: nameOf(to) + ' instead of ' + nameOf(from), settings: next });
    } catch {
      /* An alternative must work with the enchantments already on this item. */
    }
  }
  return options;
}

export function comparisonRows(a, b) {
  const left = Object.fromEntries(
    nodeEnchantments(a.result, a.settings).map((e) => [e.id, e.level])
  );
  const right = Object.fromEntries(
    nodeEnchantments(b.result, b.settings).map((e) => [e.id, e.level])
  );
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .sort()
    .map((id) => ({ id, a: left[id] || 0, b: right[id] || 0, changed: left[id] !== right[id] }));
}

export function setupPlannerTools(loadBuild, getRaw = () => ({})) {
  setupTooltips();
  let current = null;
  const builds = { a: null, b: null };
  let alternatives = [];
  let restoringBuild = null;
  const labels = (build) => nodeEnchantments(build.result, build.settings);
  const buildKey = (build) =>
    JSON.stringify([
      build.settings.version,
      build.settings.item,
      build.settings.itemUses,
      build.settings.objective,
      build.settings.selected,
      build.settings.existing,
    ]);
  function renderComparison() {
    const a = builds.a,
      b = builds.b;
    for (const key of ['a', 'b']) {
      const build = builds[key];
      const peer = builds[key === 'a' ? 'b' : 'a'];
      $('#capture-' + key).disabled = !current;
      $('#capture-' + key).textContent = build
        ? 'Replace with current'
        : 'Save current as ' + key.toUpperCase();
      $('#build-' + key).innerHTML = build
        ? `
        <div class="compare-item">${gearIcon(build.settings.item === 'book' ? 'enchanted_book' : build.settings.item)}<div><strong>${escape(itemName(build.settings.item))}</strong>
        <small>${escape(build.settings.profile.edition)} ${escape(build.settings.profile.label)}</small></div></div>
        <div class="compare-cost"><strong>${build.result.total}</strong><span>total levels</span>
          ${peer && build.result.total < peer.result.total ? '<span class="compare-saving">' + (peer.result.total - build.result.total) + ' fewer</span>' : ''}</div>
        <dl><div><dt>Highest step</dt><dd>${build.result.peak}</dd></div>
        <div><dt>Anvil steps</dt><dd>${build.result.steps.length}</dd></div>
        <div><dt>XP from level 0 per step</dt><dd>${build.result.xp}</dd></div>
        <div><dt>Item prior-work count</dt><dd>${build.settings.itemUses}</dd></div></dl>
        ${build.result.theoretical ? '<p class="compare-warning">Requires commands or mods</p>' : ''}
        <details class="compare-enchantments"><summary>${labels(build).length} final enchantments</summary>
        <ul>${labels(build)
          .map((e) => `<li>${escape(enchantLabel(e.id, e.level))}</li>`)
          .join('')}</ul></details>
        <div class="compare-actions"><button type="button" data-use-build="${key}">Use build ${key.toUpperCase()}</button>
        <button type="button" data-clear-build="${key}" aria-label="Clear build ${key.toUpperCase()}">Clear</button></div>`
        : `<div class="compare-empty">${gearIcon('enchanted_book')}<p>${key === 'a' ? 'Save a starting plan here.' : 'Try an alternative below, or change your books and click “Show my steps”.'}</p></div>`;
    }
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
        a.settings.itemUses !== b.settings.itemUses ||
        a.result.theoretical ||
        b.result.theoretical
      )
        message += ' Settings or rules differ; check both builds before choosing.';
      const rows = comparisonRows(a, b);
      const changes = rows.filter((row) => row.changed);
      $('#compare-changes').innerHTML = changes.length
        ? `<h4>What changes</h4><table>
        <thead><tr><th>Enchantment</th><th>Build A</th><th>Build B</th></tr></thead>
        <tbody>${changes
          .map(
            (row) => `<tr><th>${escape(nameOf(row.id))}</th>
          <td>${row.a ? escape(enchantLabel(row.id, row.a).replace(nameOf(row.id), '').trim()) : '-'}</td>
          <td>${row.b ? escape(enchantLabel(row.id, row.b).replace(nameOf(row.id), '').trim()) : '-'}</td></tr>`
          )
          .join('')}</tbody>
        </table><p>${rows.length - changes.length} enchantments stay the same.</p>`
        : '<p>The final enchantments are identical.</p>';
    } else $('#compare-changes').innerHTML = '';
    $('#compare-difference').textContent = message;
    alternatives = current ? comparisonAlternatives(current.settings, getRaw()) : [];
    $('#compare-shortcuts').innerHTML = alternatives.length
      ? '<p>Try another combination</p><div class="compare-alternatives">' +
        alternatives
          .map(
            (option, i) =>
              `<button type="button" data-compare-alternative="${i}">${escape(option.label)}</button>`
          )
          .join('') +
        '</div>'
      : '';
  }
  document.addEventListener('planchange', (event) => {
    current = event.detail;
    $('#item-card').disabled = !current;
    if (current) {
      $('#compare-panel').hidden = false;
      if (
        $('#compare-panel').open &&
        builds.a &&
        buildKey(current) !== restoringBuild &&
        (buildKey(current) !== buildKey(builds.a) || builds.b)
      )
        builds.b = structuredClone(current);
      restoringBuild = null;
    }
    renderComparison();
  });
  document.addEventListener('planprogress', (event) => {
    current = event.detail;
  });
  $('#compare-panel').addEventListener('toggle', () => {
    if ($('#compare-panel').open && current && !builds.a) {
      builds.a = structuredClone(current);
      renderComparison();
    }
  });
  for (const key of ['a', 'b'])
    $('#capture-' + key).addEventListener('click', () => {
      if (!current) return;
      builds[key] = structuredClone(current);
      renderComparison();
      reveal($('#build-' + key));
    });
  $('#compare-panel').addEventListener('click', (event) => {
    const use = event.target.closest('[data-use-build]')?.dataset.useBuild;
    const clear = event.target.closest('[data-clear-build]')?.dataset.clearBuild;
    const alternative = event.target.closest('[data-compare-alternative]');
    if (builds[use]) {
      restoringBuild = buildKey(builds[use]);
      loadBuild(builds[use].settings);
    } else if (clear) {
      builds[clear] = null;
      renderComparison();
    } else if (alternative && current) {
      const next = alternatives[Number(alternative.dataset.compareAlternative)];
      if (!next) return;
      if (!builds.a) builds.a = structuredClone(current);
      $('#compare-panel').open = true;
      loadBuild(next.settings);
    }
  });
  let card = null;
  const dialog = $('#item-card-dialog');
  function renderCard() {
    card = { ...card, appearance: cardAppearance() };
    $('#item-card-preview').innerHTML =
      `<div class="card-preview-heading"><img class="item-sprite" src="${escape(card.icon)}" width="64" height="64" alt=""><div><h3>${escape(card.title)}</h3><p>${escape(card.edition + ' ' + card.version)}</p></div></div>
      <p>${escape(card.status)}</p><ul>${card.enchantments.map((e) => `<li class="${e.id.endsWith('_curse') ? 'curse' : ''}">${escape(enchantLabel(e.id, e.level))}</li>`).join('')}</ul>
      <p>${card.total} levels · ${card.steps} anvil steps</p>`;
    mountCardScenery($('#item-card-preview'), card.appearance);
  }
  $('#item-card').addEventListener('click', () => {
    if (!current) return;
    card = cardDetails(current.result, current.settings, current.progress.completed);
    renderCard();
    $('#item-card-status').textContent = 'Save a PNG to share your gear.';
    dialog.showModal();
    reveal(dialog);
  });
  document.addEventListener('themechange', () => {
    if (card && dialog.open) renderCard();
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
      builds.a = builds.b = current = restoringBuild = null;
      $('#compare-panel').hidden = true;
      $('#compare-panel').open = false;
      renderComparison();
    },
  };
}
