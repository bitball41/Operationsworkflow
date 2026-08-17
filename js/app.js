/**
 * Entry point. Cloudflare Access is the only human authentication boundary.
 * Once the page loads, the dashboard opens the server-side Operations workspace
 * directly; there are no application accounts or browser database sessions.
 */
import { bindBoardDrag, onChange, onClick, onSubmit } from "./actions.js";
import { closePalette, isPaletteOpen, openPalette } from "./components/command-palette.js";
import { renderShell, setNav } from "./components/shell.js";
import { closeDrawer, closeModal, renderInto } from "./components/ui.js";
import { hydrateIcons } from "./core/icons.js";
import { initRouter, navigate, setParam } from "./core/router.js";
import { getState, setState, subscribe } from "./core/state.js";
import { debounce, escapeHtml } from "./core/utils.js";
import { fetchServiceStatus } from "./services/api.js";
import { initWorkspace, reloadWorkspace, subscribeToWorkspaceChanges } from "./services/data.js";
import { hydrateAssistantHistory } from "./services/ai/history.js";
import { renderAssistant, mountAssistant } from "./pages/assistant.js";
import { renderAutomation } from "./pages/automation.js";
import { renderAnalytics, renderCosts, renderPayments, renderPricing } from "./pages/business.js";
import { renderClients, renderMaintenance, renderProjects } from "./pages/clients.js";
import { renderHome, renderMyDay } from "./pages/home.js";
import { isOwner } from "./services/permissions.js";
import {
  renderAgencyDeployments,
  renderAutomationStudio,
  renderCalling,
  renderCommissions,
  renderMeetings,
  renderOnboarding,
  renderSubscriptions,
  renderTeam,
} from "./pages/agency.js";
import { renderFollowUps, renderInbox, renderOutreach } from "./pages/outreach.js";
import { renderDiscovery, renderLeads, renderPipeline } from "./pages/sales.js";
import { renderStudio, mountStudio } from "./pages/studio.js";
import { renderIntegrations, renderSettings } from "./pages/system.js";
import { renderDemos, renderTemplates } from "./pages/websites.js";
import { renderActivity, renderCalendar, renderNotes, renderTasks } from "./pages/workspace.js";
import { renderVoiceAgents } from "./pages/voice-agents.js";

const PAGES = {
  "my-day": renderMyDay,
  home: renderHome,
  assistant: renderAssistant,
  automation: renderAutomation,
  discovery: renderDiscovery,
  leads: renderLeads,
  pipeline: renderPipeline,
  calling: renderCalling,
  meetings: renderMeetings,
  outreach: renderOutreach,
  inbox: renderInbox,
  "follow-ups": renderFollowUps,
  studio: renderStudio,
  templates: renderTemplates,
  demos: renderDemos,
  deployments: renderAgencyDeployments,
  clients: renderClients,
  onboarding: renderOnboarding,
  projects: renderProjects,
  "voice-agents": renderVoiceAgents,
  "automation-studio": renderAutomationStudio,
  maintenance: renderMaintenance,
  payments: renderPayments,
  subscriptions: renderSubscriptions,
  commissions: renderCommissions,
  analytics: renderAnalytics,
  costs: renderCosts,
  pricing: renderPricing,
  tasks: renderTasks,
  calendar: renderCalendar,
  notes: renderNotes,
  activity: renderActivity,
  integrations: renderIntegrations,
  team: renderTeam,
  settings: renderSettings,
};

const hadExplicitRouteAtBoot = Boolean(globalThis.location?.hash);

const MOUNTS = {
  assistant: mountAssistant,
  studio: mountStudio,
  pipeline: bindBoardDrag,
};

let rendering = false;

function renderWorkspaceGate() {
  const { workspace } = getState();
  document.getElementById("app").classList.add("app--auth");

  const waiting = workspace.status === "loading";
  const title = waiting ? "Opening workspace" : "Workspace is unavailable";
  const message = workspace.message || (waiting ? "Connecting to your workspace…" : "Try again.");
  const body = waiting
    ? '<div class="faint">Connecting securely…</div>'
    : '<div class="btn-row"><button class="btn btn--primary" type="button" data-action="workspace-retry">Try again</button></div>';

  renderInto(document.getElementById("page"), `
    <section class="auth-gate stack">
      <div class="auth-gate__brand">Connor <small>/ Operations</small></div>
      <div><h1>${title}</h1><p class="faint">${escapeHtml(message)}</p></div>
      ${body}
    </section>
  `);
}

function render() {
  if (rendering) return;
  rendering = true;
  try {
    const { route, workspace } = getState();
    if (workspace.status !== "ready") {
      renderWorkspaceGate();
      return;
    }
    document.getElementById("app").classList.remove("app--auth");
    renderShell();
    renderInto(document.getElementById("page"), (PAGES[route] || renderHome)());
    MOUNTS[route]?.();
  } catch (error) {
    console.error(error);
    renderInto(
      document.getElementById("page"),
      `<div class="notice notice--error"><div><strong>This view failed to render</strong><span>${error.message}</span></div></div>`,
    );
  } finally {
    rendering = false;
  }
}

const searchInput = debounce((value) => setParam("q", value.trim()), 260);

function bindEvents() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("change", onChange);
  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-route-search]")) searchInput(event.target.value);
  });

  document.getElementById("menu-open").addEventListener("click", () => setNav(true));
  document.getElementById("sidebar-close").addEventListener("click", () => setNav(false));
  document.getElementById("scrim").addEventListener("click", () => setNav(false));
  document.getElementById("palette-open").addEventListener("click", openPalette);
  document.getElementById("sidebar-collapse").addEventListener("click", () => {
    const collapsed = !getState().navCollapsed;
    try {
      localStorage.setItem("operations.navCollapsed", JSON.stringify(collapsed));
    } catch {
      /* ignore */
    }
    setState({ navCollapsed: collapsed });
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (isPaletteOpen()) closePalette();
      else openPalette();
      return;
    }
    if (event.key === "Escape") {
      closePalette();
      closeModal();
      closeDrawer();
      setNav(false);
    }
  });

  window.addEventListener("resize", debounce(() => {
    if (window.innerWidth > 900) setNav(false);
  }, 200));
}

async function init() {
  hydrateIcons();
  bindEvents();
  subscribe(render);

  initRouter(() => {
    closePalette();
    closeModal();
    closeDrawer();
    setNav(false);
    render();
    document.getElementById("page")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  });

  /* Which API keys the Worker holds. Not awaited with the workspace: the
     dashboard must open at the same speed whether or not the Worker answers. */
  const servicesReady = fetchServiceStatus().then((services) => {
    setState({ services });
    return services;
  });

  try {
    const storage = await initWorkspace();
    if (storage === "cloud" && !hadExplicitRouteAtBoot && isOwner()) navigate("home");
    render();
    if (storage === "cloud") {
      hydrateAssistantHistory();
      render();
      const reload = debounce(() => reloadWorkspace().catch(console.error), 600);
      subscribeToWorkspaceChanges(reload);
      await servicesReady;
    }
  } catch (error) {
    console.error(error);
    setState({
      workspace: { status: "error", message: error.message || "Could not load the Operations workspace." },
      connection: { ok: false, message: error.message || "Could not load the Operations workspace." },
    });
    render();
  }
}

init();
