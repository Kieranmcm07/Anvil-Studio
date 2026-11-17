const STORAGE_KEY = 'anvil-studio-sound';
let enabled = false;
let current = null;
let lastClick = 0;

export function playSound(name) {
  if (!enabled || !['click', 'anvil', 'levelup'].includes(name)) return;
  if (name === 'click') {
    if (Date.now() - lastClick < 100) return;
    lastClick = Date.now();
  }
  try {
    current?.pause();
    current = new window.Audio(new URL('./assets/sounds/' + name + '.ogg', import.meta.url).href);
    current.volume = name === 'click' ? 0.18 : 0.3;
    current.play()?.catch(() => {}); // A blocked sound never interrupts the planner.
  } catch {}
}
export function setupSounds() {
  const toggle = document.querySelector('#sound-enabled');
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
  document.addEventListener('click', (event) => {
    const control = event.target.closest('button, summary');
    if (control && !control.disabled) playSound('click');
  });
}
