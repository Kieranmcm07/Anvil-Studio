const activeReveals = new WeakMap();
const running = new Set();

export function motionEnabled() {
  return (
    document.documentElement.dataset.motion !== 'off' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function reveal(element) {
  if (!element || element.hidden || !motionEnabled() || !element.animate) return;
  activeReveals.get(element)?.cancel();
  const animation = element.animate(
    [
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' }
  );
  if (animation) {
    running.add(animation);
    animation.finished.catch(() => {}).finally(() => running.delete(animation));
    activeReveals.set(element, animation);
  }
}

export function finishReveals() {
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
export function setupMotion() {
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
      // The theme menu has its own CSS entrance; don't restart it with a second animation.
      if (event.target.id === 'theme-picker') return;
      for (const child of event.target.children) {
        if (child.tagName !== 'SUMMARY') reveal(child);
      }
    },
    true
  );
}
