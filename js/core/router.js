import { CONFIG, ROUTES } from "../config.js";
import { setState } from "./state.js";

const routeSet = new Set(ROUTES);

export function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "") || CONFIG.defaultRoute;
  const [path, queryString = ""] = raw.split("?");
  const route = routeSet.has(path) ? path : CONFIG.defaultRoute;
  return { route, routeParams: Object.fromEntries(new URLSearchParams(queryString)) };
}

export function navigate(route, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== "" && value !== null && value !== undefined),
  ).toString();
  location.hash = `#/${route}${query ? `?${query}` : ""}`;
}

export function setParam(key, value) {
  const { route, routeParams } = parseRoute();
  const next = { ...routeParams };
  if (value === "" || value === "all" || value === null || value === undefined) delete next[key];
  else next[key] = value;
  navigate(route, next);
}

export function initRouter(onRoute) {
  const apply = () => {
    const next = parseRoute();
    setState(next, { silent: true });
    onRoute(next);
  };
  window.addEventListener("hashchange", apply);
  if (!location.hash) location.replace(`#/${CONFIG.defaultRoute}`);
  apply();
}
