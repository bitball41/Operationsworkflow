const paths = {
  "layout-dashboard": '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  "columns-3": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18M15 3v18"/>',
  radar: '<path d="M20.2 20.2c2.4-2.4 2.4-6.3 0-8.7s-6.3-2.4-8.7 0-2.4 6.3 0 8.7 6.3 2.4 8.7 0Z"/><path d="M16 16 3 3M16 4v4M4 16h4"/>',
  "building-2": '<path d="M6 22V4c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v18M6 12H4c-.6 0-1 .4-1 1v9h18v-9c0-.6-.4-1-1-1h-2M10 7h4M10 11h4M10 15h4M10 19h4"/>',
  "scan-search": '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="11" cy="11" r="3"/><path d="m16 16-2.5-2.5"/>',
  "panels-top-left": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/>',
  "monitor-up": '<path d="M12 13V7M9 10l3-3 3 3"/><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="m5.5 5.5-3.5 6.5v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.5Z"/>',
  "timer-reset": '<path d="M10 2h4M12 14v-4M4 13a8 8 0 1 0 3-6.2L4 10"/><path d="M4 4v6h6"/>',
  "shield-check": '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3Z"/><path d="m9 12 2 2 4-4"/>',
  "briefcase-business": '<path d="M12 12h.01"/><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2 13a18 18 0 0 0 20 0"/>',
  "chart-no-axes-combined": '<path d="M12 16v5M16 14v7M20 10v11M4 21v-7M8 21v-9"/><path d="m4 10 4-4 4 4 8-8"/>',
  "wallet-cards": '<rect width="18" height="13" x="3" y="6" rx="2"/><path d="M16 13h2M3 10h18M7 6V4h10a2 2 0 0 1 2 2"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  "settings-2": '<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M10.3 21a2 2 0 0 0 3.4 0M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>',
  "panel-right-open": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18M10 15l-3-3 3-3"/>',
  "more-horizontal": '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  "check-circle-2": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  "circle-dollar-sign": '<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  "mouse-pointer-click": '<path d="m9 9 5 12 1.8-5.2L21 14ZM7.2 2.2 8 5.1M4.1 6.1l-2.9-.8M5.1 8l-2.9.8M6.1 4.1 4 2"/>',
  "trending-up": '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  dollar: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  filter: '<path d="M3 6h18M7 12h10M10 18h4"/>',
  "arrow-up-right": '<path d="M7 17 17 7M7 7h10v10"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  star: '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  upload: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 21h14"/>',
  "file-code-2": '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z"/><polyline points="14 2 14 8 20 8"/><path d="m10 13-2 2 2 2M14 17l2-2-2-2"/>',
  "badge-dollar-sign": '<path d="M3.9 14.9A3.1 3.1 0 0 1 9.1 20a3.1 3.1 0 0 1 5.8 0 3.1 3.1 0 0 1 5.2-5.2 3.1 3.1 0 0 1 0-5.8 3.1 3.1 0 0 1-5.2-5.2 3.1 3.1 0 0 1-5.8 0 3.1 3.1 0 0 1-5.2 5.2 3.1 3.1 0 0 1 0 5.8Z"/><path d="M12 8v8M15 10h-4.5a1.5 1.5 0 0 0 0 3h3a1.5 1.5 0 0 1 0 3H9"/>',
  "circle-alert": '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  "circle-help": '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4M12 18h.01"/>',
  "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
  "circle-plus": '<circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/>',
  "circle-x": '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  "refresh-cw": '<path d="M21 12a9 9 0 0 0-15-6.7L3 8M3 3v5h5M3 12a9 9 0 0 0 15 6.7l3-2.7M21 21v-5h-5"/>',
  "log-out": '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
  "bot": '<rect width="18" height="14" x="3" y="7" rx="2"/><path d="M12 3v4M8 12h.01M16 12h.01M8 16h8"/>',
  sparkles: '<path d="m12 3-1.9 5.1L5 10l5.1 1.9L12 17l1.9-5.1L19 10l-5.1-1.9ZM5 3v4M3 5h4M19 17v4M17 19h4"/>',
  "wand-sparkles": '<path d="m15 4 5 5L7 22H2v-5Z"/><path d="M15 4 2 17M6 3v4M4 5h4M19 14v4M17 16h4"/>',
  "clipboard-check": '<rect width="16" height="18" x="4" y="4" rx="2"/><path d="M9 4V2h6v2M9 12l2 2 4-4"/>',
  "mail-check": '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 6L2 7M16 19l2 2 4-4"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v13h16V8M10 12h4"/>',
  "external-link": '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  "paperclip": '<path d="m21.4 11.6-9.6 9.6a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.6 9.6a2 2 0 0 1-2.8-2.8l8.9-8.9"/>',
};

export function icon(name, className = "") {
  const body = paths[name] || paths["circle-help"];
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((element) => {
    const name = element.dataset.icon;
    if (element.tagName === "BUTTON" && element.childElementCount === 0) {
      element.innerHTML = icon(name);
      return;
    }
    if (element.tagName === "SPAN" && element.childElementCount === 0) {
      element.innerHTML = icon(name);
    }
  });
}

