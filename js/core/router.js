import { CONFIG, PAGE_META } from "../config.js";
import { setState } from "./state.js";

export function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "") || CONFIG.defaultRoute;
  const [path, queryString = ""] = raw.split("?");
  const route = PAGE_META[path] ? path : CONFIG.defaultRoute;
  const routeParams = Object.fromEntries(new URLSearchParams(queryString));
  return { route, routeParams };
}

export function navigate(route, params = {}) {
  const query = new URLSearchParams(params).toString();
  location.hash = `#/${route}${query ? `?${query}` : ""}`;
}

export function initRouter(onRoute) {
  const apply = () => {
    const next = parseRoute();
    setState(next, { silent: true });
    onRoute(next);
  };

  window.addEventListener("hashchange", apply);
  if (!location.hash) location.hash = `#/${CONFIG.defaultRoute}`;
  apply();
}

