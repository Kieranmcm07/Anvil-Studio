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
let deferWorkers = false;
const workerJobs = [];
globalThis.Worker = class {
  constructor() {
    workerStarts++;
    workerJobs.push(this);
  }
  postMessage(data) {
    this.request = structuredClone(data);
    if (!deferWorkers) queueMicrotask(() => this.respond());
  }
  respond() {
    this.onmessage({ data: { result: structuredClone(optimize(this.request)) } });
  }
  terminate() {
    this.terminated = true;
  }
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
let glyphAnimations = 0;
const animateElement = window.HTMLElement.prototype.animate;
window.HTMLElement.prototype.animate = function (...args) {
  if (this.classList.contains('enchant-glyph')) glyphAnimations++;
  return animateElement.apply(this, args);
};
const completionScrolls = [];
window.HTMLElement.prototype.scrollIntoView = function (options) {
  if (this.id === 'completion') completionScrolls.push(options);
};
await import('../dist/app.js');
await tick();
check($('#selection-count').textContent === '0', 'First visit starts with no enchantments');
check(workerStarts === 0, 'First visit does not start the optimizer');
check(!$('.check-step') && !$('#flow-svg'), 'First visit has no generated steps or graph');
check(
  ['#stat-total', '#stat-peak', '#stat-steps'].every((id) => $(id).textContent === '-'),
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
check(
  $('#xp-progress').getAttribute('aria-valuenow') === '0' &&
    $('#xp-progress').getAttribute('aria-valuemax') === '6',
  'XP-style progress starts empty and measures steps, not XP cost'
);
const glyphsBeforeStep = glyphAnimations;
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
check(
  $('#xp-progress').getAttribute('aria-valuenow') === '1' &&
    parseFloat($('#xp-progress').style.getPropertyValue('--remaining')) > 83 &&
    parseFloat($('#xp-progress').style.getPropertyValue('--remaining')) < 84,
  'Completing a step fills one sixth of the XP-style bar'
);
check(glyphAnimations === glyphsBeforeStep + 6, 'Completing a step starts six enchanting glyphs');
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
  completionScrolls.length === 1 &&
    completionScrolls[0].behavior === 'smooth' &&
    completionScrolls[0].block === 'center',
  'Completing steps scrolls to the congratulations box'
);

check(
  playedSounds.some((src) => src.endsWith('/step.ogg')) &&
    playedSounds.filter((src) => src.endsWith('/levelup.ogg')).length === 1,
  'Steps play the quiet XP sound and completion plays one level-up sound'
);
click('[data-complete="6"]');
check($('#completion').hidden, 'Unchecking a step hides the completion message');
check($('#xp-progress').getAttribute('aria-valuenow') === '5', 'Undo lowers XP-style progress');
check(
  !$('[data-complete="6"]').closest('.check-step').querySelector('.enchant-particles'),
  "Undo clears that step's particles"
);
click('[data-complete="6"]');
check(
  $('#completion').classList.contains('celebrate') &&
    playedSounds.filter((src) => src.endsWith('/levelup.ogg')).length === 2 &&
    playedSounds.at(-1).endsWith('/levelup.ogg'),
  'Completing the plan again replays the celebration sound'
);

check(
  !$('#completion .glint-mask') &&
    $('#completion .finished-icon img').getAttribute('src').endsWith('diamond_helmet.png'),
  'Completion keeps the original item without the purple overlay'
);
check(
  $('#xp-progress').getAttribute('aria-valuenow') === '6' &&
    $('#xp-progress').style.getPropertyValue('--remaining') === '0%',
  'Finishing all steps fills the XP bar completely'
);
const stepButton = $('[data-complete="6"]');
check(
  stepButton.tagName === 'BUTTON' &&
    stepButton.getAttribute('aria-pressed') === 'true' &&
    stepButton.getAttribute('aria-label') === 'Undo step 6',
  'Completion control is an accessible toggle button'
);
check(
  stepButton.nextElementSibling.classList.contains('anvil-slots'),
  'Large completion button is above the slots, not at the bottom'
);
const beforeUndo = playedSounds.length;
const glyphsBeforeUndo = glyphAnimations;
click('[data-complete="6"]');
check(
  stepButton.getAttribute('aria-pressed') === 'false' &&
    stepButton.textContent === 'Mark step done' &&
    playedSounds.length === beforeUndo + 1,
  'Undo restores the button and plays just one click'
);
check(glyphAnimations === glyphsBeforeUndo, 'Undo does not start another particle burst');
const beforeRedo = playedSounds.length;
click('[data-complete="6"]');
check(
  playedSounds.length === beforeRedo + 1 && playedSounds.at(-1).endsWith('/levelup.ogg'),
  'Finishing again plays only the celebration, without a duplicate click or ping'
);
click('#theme-motion');
const glyphsWithMotionOff = glyphAnimations;
click('[data-complete="6"]');
click('[data-complete="6"]');
check(
  completionScrolls.at(-1).behavior === 'auto',
  'Completion respects disabled motion when scrolling'
);
click('#theme-motion');

check(glyphAnimations === glyphsWithMotionOff, 'Disabled motion suppresses enchanting particles');
const { enchantParticles } = await import('../dist/motion.js');
const reducedMotionBefore = motionPreference.matches;
motionPreference.matches = true;
enchantParticles($('.result-item'));
check(glyphAnimations === glyphsWithMotionOff, 'System reduced motion also suppresses particles');
motionPreference.matches = reducedMotionBefore;
const dropdown = $('#version');
dropdown.size = 0; // Model the native default omitted by the DOM harness.
let pickerOpens = 0;
dropdown.showPicker = () => {
  pickerOpens++;
};
const beforeOpen = playedSounds.length;
dropdown.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
check(pickerOpens === 0 && playedSounds.length === beforeOpen, 'Keyboard focus alone stays quiet');
const openPointer = new window.PointerEvent('pointerdown', {
  bubbles: true,
  cancelable: true,
  pointerType: 'mouse',
  button: 0,
});
dropdown.dispatchEvent(openPointer);
check(
  pickerOpens === 1 && openPointer.defaultPrevented && playedSounds.length === beforeOpen + 1,
  'Mouse press opens the picker directly and sounds once'
);
click('#version');
change('#version', 'java-1.21');
check(
  playedSounds.length === beforeOpen + 1,
  'Choosing an option does not double the opening sound'
);
change('#version', 'java-1.21');
check(playedSounds.length === beforeOpen + 1, 'Repeated change events stay silent');
change('#version', 'java-26.3');
check(playedSounds.length === beforeOpen + 2, 'Keyboard selection still has sound');
const labelPointer = new window.PointerEvent('pointerdown', {
  bubbles: true,
  cancelable: true,
  pointerType: 'mouse',
  button: 0,
});
dropdown.closest('label').dispatchEvent(labelPointer);
check(
  pickerOpens === 2 && labelPointer.defaultPrevented,
  'The dropdown label opens its options too'
);
click('#version');
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
dropdown.showPicker = () => {
  throw new Error('Unsupported');
};
const fallbackPointer = new window.PointerEvent('pointerdown', {
  bubbles: true,
  cancelable: true,
  pointerType: 'mouse',
  button: 0,
});
dropdown.dispatchEvent(fallbackPointer);
check(!fallbackPointer.defaultPrevented, 'Blocked picker calls preserve native browser behaviour');
const beforeFallback = playedSounds.length;
dropdown.dispatchEvent(
  new window.PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', button: 0 })
);
check(playedSounds.length === beforeFallback + 1, 'Native fallback activation sounds once');
delete dropdown.showPicker;
const beforeTouch = playedSounds.length;
dropdown.dispatchEvent(
  new window.PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', button: 0 })
);
dropdown.dispatchEvent(new window.PointerEvent('pointercancel', { bubbles: true }));
dropdown.dispatchEvent(
  new window.PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', button: 0 })
);
check(playedSounds.length === beforeTouch, 'Scrolling past a dropdown does not play a sound');
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));

