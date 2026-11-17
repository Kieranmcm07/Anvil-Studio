// Optional DOM smoke checks. This is not a visual browser test.
// Setup: npm ci
// Run: node scripts/check-ui.mjs
import { Window } from 'happy-dom';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { optimize } from '../dist/optimizer.js';

const window = new Window({
  url: 'http://localhost:8000',
  settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true },
});
window.document.write(await readFile(new URL('../dist/index.html', import.meta.url), 'utf8'));
globalThis.document = window.document;
globalThis.window = window;
const motionPreference = {
  matches: false,
  listeners: [],
  addEventListener(type, listener) {
    if (type === 'change') this.listeners.push(listener);
  },
};
const matchMedia = window.matchMedia.bind(window);
window.matchMedia = (query) =>
  query === '(prefers-reduced-motion: reduce)' ? motionPreference : matchMedia(query);
globalThis.localStorage = window.localStorage;
globalThis.MouseEvent = window.MouseEvent;
globalThis.fetch = async (url) => ({
  ok: true,
  json: async () => JSON.parse(await readFile(url, 'utf8')),
});
let workerStarts = 0;
globalThis.Worker = class {
  constructor() {
    workerStarts++;
  }
  postMessage(data) {
    queueMicrotask(() => this.onmessage({ data: { result: structuredClone(optimize(data)) } }));
  }
  terminate() {}
};
const $ = (s) => document.querySelector(s);
const hasPlan = () => !$('#export').disabled && !$('#plan-details').hidden;
const click = (s) => {
  assert($(s), 'Missing control: ' + s);
  if (typeof $(s).click === 'function') $(s).click();
  else $(s).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
};
const change = (s, value) => {
  $(s).value = value;
  $(s).dispatchEvent(new window.Event('change', { bubbles: true }));
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
let checks = 0;
function check(value, message) {
  assert(value, message);
  checks++;
}

const playedSounds = [];
const soundVolumes = [];
let pausedSounds = 0;
window.Audio = class {
  constructor(src) {
    this.src = src;
  }
  play() {
    playedSounds.push(this.src);
    soundVolumes.push({ src: this.src, volume: this.volume });
    return Promise.resolve();
  }
  pause() {
    pausedSounds++;
  }
};
await import('../dist/app.js');
await tick();
check($('#selection-count').textContent === '0', 'First visit starts with no enchantments');
check(workerStarts === 0, 'First visit does not start the optimizer');
check(!$('.check-step') && !$('#flow-svg'), 'First visit has no generated steps or graph');
check(
  ['#stat-total', '#stat-peak', '#stat-steps'].every((id) => $(id).textContent === '\u2014'),
  'First visit shows empty costs'
);
check($('#export').disabled && !$('#safety-badge'), 'First visit has no finished plan');
click('#preset');
check($('#selection-count').textContent === '6', 'Recommended fills the helmet selection');
check(workerStarts === 0 && !$('.check-step'), 'Recommended does not calculate a plan');
click('#calculate');
await tick();
check(workerStarts === 1, 'Show my steps starts the optimizer');
check(hasPlan(), 'Requested helmet plan');
check(
  !$('#sound-enabled').checked && playedSounds.length === 0,
  'Sounds start off with no playback'
);
const { createShareUrl, readSharedPlan } = await import('../dist/share.js');
const sharedRaw = JSON.parse(
  await readFile(new URL('../dist/vanilla-data.json', import.meta.url), 'utf8')
).enchantments;
const sharedState = {
  version: 'bedrock-26.3',
  item: 'shield',
  itemUses: 2,
  objective: 'xp',
  selected: { mending: { level: 1, uses: 1 }, unbreaking: { level: 3, uses: 0 } },
  incompatible: false,
  moreTen: false,
  bookHistory: true,
  showCurses: false,
};
const sharedUrl = createShareUrl(sharedState, 'https://anvil-studio.pages.dev/');
const restored = readSharedPlan(new URL(sharedUrl).hash, sharedRaw);
check(
  restored.edition === 'bedrock' &&
    restored.itemUses === 2 &&
    restored.objective === 'xp' &&
    restored.selected.mending.uses === 1 &&
    restored.selected.unbreaking.level === 3,
  'Share links preserve edition, item, levels, objective and prior work'
);
for (const bad of [
  '#plan=%broken',
  '#plan=' + encodeURIComponent('null'),
  '#plan=' + encodeURIComponent(JSON.stringify([1, 'unknown', 'shield', 0, 'levels', 0, []])),
  '#plan=' +
    encodeURIComponent(
      JSON.stringify([1, 'java-26.3', 'helmet', 0, 'levels', 0, [['protection', 99, 0]]])
    ),
  '#plan=' +
    encodeURIComponent(
      JSON.stringify([
        1,
        'java-26.3',
        'helmet',
        0,
        'levels',
        0,
        [
          ['protection', 4, 0],
          ['fire_protection', 4, 0],
        ],
      ])
    ),
  '#plan=' +
    encodeURIComponent(
      JSON.stringify([1, 'java-26.3', 'mace', 0, 'levels', 0, [['wind_burst', 3, 0]]])
    ),
]) {
  assert.throws(() => readSharedPlan(bad, sharedRaw));
  checks++;
}
let copiedLink = '';
const clipboard = window.navigator.clipboard;
const originalWrite = clipboard.writeText;
clipboard.writeText = async (text) => {
  copiedLink = text;
};
click('#share');
await tick();
check(
  readSharedPlan(new URL(copiedLink).hash, sharedRaw).item === 'helmet',
  'Share button copies the current setup'
);
clipboard.writeText = async () => {
  throw new Error('Permission denied');
};
click('#share');
await tick();
check(
  $('#share-dialog').open && $('#share-url').value.includes('#plan='),
  'Blocked clipboard offers a selectable link'
);
click('#close-share');
clipboard.writeText = originalWrite;

const totalBeforeTheme = $('#stat-total').dataset.value;
let popupReveals = 0;
const themeMenu = $('.theme-menu');
const originalAnimate = themeMenu.animate.bind(themeMenu);
themeMenu.animate = (...args) => {
  popupReveals++;
  check(
    args[0][0].transform === 'translateY(8px)' && args[1].duration >= 350,
    'Theme popup has a visible, slower entrance'
  );
  return originalAnimate(...args);
};
for (let i = 0; i < 3; i++) {
  click('#theme-picker > summary');
  await tick();
  click('#theme-picker > summary');
  await tick();
}
check(popupReveals === 3, 'Theme popup gets exactly one entrance per opening');
themeMenu.animate = originalAnimate;
for (const theme of ['amethyst', 'ocean', 'ember', 'overworld', 'forest']) {
  $('#theme-picker').open = true;
  click(`[data-theme-choice="${theme}"]`);
  check(document.documentElement.dataset.theme === theme, `${theme}: selected theme applied`);
  const mobs = {
    forest: ['fox'],
    amethyst: ['shulker'],
    ocean: ['dolphin'],
    ember: ['blaze'],
    overworld: ['axolotl', 'bee', 'creeper', 'enderman', 'skeleton', 'zombie'],
  };
  check(
    Array.from(document.querySelectorAll('.background-mob.is-visible'))
      .map((image) => image.dataset.mob)
      .sort()
      .join(',') === mobs[theme].join(','),
    `${theme}: matching Minecraft mobs are visible`
  );
  check(
    $(`[data-theme-choice="${theme}"]`).getAttribute('aria-pressed') === 'true',
    `${theme}: selection announced`
  );
  check($('#stat-total').dataset.value === totalBeforeTheme, `${theme}: calculation preserved`);
  check(!$('#theme-picker').open, `${theme}: picker closes after choosing`);
  check(
    document.querySelectorAll('.scene.is-active').length === 1 &&
      $('.scene.is-active').dataset.scene === theme,
    theme + ': only its matching scenery is active'
  );
}
check(
  document.querySelectorAll('.background-mob[src]').length === 10,
  'Theme scenes load all ten local images'
);
check(
  document.querySelector('.world-background').getAttribute('aria-hidden') === 'true',
  'Mobs are decorative'
);
for (let i = 0; i < 3; i++) {
  click('[data-theme-choice="ocean"]');
  click('[data-theme-choice="ember"]');
}
check(
  !$('.mob-dolphin').classList.contains('is-visible'),
  'Rapid theme changes hide the outgoing ocean mob'
);
check($('.mob-blaze').classList.contains('is-visible'), 'Rapid theme changes keep the final scene');
check(
  !$('.mob-axolotl').classList.contains('is-visible'),
  'Overworld axolotl stays out of the colour themes'
);
click('[data-theme-choice="forest"]');
click('#theme-motion');
check(document.documentElement.dataset.motion === 'off', 'Animation toggle stops motion');
const { reveal } = await import('../dist/motion.js');
let revealCount = 0;
const animationTarget = {
  hidden: false,
  getAnimations: () => [],
  animate: () => {
    revealCount++;
  },
};
reveal(animationTarget);
check(revealCount === 0, 'Animation toggle also stops JavaScript transitions');
const { loadAppearance } = await import('../dist/themes.js');
check(
  loadAppearance().motion === false && loadAppearance().theme === 'forest',
  'Appearance preferences saved'
);
click('#theme-motion');
check(document.documentElement.dataset.motion === 'on', 'Animation toggle re-enables motion');
reveal(animationTarget);
check(revealCount === 1, 'Visible panels animate when motion is enabled');
motionPreference.matches = true;
motionPreference.listeners.forEach((listener) => listener());
check(
  document.documentElement.dataset.motion === 'off' && !$('#reduced-motion-note').hidden,
  'System reduced-motion preference overrides animations'
);
reveal(animationTarget);
check(revealCount === 1, 'System reduced-motion preference also stops JavaScript transitions');
motionPreference.matches = false;
motionPreference.listeners.forEach((listener) => listener());
check(
  document.documentElement.dataset.motion === 'on' && $('#reduced-motion-note').hidden,
  'Changing the system preference restores the chosen animation setting'
);
$('#theme-picker').open = true;
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
check(!$('#theme-picker').open, 'Escape closes the theme picker');
$('#theme-picker').open = true;
click('h1');
check(!$('#theme-picker').open, 'Clicking outside closes the theme picker');
localStorage.setItem('anvil-studio-appearance', '{broken');
check(loadAppearance().theme === 'forest', 'Malformed appearance storage falls back safely');
localStorage.setItem('anvil-studio-appearance', JSON.stringify({ theme: 'unknown' }));
check(loadAppearance().theme === 'forest', 'Unrecognized saved theme falls back safely');
click('[data-theme-choice="forest"]');
check(
  !$('#steps-view').hidden && $('#flow-view').hidden && $('#step-detail').hidden,
  'Steps are the default, with the graph and inspector hidden'
);
check($('#steps-tab').getAttribute('aria-pressed') === 'true', 'Default steps button is selected');
check(
  !$('#advanced').open && !$('#plan-details').open,
  'Extra options and cost details start collapsed'
);
check(
  !document.querySelector('[data-enchant="binding_curse"]'),
  'Curses stay out of the main picker by default'
);
click('#show-curses');
check(
  document.querySelector('[data-enchant="binding_curse"]'),
  'Curses remain available in More options'
);
click('#show-curses');
check(
  $('#gear-icon img').getAttribute('src') === './assets/items/diamond_helmet.png',
  'Equipment uses the original Minecraft texture'
);
check(
  document.querySelectorAll('.check-step .anvil-slots .slot').length === 18,
  'Every step shows left, right and result slots'
);
check(
  document.querySelectorAll('#flow-svg image').length === 7,
  'Graph leaves use the original item sprites'
);
check(document.querySelectorAll('#flow-svg .node').length === 6, 'Six clickable anvil steps');
check($('#step-detail').textContent.includes('LEFT SLOT'), 'Anvil slot inspector');
click('#steps-tab');
check(!$('#steps-view').hidden, 'Step checklist opens');
const progressCounter = $('#step-progress');
const progressAnimate = progressCounter.animate.bind(progressCounter);
let progressAnimations = 0;
progressCounter.animate = (...args) => {
  progressAnimations++;
  return progressAnimate(...args);
};
click('[data-complete="1"]');
check(progressAnimations === 1, 'Completing a step animates the changed progress count');
progressCounter.animate = progressAnimate;
check($('.check-step.done'), 'Step completion');
check($('#step-progress').textContent === '1 of 6 done', 'Checklist progress updates');
click('[data-theme-choice="ocean"]');
check(
  $('.check-step.done') && $('#step-progress').textContent === '1 of 6 done',
  'Changing theme preserves completed steps'
);
click('[data-theme-choice="forest"]');
click('#flow-tab');
check(
  !$('#flow-view').hidden && $('#steps-view').hidden && !$('#step-detail').hidden,
  'Graph opens only on request'
);
click('[data-step="2"]');
check($('#step-detail').textContent.includes('STEP 2'), 'Flow node selects detail');
check($('[data-graph-select]').value === '2', 'Tree and compact graph share the selected step');
click('[data-graph-prev]');
check(
  $('[data-graph-select]').value === '1' && $('[data-graph-prev]').disabled,
  'First graph step has no previous step'
);
click('[data-graph-next]');
check($('#step-detail').textContent.includes('STEP 2'), 'Next graph step updates its details');
change('[data-graph-select]', '6');
check($('[data-graph-next]').disabled, 'Last graph step has no next step');
check(
  $('.compact-result').textContent.includes('Finished Helmet'),
  'Compact graph shows the finished item'
);
check(
  document.querySelectorAll('.compact-inputs .compact-node').length === 2,
  'Compact graph displays both anvil inputs'
);
const previousInput = $('.compact-inputs [data-step]');
check(previousInput, 'Combined inputs link back to their earlier step');
const inputStep = previousInput.dataset.step;
previousInput.click();
check(
  $('[data-graph-select]').value === inputStep,
  'Earlier-step link follows the graph dependency'
);
click('#graph-mode');
check($('.blueprint').dataset.graphMode === 'tree', 'Full tree mode opens');
const naturalWidth = parseFloat($('#flow-svg').style.width);
check(
  naturalWidth <= 240 && parseFloat($('#flow-svg').style.height) <= 402,
  'Full tree initially fits both dimensions, including the finished item'
);
let panelWidth = 360;
Object.defineProperty($('#graph'), 'clientWidth', { configurable: true, get: () => panelWidth });
click('#zoom-fit');
check(
  parseFloat($('#flow-svg').style.width) <= panelWidth,
  'Fit contains the full graph on a phone'
);
const fittedWidth = parseFloat($('#flow-svg').style.width);
click('#zoom-in');
check(parseFloat($('#flow-svg').style.width) > fittedWidth, 'Zoom enlarges the tree');
click('#zoom-fit');
panelWidth = 768;
window.dispatchEvent(new window.Event('resize'));
check(
  parseFloat($('#flow-svg').style.width) <= panelWidth &&
    parseFloat($('#flow-svg').style.width) > fittedWidth,
  'Fitted graph adjusts on tablet resize'
);
click('#graph-mode');
check($('.blueprint').dataset.graphMode === 'step', 'Compact graph can be restored');
change('[data-graph-select]', '2');
$('#flow-svg [data-step="3"]').dispatchEvent(
  new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
);
check($('[data-graph-select]').value === '3', 'Keyboard activation selects a tree step');
click('#steps-tab');
check($('.check-step.done'), 'Switching views preserves completed steps');
check($('#completion').hidden, 'Celebration stays hidden until all steps are completed');
click('#sound-enabled');
check(
  playedSounds.some((src) => src.endsWith('/click.ogg')),
  'Enabling sound previews the original click'
);
for (let step = 2; step <= 6; step++) click('[data-complete="' + step + '"]');
check(
  !$('#completion').hidden && $('#completion').classList.contains('celebrate'),
  'Finishing every step celebrates the completed item'
);
check(
  playedSounds.some((src) => src.endsWith('/step.ogg')) &&
    playedSounds.filter((src) => src.endsWith('/levelup.ogg')).length === 1,
  'Steps play the quiet XP sound and completion plays one level-up sound'
);
click('[data-complete="6"]');
check($('#completion').hidden, 'Unchecking a step hides the completion message');
click('[data-complete="6"]');
check(
  !$('#completion').classList.contains('celebrate') &&
    playedSounds.filter((src) => src.endsWith('/levelup.ogg')).length === 1,
  'Reticking a step does not replay the celebration'
);

check(
  $('#completion .glint-mask').style.getPropertyValue('--item-mask').includes('diamond_helmet.png'),
  'Original glint is masked to the completed item'
);
check(
  soundVolumes
    .filter((sound) => sound.src.endsWith('/step.ogg'))
    .every((sound) => sound.volume <= 0.12),
  'Step confirmations stay at a quiet volume'
);
for (const selector of [
  '#search',
  '#version',
  '#repository-link',
  '#projects-link',
  '#creator-link',
  '#help a[href]',
  '#sources-button',
]) {
  const control = $(selector);
  control.addEventListener('click', (event) => event.preventDefault(), { once: true });
  const before = playedSounds.length;
  click(selector);
  check(
    playedSounds.length === before + 1 && playedSounds.at(-1).endsWith('/click.ogg'),
    selector + ': activation plays one click'
  );
}
if ($('#help').open) $('#help').close();
let beforeCheckbox = playedSounds.length;
click('#show-curses');
check(playedSounds.length === beforeCheckbox + 1, 'Checking an option plays exactly one sound');
beforeCheckbox = playedSounds.length;
click('#show-curses');
check(playedSounds.length === beforeCheckbox + 1, 'Unchecking an option also plays one sound');
const beforeCalculation = playedSounds.length;
click('#calculate');
await tick();
check(
  playedSounds.length === beforeCalculation + 1 && playedSounds.at(-1).endsWith('/enchant.ogg'),
  'Show my steps plays only the original enchanting-table sound'
);
const workInput = $('#item-uses');
const workAnimate = workInput.animate.bind(workInput);
const workFrames = [];
workInput.animate = (...args) => {
  workFrames.push(args[0]);
  return workAnimate(...args);
};
function inputAndChange(input, value) {
  input.value = value;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
}
let beforeNumber = playedSounds.length;
inputAndChange(workInput, '2');
check(
  playedSounds.length === beforeNumber + 1 && workFrames.at(-1)[1].transform === 'translateY(-4px)',
  'Increasing prior work moves up and sounds once across input/change'
);
beforeNumber = playedSounds.length;
inputAndChange(workInput, '1');
check(
  playedSounds.length === beforeNumber + 1 && workFrames.at(-1)[1].transform === 'translateY(4px)',
  'Decreasing prior work moves down and sounds once'
);
const frameCount = workFrames.length;
beforeNumber = playedSounds.length;
inputAndChange(workInput, '1');
check(
  workFrames.length === frameCount && playedSounds.length === beforeNumber,
  'An unchanged number stays quiet and still'
);
click('#theme-motion');
inputAndChange(workInput, '3');
check(workFrames.length === frameCount, 'Prior-work animation respects the motion toggle');
click('#theme-motion');
workInput.animate = workAnimate;
click('#book-history');
const bookWork = $('[data-book-uses]');
beforeNumber = playedSounds.length;
inputAndChange(bookWork, '1');
check(playedSounds.length === beforeNumber + 1, 'Dynamic book prior-work controls also sound once');
click('#book-history');

click('#sound-enabled');
const soundsBefore = playedSounds.length;
click('#steps-tab');
check(
  playedSounds.length === soundsBefore && pausedSounds > 0,
  'Muting stops playback and future sounds'
);

click('#flow-tab');
click('[data-edition="bedrock"]');
change('#item', 'sword');
click('#preset');
click('#calculate');
await tick();
check(
  !$('#steps-view').hidden && $('#flow-view').hidden,
  'A fresh calculation opens the numbered steps'
);
check(!document.querySelector('[data-enchant="sweeping_edge"]'), 'Bedrock hides Sweeping Edge');
check(hasPlan(), 'Bedrock sword plan');
click('[data-edition="java"]');
change('#version', 'java-1.14');
change('#item', 'helmet');
click('[data-enchant="protection"][data-level="4"]');
click('[data-enchant="blast_protection"][data-level="4"]');
click('#calculate');
await tick();
check($('#selection-count').textContent === '2', 'Legacy stacked protections selected');
check(hasPlan(), 'Legacy protections are survival-safe');
change('#version', 'java-26.3');
check($('#selection-count').textContent === '1', 'Modern profile removes legacy conflict');
click('#incompatible');
click('[data-enchant="blast_protection"][data-level="4"]');
click('#calculate');
await tick();
check(
  $('#notice').textContent.includes('Theoretical plan'),
  'Conflicting plan never claims survival safety'
);
click('#incompatible');
change('#item', 'mace');
click('#preset');
click('#calculate');
await tick();
check(
  $('.book-origin').textContent.includes('four Wind Burst I books'),
  'Wind Burst recipe explains how to make level III'
);
check(
  !$('#preparation-note').hidden && $('#preparation-note').textContent.includes('excludes making'),
  'Preparation cost exclusion is visible beside the total'
);
check(!$('#plan-details').hidden, 'Calculated cost details are available');
check(hasPlan(), 'Mace plan is executable');
change('#item-uses', '6');
click('#calculate');
await tick();
check(
  !hasPlan() && $('#notice').textContent.includes('No survival-safe order'),
  'Impossible plan has no stale success'
);
check(
  $('#plan-details').hidden && $('#plan-footnote').textContent === '',
  'Failed plan clears old XP costs'
);
check(
  $('#preparation-note').hidden && $('#export').disabled,
  'Failed plan clears preparation note and export'
);
change('#item', 'helmet');
click('#calculate');
check($('#notice').textContent.includes('Select at least one'), 'Empty selection validation');
$('#search').value = 'resp';
$('#search').dispatchEvent(new window.Event('input', { bubbles: true }));
check(document.querySelectorAll('.enchant-row').length === 1, 'Search filters enchantments');
click('#reset');
check(
  String($('#selection-count').textContent) === '0',
  'Reset clears choices: ' + $('#selection-count').textContent
);
for (const edition of ['java', 'bedrock']) {
  click(`[data-edition="${edition}"]`);
  check(
    !document.querySelector('#item option[value="horse_armor"]'),
    `${edition}: horse armor removed`
  );
  change('#item', 'shield');
  check(
    $('#gear-icon img').getAttribute('src') === './assets/items/shield.png',
    `${edition}: shield image selected`
  );
  click('#preset');
  click('#calculate');
  await tick();
  check(hasPlan(), `${edition}: shield plan works`);
}
click('#reset');
check(
  $('#plan-footnote').textContent === '' && $('#plan-details').hidden,
  'Reset clears previous cost details'
);
check(!document.body.textContent.includes('Runs in your browser'), 'Removed the browser badge');
check(
  $('#creator-link').href === 'https://github.com/Kieranmcm07',
  'Creator credit links to the actual GitHub profile'
);
check(
  $('#projects-link').href === 'https://github.com/Kieranmcm07?tab=repositories',
  'More projects opens the repositories tab'
);
check(
  !$('#repository-link').hidden &&
    $('#repository-link').href === 'https://github.com/Kieranmcm07/Anvil-Studio',
  'Repository button links to the actual source'
);
const { site, setupGithubLinks } = await import('../dist/config.js');
site.repositoryUrl = 'https://github.com/example/test-repo';
setupGithubLinks();
check(
  !$('#repository-link').hidden && $('#repository-link').href === site.repositoryUrl,
  'Adding a repository URL enables its link'
);
site.repositoryUrl = '';
setupGithubLinks();
check($('#repository-link').hidden, 'An empty repository URL hides the link');
site.repositoryUrl = 'https://github.com/Kieranmcm07/Anvil-Studio';
setupGithubLinks();
// Active tabs do not replay entrances or disturb the plan.
click('#flow-tab');
let viewAnimations = 0;
const flowView = $('#flow-view');
const originalViewAnimate = flowView.animate.bind(flowView);
flowView.animate = (...args) => {
  viewAnimations++;
  return originalViewAnimate(...args);
};
click('#flow-tab');
click('#flow-tab');
check(viewAnimations === 0, 'Repeated clicks on the active graph tab do not replay animation');
flowView.animate = originalViewAnimate;

for (const item of ['axe', 'shovel']) {
  change('#item', item);
  click('#preset');
  check(
    $('[data-enchant="silk_touch"]').getAttribute('aria-pressed') === 'true',
    item + ': recommends Silk Touch'
  );
  check(
    $('[data-enchant="fortune"][data-level="3"]').getAttribute('aria-pressed') === 'false',
    item + ': leaves Fortune unselected'
  );
}
for (const item of ['turtle_helmet', 'brush']) {
  change('#item', item);
  click('#preset');
  click('#calculate');
  await tick();
  check(hasPlan(), item + ': calculates a survival plan');
}
change('#item', 'book');
check($('#preset').hidden, 'Book mode lets players choose their own combination');
click('[data-enchant="mending"][data-level="1"]');
click('#calculate');
await tick();
check(
  $('#stat-steps').dataset.value === '0' &&
    $('#steps-view').textContent.includes('No anvil steps needed'),
  'One enchanted book needs no operations'
);
click('[data-enchant="unbreaking"][data-level="3"]');
click('#calculate');
await tick();
check($('#stat-steps').dataset.value === '1', 'Two enchanted books require exactly one combine');
check(
  document.querySelectorAll('#flow-svg image').length === 2,
  'Book graph has no phantom blank book'
);
check(
  $('#steps-view').textContent.includes('Mending I') &&
    $('#steps-view').textContent.includes('Unbreaking III'),
  'Book plan includes both chosen inputs'
);
check(
  document.querySelectorAll('[data-edition] .ui-item').length === 2,
  'Both editions have Minecraft symbols'
);
click('#reset');

// Drive the counters with deterministic frame times, including cancellation and reduced motion.
const { setStat, clearStat, finishCounters } = await import('../dist/stats.js');
finishCounters();
const requestFrame = window.requestAnimationFrame;
const cancelFrame = window.cancelAnimationFrame;
const frames = new Map();
let frameId = 0;
window.requestAnimationFrame = (callback) => {
  frames.set(++frameId, callback);
  return frameId;
};
window.cancelAnimationFrame = (id) => frames.delete(id);
const advance = (time) => {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(time));
};
const counter = document.createElement('strong');
counter.id = 'counter-test';
setStat(counter, 45, 'levels');
check(
  counter.dataset.value === '45' && counter.querySelector('.sr-only').textContent === '45 levels',
  'Counter exposes the exact final cost immediately'
);
check(counter.querySelector('.stat-value').textContent === '0', 'First result counts up from zero');
advance(0);
advance(300);
check(
  +counter.querySelector('.stat-value').textContent > 0 &&
    +counter.querySelector('.stat-value').textContent < 45,
  'Counter passes through intermediate values'
);
advance(900);
check(
  counter.querySelector('.stat-value').textContent === '45' && frames.size === 0,
  'Counter reaches the exact result and stops'
);
setStat(counter, 12, 'levels');
advance(1000);
advance(1300);
check(
  +counter.querySelector('.stat-value').textContent < 45 &&
    +counter.querySelector('.stat-value').textContent > 12,
  'Cheaper plans count down'
);
advance(1900);
check(
  counter.querySelector('.stat-value').textContent === '12',
  'Downward counter settles exactly'
);
setStat(counter, 20);
const staleFrame = [...frames.values()][0];
clearStat(counter);
staleFrame(2000);
check(
  !counter.dataset.value && counter.querySelector('.stat-value').textContent === '12',
  'Clearing invalidates the result immediately but preserves its visible starting value'
);
advance(2000);
advance(2450);
check(
  counter.querySelector('.stat-value').textContent === '6',
  'Invalidated costs visibly count down before clearing'
);
const clearFrame = [...frames.values()][0];
clearStat(counter);
check([...frames.values()][0] === clearFrame, 'Repeated edits do not restart the countdown');
advance(2900);
check(
  counter.textContent === '\u2014' && frames.size === 0,
  'Countdown finishes at the empty state'
);
setStat(counter, 40);
finishCounters();
clearStat(counter);
advance(3000);
advance(3450);
const interruptedClear = [...frames.values()][0];
setStat(counter, 25);
check(
  counter.querySelector('.stat-value').textContent === '20',
  'A new result continues from the currently visible value'
);
interruptedClear(3900);
finishCounters();
check(
  counter.querySelector('.stat-value').textContent === '25',
  'An old clearing frame cannot erase a new result'
);
clearStat(counter);
finishCounters();
check(counter.textContent === '\u2014', 'Disabling motion finishes an empty-state countdown');
setStat(counter, 30);
click('#theme-motion');
check(
  counter.querySelector('.stat-value').textContent === '30' && frames.size === 0,
  'Disabling animations finishes pending counters'
);
setStat(counter, 7, 'levels');
check(
  counter.querySelector('.stat-value').textContent === '7' && frames.size === 0,
  'Motion-off results appear immediately'
);
click('#theme-motion');
setStat(counter, 0);
finishCounters();
check(
  counter.querySelector('.stat-value').textContent === '0' && frames.size === 0,
  'Zero-operation plans stay exact'
);
change('#item', 'helmet');
click('#preset');
click('#calculate');
await tick();
finishCounters();
const displayedTotal = $('#stat-total').querySelector('.stat-value').textContent;
click('[data-enchant="mending"][data-level="1"]');
check(
  $('#stat-total').querySelector('.stat-value').textContent === displayedTotal &&
    !$('#stat-total').dataset.value &&
    $('#export').disabled,
  'Editing a calculated plan starts a countdown and disables stale exports'
);
check(
  $('#steps-view').textContent.includes('Update your plan') && !$('#flow-svg'),
  'Edited plans explain that recalculation is needed'
);
advance(4000);
advance(4900);
check($('#stat-total').textContent === '\u2014', 'Selection edit completes its countdown');
click('#calculate');
await tick();
finishCounters();
check(hasPlan(), 'The edited selection can calculate a fresh plan');

