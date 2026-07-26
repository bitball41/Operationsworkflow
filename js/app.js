import {
  bindPipelineDrag,
  handleActionClick,
  handleControlChange,
  handleFormSubmit,
  handleRouteSearch,
} from "./actions.js";
import { closeCommandPalette, openCommandPalette } from "./components/command-palette.js";
import { renderAgentPanel, renderApprovalPanel, renderNotificationPanel } from "./components/panels.js";
import { renderShellChrome, setMobileNav, setShellVisibility } from "./components/shell.js";
import { renderInto, toast } from "./components/ui.js";
import { hydrateIcons } from "./core/icons.js";
import { initRouter, navigate } from "./core/router.js";
import { getState, resetData, setState, subscribe } from "./core/state.js";
import { debounce } from "./core/utils.js";
import { renderAnalytics, renderCosts, renderPayments, renderPricing } from "./pages/business.js";
import { renderClients, renderMaintenance, renderProjects } from "./pages/clients.js";
import { renderFollowUps, renderInbox, renderOutreach } from "./pages/communication.js";
import { renderActivity, renderCalendar, renderHome, renderTasks } from "./pages/overview.js";
import { renderDiscovery, renderLeads, renderPipeline } from "./pages/sales.js";
import { renderIntegrations, renderSettings } from "./pages/system.js";
import { renderDeployments, renderDemos, renderStudio, renderTemplates } from "./pages/websites.js";
import { renderNotes } from "./pages/workspace.js";
import { getSession, onAuthChange, signIn, signUp } from "./services/auth.js";
import { loadPreviewWorkspace, loadWorkspace, subscribeToWorkspaceChanges } from "./services/data.js";

const pageRenderers = {
  home: renderHome,
  activity: renderActivity,
  tasks: renderTasks,
  calendar: renderCalendar,
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
  pricing: renderPricing,
  costs: renderCosts,
  notes: renderNotes,
  integrations: renderIntegrations,
  settings: renderSettings,
};

let authMode = "signin";
let realtimeCleanup = () => {};
let rendering = false;

function renderApp() {
  const state = getState();
  if (!["authenticated", "preview"].includes(state.mode) || rendering) return;
  rendering = true;
  try {
    renderShellChrome();
    renderAgentPanel();
    renderApprovalPanel();
    renderNotificationPanel();
    const renderer = pageRenderers[state.route] || renderHome;
    renderInto(document.getElementById("page-content"), renderer());
    if (state.route === "pipeline" && (state.routeParams.view || "kanban") === "kanban") bindPipelineDrag();
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
    setState({ mode: "unauthenticated", session: null, user: null }, { silent: true });
    setShellVisibility(false);
    showAuthMessage("The workspace could not load. Please try signing in again.");
  }
}

function enterPreview() {
  localStorage.setItem("operations-preview", "true");
  resetData();
  loadPreviewWorkspace();
  setState({
    mode: "preview",
    session: null,
    user: { id: "preview", email: "preview@operations.local", user_metadata: { full_name: "Connor" } },
  }, { silent: true });
  setShellVisibility(true);
  renderApp();
}

function showAuthMessage(message, tone = "error") {
  const element = document.getElementById("auth-message");
  element.textContent = message;
  element.style.color = tone === "success" ? "var(--green)" : "var(--red)";
}

function updateAuthMode() {
  const signUpMode = authMode === "signup";
  document.getElementById("auth-title").textContent = signUpMode ? "Create owner account" : "Welcome back";
  document.getElementById("auth-subtitle").textContent = signUpMode
    ? "Your data is private to this Supabase user."
    : "Sign in to your private operations workspace.";
  document.getElementById("auth-submit").textContent = signUpMode ? "Create account" : "Sign in";
  document.getElementById("auth-switch").textContent = signUpMode ? "Back to sign in" : "Create owner account";
  document.getElementById("auth-password").autocomplete = signUpMode ? "new-password" : "current-password";
  showAuthMessage("");
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const submit = document.getElementById("auth-submit");
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  submit.disabled = true;
  showAuthMessage("");
  try {
    if (authMode === "signup") {
      const data = await signUp(email, password);
      if (data.session) {
        await enterAuthenticated(data.session);
      } else {
        showAuthMessage("Account created. Check your email to confirm it, then sign in.", "success");
        authMode = "signin";
        updateAuthMode();
      }
    } else {
      const data = await signIn(email, password);
      await enterAuthenticated(data.session);
    }
  } catch (error) {
    showAuthMessage(error.message || "Authentication failed.");
  } finally {
    submit.disabled = false;
  }
}

function closeOverlays() {
  closeCommandPalette();
  document.getElementById("modal-root").innerHTML = "";
  document.body.style.overflow = "";
  setState({
    agentPanelOpen: false,
    approvalPanelOpen: false,
    notificationPanelOpen: false,
    mobileNavOpen: false,
  });
  setMobileNav(false);
}

const routeSearch = debounce((value) => handleRouteSearch(value), 320);

function bindStaticEvents() {
  document.addEventListener("click", handleActionClick);
  document.addEventListener("submit", handleFormSubmit);
  document.addEventListener("change", handleControlChange);
  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-route-search]")) routeSearch(event.target.value);
  });

  document.getElementById("auth-form").addEventListener("submit", handleAuthSubmit);
  document.getElementById("auth-switch").addEventListener("click", () => {
    authMode = authMode === "signin" ? "signup" : "signin";
    updateAuthMode();
  });
  document.getElementById("preview-button").addEventListener("click", enterPreview);

  document.getElementById("global-search").addEventListener("click", openCommandPalette);
  document.getElementById("agent-panel-button").addEventListener("click", () => {
    const open = !getState().agentPanelOpen;
    setState({ agentPanelOpen: open, approvalPanelOpen: false, notificationPanelOpen: false });
  });
  document.getElementById("approvals-button").addEventListener("click", () => {
    const open = !getState().approvalPanelOpen;
    setState({ approvalPanelOpen: open, agentPanelOpen: false, notificationPanelOpen: false });
  });
  document.getElementById("notifications-button").addEventListener("click", () => {
    const open = !getState().notificationPanelOpen;
    setState({ notificationPanelOpen: open, agentPanelOpen: false, approvalPanelOpen: false });
  });
  document.getElementById("account-button").addEventListener("click", () => navigate("settings"));
  document.getElementById("top-account-button").addEventListener("click", () => navigate("settings"));
  document.getElementById("sidebar-collapse").addEventListener("click", () => {
    const collapsed = !getState().sidebarCollapsed;
    localStorage.setItem("operations.sidebarCollapsed", String(collapsed));
    setState({ sidebarCollapsed: collapsed });
  });
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
      realtimeCleanup();
      realtimeCleanup = () => {};
      localStorage.removeItem("operations-preview");
      resetData();
      setState({ mode: "unauthenticated", session: null, user: null }, { silent: true });
      setShellVisibility(false);
    }
  });

  if (localStorage.getItem("operations-preview") === "true") {
    enterPreview();
    return;
  }

  try {
    const session = await getSession();
    if (session) {
      await enterAuthenticated(session);
    } else {
      setState({ mode: "unauthenticated" }, { silent: true });
      setShellVisibility(false);
    }
  } catch (error) {
    console.error(error);
    setState({ mode: "unauthenticated" }, { silent: true });
    setShellVisibility(false);
    showAuthMessage("Could not reach Supabase. You can still open the preview workspace.");
  }
}

init().catch((error) => {
  console.error(error);
  document.getElementById("loading-screen").hidden = true;
  document.getElementById("auth-screen").hidden = false;
  toast("Initialization failed", error.message || "Reload the page.", "error");
});