check(
  soundVolumes
    .filter((sound) => sound.src.endsWith('/step.ogg'))
    .every((sound) => sound.volume <= 0.12),
  'Step confirmations stay at a quiet volume'
);
for (const selector of [
  '#search',
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
check(
  document.querySelectorAll('#enchantments .enchant-row').length === 1,
  'Search filters enchantments'
);
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
check(!$('#xp-progress'), 'Zero-operation book needs no progress bar');
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

check(
  !$('#xp-progress') && !$('.enchant-particles'),
  'Reset removes the progress bar and particles'
);

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
check(
  counter.textContent === '-' && !counter.dataset.value && frames.size === 0,
  'Invalidated costs immediately become a hyphen without counting down'
);
staleFrame(2000);
check(counter.textContent === '-', 'An old animation cannot overwrite the cleared value');
clearStat(counter);
check(counter.textContent === '-' && frames.size === 0, 'Repeated clears do not animate');
setStat(counter, 25);
check(
  counter.querySelector('.stat-value').textContent === '0',
  'New results animate from zero after clearing'
);
staleFrame(3900);
finishCounters();
check(
  counter.querySelector('.stat-value').textContent === '25',
  'A stale frame cannot erase a new result'
);
clearStat(counter);
finishCounters();
check(counter.textContent === '-', 'Finishing animations preserves an empty hyphen');
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
click('[data-enchant="mending"][data-level="1"]');
check(
  $('#stat-total').textContent === '-' && !$('#stat-total').dataset.value && $('#export').disabled,
  'Editing a plan immediately clears its cost and disables stale exports'
);
check(
  $('#steps-view').textContent.includes('Update your plan') && !$('#flow-svg'),
  'Edited plans explain that recalculation is needed'
);
advance(4000);
advance(4900);
check(
  $('#stat-total').textContent === '-',
  'Selection edit keeps its hyphen after old animation frames'
);
click('#calculate');
await tick();
finishCounters();
check(hasPlan(), 'The edited selection can calculate a fresh plan');

window.requestAnimationFrame = requestFrame;
window.cancelAnimationFrame = cancelFrame;

// Exercise delayed worker callbacks after edits and resets.
deferWorkers = true;
click('#reset');
click('#preset');
click('#calculate');
const obsoleteJob = workerJobs.at(-1);
change('#item', 'shield');
click('#preset');
click('#calculate');
const currentJob = workerJobs.at(-1);
obsoleteJob.onmessage({ data: { error: 'Outdated result' } });
check(
  $('#calculate').disabled && !currentJob.terminated && !hasPlan(),
  'Late results cannot stop or replace a newer calculation'
);
obsoleteJob.onerror();
check(
  $('#calculate').disabled && !currentJob.terminated,
  'Late errors cannot cancel a newer calculation'
);
currentJob.respond();
check(
  hasPlan() && $('#result-title').textContent.includes('shield'),
  'The current calculation still finishes normally'
);
click('#calculate');
const interruptedJob = workerJobs.at(-1);
$('#item-uses').value = '2';
$('#item-uses').dispatchEvent(new window.Event('input', { bubbles: true }));
check(
  interruptedJob.terminated && $('#export').disabled && !hasPlan(),
  'Typing prior work invalidates old costs before blur'
);
interruptedJob.respond();
check(!hasPlan() && !$('#calculate').disabled, 'A result arriving after an edit stays discarded');
click('#calculate');
check(workerJobs.at(-1).request.itemUses === 2, 'New calculations use the typed prior-work value');
workerJobs.at(-1).respond();
click('#book-history');
click('#calculate');
const bookJob = workerJobs.at(-1);
const liveBookInput = $('[data-book-uses]');
liveBookInput.value = '1';
liveBookInput.dispatchEvent(new window.Event('input', { bubbles: true }));
check(bookJob.terminated && !hasPlan(), 'Typing book history also invalidates immediately');
click('#calculate');
check(
  workerJobs.at(-1).request.books.find((book) => book.id === liveBookInput.dataset.bookUses)
    .uses === 1,
  'Book calculations use the typed history value'
);
workerJobs.at(-1).respond();
click('#book-history');
change('#item', 'mace');
click('#preset');
click('[data-enchant="wind_burst"][data-level="1"]');
click('#calculate');
check(
  workerJobs.at(-1).request.books.find((book) => book.id === 'wind_burst').uses === 0,
  'Lowering Wind Burst removes preparation history when custom history is off'
);
workerJobs.at(-1).respond();
click('#reset');
check(
  $('#steps-view').textContent.includes('No plan yet') &&
    !$('#steps-view').textContent.includes('Update your plan'),
  'Reset restores the fresh empty message'
);
click('#preset');
const WorkingWorker = globalThis.Worker;
globalThis.Worker = class {
  constructor() {
    throw new Error('Worker blocked');
  }
};
click('#calculate');
check(
  !$('#calculate').disabled && $('#notice').textContent.includes('could not start'),
  'A blocked worker leaves a usable calculate button and an error message'
);
globalThis.Worker = WorkingWorker;
deferWorkers = false;
$('#share-dialog').showModal();
$('#close-share').focus();
const slash = new window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
document.dispatchEvent(slash);
check(
  !slash.defaultPrevented && document.activeElement === $('#close-share'),
  'Search shortcut leaves focus inside the share dialog'
);
$('#share-dialog').close();

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
click('#reset');
check(
  window.location.hash === '' && $('#selection-count').textContent === '0',
  'Reset removes shared URL data so a reload cannot restore the old setup'
);
window.history.replaceState(null, '', '/');

// The optional tools work with the same planner inputs and never auto-start a new visit.
click('#reset');
click('#edit-existing');
check($('#existing-dialog').open, 'Existing enchantments open in a separate editor');
check(!$('#existing-panel [data-existing]'), 'The sidebar no longer duplicates every enchantment');

click('[data-existing="unbreaking"][data-existing-level="2"]');
check(
  $('[data-existing="unbreaking"][data-existing-level="2"]').getAttribute('aria-pressed') ===
    'true',
  'Existing levels use selectable buttons'
);
click('[data-existing="unbreaking"][data-existing-level="2"]');
check($('#existing-count').textContent === '0', 'Clicking the same existing level removes it');
click('[data-existing="protection"][data-existing-level="4"]');
check(
  $('#existing-summary').textContent.includes('Protection IV') &&
    !$('#enchantments [data-enchant="protection"]') &&
    !$('#enchantments [data-enchant="fire_protection"]'),
  'Existing max-level enchantments and their conflicts stay out of the books list'
);
check(
  $('[data-existing="fire_protection"]').disabled,
  'Existing level buttons still block conflicting enchantments'
);
click('[data-existing="protection"][data-existing-level="4"]');
click('[data-existing="unbreaking"][data-existing-level="2"]');
check(!$('#existing-enchantments select'), 'Existing gear no longer uses None dropdowns');
click('#close-existing');
check(
  !$('#existing-dialog').open && $('#enchantment-label').textContent === 'Books to add',
  'Closing the editor leaves a compact summary and the books list'
);
click('#sound-enabled');
check(
  $('#item-card img').getAttribute('src').endsWith('/diamond_helmet.png'),
  'Item card toolbar shows the selected helmet'
);
check($('#existing-count').textContent === '1', 'Existing gear has its own selection count');
click('[data-enchant="unbreaking"][data-level="2"]');
click('[data-enchant="mending"][data-level="1"]');
click('#calculate');
await tick();
check(
  $('#stat-total').dataset.value === '6',
  'Existing Unbreaking II upgrades to III with the correct cost'
);
check(
  document.querySelectorAll('[data-gather]').length === 2,
  'Book checklist lists only the two new books'
);
const firstSupply = $('[data-gather]').dataset.gather;
click('[data-gather="' + firstSupply + '"]');
check(
  playedSounds.at(-1).endsWith('/book.ogg'),
  'Gathering a book uses its quiet original Minecraft sound'
);
check(
  $('#gather-count').textContent === '1 of 2 ready',
  'Gathering books updates its own checklist'
);
check(
  $('#step-progress').textContent === '0 of 2 done',
  'Gathering books does not finish anvil steps'
);
click('[data-complete="1"]');
const savedFeatureSession = localStorage.getItem('anvil-studio-session');
check(
  JSON.parse(savedFeatureSession).progress.completed.length === 1,
  'Step progress is saved for explicit resume'
);
click('.check-step .slot .item-inspect');
check(
  !$('#item-tooltip').hidden && $('#item-tooltip').textContent.includes('Unbreaking II'),
  'Tapping an item shows its existing enchantments'
);
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
check($('#item-tooltip').hidden, 'Escape dismisses item tooltips');
click('#flow-tab');
const graphItem = $('#flow-svg [data-item-title]');
let graphSounds = playedSounds.length;
click('#flow-svg [data-step="1"]');
check(
  playedSounds.length === graphSounds + 1 && playedSounds.at(-1).endsWith('/click.ogg'),
  'A graph square plays exactly one click'
);
graphSounds = playedSounds.length;
$('#flow-svg [data-step="2"]').dispatchEvent(
  new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
);
check(playedSounds.length === graphSounds + 1, 'Keyboard graph activation also plays one click');
graphSounds = playedSounds.length;
click('#flow-tab');
check(playedSounds.length === graphSounds, 'The active graph tab stays quiet');

graphItem.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
check(!$('#item-tooltip').hidden, 'Keyboard focus opens item tooltips in the full graph');
check(
  $('#compact-graph .compact-result .item-inspect'),
  'Compact graph result offers its final enchantments'
);
click('#steps-tab');
check(playedSounds.at(-1).endsWith('/page.ogg'), 'Switching views uses the quiet book-page sound');
$('#compare-panel').open = true;
$('#compare-panel').dispatchEvent(new window.Event('toggle'));
check(
  $('#build-a').textContent.includes('Unbreaking III'),
  'Opening comparison captures the starting plan'
);
click('#capture-a');
const buildALevels = $('#build-a').textContent;
click('[data-enchant="protection"][data-level="4"]');
check(
  $('#capture-a').disabled && $('#build-a').textContent === buildALevels,
  'Editing inputs preserves the captured comparison and disables stale capture'
);
check(
  localStorage.getItem('anvil-studio-session') === savedFeatureSession,
  'Uncalculated edits do not overwrite saved progress'
);
click('#calculate');
await tick();
check(
  $('#build-b').textContent.includes('Protection IV') &&
    $('#compare-changes').textContent.includes('Protection'),
  'A new calculation fills build B and highlights changed enchantments'
);
click('#capture-b');
const savedBuildB = $('#build-b').textContent;
check(
  $('#compare-difference').textContent.includes('Build A uses'),
  'Comparison explains which calculated build costs fewer levels'
);
click('[data-use-build="a"]');
await tick();
check(
  $('#stat-total').dataset.value === '6' && $('#existing-count').textContent === '1',
  'Use build restores its existing gear and recalculates'
);
check($('#build-b').textContent === savedBuildB, 'Loading build A preserves saved build B');
click('#item-card');
check(
  $('#item-card-dialog').open && $('#item-card-preview').textContent.includes('Unbreaking III'),
  'Item card previews the final upgraded enchantments'
);
check(
  $('#item-card-preview').textContent.includes('Planned item'),
  'Unfinished item cards do not claim completion'
);
for (const [theme, mob] of Object.entries({
  forest: 'fox',
  amethyst: 'shulker',
  ocean: 'dolphin',
  ember: 'blaze',
  overworld: 'creeper',
})) {
  click('[data-theme-choice="' + theme + '"]');
  check(
    $('#item-card-preview .card-mob')
      .getAttribute('src')
      .endsWith('/' + mob + '.png') && $('#item-card-preview .scene-' + theme + '.is-active'),
    'Open item card follows the ' + theme + ' theme and its mob'
  );
}
click('[data-theme-choice="forest"]');
click('#close-item-card');

// Exercise drawing and download plumbing; the DOM harness does not render canvas pixels.
const OriginalImage = window.Image;
const originalGetContext = window.HTMLCanvasElement.prototype.getContext;
const originalToBlob = window.HTMLCanvasElement.prototype.toBlob;
const drawCalls = [];
const cardFonts = [];
const cardColors = [];
window.Image = class {
  naturalWidth = 16;
  naturalHeight = 16;
  set src(value) {
    this.url = value;
    queueMicrotask(() => this.onload());
  }
};
window.HTMLCanvasElement.prototype.getContext = function () {
  return {
    set font(value) {
      cardFonts.push(value);
    },
    set fillStyle(value) {
      cardColors.push(value);
    },
    fillRect() {},
    strokeRect() {},
    drawImage(...args) {
      drawCalls.push(['image', ...args]);
    },
    fillText(text) {
      drawCalls.push(['text', text]);
    },
  };
};
window.HTMLCanvasElement.prototype.toBlob = function (callback, type) {
  callback(new Blob(['test'], { type }));
};
let downloadedCard = '';
const trackDownload = (event) => {
  const link = event.target.closest('a[download]');
  if (link?.download.endsWith('.png')) {
    event.preventDefault();
    downloadedCard = link.download;
  }
};
document.addEventListener('click', trackDownload, true);
click('#item-card');
click('#download-item-card');
await tick();
await tick();
check(
  downloadedCard === 'anvil-helmet.png' &&
    drawCalls.some(([kind, text]) => kind === 'text' && text === 'Unbreaking III'),
  'PNG download uses the final item enchantments'
);
check(!$('#download-item-card').disabled, 'PNG export restores its button after completion');
check(
  drawCalls.some(([kind, image]) => kind === 'image' && image.url?.endsWith('/fox.png')) &&
    drawCalls.some(
      ([kind, image]) => kind === 'image' && image.url?.startsWith('data:image/svg+xml')
    ) &&
    !cardColors.includes('#100914'),
  'PNG includes theme scenery and the original mob, without fixed purple'
);

check(
  cardFonts.length > 0 && cardFonts.every((font) => !font.includes('monospace')),
  'Downloaded card uses site fonts instead of monospace'
);
window.Image = OriginalImage;
window.HTMLCanvasElement.prototype.getContext = originalGetContext;
window.HTMLCanvasElement.prototype.toBlob = originalToBlob;
document.removeEventListener('click', trackDownload, true);
click('#close-item-card');
click('#reset');
check(
  localStorage.getItem('anvil-studio-session') === null && $('#compare-panel').hidden,
  'Reset clears saved progress and build comparisons'
);
change('#item', 'shovel');
click('#preset');
click('#calculate');
await tick();
$('#compare-panel').open = true;
$('#compare-panel').dispatchEvent(new window.Event('toggle'));
check(
  $('#compare-shortcuts').textContent.includes('Fortune instead of Silk Touch'),
  'Comparison offers a suitable alternative'
);
click('[data-compare-alternative="0"]');
await tick();
check(
  $('#build-a').textContent.includes('Silk Touch') &&
    $('#build-b').textContent.includes('Fortune') &&
    $('#compare-changes').textContent.includes('Silk Touch'),
  'Trying an alternative keeps A and calculates B with its changes'
);
click('[data-clear-build="b"]');
check(
  !$('#build-b [data-use-build]') && !$('#compare-difference').textContent,
  'Clearing a comparison also clears its difference'
);
click('#reset');
click('#edit-existing');
click('[data-existing="protection"][data-existing-level="4"]');
click('#close-existing');
click('[data-remove-existing="protection"]');
check(
  $('#existing-count').textContent === '0' && $('#enchantments [data-enchant="protection"]'),
  'Removing an existing enchantment restores its book choices'
);
click('#reset');
click('#sound-enabled');
localStorage.setItem('anvil-studio-session', savedFeatureSession);

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
  $('#stat-total').textContent === '-' && $('#export').disabled && !$('#safety-badge'),
  'Returning visit has no calculated cost or finished plan'
);
check(localStorage.getItem('anvil-studio-v1') === null, 'Startup clears obsolete saved loadouts');
check(!$('#resume-banner').hidden, 'A returning visit offers Resume without restoring inputs');
click('#resume-plan');
await tick();
check($('#step-progress').textContent === '1 of 2 done', 'Explicit Resume restores checked steps');
check($('#gather-count').textContent === '1 of 2 ready', 'Explicit Resume restores gathered books');
check(
  $('#existing-count').textContent === '1',
  'Explicit Resume restores existing item enchantments'
);
console.log(`${checks} DOM interaction checks passed. Visual layout was not tested.`);
window.happyDOM.abort();
