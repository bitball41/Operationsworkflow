const initialData = {
  profile: null,
  leads: [],
  analyses: [],
  templates: [],
  demos: [],
  demoVersions: [],
  drafts: [],
  communications: [],
  followUps: [],
  approvals: [],
  agentRuns: [],
  agentEvents: [],
  notifications: [],
  clients: [],
  costEvents: [],
  pricingExperiments: [],
  financeTransactions: [],
  financeGoals: [],
  integrations: [],
};

const state = {
  mode: "loading",
  session: null,
  user: null,
  route: "command-center",
  routeParams: {},
  mobileNavOpen: false,
  agentPanelOpen: false,
  notificationPanelOpen: false,
  data: structuredClone(initialData),
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch, options = {}) {
  Object.assign(state, patch);
  if (!options.silent) notify();
}

export function setData(patch, options = {}) {
  Object.assign(state.data, patch);
  if (!options.silent) notify();
}

export function resetData() {
  state.data = structuredClone(initialData);
  notify();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notify() {
  listeners.forEach((listener) => listener(state));
}

