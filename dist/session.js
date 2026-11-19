import { readSharedPlan, createShareUrl } from './share.js';
const KEY = 'anvil-studio-session';

export function saveSession(state, progress) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        setup: new URL(createShareUrl(state)).hash,
        progress,
      })
    );
    return true;
  } catch {
    return false;
  }
}
export function readSession(raw) {
  try {
    const text = localStorage.getItem(KEY);
    if (!text || text.length > 20000) return null;
    const saved = JSON.parse(text);
    if (saved.version !== 1 || typeof saved.setup !== 'string') return null;
    const state = readSharedPlan(saved.setup, raw);
    const progress = saved.progress;
    if (
      !state ||
      !progress ||
      typeof progress.signature !== 'string' ||
      !Array.isArray(progress.completed) ||
      progress.completed.length > 13 ||
      !progress.completed.every((step) => Number.isInteger(step) && step >= 1 && step <= 13) ||
      !Array.isArray(progress.gathered) ||
      progress.gathered.length > 13 ||
      !progress.gathered.every((book) => typeof book === 'string' && book.length < 80)
    )
      return null;
    return { state, progress };
  } catch {
    return null;
  }
}
export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
