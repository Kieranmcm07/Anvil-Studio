import { itemName, itemIcon } from './data.js';
import { penalty } from './optimizer.js';
import { $, escape, enchantLabel, gearIcon } from './ui.js';

let result = null;
let context = null;
let zoom = 1;
let activeStep = 1;
let currentView = 'steps';
const completed = new Set();

export function showPlan(plan, settings) {
  result = plan;
  context = settings;
  zoom = 1;
  activeStep = 1;
  completed.clear();
  renderResult();
}

export function clearPlan() {
  result = null;
  context = null;
  completed.clear();
  for (const id of ['stat-total', 'stat-peak', 'stat-steps']) {
    $('#' + id).textContent = '—';
  }
  $('#safety-badge').hidden = true;
  $('#safety-badge').classList.remove('warning');
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
    <h3>No plan yet</h3>
    <p>Choose your enchantments, then click “Show my steps”.</p>
  </div>`;
  $('#steps-view').innerHTML = empty;
  $('#graph').innerHTML = empty;
  $('#export').disabled = true;
  setView('steps');
}

function nodeTitle(node) {
  if (node.leaf === 0) return itemName(context.item);
  if (node.leaf > 0) {
    const b = result.books[node.leaf - 1];
    return enchantLabel(b.id, b.level);
  }
  return `${node.mask & 1 ? itemName(context.item) : 'Book'} from step ${node.step}`;
}
function nodeEnchants(node) {
  return result.books
    .filter((_, i) => node.mask & (1 << (i + 1)))
    .map((b) => enchantLabel(b.id, b.level));
}
function slot(node, label) {
  const output = label === 'RESULT';
  const isGear = Boolean(node.mask & 1);
  const name = output ? (isGear ? itemName(context.item) : 'Combined book') : nodeTitle(node);
  let description = node.leaf === 0 ? 'Starting item' : 'Enchanted book';
  if (node.leaf === undefined) description = 'Use the result of this step';
  if (output) {
    const count = nodeEnchants(node).length;
    description = `${count} enchantment${count === 1 ? '' : 's'}`;
  }
  return `
    <div class="slot ${output ? 'output-slot' : ''}">
      <small>${label}</small>
      <div class="slot-content">
        ${gearIcon(isGear ? context.item : 'enchanted_book')}
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
  return step.mask & 1
    ? `Enchant your ${itemName(context.item).toLowerCase()}`
    : 'Combine two books';
}
function renderDetail() {
  const step = result.steps.find((s) => s.step === activeStep);
  if (!step) return;
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
}

