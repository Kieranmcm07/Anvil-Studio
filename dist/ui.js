import { itemIcon, nameOf, ROMAN } from './data.js';

export const $ = (selector) => document.querySelector(selector);

export function escape(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (character) => entities[character]);
}

export const enchantLabel = (id, level) => `${nameOf(id)} ${ROMAN[level]}`;

export function gearIcon(item) {
  return `<img class="item-sprite" src="${itemIcon(item)}" alt="" width="40" height="40">`;
}
