import { nudgeNumber } from './motion.js';

const STORAGE_KEY = 'anvil-studio-sound';
const volumes = {
  click: 0.18,
  step: 0.12,
  enchant: 0.2,
  levelup: 0.18,
  page: 0.12,
  book: 0.12,
  error: 0.14,
  open: 0.12,
  close: 0.1,
  reset: 0.08,
  equip: 0.16,
  saved: 0.13,
};
// Reuse recordings instead of allocating a new audio element on every click.
const recordings = new Map();
let enabled = false;
let current = null;

export function playSound(name) {
  if (!enabled || !Object.hasOwn(volumes, name)) return;
  try {
    current?.pause();
    if (!recordings.has(name)) {
      const audio = new window.Audio(
        new URL('./assets/sounds/' + name + '.ogg', import.meta.url).href
      );
      audio.volume = volumes[name];
      recordings.set(name, audio);
    }
    current = recordings.get(name);
    current.currentTime = 0;
    current.play()?.catch(() => {}); // A blocked sound never interrupts the planner.
  } catch {}
}

export function setupSounds() {
  const toggle = document.querySelector('#sound-enabled');
  const numberValues = new WeakMap();
  const controlTimes = new WeakMap();
  const numberSelector = '#item-uses, [data-book-uses]';
  document
    .querySelectorAll(numberSelector)
    .forEach((input) => numberValues.set(input, input.value));
  function controlClick(control, sound = 'click') {
    // Only text fields emit both focus and click for one activation.
    // Real button presses should still sound when the user clicks quickly.
    if (control.matches('input[type="search"], input[type="text"], textarea')) {
      const now = Date.now();
      if (now - (controlTimes.get(control) ?? -Infinity) < 90) return;
      controlTimes.set(control, now);
    }
    playSound(sound);
  }
  try {
    enabled = localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {}
  toggle.checked = enabled;
  toggle.addEventListener('change', () => {
    enabled = toggle.checked;
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {}
    if (enabled) playSound('click');
    else {
      current?.pause();
      current = null;
    }
  });
  document.addEventListener(
    'click',
    (event) => {
      const control = event.target.closest(
        'button, summary, a[href], input[type="search"], input[type="text"], textarea, #flow-svg [data-step], #flow-svg [data-item-title]'
      );
      if (
        !control ||
        control.disabled ||
        control.id === 'calculate' ||
        control.hasAttribute('data-complete')
      )
        return;
      if (
        control.matches('#steps-tab, #flow-tab') &&
        control.getAttribute('aria-pressed') === 'true'
      )
        return;
      // Copy/download feedback is played on success, not before the action finishes.
      if (control.matches('#share, #copy-share, #download-item-card, a[download]')) return;
      let sound = 'click';
      if (control.matches('#reset')) sound = 'reset';
      else if (control.matches('#preset, [data-theme-choice]')) sound = 'equip';
      else if (control.matches('#help-button, #sources-button, #edit-existing')) sound = 'open';
      else if (control.matches('#close-help, #close-existing, #close-item-card, #close-share'))
        sound = 'close';
      else if (control.matches('#steps-tab, #flow-tab, #item-card')) sound = 'page';
      else if (control.matches('#capture-a, #capture-b')) sound = 'book';
      else if (control.matches('[data-enchant], [data-existing]'))
        sound = control.getAttribute('aria-pressed') === 'true' ? 'page' : 'book';
      else if (control.matches('summary')) sound = control.parentElement.open ? 'close' : 'open';
      controlClick(control, sound);
    },
    true
  );
  document.addEventListener(
    'cancel',
    (event) => {
      if (event.target.tagName === 'DIALOG') playSound('close');
    },
    true
  );
  document.addEventListener('focusin', (event) => {
    const input = event.target;
    if (input.matches(numberSelector)) numberValues.set(input, input.value);
    if (input.matches('input[type="search"], input[type="text"], textarea')) controlClick(input);
  });
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (input.disabled || input.id === 'sound-enabled') return;
    if (input.matches('input[type="checkbox"]') && (!input.dataset.complete || !input.checked))
      playSound(input.hasAttribute('data-gather') && input.checked ? 'book' : 'click');
  });
  function numberFeedback(event) {
    const input = event.target;
    if (!input.matches(numberSelector) || input.disabled) return;
    const previous = numberValues.get(input) ?? input.defaultValue;
    numberValues.set(input, input.value);
    if (input.value === previous || input.value === '' || !Number.isFinite(input.valueAsNumber))
      return;
    nudgeNumber(input, input.valueAsNumber >= Number(previous) ? 1 : -1);
    playSound('click');
  }
  document.addEventListener('input', numberFeedback);
  document.addEventListener('change', numberFeedback);
}
