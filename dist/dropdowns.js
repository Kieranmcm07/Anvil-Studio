// Keep the browser's native options and keyboard navigation.
// showPicker support varies, so failed calls leave the default interaction intact.
export function setupDropdowns(playClick) {
  const values = new WeakMap();
  const manualClicks = new WeakSet();
  let soundedSelect = null;
  let pointer = null;
  document.querySelectorAll('select').forEach((select) => values.set(select, select.value));
  function targetSelect(target) {
    return target.closest('select') || target.closest('label')?.querySelector('select');
  }
  function usable(select) {
    return select && !select.disabled && !select.multiple && select.size <= 1;
  }
  function isOpen(select) {
    try {
      return select.matches(':open');
    } catch {
      return false;
    }
  }
  function opened(select) {
    soundedSelect = select;
    playClick();
  }
  document.addEventListener('focusin', (event) => {
    const select = event.target.closest('select');
    if (select) values.set(select, select.value);
  });
  document.addEventListener('pointerdown', (event) => {
    const select = targetSelect(event.target);
    soundedSelect = null;
    pointer = null;
    if (!usable(select) || event.button !== 0) return;
    manualClicks.delete(select);
    values.set(select, select.value);
    if (isOpen(select)) return;
    pointer = { select, x: event.clientX, y: event.clientY };
    if (event.pointerType !== 'mouse' || !select.showPicker) return;
    try {
      select.focus({ preventScroll: true });
      select.showPicker();
      // Cancel the default mouse action so it cannot immediately close the picker.
      event.preventDefault();
      pointer = null;
      manualClicks.add(select);
      opened(select);
    } catch {
      // Safari, embedded browsers and blocked pickers retain their normal behaviour.
    }
  });
  document.addEventListener('pointerup', (event) => {
    const select = targetSelect(event.target);
    const started = pointer;
    pointer = null;
    if (
      !usable(select) ||
      started?.select !== select ||
      event.button !== 0 ||
      soundedSelect === select ||
      isOpen(select) ||
      Math.hypot(event.clientX - started.x, event.clientY - started.y) > 12
    )
      return;
    values.set(select, select.value);
    opened(select);
  });
  document.addEventListener('pointercancel', () => {
    pointer = null;
  });
  document.addEventListener(
    'click',
    (event) => {
      const select = targetSelect(event.target);
      if (select && manualClicks.has(select)) {
        manualClicks.delete(select);
        event.preventDefault();
      }
    },
    true
  );
  document.addEventListener('change', (event) => {
    const select = event.target.closest('select');
    if (!select || select.disabled) return;
    const previous = values.get(select);
    values.set(select, select.value);
    if (previous !== select.value && soundedSelect !== select) playClick();
    soundedSelect = null;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Tab') soundedSelect = null;
  });
  document.addEventListener('focusout', (event) => {
    if (event.target.closest('select') === soundedSelect) soundedSelect = null;
  });
}