function graphCard(node) {
  const combine = node.leaf === undefined;
  const isGear = Boolean(node.mask & 1);
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
    role="button" tabindex="0" aria-label="Step ${node.step}: ${node.cost} levels. ${escape(title)}"`
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
    <g transform="translate(${node.x},${node.y})" ${attributes}>
      <title>${escape(title)}</title>
      <rect class="node-bg ${combine ? 'merge-bg' : isGear ? '' : 'book-bg'}"
        width="163" height="60" rx="7"/>
      ${icon}
      <text x="34" y="23" class="graph-node-title" font-size="10" font-weight="500">${escape(shortTitle)}</text>
      <text x="12" y="44" class="graph-node-subtitle" font-size="9">${escape(subtitle)}</text>
    </g>`;
}
function renderGraph() {
  let leaf = 0;
  const nodes = [],
    edges = [];
  function layout(node) {
    if (node.leaf !== undefined) {
      node.x = 12;
      node.y = 14 + leaf++ * 83;
      node.depth = 0;
    } else {
      layout(node.left);
      layout(node.right);
      node.depth = Math.max(node.left.depth, node.right.depth) + 1;
      node.x = 12 + node.depth * 207;
      node.y = (node.left.y + node.right.y) / 2;
      edges.push([node.left, node], [node.right, node]);
    }
    nodes.push(node);
  }
  layout(result.root);
  const width = result.root.x + 190,
    height = Math.max(leaf * 83 + 10, 190);
  const paths = edges
    .map(
      ([a, b]) =>
        `<path class="flow-edge ${a.mask & 1 ? '' : 'book-edge'}" d="M${a.x + 163} ${a.y + 30} C${a.x + 185} ${a.y + 30},${b.x - 22} ${b.y + 30},${b.x} ${b.y + 30}"/><circle class="graph-junction" cx="${b.x}" cy="${b.y + 30}" r="2.5"/>`
    )
    .join('');
  const cards = nodes.map(graphCard).join('');
  $('#graph').innerHTML =
    `<svg id="flow-svg" data-natural-width="${width}" viewBox="0 0 ${width} ${height}" role="group" aria-label="Optimal enchantment combining tree" xmlns="http://www.w3.org/2000/svg">${paths}${cards}</svg>`;
  applyZoom();
}
function renderSteps() {
  $('#steps-view').innerHTML =
    `<div class="steps-intro"><p>Follow these in order. Keep the anvil slots as shown.</p><span id="step-progress">${completed.size} of ${result.steps.length} done</span></div>` +
    result.steps
      .map(
        (s) => `
    <article class="check-step ${completed.has(s.step) ? 'done' : ''}" aria-label="Step ${s.step}" style="--step-index: ${Math.min(s.step - 1, 7)}">
      <div class="check-step-heading">
        <h3><span class="step-number">${s.step}</span>${stepHeading(s)}</h3>
        <span class="step-cost">${s.cost} levels</span>
      </div>
      ${anvilSlots(s)}
      <div class="step-bottom">
        <details class="result-enchantments">
          <summary>Result enchantments</summary>
          <p>${nodeEnchants(s).map(escape).join(' · ')}</p>
        </details>
        <label class="done-control">
          <input type="checkbox" data-complete="${s.step}" ${completed.has(s.step) ? 'checked' : ''}>Done
        </label>
      </div>
    </article>`
      )
      .join('');
}
function renderResult() {
  $('#safety-badge').hidden = false;
  $('#plan-details').hidden = false;
  $('#result-title').textContent = `Enchant your ${itemName(context.item).toLowerCase()}`;
  $('#safety-badge').textContent = result.theoretical ? '⚠ Theoretical only' : '✓ Survival safe';
  $('#safety-badge').classList.toggle('warning', result.theoretical);
  $('#stat-total').innerHTML = `${result.total}<em>levels</em>`;
  $('#stat-peak').innerHTML = `${result.peak}<em>${result.theoretical ? 'levels' : '/ 39'}</em>`;
  $('#stat-steps').textContent = String(result.steps.length);
  $('#peak-note').textContent = result.theoretical
    ? 'Survival rules overridden'
    : 'Every step is within the limit';
  $('#penalty-note').textContent = `Final work penalty: ${result.finalPenalty}`;
  $('#plan-footnote').textContent =
    `${result.xp.toLocaleString()} XP if you recharge from level 0 for each step. One separate book per enchantment, already at the selected level. ${context.objective === 'penalty' ? 'Optimized for lowest final work penalty, then total levels.' : context.objective === 'xp' ? 'Optimized for that XP strategy.' : 'Optimized for fewest total levels.'}`;
  $('#export').disabled = false;
  const windBurst = result.books.find((book) => book.id === 'wind_burst' && book.level > 1);
  $('#preparation-note').hidden = !windBurst;
  $('#preparation-note').textContent = windBurst
    ? `Make your ${enchantLabel(windBurst.id, windBurst.level)} book first. The plan cost below excludes making that book.`
    : '';
  renderGraph();
  renderDetail();
  renderSteps();
  setView('steps');
}
function applyZoom() {
  const svg = $('#flow-svg');
  if (svg) {
    svg.style.width = `${zoom * 100}%`;
    svg.style.maxWidth = `${Number(svg.dataset.naturalWidth) * zoom}px`;
  }
}
export function setView(view) {
  currentView = view;
  for (const v of ['flow', 'steps']) {
    $('#' + v + '-view').hidden = v !== view;
    $('#' + v + '-tab').classList.toggle('active', v === view);
    $('#' + v + '-tab').setAttribute('aria-pressed', v === view);
  }
  $('#step-detail').hidden = view !== 'flow' || !result;
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
    `Unenchanted ${itemName(context.item)}, prior-work count ${context.itemUses}`,
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
$('#graph').addEventListener('click', (e) => {
  const g = e.target.closest('[data-step]');
  if (!g || !result) return;
  activeStep = Number(g.dataset.step);
  document
    .querySelectorAll('.node')
    .forEach((n) => n.classList.toggle('selected', Number(n.dataset.step) === activeStep));
  renderDetail();
});
$('#graph').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-step]')) {
    e.preventDefault();
    e.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
});
$('#steps-view').addEventListener('change', (e) => {
  if (!e.target.dataset.complete) return;
  const step = Number(e.target.dataset.complete);
  if (e.target.checked) completed.add(step);
  else completed.delete(step);
  e.target.closest('.check-step').classList.toggle('done', e.target.checked);
  $('#step-progress').textContent = `${completed.size} of ${result.steps.length} done`;
});
$('#zoom-in').addEventListener('click', () => {
  zoom = Math.min(3, zoom + 0.25);
  applyZoom();
});
$('#zoom-out').addEventListener('click', () => {
  zoom = Math.max(1, zoom - 0.25);
  applyZoom();
});
$('#zoom-fit').addEventListener('click', () => {
  zoom = 1;
  applyZoom();
});
$('#export').addEventListener('click', exportPlan);