window.requestAnimationFrame = requestFrame;
window.cancelAnimationFrame = cancelFrame;

const startsBeforeShare = workerStarts;
window.location.hash = new URL(sharedUrl).hash;
await tick();
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
check(
  $('#version').value === 'bedrock-26.3' &&
    $('#item').value === 'shield' &&
    $('#selection-count').textContent === '2',
  'Opening a shared link restores the controls'
);
check(workerStarts === startsBeforeShare && !hasPlan(), 'Shared links wait for Show my steps');
window.history.replaceState(null, '', '/');

// Load a fresh app module with saved inputs to exercise returning-visitor startup.
click('[data-edition="bedrock"]');
change('#item', 'shield');
click('#preset');
localStorage.setItem(
  'anvil-studio-v1',
  JSON.stringify({
    edition: 'bedrock',
    version: 'bedrock-26.3',
    item: 'shield',
    selected: { unbreaking: { level: 3, uses: 0 }, mending: { level: 1, uses: 0 } },
  })
);
const startsBeforeReload = workerStarts;
await import('../dist/app.js?returning-visit');
await tick();
check(
  $('#version').value === 'java-26.3' && $('#item').value === 'helmet',
  'Returning visit starts with fresh edition and equipment controls'
);
check(
  $('#selection-count').textContent === '0',
  'Returning visit never restores old recommended enchantments'
);
check(workerStarts === startsBeforeReload, 'Returning visit does not start the optimizer');
check(!$('.check-step') && !$('#flow-svg'), 'Returning visit waits to generate steps and graph');
check(
  $('#stat-total').textContent === '\u2014' && $('#export').disabled && !$('#safety-badge'),
  'Returning visit has no calculated cost or finished plan'
);
check(localStorage.getItem('anvil-studio-v1') === null, 'Startup clears obsolete saved loadouts');
console.log(`${checks} DOM interaction checks passed. Visual layout was not tested.`);
window.happyDOM.abort();
