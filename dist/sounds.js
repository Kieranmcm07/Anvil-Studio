import { nudgeNumber } from './motion.js';

const STORAGE_KEY = 'anvil-studio-sound';
const volumes = { click: 0.18, step: 0.12, enchant: 0.2, levelup: 0.18 };
let enabled = false;
let current = null;

export function playSound(name) {
  if (!enabled || !Object.hasOwn(volumes, name)) return;
  try {
    current?.pause();
    current = new window.Audio(new URL('./assets/sounds/' + name + '.ogg', import.meta.url).href);
    current.volume = volumes[name];
    current.play()?.catch(() => {}); // A blocked sound never interrupts the planner.
  } catch {}
}

export function setupSounds() {
  const toggle = document.querySelector('#sound-enabled');
  const numberValues = new WeakMap();
  const selectValues = new WeakMap();
  document.querySelectorAll('select').forEach((select) => selectValues.set(select, select.value));
  const controlTimes = new WeakMap();
  const numberSelector = '#item-uses, [data-book-uses]';
  document
    .querySelectorAll(numberSelector)
    .forEach((input) => numberValues.set(input, input.value));
  function controlClick(control) {
    // Focus and click can describe the same text-field activation.
    const now = Date.now();
    if (now - (controlTimes.get(control) ?? -Infinity) < 90) return;
    controlTimes.set(control, now);
    playSound('click');
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
        'button, summary, a[href], input[type="search"], input[type="text"], textarea'
      );
      if (
        !control ||
        control.disabled ||
        control.id === 'calculate' ||
        control.hasAttribute('data-complete')
      )
        return;
      controlClick(control);
    },
    true
  );
  document.addEventListener('focusin', (event) => {
    const input = event.target;
    if (input.matches(numberSelector)) numberValues.set(input, input.value);
    if (input.matches('select')) selectValues.set(input, input.value);
    if (input.matches('input[type="search"], input[type="text"], textarea')) controlClick(input);
  });
  document.addEventListener('pointerdown', (event) => {
    const select = event.target.closest('select');
    if (select) selectValues.set(select, select.value);
  });
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (input.disabled || input.id === 'sound-enabled') return;
    if (input.matches('select')) {
      const previous = selectValues.get(input);
      selectValues.set(input, input.value);
      if (previous !== input.value) playSound('click');
    }
    if (input.matches('input[type="checkbox"]') && (!input.dataset.complete || !input.checked))
      playSound('click');
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
