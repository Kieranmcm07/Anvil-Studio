import { itemName, itemIcon } from './data.js';
import { penalty } from './optimizer.js';
import { $, escape, enchantLabel, gearIcon } from './ui.js';
import { reveal, motionEnabled, enchantParticles, depart, finishDepartures } from './motion.js';
import { setStat, clearStat, updateCount } from './stats.js';
import { playSound } from './sounds.js';
import { itemTooltip, tooltipAttributes } from './planner-tools.js';
import { nodeEnchantments, bookKey, planSignature } from './planner-model.js';

let result = null;
let needsUpdate = false;
let context = null;
let zoom = 1;
let fitGraph = true;
let activeStep = 1;
let currentView = 'steps';
const completed = new Set();
const gathered = new Set();

export function showPlan(plan, settings, saved = null) {
  finishDepartures();
  needsUpdate = false;
  result = plan;
  context = settings;
  zoom = 1;
  fitGraph = true;
  activeStep = 1;
  completed.clear();
  gathered.clear();
  if (saved?.signature === planSignature(plan)) {
    for (const step of saved.completed || [])
      if (plan.steps.some((s) => s.step === step)) completed.add(step);
    for (const key of saved.gathered || [])
      if (plan.books.some((book) => bookKey(book) === key)) gathered.add(key);
  }
  setGraphMode('step');
  renderResult();
  emitPlan('planchange');
}

export function clearPlan({ fresh = false, reset = false } = {}) {
  const hadResult = Boolean(result);
  if (hadResult && !fresh) depart($(currentView === 'steps' ? '#steps-view' : '#flow-view'));
  needsUpdate = !fresh && !reset && (needsUpdate || Boolean(result));
  result = null;
  context = null;
  completed.clear();
  gathered.clear();
  emitPlan('planchange');
  for (const id of ['stat-total', 'stat-peak', 'stat-steps']) {
    clearStat($('#' + id), { countdown: reset });
  }
  $('#result-title').textContent = 'Your enchanting steps';
  $('#plan-details').hidden = true;
  $('#plan-details').open = false;
  $('#plan-footnote').textContent = '';
  $('#preparation-note').hidden = true;
  $('#preparation-note').textContent = '';
  $('#peak-note').textContent = '';
  $('#penalty-note').textContent = '';
  $('#step-detail').hidden = true;
  $('#step-detail').innerHTML = '';
  const empty = `<div class="empty-state">
    ${gearIcon('anvil')}
    <h3>${needsUpdate ? 'Update your plan' : 'No plan yet'}</h3>
    <p>${needsUpdate ? 'Your selection changed. Click “Show my steps” for the new order and costs.' : 'Choose your enchantments, then click “Show my steps”.'}</p>
  </div>`;
  $('#steps-view').innerHTML = empty;
  $('#graph').innerHTML = empty;
  $('#compact-graph').innerHTML = empty;
  $('#graph-mode').hidden = true;
  setGraphMode('step');
  for (const id of ['zoom-in', 'zoom-out', 'zoom-fit']) $('#' + id).disabled = true;
  $('#export').disabled = true;
  setView('steps');
  if (hadResult && !fresh) reveal($('#steps-view'), { fadeOnly: true, duration: 340 });
}

function isEquipment(node) {
  return context.item !== 'book' && Boolean(node.mask & 1);
}

function nodeTitle(node) {
  if (node.leaf === 0) return itemName(context.item);
  if (node.leaf > 0) {
    const b = result.books[node.leaf - 1];
    return enchantLabel(b.id, b.level);
  }
  return `${isEquipment(node) ? itemName(context.item) : 'Book'} from step ${node.step}`;
}
function nodeEnchants(node) {
  return nodeEnchantments(result, context, node).map((e) => enchantLabel(e.id, e.level));
}
function emitPlan(name) {
  document.dispatchEvent(
    new window.CustomEvent(name, {
      detail: result
        ? {
            result,
            settings: context,
            progress: {
              completed: [...completed],
              gathered: [...gathered],
              signature: planSignature(result),
            },
          }
        : null,
    })
  );
}
function slot(node, label) {
  const output = label === 'RESULT';
  const isGear = isEquipment(node);
  const name = output ? (isGear ? itemName(context.item) : 'Combined book') : nodeTitle(node);
  let description = node.leaf === 0 ? 'Starting item' : 'Enchanted book';
  if (node.leaf === undefined) description = 'Use the result of this step';
  if (node.leaf === 0 && Object.keys(context.existing || {}).length)
    description = 'Your existing enchantments';
  if (output) {
    const count = nodeEnchants(node).length;
    description = `${count} enchantment${count === 1 ? '' : 's'}`;
  }
  return `
    <div class="slot ${output ? 'output-slot' : ''}">
      <small>${label}</small>
      <div class="slot-content">
        ${output ? '<span class="result-item">' + itemTooltip(isGear ? context.item : 'enchanted_book', name, nodeEnchantments(result, context, node)) + '</span>' : itemTooltip(isGear ? context.item : 'enchanted_book', name, nodeEnchantments(result, context, node))}
        <div>
          <strong>${escape(name)}</strong>
          <span class="slot-subtitle">${description}</span>
        </div>
      </div>
    </div>`;
}

