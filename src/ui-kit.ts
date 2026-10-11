export function icon(name: string, size = 20): string {
  const paths: Record<string, string> = {
    tank: '<path d="M3 13h18v6H3zM7 8h9v5H7zM12 8V4h9M6 19v2m12-2v2"/>',
    target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/>',
    route: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h8a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h8"/>',
    shield: '<path d="M12 2 3 6v7c0 5 9 9 9 9s9-4 9-9V6zM8 12l3 3 5-6"/>',
    settings: '<path d="m10 2-1 3-3 1-3-1-2 4 3 2v3l-2 2 2 4 3-1 3 1 1 3h4l1-3 3-1 3 1 2-4-3-2v-3l2-2-2-4-3 1-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>', controller: '<path d="M7 8h10c3 0 5 10 3 11-2 1-4-3-5-3H9c-1 0-3 4-5 3C2 18 4 8 7 8zM7 10v4m-2-2h4m7-1h1m1 3h1M12 8V4"/>',
    volume: '<path d="m3 9 4 0 5-4v14l-5-4H3zM16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 .5-1 1-1 2m0 3v.1"/>',
    pause: '<path d="M8 5v14m8-14v14"/>', fullscreen: '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>', camera: '<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="4"/><path d="m8 6 2-3h4l2 3"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths['tank']}</svg>`;
}
export function silhouette(color: number, family: string): string {
  const fill = `#${color.toString(16).padStart(6, '0')}`;
  const turret = family === 'eastern' ? 'M53 24Q68 8 91 23L101 34H47Z' : family === 'futuristic' ? 'M49 19 85 13 104 29 49 33Z' : 'M51 19 88 20 104 31 46 33Z';
  return `<svg class="tank-silhouette" viewBox="0 0 160 66" aria-hidden="true"><defs><linearGradient id="metal-${color}-${family}" x2="0" y2="1"><stop stop-color="${fill}"/><stop offset="1" stop-color="#293232"/></linearGradient></defs><g fill="url(#metal-${color}-${family})" stroke="#a4afa5" stroke-opacity=".35"><path d="M18 34 116 30 139 42 128 54H26L16 46Z"/><path d="${turret}"/><path d="M95 25h59v5H95Z"/><path d="M26 44h100v13H26z" fill="#151b1b"/>${[35,51,67,83,99,115].map(x => `<circle cx="${x}" cy="49" r="5" fill="${fill}"/>`).join('')}</g></svg>`;
}
export function required<T extends Element>(selector: string, type: { new(...args: never[]): T }): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new TypeError(`Missing element: ${selector}`);
  return element;
}
export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
