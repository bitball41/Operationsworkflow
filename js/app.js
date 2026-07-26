import { handleActionClick, handleFormSubmit, bindPipelineDrag } from "./actions.js";
import { openCommandPalette, closeCommandPalette } from "./components/command-palette.js";
import { openLeadForm } from "./components/forms.js";
import { renderAgentPanel, renderNotificationPanel } from "./components/panels.js";
import { renderShellChrome, setMobileNav, setShellVisibility } from "./components/shell.js";
import { hydrateIcons } from "./core/icons.js";
import { initRouter, navigate } from "./core/router.js";
import { getState, resetData, setState, subscribe } from "./core/state.js";
import { debounce } from "./core/utils.js";
import {
  applySupabaseSession,
  getGateStatus,
  getSupabaseSession,
  onAuthChange,
  requestSupabaseSession,
  unlock,
} from "./services/auth.js";
import { loadPreviewWorkspace, loadWorkspace, subscribeToWorkspaceChanges } from "./services/data.js";
import { renderInto, toast } from "./components/ui.js";
import { renderAnalytics, renderCommandCenter, renderFinance } from "./pages/dashboard.js";
import { renderAnalysis, renderDiscovery, renderPipeline, renderProspects } from "./pages/sales.js";
import { renderClients, renderDemos, renderTemplates } from "./pages/delivery.js";
import { renderApprovals, renderFollowUps, renderInbox, renderOutreach } from "./pages/communication.js";
import { renderActivity, renderSettings } from "./pages/system.js";

const pageRenderers = {
  "command-center": renderCommandCenter,
  pipeline: renderPipeline,
  discovery: renderDiscovery,
  prospects: renderProspects,
  analysis: renderAnalysis,
  templates: renderTemplates,
  demos: renderDemos,
  outreach: renderOutreach,
  inbox: renderInbox,
  "follow-ups": renderFollowUps,
  approvals: renderApprovals,
  clients: renderClients,
  analytics: renderAnalytics,
  finance: renderFinance,
  activity: renderActivity,
  settings: renderSettings,
};

const LOCAL_DATA_NOTICE = "Supabase owner credentials are not set on the Worker, so this session uses local sample data.";

let realtimeCleanup = () => {};
let rendering = false;

function renderApp() {
  const state = getState();
  if (!["authenticated", "preview"].includes(state.mode) || rendering) return;
  rendering = true;
  try {
    renderShellChrome();
    renderAgentPanel();
    renderNotificationPanel();
    const renderer = pageRenderers[state.route] || renderCommandCenter;
    renderInto(document.getElementById("page-content"), renderer());
    if (state.route === "pipeline") bindPipelineDrag();
  } finally {
    rendering = false;
  }
}

async function enterAuthenticated(session) {
  setState({ mode: "loading", session, user: session.user }, { silent: true });
  document.getElementById("loading-screen").hidden = false;
  document.getElementById("auth-screen").hidden = true;
  try {
    await loadWorkspace(session.user);
    setState({ mode: "authenticated" }, { silent: true });
    setShellVisibility(true);
    renderApp();
    realtimeCleanup();
    const reload = debounce(() => loadWorkspace(session.user).catch(console.error), 500);
    realtimeCleanup = subscribeToWorkspaceChanges(reload);
  } catch (error) {
    console.error(error);
    lock();
    showAuthMessage("The workspace could not load. Sign in again to retry.");
  }
}

/**
 * Sample-data workspace. Used both for the explicit preview button and as the
 * fallback when the password is correct but Supabase is not wired up yet.
 */
function enterPreview({ persist = true, notice = "" } = {}) {
  if (persist) localStorage.setItem("operations-preview", "true");
  resetData();
  loadPreviewWorkspace();
  setState({
    mode: "preview",
    session: null,
    user: { id: "preview", email: "preview@operations.local", user_metadata: { full_name: "Connor" } },
  }, { silent: true });
  setShellVisibility(true);
  renderApp();
  if (notice) toast("Local sample data", notice, "warning");
}

function lock(status = null) {
  realtimeCleanup();
  realtimeCleanup = () => {};
  setState({ mode: "unauthenticated", session: null, user: null }, { silent: true });
  setShellVisibility(false);
  if (status && !status.passwordConfigured) {
    showAuthMessage("No password is set on this Worker yet. Run: npx wrangler secret put DASHBOARD_PASSWORD", "warning");
  }
}

