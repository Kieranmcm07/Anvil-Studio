const activeReveals = new WeakMap();

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
    animation.finished.catch(() => {});
    activeReveals.set(element, animation);
  }
}

export function setupMotion() {
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
