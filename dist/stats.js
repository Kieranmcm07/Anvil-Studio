import { motionEnabled } from './motion.js';

const active = new Map();
const DURATION = 900;

function stop(element) {
  const counter = active.get(element);
  if (!counter) return;
  window.cancelAnimationFrame(counter.frame);
  active.delete(element);
}

function tween(element, from, value, draw, finish = () => {}) {
  stop(element);
  if (!motionEnabled() || from === value) {
    draw(value);
    finish();
    return;
  }
  draw(from);
  const counter = {
    frame: 0,
    finish: () => {
      draw(value);
      finish();
    },
  };
  active.set(element, counter);
  let start;
  function update(time) {
    if (active.get(element) !== counter) return;
    start ??= time;
    const progress = Math.min(1, Math.max(0, (time - start) / DURATION));
    const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
    draw(Math.round(from + (value - from) * eased));
    if (progress < 1) counter.frame = window.requestAnimationFrame(update);
    else {
      active.delete(element);
      finish();
    }
  }
  counter.frame = window.requestAnimationFrame(update);
}

export function clearStat(element, { immediate = false } = {}) {
  if (element.classList.contains('is-clearing') && !immediate) return;
  const number = element.querySelector('.stat-value');
  const from = Number(number?.textContent) || 0;
  stop(element);
  delete element.dataset.value;
  const finish = () => {
    element.classList.remove('is-clearing');
    element.textContent = '—';
  };
  if (!number || immediate) return finish();
  element.classList.add('is-clearing');
  element.querySelector('.sr-only').textContent = 'Not calculated';
  tween(
    element,
    from,
    0,
    (value) => {
      number.textContent = String(value);
    },
    finish
  );
}

export function setStat(element, value, unit = '') {
  const from = Number(element.querySelector('.stat-value')?.textContent) || 0;
  stop(element);
  element.classList.remove('is-clearing');
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
  const accessible = document.createElement('span');
  accessible.className = 'sr-only';
  accessible.textContent = [value, unit].filter((v) => v !== '').join(' ');
  element.append(accessible);
  tween(element, from, value, (current) => {
    number.textContent = String(current);
  });
}

// Small counts stay readable: update the answer immediately and bounce only when it changes.
const countAnimations = new WeakMap();
export function updateCount(element, text) {
  if (element.textContent === text) return;
  const hadValue = element.textContent !== '';
  element.textContent = text;
  countAnimations.get(element)?.cancel();
  if (!hadValue || !motionEnabled() || !element.animate) return;
  const animation = element.animate(
    [
      { transform: 'translateY(0)' },
      { transform: 'translateY(-4px)', offset: 0.4 },
      { transform: 'translateY(0)' },
    ],
    { duration: 500, easing: 'ease-in-out' }
  );
  countAnimations.set(element, animation);
  active.set(element, { frame: 0, finish: () => animation.finish() });
  animation.finished
    .catch(() => {})
    .finally(() => {
      if (countAnimations.get(element) === animation) {
        active.delete(element);
        countAnimations.delete(element);
      }
    });
}

export function finishCounters() {
  for (const [element, counter] of active) {
    counter.finish();
    stop(element);
  }
}
