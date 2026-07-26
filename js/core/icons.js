/* Minimal single-weight icon set. Icons only appear where they carry meaning. */
const paths = {
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/><path d="M9.5 21v-6h5v6"/>',
  sparkle: '<path d="M12 4l1.6 4.6L18 10l-4.4 1.4L12 16l-1.6-4.6L6 10l4.4-1.4Z"/><path d="M18 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z"/>',
  play: '<path d="M8 5.5v13l11-6.5Z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  radar: '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7a5 5 0 1 0 5 5"/><path d="M12 12l6-6"/>',
  building: '<path d="M6 21V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16"/><path d="M3 21h18M10 8h4M10 12h4M10 16h4"/>',
  columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  send: '<path d="M21 3 3 10.5l7 2.5 2.5 7Z"/><path d="M21 3l-11 11"/>',
  inbox: '<path d="M4 13h4l1.5 2.5h5L16 13h4"/><path d="M6.5 5h11l3.5 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5Z"/>',
  timer: '<path d="M10 3h4M12 14v-4"/><path d="M20 13a8 8 0 1 1-3-6.2"/><path d="M20 4v4h-4"/>',
  code: '<path d="m9 8-4 4 4 4M15 8l4 4-4 4"/>',
  layers: '<path d="m12 3 8 4.5-8 4.5-8-4.5Z"/><path d="m4 12 8 4.5 8-4.5"/><path d="m4 16.5 8 4.5 8-4.5"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3.5 9h17M3.5 15h17"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M3 12h18"/>',
  "check-square": '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-13.6-4.6L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 13.6 4.6L20 16"/><path d="M20 20v-4h-4"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14.5h2"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 17v-5M12.5 17V8M17 17v-7"/>',
  dollar: '<path d="M12 3v18"/><path d="M16 7.5c0-1.7-1.8-2.5-4-2.5s-4 .9-4 2.8c0 4 8 1.8 8 5.7 0 2-1.8 2.9-4 2.9s-4-.9-4-2.6"/>',
  flask: '<path d="M9 3h6M10 3v5L5 19a1 1 0 0 0 .9 1.5h12.2A1 1 0 0 0 19 19l-5-11V3"/><path d="M7.5 14h9"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  note: '<path d="M5 4h14v11l-5 5H5Z"/><path d="M14 20v-5h5M9 9h6M9 13h4"/>',
  activity: '<path d="M3 12h4l2.5-7 4 14L16 12h5"/>',
  plug: '<path d="M9 3v6M15 3v6"/><path d="M6 9h12v2a6 6 0 0 1-12 0Z"/><path d="M12 17v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M4.6 7.5l2.2 1.3M17.2 15.2l2.2 1.3M4.6 16.5l2.2-1.3M17.2 8.8l2.2-1.3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  circle: '<circle cx="12" cy="12" r="8.5"/>',
  alert: '<path d="M12 4l9 15.5H3Z"/><path d="M12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  "chevron-down": '<path d="m6 9.5 6 6 6-6"/>',
  "arrow-right": '<path d="M4 12h15"/><path d="m13.5 6.5 6 5.5-6 5.5"/>',
  "arrow-up-right": '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 6.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h1.5"/>',
  trash: '<path d="M5 7h14"/><path d="M9 7V4.5h6V7"/><path d="M7 7l1 13h8l1-13"/>',
  upload: '<path d="M12 16V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4 20h16"/>',
  download: '<path d="M12 4v12"/><path d="m7.5 11.5 4.5 4.5 4.5-4.5"/><path d="M4 20h16"/>',
  eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  phone: '<path d="M6 3h3l2 5-2.5 1.5a10 10 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 4 5a2 2 0 0 1 2-2Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  star: '<path d="m12 4 2.4 5.2 5.6.7-4.1 3.9 1 5.6-4.9-2.8-4.9 2.8 1-5.6L4 9.9l5.6-.7Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  bolt: '<path d="M13 3 5 14h5l-1 7 8-11h-5Z"/>',
  tool: '<path d="M14.5 6.5a4 4 0 0 1 5 5l-8 8a2.8 2.8 0 0 1-4-4Z"/><path d="m6 6 3 3"/>',
  "message": '<path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/>',
  file: '<path d="M6 3h7l5 5v13H6Z"/><path d="M13 3v5h5"/>',
  smartphone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
  link: '<path d="M9.5 14.5 14.5 9.5"/><path d="M11 7l1.5-1.5a3.5 3.5 0 0 1 5 5L16 12"/><path d="M13 17l-1.5 1.5a3.5 3.5 0 0 1-5-5L8 12"/>',
};

export function icon(name) {
  const body = paths[name] || paths.circle;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/* Lets static HTML declare icons with data-icon instead of inlining SVG. */
export function hydrateIcons(root) {
  const scope = root || (typeof document !== "undefined" ? document : null);
  if (!scope?.querySelectorAll) return;
  scope.querySelectorAll("[data-icon]").forEach((element) => {
    if (element.childElementCount === 0) element.innerHTML = icon(element.dataset.icon);
  });
}
