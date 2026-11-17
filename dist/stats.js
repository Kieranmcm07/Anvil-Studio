import { motionEnabled } from './motion.js';

const previous = new Map();
const active = new Map();

function stop(element) {
  const counter = active.get(element);
  if (!counter) return;
  window.cancelAnimationFrame(counter.frame);
  active.delete(element);
}

export function clearStat(element) {
  stop(element);
  delete element.dataset.value;
  element.textContent = '—';
}

export function setStat(element, value, unit = '') {
  stop(element);
  const from = previous.get(element.id) ?? 0;
  previous.set(element.id, value);
  element.dataset.value = String(value);
  element.replaceChildren();
  const number = document.createElement('span');
  number.className = 'stat-value';
  number.setAttribute('aria-hidden', 'true');
  element.append(number);
  if (unit) {
    const suffix = document.createElement('em');
    suffix.textContent = unit;
    suffix.setAttribute('aria-hidden', 'true');
    element.append(suffix);
  }
  // Assistive technology gets the final answer once, not every animation frame.
  const accessible = document.createElement('span');
  accessible.className = 'sr-only';
  accessible.textContent = [value, unit].filter((v) => v !== '').join(' ');
  element.append(accessible);
  number.textContent = String(value);
  if (!motionEnabled() || from === value) return;
  number.textContent = String(from);
  const counter = { frame: 0, number, value };
  active.set(element, counter);
  let start;
  function update(time) {
    if (active.get(element) !== counter) return;
    start ??= time;
    const progress = Math.min(1, Math.max(0, (time - start) / 420));
    number.textContent = String(Math.round(from + (value - from) * (1 - (1 - progress) ** 3)));
    if (progress < 1) counter.frame = window.requestAnimationFrame(update);
    else active.delete(element);
  }
  counter.frame = window.requestAnimationFrame(update);
}

export function finishCounters() {
  for (const [element, counter] of active) {
    counter.number.textContent = String(counter.value);
    stop(element);
  }
}
