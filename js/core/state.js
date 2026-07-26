const initialData = {
  profile: null,
  leads: [],
  discoveryRuns: [],
  discoveryResults: [],
  templates: [],
  demos: [],
  demoVersions: [],
  drafts: [],
  emailThreads: [],
  emails: [],
  followUps: [],
  approvals: [],
  agentRuns: [],
  agentEvents: [],
  notifications: [],
  clients: [],
  clientSites: [],
  projects: [],
  projectTasks: [],
  maintenanceSubscriptions: [],
  maintenanceRequests: [],
  payments: [],
  expenses: [],
  aiUsage: [],
  pricingExperiments: [],
  activity: [],
  tasks: [],
  calendarEvents: [],
  notes: [],
  deployments: [],
  settings: [],
  integrations: [],
};

const state = {
  mode: "loading",
  session: null,
  user: null,
  route: "home",
  routeParams: {},
  mobileNavOpen: false,
  agentPanelOpen: false,
  approvalPanelOpen: false,
  notificationPanelOpen: false,
  sidebarCollapsed: localStorage.getItem("operations.sidebarCollapsed") === "true",
  discovery: {
    status: "idle",
    progress: null,
    results: [],
    selected: [],
    runId: null,
    error: "",
    summary: null,
  },
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

export function setDiscovery(patch, options = {}) {
  state.discovery = { ...state.discovery, ...patch };
  if (!options.silent) notify();
}

export function setData(patch, options = {}) {
  Object.assign(state.data, patch);
  if (!options.silent) notify();
}

export function resetData() {
  state.data = structuredClone(initialData);
  state.discovery = { status: "idle", progress: null, results: [], selected: [], runId: null, error: "", summary: null };
  notify();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notify() {
  listeners.forEach((listener) => listener(state));
}