function anvilSlots(step) {
  return `
    <div class="anvil-slots">
      ${slot(step.left, 'LEFT SLOT')}
      <span class="slot-symbol" aria-hidden="true">+</span>
      ${slot(step.right, 'RIGHT SLOT')}
      <span class="slot-symbol" aria-hidden="true">→</span>
      ${slot(step, 'RESULT')}
    </div>`;
}

function stepHeading(step) {
  return isEquipment(step)
    ? `Enchant your ${itemName(context.item).toLowerCase()}`
    : 'Combine two books';
}
function renderDetail() {
  const step = result.steps.find((s) => s.step === activeStep);
  if (!step) {
    $('#step-detail').hidden = true;
    $('#compact-graph').innerHTML = readyBook();
    return;
  }
  const leftPenalty = penalty(step.left.uses);
  const rightPenalty = penalty(step.right.uses);
  const enchantmentCost = step.cost - leftPenalty - rightPenalty;
  $('#step-detail').hidden = currentView !== 'flow';
  $('#step-detail').innerHTML = `
    <div class="step-detail-header">
      <h3><span class="step-pill">STEP ${step.step}</span>${stepHeading(step)}</h3>
      <span class="cost-pill">${step.cost} levels</span>
    </div>
    ${anvilSlots(step)}
    <p class="detail-math">
      ${leftPenalty} left penalty + ${rightPenalty} right penalty + ${enchantmentCost}
      enchantment cost = ${step.cost} levels. Result’s work penalty: ${penalty(step.uses)}.
    </p>`;
  renderCompactGraph(step);
  reveal($('#step-detail'));
}

function compactInput(node, label) {
  const isGear = isEquipment(node);
  const fromStep = node.leaf === undefined;
  const tag = fromStep ? 'button' : 'div';
  return `<${tag} class="compact-node ${isGear ? 'gear-node' : 'book-node'}"
    ${fromStep ? `type="button" data-step="${node.step}" aria-label="Go to step ${node.step}"` : ''}>
    <small>${label}</small>
    ${fromStep ? gearIcon(isGear ? context.item : 'enchanted_book') : itemTooltip(isGear ? context.item : 'enchanted_book', nodeTitle(node), nodeEnchantments(result, context, node))}
    <strong>${escape(nodeTitle(node))}</strong>
    <span>${fromStep ? 'View this earlier step ↗' : isGear ? 'Starting item' : 'Enchanted book'}</span>
  </${tag}>`;
}

function renderCompactGraph(step) {
  $('#compact-graph').innerHTML = `
    <nav class="graph-step-nav" aria-label="Browse graph steps">
      <button data-graph-prev aria-label="Previous graph step" ${activeStep === 1 ? 'disabled' : ''}>←</button>
      <label><span class="sr-only">Graph step</span><select data-graph-select>
        ${result.steps.map((s) => `<option value="${s.step}" ${s.step === activeStep ? 'selected' : ''}>Step ${s.step} of ${result.steps.length}</option>`).join('')}
      </select></label>
      <button data-graph-next aria-label="Next graph step" ${activeStep === result.steps.length ? 'disabled' : ''}>→</button>
    </nav>
    <div class="compact-inputs">
      ${compactInput(step.left, 'LEFT SLOT')}
      ${compactInput(step.right, 'RIGHT SLOT')}
    </div>
    <svg class="compact-connectors" viewBox="0 0 300 48" preserveAspectRatio="none" aria-hidden="true">
      <path d="M75 0 V14 Q75 24 90 24 H135 Q150 24 150 36 V46"/>
      <path class="book-connector" d="M225 0 V14 Q225 24 210 24 H165 Q150 24 150 36"/>
      <path d="M144 40 L150 46 L156 40"/>
    </svg>
    <div class="compact-node compact-result">
      ${itemTooltip(isEquipment(step) ? context.item : 'enchanted_book', isEquipment(step) ? itemName(context.item) : 'Combined book', nodeEnchantments(result, context, step))}
      <div><small>RESULT · ${step.cost} LEVELS</small>
        <strong>${step === result.root ? 'Finished ' : ''}${isEquipment(step) ? escape(itemName(context.item)) : 'Combined book'}</strong>
        <span>${nodeEnchants(step).map(escape).join(' · ')}</span>
      </div>
    </div>`;
  $('[data-graph-select]').value = String(activeStep);
  reveal($('#compact-graph'));
}

