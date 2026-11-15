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
globalThis.Worker = class {
  postMessage(data) {
    queueMicrotask(() => this.onmessage({ data: { result: structuredClone(optimize(data)) } }));
  }
  terminate() {}
};
const $ = (s) => document.querySelector(s);
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

await import('../dist/app.js');
await tick();
check($('#safety-badge').textContent.includes('Survival safe'), 'Default helmet plan');
const totalBeforeTheme = $('#stat-total').textContent;
for (const theme of ['amethyst', 'ocean', 'ember', 'overworld', 'forest']) {
  $('#theme-picker').open = true;
  click(`[data-theme-choice="${theme}"]`);
  check(document.documentElement.dataset.theme === theme, `${theme}: selected theme applied`);
  check(
    $(`[data-theme-choice="${theme}"]`).getAttribute('aria-pressed') === 'true',
    `${theme}: selection announced`
  );
  check($('#stat-total').textContent === totalBeforeTheme, `${theme}: calculation preserved`);
  check(!$('#theme-picker').open, `${theme}: picker closes after choosing`);
}
check(
  document.querySelectorAll('.background-mob[src]').length === 6,
  'Mob theme loads all six local images'
);
check(
  document.querySelector('.world-background').getAttribute('aria-hidden') === 'true',
  'Mobs are decorative'
);
click('#theme-motion');
check(document.documentElement.dataset.motion === 'off', 'Animation toggle stops motion');
const { loadAppearance } = await import('../dist/themes.js');
check(
  loadAppearance().motion === false && loadAppearance().theme === 'forest',
  'Appearance preferences saved'
);
click('#theme-motion');
check(document.documentElement.dataset.motion === 'on', 'Animation toggle re-enables motion');
motionPreference.matches = true;
motionPreference.listeners.forEach((listener) => listener());
check(
  document.documentElement.dataset.motion === 'off' && !$('#reduced-motion-note').hidden,
  'System reduced-motion preference overrides animations'
);
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
click('[data-complete="1"]');
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
click('#steps-tab');
check($('.check-step.done'), 'Switching views preserves completed steps');
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
check($('#safety-badge').textContent.includes('Survival safe'), 'Bedrock sword plan');
click('[data-edition="java"]');
change('#version', 'java-1.14');
change('#item', 'helmet');
click('[data-enchant="protection"][data-level="4"]');
click('[data-enchant="blast_protection"][data-level="4"]');
click('#calculate');
await tick();
check($('#selection-count').textContent === '2', 'Legacy stacked protections selected');
check(
  $('#safety-badge').textContent.includes('Survival safe'),
  'Legacy protections are survival-safe'
);
change('#version', 'java-26.3');
check($('#selection-count').textContent === '1', 'Modern profile removes legacy conflict');
click('#incompatible');
click('[data-enchant="blast_protection"][data-level="4"]');
click('#calculate');
await tick();
check(
  $('#safety-badge').textContent.includes('Theoretical'),
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
check($('#safety-badge').textContent.includes('Survival safe'), 'Mace plan is executable');
change('#item-uses', '6');
click('#calculate');
await tick();
check($('#safety-badge').textContent === 'Too expensive', 'Impossible plan has no stale success');
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
  check($('#safety-badge').textContent.includes('Survival safe'), `${edition}: shield plan works`);
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
check($('#repository-link').hidden, 'Unknown repository URL does not create a dead link');
const { site, setupGithubLinks } = await import('../dist/config.js');
site.repositoryUrl = 'https://github.com/example/test-repo';
setupGithubLinks();
check(
  !$('#repository-link').hidden && $('#repository-link').href === site.repositoryUrl,
  'Adding a repository URL enables its link'
);
site.repositoryUrl = '';
setupGithubLinks();
console.log(`${checks} DOM interaction checks passed. Visual layout was not tested.`);
window.happyDOM.abort();
