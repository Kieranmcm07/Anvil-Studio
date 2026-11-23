const activeReveals = new WeakMap();
const running = new Set();

export function motionEnabled() {
  return (
    document.documentElement.dataset.motion !== 'off' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function reveal(element, { fadeOnly = false, duration = 260 } = {}) {
  if (!element || element.hidden || !motionEnabled() || !element.animate) return;
  activeReveals.get(element)?.cancel();
  const animation = element.animate(
    fadeOnly
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
    { duration, easing: 'cubic-bezier(.2,.7,.2,1)' }
  );
  if (animation) {
    running.add(animation);
    animation.finished.catch(() => {}).finally(() => running.delete(animation));
    activeReveals.set(element, animation);
  }
}

// Keep the outgoing plan as a non-interactive picture while the real DOM updates.
const departures = new Map();
export function finishDepartures() {
  for (const [element, { animation, picture }] of departures) {
    animation.cancel();
    picture.remove();
    departures.delete(element);
  }
}
export function depart(element) {
  finishDepartures();
  if (!element || element.hidden || !motionEnabled() || !element.animate) return;
  const host = element.parentElement;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const bounds = host.getBoundingClientRect();
  const picture = element.cloneNode(true);
  for (const node of [picture, ...picture.querySelectorAll('*')]) {
    for (const attr of [...node.attributes])
      if (attr.name === 'id' || attr.name.startsWith('data-') || attr.name === 'name')
        node.removeAttribute(attr.name);
  }
  picture.inert = true;
  picture.setAttribute('aria-hidden', 'true');
  picture.classList.add('departing-plan');
  Object.assign(picture.style, {
    top: rect.top - bounds.top + host.scrollTop + 'px',
    left: rect.left - bounds.left + 'px',
    width: rect.width + 'px',
    height: rect.height + 'px',
  });
  host.append(picture);
  const animation = picture.animate(
    [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(-12px)' },
    ],
    { duration: 260, easing: 'ease-in', fill: 'forwards' }
  );
  departures.set(element, { animation, picture });
  animation.finished
    .catch(() => {})
    .finally(() => {
      picture.remove();
      if (departures.get(element)?.picture === picture) departures.delete(element);
    });
}

export function finishReveals() {
  finishDepartures();
  for (const animation of running) animation.finish();
}
function tap(element) {
  if (!motionEnabled() || !element?.animate) return;
  const animation = element.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(.92)' }, { transform: 'scale(1)' }],
    { duration: 180, easing: 'ease-out' }
  );
  running.add(animation);
  animation.finished.catch(() => {}).finally(() => running.delete(animation));
}
const numberAnimations = new WeakMap();
export function nudgeNumber(element, direction) {
  numberAnimations.get(element)?.cancel();
  if (!motionEnabled() || !element.animate) return;
  const animation = element.animate(
    [
      { transform: 'translateY(0)' },
      { transform: 'translateY(' + (direction > 0 ? -4 : 4) + 'px)', offset: 0.4 },
      { transform: 'translateY(0)' },
    ],
    { duration: 360, easing: 'ease-out' }
  );
  numberAnimations.set(element, animation);
  running.add(animation);
  animation.finished.catch(() => {}).finally(() => running.delete(animation));
}
export function setupMotion() {
  const loadDialogMobs = (dialog) => {
    dialog.querySelectorAll('[data-dialog-mob]').forEach((image) => {
      if (!image.getAttribute('src')) image.src = image.dataset.dialogMob;
    });
  };
  const observer = new window.MutationObserver((changes) => {
    for (const { target } of changes) if (target.open) loadDialogMobs(target);
  });
  document.querySelectorAll('dialog').forEach((dialog) => {
    observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    if (dialog.open) loadDialogMobs(dialog);
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('#reset, #preset');
    if (button) tap(button);
  });
  document.addEventListener('change', (event) => {
    if (event.target.matches('input[type="checkbox"]')) tap(event.target);
  });
  document.addEventListener(
    'toggle',
    (event) => {
      if (event.target.tagName !== 'DETAILS' || !event.target.open) return;
      // The theme menu animates directly on click; don't start it again on toggle.
      if (event.target.id === 'theme-picker') return;
      for (const child of event.target.children) {
        if (child.tagName !== 'SUMMARY') reveal(child);
      }
    },
    true
  );
}

const enchantBursts = new WeakMap();
export function enchantParticles(item, completed = true) {
  if (!item) return;
  enchantBursts.get(item)?.();
  if (!completed || !motionEnabled() || !item.animate) return;
  const layer = document.createElement('span');
  layer.className = 'enchant-particles';
  layer.setAttribute('aria-hidden', 'true');
  item.append(layer);
  const animations = [];
  const cancel = () => {
    for (const animation of animations) animation.cancel();
    layer.remove();
    enchantBursts.delete(item);
  };
  enchantBursts.set(item, cancel);
  for (let i = 0; i < 6; i++) {
    const glyph = document.createElement('span');
    glyph.className = 'enchant-glyph';
    glyph.style.backgroundImage = `url('./assets/effects/sga_${'abcdef'[i]}.png')`;
    layer.append(glyph);
    const angle = (i / 6) * Math.PI * 2;
    const x = Math.round(Math.cos(angle) * 42);
    const y = Math.round(Math.sin(angle) * 30);
    const animation = glyph.animate(
      [
        { opacity: 0, transform: `translate(${x}px, ${y}px) scale(1)` },
        { opacity: 0.85, offset: 0.2 },
        { opacity: 0, transform: 'translate(0, 0) scale(.5)' },
      ],
      { duration: 1100, delay: i * 65, easing: 'ease-in', fill: 'both' }
    );
    animations.push(animation);
    running.add(animation);
    animation.finished.catch(() => {}).finally(() => running.delete(animation));
  }
  Promise.all(animations.map((animation) => animation.finished.catch(() => {}))).then(() => {
    layer.remove();
    if (enchantBursts.get(item) === cancel) enchantBursts.delete(item);
  });
}