function selectStep(number, focusControl) {
  if (!result || !result.steps.some((step) => step.step === number)) return;
  activeStep = number;
  document.querySelectorAll('#flow-svg .node').forEach((node) => {
    const selected = Number(node.dataset.step) === activeStep;
    node.classList.toggle('selected', selected);
    node.setAttribute('aria-pressed', selected);
  });
  renderDetail();
  if (focusControl) {
    const control = $('#compact-graph').querySelector(focusControl);
    (control?.disabled ? $('[data-graph-select]') : control)?.focus({ preventScroll: true });
  }
}

function setGraphMode(mode) {
  $('.blueprint').dataset.graphMode = mode;
  $('#graph-mode').textContent = mode === 'tree' ? 'One step' : 'Full tree';
  $('#graph-mode').setAttribute('aria-pressed', mode === 'tree');
  applyZoom();
}

function graphCard(node) {
  const combine = node.leaf === undefined;
  const isGear = isEquipment(node);
  const finished = node === result.root;
  const title = combine
    ? finished
      ? `Finished ${itemName(context.item).toLowerCase()}`
      : stepHeading(node)
    : nodeTitle(node);
  const subtitle = combine
    ? `${node.cost} levels · ${nodeEnchants(node).length} enchantments`
    : node.leaf === 0
      ? 'Starting item'
      : `Book · penalty ${penalty(node.uses)}`;
  const attributes = combine
    ? `
    class="node ${node.step === activeStep ? 'selected' : ''}" data-step="${node.step}"
    role="button" tabindex="0" aria-pressed="${node.step === activeStep}" aria-label="Step ${node.step}: ${node.cost} levels. ${escape(title)}"`
    : '';
  const icon = combine
    ? `
    <rect x="9" y="9" width="18" height="18" rx="4" class="graph-step-number ${finished ? 'finished' : ''}"/>
    <text x="18" y="22" class="graph-step-label ${finished ? 'finished' : ''}"
      text-anchor="middle" font-size="10" font-weight="600">${node.step}</text>`
    : `
    <image href="${itemIcon(isGear ? context.item : 'enchanted_book')}"
      x="9" y="9" width="19" height="19" preserveAspectRatio="xMidYMid meet"/>`;
  const shortTitle = title.length > 24 ? title.slice(0, 23) + '…' : title;
  return `
    <g transform="translate(${node.x},${node.y})" ${attributes}
      ${!combine ? `tabindex="0" role="img" aria-label="${escape(title)}" ${tooltipAttributes(title, nodeEnchantments(result, context, node))}` : ''}>
      ${combine ? `<title>${escape(title)}</title>` : ''}
      <rect class="node-bg ${combine ? 'merge-bg' : isGear ? '' : 'book-bg'}"
        width="224" height="82" rx="7"/>
      ${icon}
      <text x="34" y="23" class="graph-node-title" font-size="13" font-weight="500">${escape(shortTitle)}</text>
      <text x="12" y="60" class="graph-node-subtitle" font-size="12">${escape(subtitle)}</text>
    </g>`;
}
function renderGraph() {
  let leaf = 0;
  const nodes = [],
    edges = [];
  function layout(node) {
    if (node.leaf !== undefined) {
      node.x = 12;
      node.y = 14 + leaf++ * 108;
      node.depth = 0;
    } else {
      layout(node.left);
      layout(node.right);
      node.depth = Math.max(node.left.depth, node.right.depth) + 1;
      node.x = 12 + node.depth * 276;
      node.y = (node.left.y + node.right.y) / 2;
      edges.push([node.left, node], [node.right, node]);
    }
    nodes.push(node);
  }
  layout(result.root);
  const width = result.root.x + 248,
    height = Math.max(leaf * 108 + 10, 190);
  const paths = edges
    .map(
      ([a, b]) =>
        `<path class="flow-edge ${isEquipment(a) ? '' : 'book-edge'}" d="M${a.x + 224} ${a.y + 41} C${a.x + 250} ${a.y + 41},${b.x - 22} ${b.y + 41},${b.x} ${b.y + 41}"/><circle class="graph-junction" cx="${b.x}" cy="${b.y + 41}" r="2.5"/>`
    )
    .join('');
  const cards = nodes.map(graphCard).join('');
  $('#graph').innerHTML =
    `<svg id="flow-svg" data-natural-width="${width}" data-natural-height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="Optimal enchantment combining tree" xmlns="http://www.w3.org/2000/svg">${paths}${cards}</svg>`;
  applyZoom();
}
function readyBook() {
  if (context?.item !== 'book')
    return (
      '<div class="empty-state">' +
      itemTooltip(context.item, itemName(context.item), nodeEnchantments(result, context)) +
      '<h3>Your item is ready</h3><p>No books to add. Your existing enchantments are already on the item.</p></div>'
    );
  return (
    '<div class="empty-state">' +
    gearIcon('enchanted_book') +
    '<h3>Your book is ready</h3><p>One enchanted book selected. No anvil steps needed.</p></div>'
  );
}
function renderSteps() {
  if (!result.steps.length) {
    $('#steps-view').innerHTML = (result.books.length ? bookChecklist() : '') + readyBook();
    reveal($('#steps-view'));
    return;
  }
  $('#steps-view').innerHTML =
    bookChecklist() +
    `<div class="steps-intro"><p>Follow these in order. Keep the anvil slots as shown.</p><span id="step-progress">${completed.size} of ${result.steps.length} done</span></div>` +
    `<div id="xp-progress" class="xp-progress" role="progressbar" aria-label="Enchanting steps completed"
      aria-describedby="step-progress" aria-valuemin="0" aria-valuemax="${result.steps.length}"
      aria-valuenow="${completed.size}" style="--remaining: ${100 - (completed.size / result.steps.length) * 100}%">
      <span class="xp-progress-fill" aria-hidden="true"></span>
    </div>` +
    result.steps
      .map(
        (s) => `
    <article class="check-step ${completed.has(s.step) ? 'done' : ''}" aria-label="Step ${s.step}" style="--step-index: ${Math.min(s.step - 1, 7)}">
      <div class="check-step-heading">
        <h3><span class="step-number">${s.step}</span>${stepHeading(s)}</h3>
        <span class="step-cost">${s.cost} levels</span>
      </div>
      <button type="button" class="step-complete" data-complete="${s.step}"
        aria-pressed="${completed.has(s.step)}" aria-label="${completed.has(s.step) ? 'Undo step ' + s.step : 'Mark step ' + s.step + ' done'}">
        ${completed.has(s.step) ? '✓ Done · Undo' : 'Mark step done'}
      </button>
      ${anvilSlots(s)}
      <div class="step-bottom">
        <details class="result-enchantments">
          <summary>Result enchantments</summary>
          <p>${nodeEnchants(s).map(escape).join(' · ')}</p>
        </details>

      </div>
    </article>`
      )
      .join('') +
    completionCard();
  $('#completion').hidden = completed.size !== result.steps.length;
}
function bookChecklist() {
  return `<details class="book-checklist"><summary>Books to gather <span id="gather-count">${gathered.size} of ${result.books.length} ready</span></summary>
    <p>One separate book per row, already at the listed level. “Got it” only tracks your supplies.</p>
    <div>${result.books
      .map(
        (book) => `<label class="gather-book">
      ${gearIcon('enchanted_book')}<span>${escape(enchantLabel(book.id, book.level))}<small>Prior-work count: ${book.uses}</small></span>
      <span><input type="checkbox" data-gather="${bookKey(book)}" ${gathered.has(bookKey(book)) ? 'checked' : ''}> Got it</span>
    </label>`
      )
      .join('')}</div>
  </details>`;
}
function completionCard() {
  const name = context.item === 'book' ? 'book' : itemName(context.item).toLowerCase();
  const particles = Array.from(
    { length: 12 },
    (_, i) =>
      `<i style="--x: ${Math.round(Math.cos((i * Math.PI) / 6) * 95)}px; --y: ${Math.round(Math.sin((i * Math.PI) / 6) * 60)}px; --turn: ${i * 45}deg"></i>`
  ).join('');
  return `<div id="completion" class="completion-card" role="status" hidden>
    <div class="finished-icon" aria-hidden="true">${itemTooltip(context.item === 'book' ? 'enchanted_book' : context.item, itemName(context.item), nodeEnchantments(result, context))}<span class="finish-particles">${particles}</span></div>
    <div><h3>Your ${escape(name)} is ready!</h3><p>Every anvil step is done. Enjoy your gear.</p></div>
  </div>`;
}
function renderResult() {
  $('#plan-details').hidden = false;
  $('#result-title').textContent =
    context.item === 'book'
      ? 'Combine your books'
      : `Enchant your ${itemName(context.item).toLowerCase()}`;
  setStat($('#stat-total'), result.total, 'levels');
  setStat($('#stat-peak'), result.peak, result.theoretical ? 'levels' : '/ 39');
  setStat($('#stat-steps'), result.steps.length);
  $('#peak-note').textContent = result.theoretical
    ? 'Survival rules overridden'
    : 'Every step is within the limit';
  $('#penalty-note').textContent = `Final work penalty: ${result.finalPenalty}`;
  $('#plan-footnote').textContent =
    `${result.xp.toLocaleString()} XP if you recharge from level 0 for each step. One separate book per selected enchantment, already at the selected level. Existing item enchantments are kept. ${context.objective === 'penalty' ? 'Optimized for lowest final work penalty, then total levels.' : context.objective === 'xp' ? 'Optimized for that XP strategy.' : 'Optimized for fewest total levels.'}`;
  $('#export').disabled = false;
  $('#graph-mode').hidden = !result.steps.length;
  for (const id of ['zoom-in', 'zoom-out', 'zoom-fit']) $('#' + id).disabled = false;
  const windBurst = result.books.find((book) => book.id === 'wind_burst' && book.level > 1);
  $('#preparation-note').hidden = !windBurst;
  $('#preparation-note').textContent = windBurst
    ? `Make your ${enchantLabel(windBurst.id, windBurst.level)} book first. The plan cost below excludes making that book.`
    : '';
  renderGraph();
  renderDetail();
  renderSteps();
  setView('steps');
  reveal($('#steps-view'));
}
function applyZoom() {
  const svg = $('#flow-svg');
  if (svg) {
    const naturalWidth = Number(svg.dataset.naturalWidth);
    const available = Math.max(240, $('#graph').clientWidth - 28);
    const naturalHeight = Number(svg.dataset.naturalHeight);
    const availableHeight = Math.max(160, ($('#graph').clientHeight || 430) - 28);
    const fit = Math.min(1, available / naturalWidth, availableHeight / naturalHeight);
    const width = naturalWidth * (fitGraph ? fit : 1) * zoom;
    svg.style.width = `${width}px`;
    svg.style.height = `${(width * Number(svg.dataset.naturalHeight)) / naturalWidth}px`;
    svg.style.maxWidth = 'none';
  }
}
export function setView(view) {
  const changed = currentView !== view;
  currentView = view;
  for (const v of ['flow', 'steps']) {
    $('#' + v + '-view').hidden = v !== view;
    $('#' + v + '-tab').classList.toggle('active', v === view);
    $('#' + v + '-tab').setAttribute('aria-pressed', v === view);
  }
  $('#step-detail').hidden = view !== 'flow' || !result?.steps.length;
  if (view === 'flow') applyZoom();
  if (changed) reveal($('#' + view + '-view'));
}
function exportPlan() {
  if (!result) return;
  const lines = [
    'ANVIL STUDIO',
    `${context.profile.edition.toUpperCase()} ${context.profile.label} · ${itemName(context.item)}`,
    result.theoretical ? 'THEORETICAL — NOT POSSIBLE IN VANILLA SURVIVAL' : 'Survival-safe plan',
    `Total: ${result.total} levels | Highest step: ${result.peak} | Final work penalty: ${result.finalPenalty}`,
    `XP: ${result.xp} (earn from level 0 before each operation)`,
    'Books must already be at the selected levels. Making higher-level books is not included in this total.',
    '',
    'INPUTS',
    context.item === 'book'
      ? 'Combine the enchanted books below.'
      : `${itemName(context.item)}, prior-work count ${context.itemUses}. Already on item: ${
          Object.entries(context.existing || {})
            .map(([id, level]) => enchantLabel(id, level))
            .join(', ') || 'none'
        }`,
    ...result.books.map((b) => `${enchantLabel(b.id, b.level)} book, prior-work count ${b.uses}`),
    '',
    'ORDER',
    ...result.steps.map(
      (s) =>
        `Step ${s.step} — ${s.cost} levels\n  LEFT: ${nodeTitle(s.left)}\n  RIGHT: ${nodeTitle(s.right)}\n  RESULT: ${nodeEnchants(s).join(', ')}\n  Result work penalty: ${penalty(s.uses)}\n`
    ),
    'No repairs or renaming included.',
  ];
  const url = URL.createObjectURL(
    new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `anvil-${context.item}-${context.version}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#flow-tab').addEventListener('click', () => setView('flow'));
$('#steps-tab').addEventListener('click', () => setView('steps'));
$('#flow-view').addEventListener('click', (event) => {
  if (!result) return;
  if (event.target.closest('[data-graph-prev]')) selectStep(activeStep - 1, '[data-graph-prev]');
  else if (event.target.closest('[data-graph-next]'))
    selectStep(activeStep + 1, '[data-graph-next]');
  else {
    const node = event.target.closest('[data-step]');
    if (node)
      selectStep(
        Number(node.dataset.step),
        node.closest('#compact-graph') ? '[data-graph-select]' : null
      );
  }
});
$('#compact-graph').addEventListener('change', (event) => {
  if (event.target.matches('[data-graph-select]')) {
    selectStep(Number(event.target.value), '[data-graph-select]');
  }
});
$('#graph-mode').addEventListener('click', () => {
  const mode = $('.blueprint').dataset.graphMode === 'tree' ? 'step' : 'tree';
  setGraphMode(mode);
  reveal(mode === 'tree' ? $('#graph') : $('#compact-graph'));
});
window.addEventListener('resize', applyZoom);
$('#graph').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-step]')) {
    e.preventDefault();
    e.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
});
$('#steps-view').addEventListener('change', (event) => {
  const key = event.target.dataset.gather;
  if (!result || !key || !result.books.some((book) => bookKey(book) === key)) return;
  if (event.target.checked) gathered.add(key);
  else gathered.delete(key);
  updateCount($('#gather-count'), `${gathered.size} of ${result.books.length} ready`);
  emitPlan('planprogress');
});
$('#steps-view').addEventListener('click', (e) => {
  const button = e.target.closest('[data-complete]');
  if (!button || !result) return;
  const step = Number(button.dataset.complete);
  if (!result.steps.some((s) => s.step === step)) return;
  const wasComplete = completed.size === result.steps.length;
  const done = !completed.has(step);
  if (done) completed.add(step);
  else completed.delete(step);
  button.setAttribute('aria-pressed', String(done));
  button.setAttribute('aria-label', done ? 'Undo step ' + step : 'Mark step ' + step + ' done');
  button.textContent = done ? '✓ Done · Undo' : 'Mark step done';
  const stepCard = button.closest('.check-step');
  stepCard.classList.toggle('done', done);
  enchantParticles(stepCard.querySelector('.output-slot .result-item'), done);
  const progress = $('#xp-progress');
  progress.setAttribute('aria-valuenow', String(completed.size));
  progress.style.setProperty(
    '--remaining',
    `${100 - (completed.size / result.steps.length) * 100}%`
  );
  updateCount($('#step-progress'), `${completed.size} of ${result.steps.length} done`);
  const allDone = completed.size === result.steps.length;
  const card = $('#completion');
  card.hidden = !allDone;
  if (!allDone) card.classList.remove('celebrate');
  if (allDone && !wasComplete) {
    card.classList.add('celebrate');
    reveal(card);
    playSound('levelup');
    card.scrollIntoView({ behavior: motionEnabled() ? 'smooth' : 'auto', block: 'center' });
  } else playSound(done ? 'step' : 'click');
  emitPlan('planprogress');
});
$('#zoom-in').addEventListener('click', () => {
  zoom = Math.min(3, zoom + 0.25);
  applyZoom();
});
$('#zoom-out').addEventListener('click', () => {
  zoom = Math.max(0.5, zoom - 0.25);
  applyZoom();
});
$('#zoom-fit').addEventListener('click', () => {
  fitGraph = true;
  zoom = 1;
  applyZoom();
});
$('#export').addEventListener('click', exportPlan);
