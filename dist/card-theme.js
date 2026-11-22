import { THEMES, themeMobs, backgrounds } from './themes.js';

export function cardAppearance() {
  const theme = THEMES.includes(document.documentElement.dataset.theme)
    ? document.documentElement.dataset.theme
    : 'forest';
  const style = window.getComputedStyle(document.documentElement);
  const colour = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    theme,
    background: colour('--surface', backgrounds[theme]),
    text: colour('--text', '#edf1e9'),
    muted: colour('--muted', '#acb7a5'),
    accent: colour('--accent', '#b6ed86'),
    border: colour('--accent-border', '#536e41'),
    mobs: themeMobs[theme].slice(0, 2).map((mob) => './assets/mobs/' + mob + '.png'),
  };
}

export function mountCardScenery(container, appearance) {
  const layer = document.createElement('div');
  layer.className = 'card-scenery';
  layer.setAttribute('aria-hidden', 'true');
  const original = document.querySelector(
    '.world-background [data-scene="' + appearance.theme + '"]'
  );
  if (original) {
    const scene = original.cloneNode(true);
    scene.removeAttribute('data-scene');
    scene.classList.add('is-active');
    layer.append(scene);
  }
  appearance.mobs.forEach((src) => {
    const mob = document.createElement('img');
    mob.className = 'card-mob';
    mob.alt = '';
    mob.src = src;
    layer.append(mob);
  });
  container.prepend(layer);
}

export function loadCardImage(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('A card image could not load. Refresh and try again.'));
    image.src = src;
  });
}

// Freeze the same page scenery into the downloadable PNG.
export function sceneryImage(appearance, width, height) {
  const original = document.querySelector(
    '.world-background [data-scene="' + appearance.theme + '"] .scene-landscape'
  );
  const landscape = original?.cloneNode(true);
  if (landscape) {
    landscape.removeAttribute('class');
    landscape.setAttribute('x', '0');
    landscape.setAttribute('y', String(height - 180));
    landscape.setAttribute('width', String(width));
    landscape.setAttribute('height', '180');
    landscape.setAttribute('fill', appearance.accent);
    landscape.setAttribute('opacity', '.16');
    landscape.querySelectorAll('.scene-line').forEach((path) => {
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', appearance.accent);
      path.setAttribute('stroke-width', '2');
    });
  }
  const particles = Array.from({ length: 16 }, (_, i) => {
    const x = 22 + ((i * 127) % (width - 44));
    const y = 40 + ((i * 83) % (height - 80));
    if (appearance.theme === 'ocean')
      return `<circle cx="${x}" cy="${y}" r="4" fill="none" stroke="${appearance.accent}"/>`;
    if (appearance.theme === 'amethyst') return `<path d="M${x} ${y - 5}l4 5-4 5-4-5Z"/>`;
    return `<rect x="${x}" y="${y}" width="3" height="${appearance.theme === 'ember' ? 6 : 3}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${landscape?.outerHTML || ''}<g fill="${appearance.accent}" opacity=".22">${particles}</g></svg>`;
  return loadCardImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
}
