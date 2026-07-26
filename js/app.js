/**
 * Entry point. The dashboard opens straight into the workspace — there is no
 * sign-in wall. Supabase is used when a session exists; otherwise everything
 * persists locally and a small warning appears in the sidebar.
 */
import { bindBoardDrag, onChange, onClick, onSubmit } from "./actions.js";
import { closePalette, isPaletteOpen, openPalette } from "./components/command-palette.js";
import { renderShell, setNav } from "./components/shell.js";
import { closeDrawer, closeModal, renderInto, toast } from "./components/ui.js";
import { hydrateIcons } from "./core/icons.js";
import { initRouter } from "./core/router.js";
import { getState, setState, subscribe } from "./core/state.js";
import { debounce } from "./core/utils.js";
import { setParam } from "./core/router.js";
import { initWorkspace, reloadWorkspace, subscribeToWorkspaceChanges } from "./services/data.js";
import { renderAssistant, mountAssistant } from "./pages/assistant.js";
import { renderAutomation } from "./pages/automation.js";
import { renderAnalytics, renderCosts, renderPayments, renderPricing } from "./pages/business.js";
import { renderClients, renderMaintenance, renderProjects } from "./pages/clients.js";
import { renderHome } from "./pages/home.js";
import { renderFollowUps, renderInbox, renderOutreach } from "./pages/outreach.js";
import { renderDiscovery, renderLeads, renderPipeline } from "./pages/sales.js";
import { renderStudio, mountStudio } from "./pages/studio.js";
import { renderIntegrations, renderSettings } from "./pages/system.js";
import { renderDemos, renderDeployments, renderTemplates } from "./pages/websites.js";
import { renderActivity, renderCalendar, renderNotes, renderTasks } from "./pages/workspace.js";

const PAGES = {
  home: renderHome,
  assistant: renderAssistant,
  automation: renderAutomation,
  discovery: renderDiscovery,
  leads: renderLeads,
  pipeline: renderPipeline,
  outreach: renderOutreach,
  inbox: renderInbox,
  "follow-ups": renderFollowUps,
  studio: renderStudio,
  templates: renderTemplates,
  demos: renderDemos,
  deployments: renderDeployments,
  clients: renderClients,
  projects: renderProjects,
  maintenance: renderMaintenance,
  payments: renderPayments,
  analytics: renderAnalytics,
  costs: renderCosts,
  pricing: renderPricing,
  tasks: renderTasks,
  calendar: renderCalendar,
  notes: renderNotes,
  activity: renderActivity,
  integrations: renderIntegrations,
  settings: renderSettings,
};

const MOUNTS = {
  assistant: mountAssistant,
  studio: mountStudio,
  pipeline: bindBoardDrag,
};

let rendering = false;

function render() {
  if (rendering) return;
  rendering = true;
  try {
    const { route } = getState();
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
    setNav(false);
    render();
    document.getElementById("page")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  });

  try {
    const storage = await initWorkspace();
    render();
    if (storage === "cloud") {
      const reload = debounce(() => reloadWorkspace().catch(console.error), 600);
      subscribeToWorkspaceChanges(reload);
    }
  } catch (error) {
    console.error(error);
    setState({ connection: { ok: false, message: "Could not load the workspace. Working from local data." } });
    toast("Workspace could not load", error.message || "Working from local data.", "error");
  }
}

init();