function showAuthMessage(message, tone = "error") {
  const element = document.getElementById("auth-message");
  element.textContent = message;
  element.style.color = tone === "success" ? "var(--green)" : tone === "warning" ? "var(--yellow)" : "var(--red)";
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const button = document.getElementById("auth-submit");
  const input = document.getElementById("auth-password");
  button.disabled = true;
  showAuthMessage("");
  try {
    const result = await unlock(input.value);
    input.value = "";
    if (result.supabase) {
      await enterAuthenticated(await applySupabaseSession(result.supabase));
    } else {
      enterPreview({ persist: false, notice: result.notice || LOCAL_DATA_NOTICE });
    }
  } catch (error) {
    showAuthMessage(error.message || "Sign-in failed.");
  } finally {
    button.disabled = false;
  }
}

function closeOverlays() {
  closeCommandPalette();
  document.getElementById("modal-root").innerHTML = "";
  document.body.style.overflow = "";
  setState({ agentPanelOpen: false, notificationPanelOpen: false, mobileNavOpen: false });
  setMobileNav(false);
}

function bindStaticEvents() {
  document.addEventListener("click", handleActionClick);
  document.addEventListener("submit", handleFormSubmit);

  document.getElementById("auth-form").addEventListener("submit", handleAuthSubmit);
  document.getElementById("preview-button").addEventListener("click", () => enterPreview());

  document.getElementById("global-search").addEventListener("click", openCommandPalette);
  document.getElementById("add-lead-button").addEventListener("click", () => openLeadForm());
  document.getElementById("agent-panel-button").addEventListener("click", () => {
    const open = !getState().agentPanelOpen;
    setState({ agentPanelOpen: open, notificationPanelOpen: false });
  });
  document.getElementById("notifications-button").addEventListener("click", () => {
    const open = !getState().notificationPanelOpen;
    setState({ notificationPanelOpen: open, agentPanelOpen: false });
  });
  document.getElementById("account-button").addEventListener("click", () => navigate("settings"));
  document.getElementById("sidebar-open").addEventListener("click", () => {
    setState({ mobileNavOpen: true });
    setMobileNav(true);
  });
  document.getElementById("sidebar-close").addEventListener("click", () => {
    setState({ mobileNavOpen: false });
    setMobileNav(false);
  });
  document.getElementById("sidebar-scrim").addEventListener("click", () => {
    setState({ mobileNavOpen: false });
    setMobileNav(false);
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openCommandPalette();
    }
    if (event.key === "Escape") closeOverlays();
  });
}

/**
 * Reload order: a Supabase session already in this browser, then the Worker gate
 * cookie, then the password screen.
 */
async function restoreSession() {
  try {
    const session = await getSupabaseSession();
    if (session) {
      await enterAuthenticated(session);
      return;
    }
  } catch (error) {
    console.error(error);
  }

  let status;
  try {
    status = await getGateStatus();
  } catch (error) {
    console.error(error);
    lock();
    showAuthMessage(error.message, "warning");
    return;
  }

  if (!status.authenticated) {
    lock(status);
    return;
  }

  if (!status.supabaseConfigured) {
    enterPreview({ persist: false, notice: LOCAL_DATA_NOTICE });
    return;
  }

  try {
    const { supabase: tokens } = await requestSupabaseSession();
    await enterAuthenticated(await applySupabaseSession(tokens));
  } catch (error) {
    console.error(error);
    enterPreview({ persist: false, notice: error.message || "Could not restore the Supabase session." });
  }
}

async function init() {
  hydrateIcons();
  bindStaticEvents();
  subscribe(renderApp);
  initRouter(() => {
    setMobileNav(false);
    renderApp();
    document.getElementById("page-content")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "auto" });
  });

  onAuthChange((event) => {
    if (event === "SIGNED_OUT") {
      localStorage.removeItem("operations-preview");
      resetData();
      lock();
    }
  });

  if (localStorage.getItem("operations-preview") === "true") {
    enterPreview();
    return;
  }

  await restoreSession();
}

init().catch((error) => {
  console.error(error);
  document.getElementById("loading-screen").hidden = true;
  document.getElementById("auth-screen").hidden = false;
  toast("Initialization failed", error.message || "Reload the page.", "error");
});
