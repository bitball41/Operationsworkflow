/* Single client state tree with a tiny subscription model. */

const EMPTY_DATA = {
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

function readStored(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw === null || raw === undefined ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export const INITIAL_DISCOVERY = {
  status: "idle",
  progress: null,
  results: [],
  selected: [],
  runId: null,
  error: "",
  summary: null,
};

export const INITIAL_AUTOMATION = {
  status: "idle",
  runId: null,
  startedAt: null,
  stoppedAt: null,
  stopReason: "",
  currentLeadId: null,
  currentLeadName: "",
  currentStep: "",
  stepIndex: -1,
  completedSteps: [],
  processed: 0,
  sent: 0,
  failures: [],
  events: [],
};

const state = {
  /* "cloud" once a Supabase session is present, otherwise "local". */
  storage: "local",
  connection: { ok: true, message: "" },
  /* Which API keys the Cloudflare Worker holds. Filled in once at boot from
     /api/status; every provider stays false when the Worker is not there. */
  services: {
    reachable: false,
    providers: { outlook: false, anthropic: false, openai: false, whop: false, google_maps: false },
  },
  user: null,
  route: "home",
  routeParams: {},
  navOpen: false,
  navCollapsed: readStored("operations.navCollapsed", false) === true,
  discovery: { ...INITIAL_DISCOVERY },
  automation: { ...INITIAL_AUTOMATION },
  automationSettings: null,
  assistant: {
    messages: [],
    pending: false,
    contextOpen: false,
  },
  studio: {
    file: "index.html",
    view: "preview",
    viewport: "desktop",
    pendingChange: null,
    messages: [],
    dirty: false,
    draftFiles: null,
  },
  data: structuredClone(EMPTY_DATA),
};

const listeners = new Set();
let notifyQueued = false;

export function getState() {
  return state;
}

export function getData() {
  return state.data;
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
  state.data = structuredClone(EMPTY_DATA);
  notify();
}

export function setDiscovery(patch, options = {}) {
  state.discovery = { ...state.discovery, ...patch };
  if (!options.silent) notify();
}

export function setAutomation(patch, options = {}) {
  state.automation = { ...state.automation, ...patch };
  if (!options.silent) notify();
}

export function setAssistant(patch, options = {}) {
  state.assistant = { ...state.assistant, ...patch };
  if (!options.silent) notify();
}

export function setStudio(patch, options = {}) {
  state.studio = { ...state.studio, ...patch };
  if (!options.silent) notify();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* Renders are coalesced to one per frame so bursty automation events do not
   thrash the DOM. */
export function notify() {
  if (notifyQueued) return;
  notifyQueued = true;
  const flush = () => {
    notifyQueued = false;
    listeners.forEach((listener) => listener(state));
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(flush);
  else queueMicrotask(flush);
}

export function notifyNow() {
  listeners.forEach((listener) => listener(state));
}

export { EMPTY_DATA };
