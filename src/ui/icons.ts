/**
 * Ícones SVG próprios do Kaelora (nada de bibliotecas de terceiros).
 * Os coloridos têm contorno escuro grosso, no mesmo estilo toon do 3D.
 */
const S = (body: string, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
const INK = '#14122b';

export const ICONS = {
  coin: S(
    `<circle cx="12" cy="12" r="9.5" fill="#ffc93c" stroke="${INK}" stroke-width="2"/><circle cx="12" cy="12" r="6.2" fill="#ffe27a" stroke="#d8961a" stroke-width="1.4"/><path d="M10.2 8.6v6.8M10.4 12l3.4-3.4M10.6 11.8l3.4 3.6" stroke="#d8961a" stroke-width="1.8" fill="none"/>`,
  ),
  gem: S(
    `<path d="M6 4h12l4 5-10 12L2 9z" fill="#3ff6ff" stroke="${INK}" stroke-width="2"/><path d="M2 9h20M8 4l-2 5 6 12 6-12-2-5" fill="none" stroke="#1876b5" stroke-width="1.3"/><path d="M6 9l2-5h4z" fill="#e9fdff"/>`,
  ),
  trophy: S(
    `<path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="#ffc93c" stroke="${INK}" stroke-width="2"/><path d="M7 5H3.5a3.5 3.5 0 0 0 4 4M17 5h3.5a3.5 3.5 0 0 1-4 4" fill="none" stroke="${INK}" stroke-width="2"/><path d="M10 13h4v4h-4z" fill="#d8961a" stroke="${INK}" stroke-width="2"/><rect x="6.5" y="17" width="11" height="4" rx="1" fill="#a64dff" stroke="${INK}" stroke-width="2"/>`,
  ),
  star: S(
    `<path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6-4.9-4.6 6.6-.8z" fill="#ffd23f" stroke="${INK}" stroke-width="2"/><path d="M12 6l1.6 3.4" stroke="#fff6c0" stroke-width="1.6"/>`,
  ),
  starEmpty: S(
    `<path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6-4.9-4.6 6.6-.8z" fill="#2a2450" stroke="${INK}" stroke-width="2"/>`,
  ),
  energy: S(
    `<path d="M13.5 2L5 13.5h6L9.5 22 19 9.5h-6z" fill="#e14fff" stroke="${INK}" stroke-width="2"/><path d="M12.5 5l-4.5 6.5" stroke="#ffd6ff" stroke-width="1.4"/>`,
  ),
  chest: S(
    `<path d="M3 10h18v10H3z" fill="#c9773a" stroke="${INK}" stroke-width="2"/><path d="M3 10a9 5 0 0 1 18 0z" fill="#e2924c" stroke="${INK}" stroke-width="2"/><path d="M3 13h18" stroke="#ffc93c" stroke-width="2"/><rect x="10" y="11" width="4" height="5" rx="1" fill="#ffc93c" stroke="${INK}" stroke-width="1.6"/>`,
  ),
  city: S(
    `<path d="M3 21V10l5-3v14M8 21V5l6-2v18M14 21V9l7 2v10" fill="#3ff6ff" stroke="${INK}" stroke-width="2"/><path d="M2 21h20" stroke="${INK}" stroke-width="2"/><path d="M10.5 7h1M10.5 10h1M10.5 13h1M17 13h1M17 16h1M5 12h1M5 15h1" stroke="#fff3b0" stroke-width="1.6"/>`,
  ),
  squad: S(
    `<circle cx="8" cy="8" r="3.4" fill="#ff8fcf" stroke="${INK}" stroke-width="2"/><circle cx="16.5" cy="8.5" r="3" fill="#7ff08a" stroke="${INK}" stroke-width="2"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0z" fill="#ff3fb4" stroke="${INK}" stroke-width="2"/><path d="M12 20a5 5 0 0 1 9.5 0z" fill="#2fd46b" stroke="${INK}" stroke-width="2"/>`,
  ),
  swords: S(
    `<path d="M4 3l9 9-2 2-9-9V3z" fill="#e9eefb" stroke="${INK}" stroke-width="1.8"/><path d="M20 3l-9 9 2 2 9-9V3z" fill="#e9eefb" stroke="${INK}" stroke-width="1.8"/><path d="M6.5 15.5l2 2-3 3-2-2zM17.5 15.5l-2 2 3 3 2-2z" fill="#ffc93c" stroke="${INK}" stroke-width="1.8"/><path d="M5 13l6 6M19 13l-6 6" stroke="${INK}" stroke-width="2"/>`,
  ),
  more: S(
    `<rect x="3" y="3" width="7.5" height="7.5" rx="2" fill="#ffc93c" stroke="${INK}" stroke-width="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" fill="#3ff6ff" stroke="${INK}" stroke-width="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" fill="#ff3fb4" stroke="${INK}" stroke-width="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" fill="#7ff08a" stroke="${INK}" stroke-width="2"/>`,
  ),
  gear: S(
    `<path d="M12 2.5l1.6 2.3 2.7-.7.6 2.7 2.7.7-.7 2.7L21.5 12l-2.3 1.6.7 2.7-2.7.6-.7 2.7-2.7-.7L12 21.5l-1.6-2.3-2.7.7-.6-2.7-2.7-.7.7-2.7L2.5 12l2.3-1.6-.7-2.7 2.7-.6.7-2.7 2.7.7z" fill="#b9c3de" stroke="${INK}" stroke-width="1.8"/><circle cx="12" cy="12" r="3.4" fill="#4c5578" stroke="${INK}" stroke-width="1.8"/>`,
  ),
  hammer: S(
    `<path d="M13 3l6 2 2 5-3 1-2-3-3 1z" fill="#b9c3de" stroke="${INK}" stroke-width="1.8"/><path d="M13 9l-9.5 9.5a1.8 1.8 0 0 0 2.5 2.5L15.5 11.5z" fill="#c98a4c" stroke="${INK}" stroke-width="1.8"/>`,
  ),
  build: S(
    `<rect x="3" y="10" width="11" height="11" rx="1.5" fill="#3ff6ff" stroke="${INK}" stroke-width="2"/><path d="M6 14h2M6 17h2M10 14h1M10 17h1" stroke="#fff3b0" stroke-width="1.6"/><circle cx="17.5" cy="7" r="5" fill="#5bff8a" stroke="${INK}" stroke-width="2"/><path d="M17.5 4.5v5M15 7h5" stroke="${INK}" stroke-width="2"/>`,
  ),
  rotate: S(`<path d="M20 12a8 8 0 1 1-2.3-5.7" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M20.5 3.5v5h-5" fill="none" stroke="currentColor" stroke-width="2.6"/>`),
  store: S(`<path d="M4 8h16v12H4z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M2.5 4h19v4h-19z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 11v6M9.5 14.5L12 17l2.5-2.5" fill="none" stroke="currentColor" stroke-width="2.4"/>`),
  check: S(`<path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3.2"/>`),
  close: S(`<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3.2"/>`),
  up: S(`<path d="M12 3l8 9h-5v9H9v-9H4z" fill="#5bff8a" stroke="${INK}" stroke-width="2"/>`),
  info: S(`<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 11v6M12 7.2v.1" stroke="currentColor" stroke-width="2.8"/>`),
  clock: S(`<circle cx="12" cy="12" r="9" fill="#e9eefb" stroke="${INK}" stroke-width="2"/><path d="M12 7v5l3.5 2" fill="none" stroke="${INK}" stroke-width="2.2"/>`),
  play: S(`<path d="M7 4l13 8-13 8z" fill="currentColor"/>`),
  shield: S(`<path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z" fill="#3b8bff" stroke="${INK}" stroke-width="2"/><path d="M12 5.5v13c3-1.3 5.2-3.8 5.2-7.3V7.4z" fill="#8fc0ff"/>`),
  book: S(`<path d="M3 5c3-1.5 6-1.5 9 0v15c-3-1.5-6-1.5-9 0z" fill="#ff8fcf" stroke="${INK}" stroke-width="2"/><path d="M21 5c-3-1.5-6-1.5-9 0v15c3-1.5 6-1.5 9 0z" fill="#a64dff" stroke="${INK}" stroke-width="2"/>`),
  calendar: S(`<rect x="3" y="5" width="18" height="16" rx="2" fill="#e9eefb" stroke="${INK}" stroke-width="2"/><path d="M3 9.5h18" stroke="${INK}" stroke-width="2"/><rect x="3" y="5" width="18" height="4.5" rx="2" fill="#ff4f5e" stroke="${INK}" stroke-width="2"/><path d="M8 3v4M16 3v4" stroke="${INK}" stroke-width="2"/><path d="M7.5 13.5h2v2h-2zM11 13.5h2v2h-2zM14.5 13.5h2v2h-2z" fill="${INK}"/>`),
  pass: S(`<path d="M3 7a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4z" fill="#ffc93c" stroke="${INK}" stroke-width="2"/><path d="M12 8.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" fill="#ff3fb4" stroke="${INK}" stroke-width="1.2"/>`),
  shop: S(`<path d="M4 8h16l-1.5 13h-13z" fill="#5bff8a" stroke="${INK}" stroke-width="2"/><path d="M8.5 10V6.5a3.5 3.5 0 0 1 7 0V10" fill="none" stroke="${INK}" stroke-width="2"/>`),
  user: S(`<circle cx="12" cy="8" r="4.5" fill="#ffd9b8" stroke="${INK}" stroke-width="2"/><path d="M3.5 21a8.5 8.5 0 0 1 17 0z" fill="#3ff6ff" stroke="${INK}" stroke-width="2"/>`),
  ranking: S(`<rect x="9" y="6" width="6" height="15" fill="#ffc93c" stroke="${INK}" stroke-width="2"/><rect x="2.5" y="11" width="6.5" height="10" fill="#b9c3de" stroke="${INK}" stroke-width="2"/><rect x="15" y="14" width="6.5" height="7" fill="#e2924c" stroke="${INK}" stroke-width="2"/><path d="M12 2l.8 1.7 1.8.2-1.3 1.2.3 1.8-1.6-.9-1.6.9.3-1.8-1.3-1.2 1.8-.2z" fill="#ffd23f"/>`),
  target: S(`<circle cx="12" cy="12" r="9.5" fill="#ff4f5e" stroke="${INK}" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="#fff" stroke="${INK}" stroke-width="1.6"/><circle cx="12" cy="12" r="2.6" fill="#ff4f5e" stroke="${INK}" stroke-width="1.6"/>`),
  versus: S(`<path d="M2 5h4l3 9 3-9h4" fill="none" stroke="#3ff6ff" stroke-width="2.6"/><path d="M21 6c-2-1.6-6-1-6 1.5 0 3.5 6 2 6 5.8 0 2.4-4 3-6.2 1.2" fill="none" stroke="#ff3fb4" stroke-width="2.6"/><path d="M2 20h20" stroke="#ffc93c" stroke-width="2"/>`),
  flame: S(`<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 1.5-4.5 3-6 0 2 1 3 2 3 0-3-1-6 1-9z" fill="#ff5a3d" stroke="${INK}" stroke-width="2"/><path d="M12 13c1.5 1.5 3 2.5 3 4.5a3 3 0 0 1-6 0c0-1.5 1-2.5 3-4.5z" fill="#ffd23f"/>`),
  fullscreen: S(`<path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" fill="none" stroke="currentColor" stroke-width="2.6"/>`),
  back: S(`<path d="M15 4l-8 8 8 8" fill="none" stroke="currentColor" stroke-width="3.2"/>`),
  lock: S(`<rect x="4.5" y="10" width="15" height="11" rx="2" fill="#b9c3de" stroke="${INK}" stroke-width="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="12" cy="15.5" r="1.6" fill="${INK}"/>`),
  plus: S(`<path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" stroke-width="3.2"/>`),
  gift: S(`<rect x="3" y="9" width="18" height="12" rx="1.5" fill="#ff3fb4" stroke="${INK}" stroke-width="2"/><rect x="2" y="6.5" width="20" height="4" rx="1" fill="#ff8fcf" stroke="${INK}" stroke-width="2"/><path d="M12 6.5V21" stroke="#ffd23f" stroke-width="3"/><path d="M12 6.5C10 2 6 3 7.5 6.5M12 6.5C14 2 18 3 16.5 6.5" fill="none" stroke="${INK}" stroke-width="2"/>`),
  mission: S(`<rect x="4" y="3" width="16" height="18" rx="2" fill="#e9eefb" stroke="${INK}" stroke-width="2"/><path d="M8 8l1.5 1.5L12 7M8 13l1.5 1.5L12 12M8 18h.1" fill="none" stroke="#2fd46b" stroke-width="2"/><path d="M14 8.5h3M14 13.5h3M11 18h6" stroke="${INK}" stroke-width="1.8"/>`),
  heal: S(`<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="#5bff8a" stroke="${INK}" stroke-width="2"/>`),
  sword: S(`<path d="M20 3l-1 5L8 19l-3-3L16 5z" fill="#e9eefb" stroke="${INK}" stroke-width="1.8"/><path d="M4 14l6 6M3 21l3-3" stroke="${INK}" stroke-width="2"/>`),
  heart: S(`<path d="M12 20.5S3 15 3 8.8A4.8 4.8 0 0 1 12 6.3a4.8 4.8 0 0 1 9 2.5c0 6.2-9 11.7-9 11.7z" fill="#ff4f5e" stroke="${INK}" stroke-width="2"/>`),
  speed: S(`<path d="M3 15a9 9 0 0 1 18 0" fill="none" stroke="#3ff6ff" stroke-width="3"/><path d="M12 15l4.5-5.5" stroke="${INK}" stroke-width="2.4"/><circle cx="12" cy="15" r="2" fill="${INK}"/>`),
  range: S(`<circle cx="12" cy="12" r="9" fill="none" stroke="#3ff6ff" stroke-width="2" stroke-dasharray="3 2.4"/><circle cx="12" cy="12" r="3" fill="#ff3fb4" stroke="${INK}" stroke-width="1.6"/>`),
  wrench: S(`<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" fill="#b9c3de" stroke="${INK}" stroke-width="1.8"/>`),
  bolt: S(`<path d="M13.5 2L5 13.5h6L9.5 22 19 9.5h-6z" fill="#ffe14f" stroke="${INK}" stroke-width="2"/>`),
  replay: S(`<path d="M4 12a8 8 0 1 0 2.3-5.7" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M3.5 3.5v5h5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M10 9l5 3-5 3z" fill="currentColor"/>`),
  share: S(`<circle cx="18" cy="5" r="2.6" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="6" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="18" cy="19" r="2.6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8.3 10.8l7.4-4.3M8.3 13.2l7.4 4.3" stroke="currentColor" stroke-width="2.2"/>`),
  pause: S(`<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>`),
  flag: S(`<path d="M5 21V3" stroke="${INK}" stroke-width="2.4"/><path d="M5 4h13l-3 4 3 4H5z" fill="#ff4f5e" stroke="${INK}" stroke-width="2"/>`),
  skull: S(`<path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.3 4.2 3 5.2V20h10v-3.8c1.7-1 3-2.6 3-5.2a8 8 0 0 0-8-8z" fill="#e9eefb" stroke="${INK}" stroke-width="2"/><circle cx="9" cy="11.5" r="2" fill="${INK}"/><circle cx="15" cy="11.5" r="2" fill="${INK}"/><path d="M10 20v-2M14 20v-2" stroke="${INK}" stroke-width="1.6"/>`),
  install: S(`<path d="M12 3v12M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.8"/><path d="M4 17v3h16v-3" fill="none" stroke="currentColor" stroke-width="2.8"/>`),
  sound: S(`<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.2"/>`),
  music: S(`<path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="6.5" cy="18" r="2.6" fill="currentColor"/><circle cx="17.5" cy="16" r="2.6" fill="currentColor"/>`),
  ult: S(`<path d="M12 1.5l2.6 6.2 6.7.5-5.1 4.4 1.6 6.5L12 15.6l-5.8 3.5 1.6-6.5-5.1-4.4 6.7-.5z" fill="#ff3fb4" stroke="${INK}" stroke-width="2"/><circle cx="12" cy="10.5" r="2.6" fill="#fff"/>`),
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, cls = 'icon'): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = cls;
  span.innerHTML = ICONS[name];
  return span;
}
