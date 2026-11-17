import { reveal, finishReveals } from './motion.js';
import { finishCounters } from './stats.js';

const STORAGE_KEY = 'anvil-studio-appearance';
export const THEMES = ['forest', 'amethyst', 'ocean', 'ember', 'overworld'];
const themeMobs = {
  forest: ['fox'],
  amethyst: ['shulker'],
  ocean: ['dolphin'],
  ember: ['blaze'],
  overworld: ['creeper', 'bee', 'enderman', 'zombie', 'axolotl', 'skeleton'],
};
const backgrounds = {
  forest: '#101413',
  amethyst: '#16121e',
  ocean: '#0e1720',
  ember: '#1d1413',
  overworld: '#101912',
};

export function loadAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      theme: THEMES.includes(saved?.theme) ? saved.theme : 'forest',
      motion: saved?.motion !== false,
    };
  } catch {
    return { theme: 'forest', motion: true };
  }
}

export function setupThemes() {
  const appearance = loadAppearance();
  const root = document.documentElement;
  const picker = document.querySelector('#theme-picker');
  const motionControl = document.querySelector('#theme-motion');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function apply() {
    root.dataset.theme = appearance.theme;
    applyMotion();
    document.querySelector('meta[name="theme-color"]').content = backgrounds[appearance.theme];
    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.themeChoice === appearance.theme);
    });
    document.querySelectorAll('[data-scene]').forEach((scene) => {
      scene.classList.toggle('is-active', scene.dataset.scene === appearance.theme);
    });
    document.querySelectorAll('[data-mob]').forEach((image) => {
      const visible = themeMobs[appearance.theme].includes(image.dataset.mob);
      if (visible && !image.getAttribute('src')) image.src = image.dataset.mobSrc;
      image.classList.toggle('is-visible', visible);
    });
  }
  function applyMotion() {
    const enabled = appearance.motion && !reducedMotion.matches;
    if (!enabled) {
      finishReveals();
      finishCounters();
    }
    root.dataset.motion = enabled ? 'on' : 'off';
    motionControl.checked = appearance.motion;
    document.querySelector('#reduced-motion-note').hidden = !reducedMotion.matches;
  }
  picker.querySelector('summary').addEventListener('click', (event) => {
    event.preventDefault();
    picker.open = !picker.open;
    if (picker.open) reveal(picker.querySelector('.theme-menu'), { duration: 360 });
  });

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
    } catch {
      // Theme switching still works when browser storage is disabled.
    }
  }

  picker.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-theme-choice]');
    if (!choice) return;
    appearance.theme = choice.dataset.themeChoice;
    apply();
    save();
    picker.open = false;
    picker.querySelector('summary').focus({ preventScroll: true });
  });
  motionControl.addEventListener('change', () => {
    appearance.motion = motionControl.checked;
    applyMotion();
    save();
  });
  reducedMotion.addEventListener('change', applyMotion);
  document.addEventListener('click', (event) => {
    if (!picker.contains(event.target)) picker.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && picker.open) {
      picker.open = false;
      picker.querySelector('summary').focus({ preventScroll: true });
    }
  });
  apply();
}
