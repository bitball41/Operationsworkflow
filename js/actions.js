/* Single delegated event router: clicks, form submits and control changes. */
import { PIPELINE_STAGES, PROJECT_STAGES } from "./config.js";

/* Worker secret name per integration, so "Set up" can say exactly what to run. */
const WORKER_SECRET_NAMES = Object.freeze({
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  whop: "WHOP_WEBHOOK_SECRET",
  google_maps: "GOOGLE_MAPS_API_KEY",
  mcp: "MCP_API_TOKEN",
});

import { closePalette, isPaletteOpen } from "./components/command-palette.js";
import {
  openCalendarForm,
  openClientDetails,
  openClientForm,
  openDeploymentLogs,
  openDirectEmailForm,
  openDiscoveryDetails,
  openDraftForm,
  openExpenseForm,
  openFollowUpForm,
  openLeadDetails,
  openLeadForm,
  openMeetingForm,
  openMaintenanceForm,
  openNoteForm,
  openOnboardingForm,
  openPaymentForm,
  openPricingForm,
  openProjectForm,
  openAutomationRecordForm,
  openCommissionForm,
  openStageForm,
  openSubscriptionForm,
  openTaskForm,
  openTeamMemberForm,
  openTemplateChooser,
  openTemplatePreview,
  openTemplateUploadForm,
} from "./components/forms.js";
import { setNav } from "./components/shell.js";
import { closeDrawer, closeModal, confirmAction, formValues, openDrawer, toast } from "./components/ui.js";
import { navigate, setParam } from "./core/router.js";
import { getState, setAssistant, setDiscovery, setState, setStudio } from "./core/state.js";
import { isoOffset, safeJson, slugify, uid } from "./core/utils.js";
import { runAgentLoop } from "./services/ai/agent.js";
import { matchCommand, runCommand } from "./services/ai/commands.js";
import {
  deleteAssistantConversation,
  newAssistantConversation,
  openAssistantConversation,
  persistAssistantHistory,
} from "./services/ai/history.js";
import { activeModel, providerReady } from "./services/ai/provider.js";
import { formatPerMTok } from "./data/models.js";
import { connectOutlook, disconnectOutlook, fetchServiceStatus } from "./services/api.js";
import { AUTOMATION_DEFAULTS } from "./config.js";
import {
  runOnce,
  saveAutomationSettings,
  startAutomation,
  stopAutomation,
} from "./services/automation/engine.js";
import {
  createRecord,
  deleteRecord,
  findRecord,
  logActivity,
  preferences,
  rejectDiscoveryCandidates,
  saveDiscoveryCandidates,
  savePreferences,
  updateRecord,
} from "./services/data.js";
import { runDiscoverySearch } from "./services/discovery.js";
import { canSend } from "./services/email/outreach.js";
import { providerName } from "./services/integrations.js";
import { syncInbox } from "./services/email/inbox.js";
import {
  classifyReply,
  createMeeting,
  createOrUpdateDemo,
  createOutreachDraft,
  demoForLead,
  ensureTemplateRecords,
  publishDemo,
  replyToThread,
  recordPayment,
  recordSalesCall,
  saveDemoFiles,
  sendDirectEmail,
  sendDraft,
  syncCommissionForPayment,
  updatePipeline,
} from "./services/operations.js";
import { buildBundleForLead, buildBundleForTemplateRecord, catalogForRecord, composeDocument } from "./services/sites/bundle.js";
import { downloadBundle, openBundleInTab } from "./services/sites/publish.js";
import {
  createCustomTemplate,
  deleteCustomTemplate,
  filesForTemplatePreview,
} from "./services/sites/templates.js";
import { currentFiles, selectedDemo, siteDetailsForm } from "./pages/studio.js";

async function run(action, successTitle = "", successMessage = "") {
  try {
    const result = await action();
    if (successTitle) toast(successTitle, successMessage);
    return result;
  } catch (error) {
    console.error(error);
    toast("That did not work", error.message || "Try again.", "error");
    return null;
  }
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function clean(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === "" ? null : value]));
}

function lines(value) {
  return String(value || "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function jsonValue(value, label) {
  try {
    return JSON.parse(String(value || "{}").trim() || "{}");
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

/**
 * Deletes are permanent, so the first click asks. Returns true once the user
 * has confirmed (the confirm button repeats the action with data-confirmed).
 */
function confirmDelete(target, collection, label) {
  if (target.dataset.confirmed === "true") return true;
  confirmAction({
    title: `Delete ${label || "this record"}?`,
    message: "This cannot be undone.",
    confirmLabel: "Delete",
    action: target.dataset.action,
    attrs: `data-id="${target.dataset.id}" data-confirmed="true" data-collection="${collection}"`,
  });
  return false;
}

/* ---------- clicks ---------- */

export async function onClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const anchor = event.target.closest("a[href]");
  if (anchor && anchor !== target && !anchor.hasAttribute("data-action")) return;

  const action = target.dataset.action;
  const id = target.dataset.id;
  if (target.tagName !== "SELECT" && target.type !== "checkbox") event.preventDefault();

  if (isPaletteOpen() && action !== "close-palette") closePalette();

  switch (action) {
    /* --- shell --- */
    case "navigate":
      navigate(target.dataset.routeTarget, safeJson(target.dataset.routeParams, {}) || {});
      closeModal();
      setNav(false);
      break;
    case "route-filter":
      setParam(target.dataset.key, target.dataset.value);
      break;
    case "close-modal":
      closeModal();
      break;
    case "close-drawer":
      closeDrawer();
      break;
    case "close-palette":
      closePalette();
      break;
    case "workspace-retry":
      location.reload();
      break;
    case "integration-setup": {
      const provider = target.dataset.provider;
      const secret = WORKER_SECRET_NAMES[provider];
      /* Outlook is not one secret but a set, plus a KV namespace, so it names
         exactly what the Worker reported as missing rather than guessing. */
      const outlookMissing = getState().services.outlook?.missing || [];
      toast(
        `${providerName(provider)} is not connected`,
        provider === "outlook"
          ? `The Cloudflare Worker is missing ${outlookMissing.join(", ") || "its Microsoft configuration"}. See README → API keys.`
          : secret
            ? `Add the key to the Cloudflare Worker — wrangler secret put ${secret} — then reload. No credential is ever stored in this project.`
            : "Credentials are deliberately not in this project. The interface, records and tool calls for it already exist.",
        "info",
      );
      break;
    }
    case "outlook-connect":
      await run(connectOutlook);
      break;
    case "outlook-disconnect":
      await run(async () => {
        await disconnectOutlook();
        setState({ services: await fetchServiceStatus() });
      }, "Outlook disconnected", "No further email can be sent until it is reconnected.");
      break;
    case "inbox-sync":
      await run(async () => {
        const result = await syncInbox();
        toast(
          result.messages ? "Inbox synced" : "Inbox is up to date",
          result.messages ? `${result.messages} new message${result.messages === 1 ? "" : "s"}.` : "No new messages from Outlook.",
        );
      });
      break;
    case "email-new":
      openDirectEmailForm();
      break;

    /* --- automation --- */
    case "automation-start": {
      const result = await startAutomation();
      if (!result.ok) toast("Automation did not start", result.reason, "error");
      else if (!canSend()) toast("Automation started", "Outlook is not connected, so emails will stop at “ready”.", "info");
      else toast("Automation started");
      break;
    }
    case "automation-stop": {
      const result = stopAutomation();
      toast(result.ok ? "Stopping" : "Nothing to stop", result.ok ? "Finishing the current lead." : result.reason, result.ok ? "success" : "info");
      break;
    }
    case "automation-run-once": {
      const result = await runOnce(target.dataset.id);
      toast(result.ok ? "Lead prepared" : "Could not prepare", result.ok ? `${result.result.leadName} is ready.` : result.reason, result.ok ? "success" : "error");
      break;
    }
    case "automation-clear-failures":
      setState({ automation: { ...getState().automation, failures: [] } });
      break;
    case "automation-reset-settings":
      await saveAutomationSettings({ ...AUTOMATION_DEFAULTS });
      toast("Settings reset");
      break;

    /* --- assistant --- */
    case "assistant-suggest": {
      const input = document.getElementById("assistant-input") || document.getElementById("studio-input");
      if (input) {
        input.value = target.dataset.text;
        input.focus();
      }
      break;
    }
    case "assistant-open-conversation":
      openAssistantConversation(id);
      break;
    case "assistant-toggle-context":
      setAssistant({ contextOpen: !getState().assistant.contextOpen });
      break;
    case "assistant-clear":
    case "assistant-new":
      newAssistantConversation();
      break;
    case "assistant-delete":
      if (target.dataset.confirmed !== "true") {
        confirmAction({
          title: "Delete this conversation?",
          message: "This removes the saved transcript from this workspace.",
          confirmLabel: "Delete",
          action: "assistant-delete",
        });
        break;
      }
      closeModal();
      await run(() => deleteAssistantConversation(), "Conversation deleted");
      break;

    /* --- discovery --- */
    case "discovery-save":
      await saveDiscovery([id]);
      break;
    case "discovery-save-selected":
      await saveDiscovery(getState().discovery.selected);
      break;
    case "discovery-reject":
      await rejectDiscovery([id]);
      break;
    case "discovery-reject-selected":
      await rejectDiscovery(getState().discovery.selected);
      break;
    case "discovery-inspect": {
      const result = findRecord("discoveryResults", id);
      if (result) openDiscoveryDetails(result);
      break;
    }
    case "discovery-open-run": {
      const runRecord = findRecord("discoveryRuns", id);
      if (!runRecord) break;
      setDiscovery({
        runId: id,
        results: getState().data.discoveryResults.filter((item) => item.run_id === id),
        selected: [],
        summary: runRecord.summary || null,
        status: "idle",
        error: "",
      });
      break;
    }

    /* --- leads --- */
    case "lead-new":
      openLeadForm();
      break;
    case "lead-open": {
      const lead = findRecord("leads", id);
      if (lead) openLeadDetails(lead);
      break;
    }
    case "lead-edit": {
      const lead = findRecord("leads", id);
      if (lead) openLeadForm(lead);
      break;
    }
    case "lead-stage": {
      const lead = findRecord("leads", id);
      if (lead) openStageForm(lead);
      break;
    }
    case "lead-delete":
      if (!confirmDelete(target, "leads", findRecord("leads", id)?.business_name)) break;
      await run(() => deleteRecord("leads", id), "Lead deleted");
      closeModal();
      break;
    case "lead-outreach":
      closeModal();
      navigate("outreach", { lead: id });
      break;
    case "lead-prepare": {
      closeModal();
      toast("Working", "Building the demo and drafting the email.", "info");
      const result = await runOnce(id);
      if (result.ok) {
        toast(
          result.result.sent ? "Sent" : "Ready to send",
          result.result.sent ? `${result.result.leadName} contacted.` : `${result.result.leadName}: demo built, email ready. ${result.result.blocked || ""}`,
        );
      } else {
        toast("Could not prepare", result.reason, "error");
      }
      break;
    }
    case "leads-export":
      exportLeads();
      break;
    case "meeting-new":
      openMeetingForm(null, target.dataset.leadId || "");
      break;
    case "meeting-open": {
      const meeting = findRecord("meetings", id);
      if (meeting) openMeetingForm(meeting);
      break;
    }

    /* --- outreach --- */
    case "outreach-batch":
      await prepareBatch();
      break;
    case "draft-send":
      await run(async () => {
        const result = await sendDraft(id);
        if (result.blocked) toast("Not sent", result.reason, "info");
        else toast("Email sent");
      });
      break;
    case "draft-open": {
      const draft = findRecord("drafts", id);
      if (draft) openDraftForm(draft);
      break;
    }
    case "thread-open":
      closeModal();
      navigate("inbox", { thread: id });
      break;
    case "followup-new":
      openFollowUpForm();
      break;
    case "followup-draft": {
      const followUp = findRecord("followUps", id);
      if (!followUp) break;
      const created = await run(() => createOutreachDraft(followUp.lead_id, { kind: "follow_up", status: "ready" }), "Follow-up drafted");
      if (created) {
        await updateRecord("followUps", id, { status: "drafted", draft_id: created.draft.id });
        openDraftForm(created.draft);
      }
      break;
    }
    case "followup-snooze":
      await run(() => updateRecord("followUps", id, { status: "snoozed", due_at: isoOffset({ days: 2 }) }), "Snoozed two days");
      break;
    case "followup-status":
      await run(() => updateRecord("followUps", id, {
        status: target.dataset.status,
        completed_at: ["replied", "completed", "dead"].includes(target.dataset.status) ? new Date().toISOString() : null,
      }), "Follow-up updated");
      break;

    /* --- studio --- */
    case "studio-view":
      setStudio({ view: target.dataset.value });
      break;
    case "studio-file":
      setStudio({ file: target.dataset.value });
      break;
    case "studio-viewport":
      setStudio({ viewport: target.dataset.value });
      break;
    case "studio-refresh":
      setStudio({ draftFiles: null });
      break;
    case "studio-open-tab": {
      const demo = selectedDemo();
      if (demo && !openBundleInTab(currentFiles(demo))) {
        toast("Popup blocked", "Allow popups to open the site in a new tab.", "error");
      }
      break;
    }
    case "studio-publish": {
      const demo = selectedDemo();
      if (!demo) break;
      const result = await run(() => publishDemo(demo.id));
      if (result) {
        toast(
          result.publish.hosted ? "Published" : "Saved and ready",
          result.publish.hosted ? result.publish.url : result.publish.note,
          result.publish.hosted ? "success" : "info",
        );
      }
      break;
    }
    case "studio-details": {
      const demo = selectedDemo();
      if (demo) openDrawer({ title: "Site details", body: siteDetailsForm(demo) });
      break;
    }
    case "studio-rebuild": {
      const demo = selectedDemo();
      if (!demo) break;
      const lead = findRecord("leads", demo.lead_id);
      const templateRecord = findRecord("templates", demo.template_id);
      const built = buildBundleForLead(lead, catalogForRecord(templateRecord), demo.content?.site || {});
      setStudio({
        pendingChange: {
          summary: `Rebuild from the ${templateRecord?.name || "matching"} template`,
          before: demo.content?.files || {},
          files: built.files,
          primaryFile: "index.html",
        },
      });
      break;
    }
    case "studio-suggest": {
      const input = document.getElementById("studio-input");
      if (input) {
        input.value = target.dataset.text;
        input.focus();
      }
      break;
    }
    case "studio-apply-change": {
      const demo = selectedDemo();
      const change = getState().studio.pendingChange;
      if (!demo || !change) break;
      await run(async () => {
        await saveDemoFiles(demo.id, change.files, { summary: change.summary, custom: false });
        setStudio({ pendingChange: null, draftFiles: null });
      }, "Change applied");
      break;
    }
    case "studio-discard-change":
      setStudio({ pendingChange: null });
      break;

    /* --- websites --- */
    case "template-upload":
      openTemplateUploadForm();
      break;
    case "templates-install":
      await run(ensureTemplateRecords, "Templates installed");
      break;
    case "template-preview": {
      const template = findRecord("templates", id);
      if (!template) break;
      const { files } = buildBundleForTemplateRecord({
        business_name: "Example Local Co.",
        category: template.category,
        city: "Arlington",
        region: "TX",
        phone: "(817) 555-0100",
        address: "120 Main Street, Arlington, TX",
        source_metadata: { openscout: { rating: 4.8, ratingCount: 42 } },
      }, template);
      const previewFiles = await filesForTemplatePreview(template, files);
      openTemplatePreview(template, composeDocument(previewFiles));
      break;
    }
    case "template-delete": {
      const template = findRecord("templates", id);
      if (!template) break;
      if (!confirmDelete(target, "templates", template.name)) break;
      await run(() => deleteCustomTemplate(template), "Template deleted");
      closeModal();
      break;
    }
    case "template-use": {
      closeModal();
      const { data } = getState();
      openTemplateChooser(data.templates, data.leads);
      break;
    }
    case "demo-build": {
      const leadId = target.dataset.leadId || id;
      closeModal();
      const result = await run(() => createOrUpdateDemo(leadId), "Demo built");
      if (result) navigate("studio", { demo: result.demo.id });
      break;
    }
    case "demo-open-tab": {
      const demo = findRecord("demos", id);
      if (demo && !openBundleInTab(demo.content?.files || {})) {
        toast("Popup blocked", "Allow popups to open the site in a new tab.", "error");
      }
      break;
    }
    case "demo-studio":
      closeModal();
      navigate("studio", { demo: id });
      break;
    case "demo-download": {
      const demo = findRecord("demos", id);
      if (demo) downloadBundle(demo.content?.files || {}, demo.slug || demo.name);
      break;
    }
    case "deployment-logs": {
      const deployment = findRecord("deployments", id);
      if (deployment) openDeploymentLogs(deployment);
      break;
    }

    /* --- clients --- */
    case "client-new":
      openClientForm();
      break;
    case "client-open": {
      const client = findRecord("clients", id);
      if (client) openClientDetails(client);
      break;
    }
    case "client-edit": {
      const client = findRecord("clients", id);
      if (client) openClientForm(client);
      break;
    }
    case "project-new":
      closeModal();
      openProjectForm();
      break;
    case "project-open": {
      const project = findRecord("projects", id);
      if (project) openProjectForm(project);
      break;
    }
    case "project-advance": {
      const project = findRecord("projects", id);
      if (!project) break;
      const stages = PROJECT_STAGES;
      const next = stages[Math.min(stages.indexOf(project.status) + 1, stages.length - 1)];
      await run(() => updateRecord("projects", id, {
        status: next,
        progress: Math.round((stages.indexOf(next) / (stages.length - 1)) * 100),
      }), "Project advanced");
      break;
    }
    case "onboarding-open": {
      const client = findRecord("clients", target.dataset.clientId);
      const record = id ? findRecord("onboardingRecords", id) : null;
      if (client) openOnboardingForm(record, client);
      break;
    }
    case "automation-record-new":
      openAutomationRecordForm();
      break;
    case "automation-record-open": {
      const automation = findRecord("automations", id);
      if (automation) openAutomationRecordForm(automation);
      break;
    }
    case "maintenance-new":
      closeModal();
      openMaintenanceForm();
      break;
    case "maintenance-open": {
      const subscription = findRecord("maintenanceSubscriptions", id);
      if (subscription) openMaintenanceForm(subscription);
      break;
    }
    case "maintenance-request-toggle": {
      const request = findRecord("maintenanceRequests", id);
      if (!request) break;
      const complete = request.status !== "completed";
      await run(() => updateRecord("maintenanceRequests", id, {
        status: complete ? "completed" : "new",
        completed_at: complete ? new Date().toISOString() : null,
      }), complete ? "Request completed" : "Request reopened");
      break;
    }
    case "subscription-new":
      closeModal();
      openSubscriptionForm();
      break;
    case "subscription-open": {
      const subscription = findRecord("maintenanceSubscriptions", id);
      if (subscription) openSubscriptionForm(subscription);
      break;
    }

    /* --- money --- */
    case "payment-new":
      openPaymentForm();
      break;
    case "payment-open": {
      const payment = findRecord("payments", id);
      if (payment) openPaymentForm(payment);
      break;
    }
    case "commission-open": {
      const commission = findRecord("commissions", id);
      if (commission) openCommissionForm(commission);
      break;
    }
    case "expense-new":
      openExpenseForm();
      break;
    case "expense-open": {
      const expense = findRecord("expenses", id);
      if (expense) openExpenseForm(expense);
      break;
    }
    case "expense-delete":
      if (!confirmDelete(target, "expenses", findRecord("expenses", id)?.description)) break;
      await run(() => deleteRecord("expenses", id), "Expense deleted");
      closeModal();
      break;
    case "pricing-new":
      openPricingForm();
      break;
    case "pricing-open": {
      const experiment = findRecord("pricingExperiments", id);
      if (experiment) openPricingForm(experiment);
      break;
    }
    case "team-member-new":
      openTeamMemberForm();
      break;
    case "team-member-open": {
      const member = findRecord("teamMembers", id);
      if (member) openTeamMemberForm(member);
      break;
    }

    /* --- workspace --- */
    case "task-new":
      openTaskForm();
      break;
    case "task-open": {
      const task = findRecord("tasks", id);
      if (task) openTaskForm(task);
      break;
    }
    case "task-toggle": {
      const task = findRecord("tasks", id);
      if (task) await run(() => updateRecord("tasks", id, { status: task.status === "completed" ? "pending" : "completed" }));
      break;
    }
    case "task-delete":
      if (!confirmDelete(target, "tasks", findRecord("tasks", id)?.title)) break;
      await run(() => deleteRecord("tasks", id), "Task deleted");
      closeModal();
      break;
    case "note-new":
      openNoteForm();
      break;
    case "note-open": {
      const note = findRecord("notes", id);
      if (note) openNoteForm(note);
      break;
    }
    case "note-delete":
      if (!confirmDelete(target, "notes", findRecord("notes", id)?.title)) break;
      await run(() => deleteRecord("notes", id), "Note deleted");
      closeModal();
      break;
    case "calendar-new":
      openCalendarForm();
      break;
    case "calendar-day":
      openCalendarForm(target.dataset.date);
      break;
    case "calendar-shift": {
      const current = /^\d{4}-\d{2}$/.test(getState().routeParams.month || "")
        ? new Date(`${getState().routeParams.month}-01T12:00:00`)
        : new Date();
      current.setMonth(current.getMonth() + number(target.dataset.direction, 1));
      setParam("month", `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`);
      break;
    }
    case "calendar-today":
      setParam("month", "");
      break;

    default:
      break;
  }
}

/* ---------- control changes ---------- */

export async function onChange(event) {
  const target = event.target;
  const action = target.dataset.action;
  if (!action) return;

  if (action === "route-select") {
    setParam(target.dataset.key, target.value);
    return;
  }
  if (action === "discovery-select") {
    const selected = new Set(getState().discovery.selected.map(String));
    if (target.checked) selected.add(String(target.dataset.id));
    else selected.delete(String(target.dataset.id));
    setDiscovery({ selected: [...selected] });
    return;
  }
  if (action === "outreach-lead") {
    navigate("outreach", { ...getState().routeParams, lead: target.value });
    return;
  }
  if (action === "studio-demo") {
    setStudio({ draftFiles: null, pendingChange: null });
    navigate("studio", { demo: target.value });
    return;
  }
  if (action === "thread-classify") {
    await run(() => classifyReply(target.dataset.id, target.value), "Reply classified");
    return;
  }
  if (action === "assistant-conversation") {
    openAssistantConversation(target.value);
    return;
  }
  /* Model and effort switch in place, from the assistant bar or Settings, so
     you can drop to a cheaper model mid-conversation without leaving the page. */
  if (action === "ai-permission-select") {
    await run(async () => {
      await savePreferences({ ai_permission_mode: target.value, ai_permission_mode_version: 2 });
      toast("AI access updated", "The new permission mode applies on the next message.");
    });
    return;
  }
  if (action === "model-select" || action === "effort-select") {
    const key = action === "model-select" ? "model" : "effort";
    await run(async () => {
      await savePreferences({ [key]: target.value });
      const { model, effort } = activeModel();
      toast("Model updated", `${model.label}${model.supportsEffort ? ` · ${effort} effort` : ""} · ${formatPerMTok(model)}`);
    });
  }
}

/* ---------- form submits ---------- */

export async function onSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();

  const type = form.dataset.form;
  const id = form.dataset.id;
  const values = clean(formValues(form));
  const mode = event.submitter?.dataset.mode || "";
  const submit = event.submitter || form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;

  try {
    switch (type) {
      case "discovery":
        await runDiscovery(values);
        break;

      case "assistant":
        await handleAssistant(values.message, form);
        break;

      case "template-upload": {
        const readSource = async (name, required = false) => {
          const file = form.elements[name]?.files?.[0] || null;
          if (!file && required) throw new Error(`${name} is required.`);
          return file ? file.text() : "";
        };
        const files = {
          "index.html": await readSource("html_file", true),
          "style.css": await readSource("css_file", true),
          "script.js": await readSource("js_file"),
        };
        const assets = [...(form.elements.assets?.files || [])];
        const template = await createCustomTemplate({
          name: values.name,
          category: values.category,
          description: values.description || "",
          files,
          assets,
        });
        closeModal();
        toast("Template uploaded", `${template.name} · ${assets.length} original asset${assets.length === 1 ? "" : "s"}.`);
        break;
      }

      case "automation-settings":
        await saveAutomationSettings({
          batchTarget: number(values.batchTarget, 48),
          price: number(values.price, 500),
          followUpDays: number(values.followUpDays, 3),
          stepDelayMs: number(values.stepDelayMs, 220),
          maxConsecutiveFailures: number(values.maxConsecutiveFailures, 3),
          niche: values.niche || "",
          location: values.location || "",
          autoFollowUp: Boolean(values.autoFollowUp),
          research: Boolean(values.research),
        });
        toast("Settings saved");
        break;

      case "lead": {
        const payload = {
          ...values,
          has_website: Boolean(values.has_website),
          website_status: values.has_website ? "Has website" : "No website",
          lead_score: number(values.lead_score, 80),
          qualification_score: number(values.lead_score, 80),
          opportunity_score: number(values.lead_score, 80),
          deal_value: number(values.deal_value, 2500),
          asking_price: number(values.deal_value, 2500),
          quoted_setup_fee: values.quoted_setup_fee === null ? null : number(values.quoted_setup_fee, 0),
          quoted_monthly_fee: values.quoted_monthly_fee === null ? null : number(values.quoted_monthly_fee, 0),
          opportunity_tags: lines(values.opportunity_tags),
          pain_points: lines(values.pain_points),
          objections: lines(values.objections),
          source: id ? findRecord("leads", id)?.source || "manual" : "manual",
          source_key: id ? findRecord("leads", id)?.source_key || null : `manual-${slugify(values.business_name || uid())}`,
          discovered_at: id ? findRecord("leads", id)?.discovered_at : new Date().toISOString(),
        };
        const saved = id ? await updateRecord("leads", id, payload) : await createRecord("leads", payload);
        await logActivity(id ? "lead_updated" : "lead_created", id ? "Lead updated" : "Lead added", saved.business_name, { lead_id: saved.id });
        closeModal();
        toast(id ? "Lead updated" : "Lead added");
        break;
      }

      case "lead-stage":
        await updatePipeline(id, values.status);
        closeModal();
        toast("Stage updated");
        break;

      case "sales-call": {
        if (values.outcome === "meeting_booked" && !values.meeting_starts_at) {
          throw new Error("Add the meeting time before saving a booked meeting.");
        }
        await recordSalesCall(form.dataset.leadId, {
          ...values,
          next_follow_up_at: values.next_follow_up_at ? iso(values.next_follow_up_at) : null,
          meeting_starts_at: values.meeting_starts_at ? iso(values.meeting_starts_at) : null,
        });
        form.reset();
        navigate("calling");
        toast("Call saved", "The lead, activity, and any follow-up or meeting were updated.");
        break;
      }

      case "meeting": {
        const payload = {
          title: values.title,
          lead_id: values.lead_id,
          client_id: values.client_id,
          salesperson_id: values.salesperson_id,
          starts_at: iso(values.starts_at),
          ends_at: iso(values.ends_at),
          outcome: values.outcome,
          implementation_complexity: values.implementation_complexity,
          quoted_setup_fee: values.quoted_setup_fee === null ? null : number(values.quoted_setup_fee, 0),
          quoted_monthly_fee: values.quoted_monthly_fee === null ? null : number(values.quoted_monthly_fee, 0),
          current_workflow: values.current_workflow,
          biggest_pain_point: values.biggest_pain_point,
          approximate_volume: values.approximate_volume,
          decision_maker: values.decision_maker,
          existing_crm: values.existing_crm,
          calendar_system: values.calendar_system,
          phone_provider: values.phone_provider,
          usage_allowance: values.usage_allowance,
          automation_proposed: values.automation_proposed,
          tools_used: lines(values.tools_used),
          required_integrations: lines(values.required_integrations),
          notes: values.notes,
          next_action: values.next_action,
        };
        const meeting = id ? await updateRecord("meetings", id, payload) : await createMeeting(payload);
        if (id && meeting.lead_id) {
          if (meeting.outcome === "won") await updatePipeline(meeting.lead_id, "won");
          else if (meeting.outcome === "lost") await updatePipeline(meeting.lead_id, "lost");
          else if (meeting.outcome === "proposal_needed") await updatePipeline(meeting.lead_id, "demo_completed");
        }
        closeModal();
        toast("Meeting saved");
        break;
      }

      case "outreach": {
        const leadId = values.lead_id || form.dataset.leadId;
        const status = mode === "draft" ? "draft" : "ready";
        const { draft } = await createOutreachDraft(leadId, { price: number(values.price, 500), status });
        const updated = await updateRecord("drafts", draft.id, { subject: values.subject, body: values.body, status });
        if (mode === "send") {
          const result = await sendDraft(updated.id);
          toast(result.sent ? "Email sent" : "Not sent", result.sent ? "" : result.reason, result.sent ? "success" : "info");
        } else {
          toast(mode === "draft" ? "Draft saved" : "Marked ready");
        }
        break;
      }

      case "draft": {
        const status = mode === "draft" ? "draft" : "ready";
        const updated = await updateRecord("drafts", id, { subject: values.subject, body: values.body, status });
        closeModal();
        if (mode === "send") {
          const result = await sendDraft(updated.id);
          toast(result.sent ? "Email sent" : "Not sent", result.sent ? "" : result.reason, result.sent ? "success" : "info");
        } else {
          toast(mode === "draft" ? "Draft saved" : "Marked ready");
        }
        break;
      }

      case "direct-email": {
        await sendDirectEmail({
          to: values.to,
          cc: values.cc,
          subject: values.subject,
          body: values.body,
          leadId: values.lead_id || null,
        });
        closeModal();
        toast("Email sent", values.to);
        break;
      }

      case "reply": {
        const threadId = form.dataset.threadId;
        const thread = findRecord("emailThreads", threadId);

        /* A thread that came from Outlook can be answered in place. Anything
           else — an older record, or a mailbox that has not been synced — still
           falls back to a ready draft rather than dropping the reply. */
        if (thread?.external_thread_id && canSend()) {
          await replyToThread(threadId, values.body);
          toast("Reply sent", thread.sender_email || "");
          form.reset();
          break;
        }

        await createRecord("drafts", {
          lead_id: form.dataset.leadId || null,
          kind: "reply",
          subject: `Re: ${thread?.subject || "Website preview"}`,
          body: values.body,
          status: "ready",
        });
        await updateRecord("emailThreads", threadId, { is_unread: false });
        toast(
          "Reply saved as ready",
          canSend() ? "This thread has no Outlook conversation to answer — send it from Outreach." : "Outlook is not connected yet.",
        );
        form.reset();
        break;
      }

      case "followup": {
        const payload = {
          lead_id: values.lead_id,
          sequence_number: number(values.sequence_number, 1),
          due_at: iso(values.due_at),
          suggested_text: values.suggested_text || "",
          status: id ? findRecord("followUps", id)?.status || "scheduled" : "scheduled",
        };
        if (id) await updateRecord("followUps", id, payload);
        else await createRecord("followUps", payload);
        await updateRecord("leads", values.lead_id, { follow_up_at: payload.due_at });
        closeModal();
        toast("Follow-up saved");
        break;
      }

      case "build-demo": {
        const templateRecord = values.template_id ? findRecord("templates", values.template_id) : null;
        const result = await createOrUpdateDemo(values.lead_id, { templateRecord });
        closeModal();
        toast("Demo built", result.reason);
        navigate("studio", { demo: result.demo.id });
        break;
      }

      case "studio-file": {
        const demo = findRecord("demos", form.dataset.demoId);
        const file = form.dataset.file;
        await saveDemoFiles(demo.id, { ...(demo.content?.files || {}), [file]: values.source }, { summary: `Edited ${file}` });
        toast("File saved");
        break;
      }

      case "studio-details": {
        const demo = findRecord("demos", form.dataset.demoId);
        const overrides = {
          business: values.business,
          phone: values.phone,
          email: values.email,
          address: values.address,
          cta: values.cta,
          hours: values.hours,
        };
        const lead = findRecord("leads", demo.lead_id);
        const templateRecord = findRecord("templates", demo.template_id);
        const built = buildBundleForLead(lead, catalogForRecord(templateRecord), { ...(demo.content?.site || {}), ...overrides });
        await updateRecord("demos", demo.id, {
          business_info: { ...(demo.business_info || {}), name: overrides.business, phone: overrides.phone, email: overrides.email, address: overrides.address, cta: overrides.cta, hours: overrides.hours },
          content: { ...(demo.content || {}), site: built.site, files: built.files, custom_edited: false },
        });
        closeDrawer();
        toast("Site updated");
        break;
      }

      case "studio-ai": {
        const message = String(values.message || "").trim();
        if (!message) break;
        const messages = [...getState().studio.messages, { role: "user", text: message }];
        if (providerReady()) {
          messages.push({ role: "system", text: "The provider is connected but the request layer is not implemented yet." });
        } else {
          messages.push({
            role: "system",
            blocked: true,
            text: "No AI provider is connected, so this request was not answered. Use Site details or the file editor for manual changes.",
          });
        }
        setStudio({ messages });
        form.reset();
        break;
      }

      case "client": {
        const setupFee = number(values.setup_fee, 2500);
        const payload = {
          ...values,
          agreed_price: setupFee,
          setup_fee: setupFee,
          monthly_fee: number(values.monthly_fee, 300),
          amount_received: number(values.amount_received, 0),
          payment_status: number(values.amount_received) >= setupFee ? "paid" : "pending",
          pricing: { setup_fee: setupFee, monthly_fee: number(values.monthly_fee, 300) },
        };
        if (id) await updateRecord("clients", id, payload);
        else {
          if (!values.lead_id) throw new Error("Choose the won lead to convert.");
          await updateRecord("leads", values.lead_id, { quoted_setup_fee: setupFee, quoted_monthly_fee: payload.monthly_fee });
          await updatePipeline(values.lead_id, "won");
          const created = getState().data.clients.find((client) => String(client.lead_id) === String(values.lead_id));
          if (!created) throw new Error("The won lead could not be converted to a client.");
          await updateRecord("clients", created.id, payload);
        }
        closeModal();
        toast("Client saved");
        break;
      }

      case "project": {
        const payload = {
          ...values,
          progress: number(values.progress, 0),
          requirements: jsonValue(values.requirements, "Requirements"),
        };
        if (id) await updateRecord("projects", id, payload);
        else await createRecord("projects", payload);
        closeModal();
        toast("Project saved");
        break;
      }

      case "onboarding": {
        const payload = {
          client_id: form.dataset.clientId,
          status: values.status,
          progress: number(values.progress, 0),
          completed_at: values.status === "complete" ? new Date().toISOString() : null,
          business: {
            services: lines(values.business_services),
            service_area: lines(values.business_service_area),
            hours: values.business_hours || "",
            staff: values.business_staff || "",
          },
          customer_handling: {
            common_questions: lines(values.handling_common_questions),
            qualification_criteria: lines(values.handling_qualification),
            allowed_guidance: lines(values.handling_allowed),
            forbidden_behavior: lines(values.handling_forbidden),
            escalation_rules: values.handling_escalation || "",
            appointment_rules: values.handling_appointment_rules || "",
          },
          technical: {
            phone_system: values.technical_phone || "",
            crm: values.technical_crm || "",
            calendar: values.technical_calendar || "",
            messaging: values.technical_messaging || "",
            tools: values.technical_tools || "",
          },
          automation_goals: {
            current_problem: values.goals_problem || "",
            desired_outcome: values.goals_outcome || "",
            current_workflow: values.goals_current_workflow || "",
            proposed_workflow: values.goals_proposed_workflow || "",
            success_metric: values.goals_success_metric || "",
          },
        };
        if (id) await updateRecord("onboardingRecords", id, payload);
        else await createRecord("onboardingRecords", payload);
        await updateRecord("clients", form.dataset.clientId, { onboarding_status: payload.status, onboarding_progress: payload.progress });
        closeModal();
        toast("Onboarding saved");
        break;
      }

      case "automation-record": {
        if (!values.name || !values.client_id || !values.automation_type) throw new Error("Name, client, and type are required.");
        const payload = {
          name: values.name,
          client_id: values.client_id,
          automation_type: values.automation_type,
          provider: values.provider,
          status: values.status,
          environment: values.environment,
          development_version: values.development_version,
          deployed_version: values.deployed_version,
          system_prompt: values.system_prompt,
          configuration: jsonValue(values.configuration, "Configuration"),
          escalation_behavior: jsonValue(values.escalation_behavior, "Escalation behavior"),
        };
        if (id) await updateRecord("automations", id, payload);
        else await createRecord("automations", payload);
        closeModal();
        toast("Automation saved");
        break;
      }

      case "maintenance": {
        const payload = {
          ...values,
          monthly_amount: number(values.monthly_amount, 50),
          hosting_included: Boolean(values.hosting_included),
          domain_managed: Boolean(values.domain_managed),
        };
        if (id) await updateRecord("maintenanceSubscriptions", id, payload);
        else await createRecord("maintenanceSubscriptions", payload);
        if (values.client_id) await updateRecord("clients", values.client_id, { maintenance_status: values.status });
        closeModal();
        toast("Plan saved");
        break;
      }

      case "subscription": {
        const payload = {
          ...values,
          monthly_amount: number(values.monthly_amount, 300),
          included_usage: values.included_usage === null ? null : number(values.included_usage, 0),
          overage_rate: values.overage_rate === null ? null : number(values.overage_rate, 0),
          billing_day: values.billing_day === null ? null : number(values.billing_day, 1),
          hosting_included: false,
          domain_managed: false,
        };
        if (id) await updateRecord("maintenanceSubscriptions", id, payload);
        else await createRecord("maintenanceSubscriptions", payload);
        if (values.client_id) await updateRecord("clients", values.client_id, { maintenance_status: values.status });
        closeModal();
        toast("Subscription saved");
        break;
      }

      case "payment": {
        const payload = {
          ...values,
          amount: number(values.amount, 0),
          fee_amount: number(values.fee_amount, 0),
          paid_at: iso(values.paid_at),
          source: "manual",
        };
        const payment = id
          ? await updateRecord("payments", id, payload)
          : await recordPayment(payload);
        if (id) await syncCommissionForPayment(payment);
        closeModal();
        toast("Payment saved");
        break;
      }

      case "commission": {
        const patch = {
          status: values.status,
          notes: values.notes,
          paid_at: values.status === "paid" ? new Date().toISOString() : null,
          reversed_at: values.status === "reversed" ? new Date().toISOString() : null,
        };
        await updateRecord("commissions", id, patch);
        closeModal();
        toast("Commission updated");
        break;
      }

      case "expense": {
        const payload = { ...values, amount: number(values.amount, 0), recurring: Boolean(values.recurring) };
        if (id) await updateRecord("expenses", id, payload);
        else await createRecord("expenses", payload);
        closeModal();
        toast("Expense saved");
        break;
      }

      case "pricing": {
        const payload = {
          ...values,
          offer_amount: number(values.offer_amount, 500),
          sent_count: number(values.sent_count, 0),
          reply_count: number(values.reply_count, 0),
          close_count: number(values.close_count, 0),
          revenue: number(values.revenue, 0),
        };
        if (id) await updateRecord("pricingExperiments", id, payload);
        else await createRecord("pricingExperiments", payload);
        closeModal();
        toast("Experiment saved");
        break;
      }

      case "team-member": {
        const minimum = number(values.commission_min, 250);
        const maximum = number(values.commission_max, 1000);
        if (maximum < minimum) throw new Error("Commission maximum cannot be below the minimum.");
        const payload = {
          full_name: values.full_name,
          access_email: values.access_email,
          role: values.role,
          status: values.status,
          permissions: id ? findRecord("teamMembers", id)?.permissions || {} : {},
          commission_rate: number(values.commission_rate, 10) / 100,
          commission_min: minimum,
          commission_max: maximum,
        };
        if (id) await updateRecord("teamMembers", id, payload);
        else await createRecord("teamMembers", payload);
        closeModal();
        toast("Team member saved");
        break;
      }

      case "task": {
        const payload = { ...values, due_at: iso(values.due_at), status: values.status || (id ? findRecord("tasks", id)?.status : "pending") || "pending" };
        if (id) await updateRecord("tasks", id, payload);
        else await createRecord("tasks", { ...payload, created_by: "user" });
        closeModal();
        toast("Task saved");
        break;
      }

      case "note": {
        const payload = {
          ...values,
          tags: String(values.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean),
          is_pinned: Boolean(values.is_pinned),
        };
        if (id) await updateRecord("notes", id, payload);
        else await createRecord("notes", payload);
        closeModal();
        toast("Note saved");
        break;
      }

      case "calendar": {
        const payload = { ...values, starts_at: iso(values.starts_at) };
        if (id) await updateRecord("calendarEvents", id, payload);
        else await createRecord("calendarEvents", payload);
        closeModal();
        toast("Event saved");
        break;
      }

      case "classify":
        await classifyReply(id, values.classification);
        closeModal();
        toast("Reply classified");
        break;

      case "settings": {
        await savePreferences({
          owner_name: values.owner_name,
          business_name: values.business_name,
          default_site_price: number(values.default_site_price, 500),
          maintenance_price: number(values.maintenance_price, 50),
          default_email: values.default_email,
          signature: values.signature,
          batch_target: number(values.batch_target, 48),
          preview_domain: values.preview_domain,
          timezone: values.timezone,
          model: values.model,
          effort: values.effort,
          follow_up_days: String(values.follow_up_days || "")
            .split(",")
            .map((part) => number(part.trim()))
            .filter((day) => day > 0),
        });
        await saveAutomationSettings({ batchTarget: number(values.batch_target, 48), price: number(values.default_site_price, 500) });
        toast("Settings saved");
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error(error);
    toast("That did not work", error.message || "Try again.", "error");
  } finally {
    if (submit) submit.disabled = false;
  }
}

/* ---------- assistant turn ---------- */

async function handleAssistant(rawMessage, form) {
  const message = String(rawMessage || "").trim();
  if (!message) return;

  const messages = [...getState().assistant.messages, { id: uid(), role: "user", text: message, at: new Date().toISOString() }];
  setAssistant({ messages, pending: true });
  await persistAssistantHistory(messages);
  form.reset();
  const input = document.getElementById("assistant-input");
  if (input) input.style.height = "auto";

  const command = matchCommand(message);
  if (command) {
    const { result } = await runCommand(command);
    const commandResult = {
      id: uid(),
      role: "tool",
      tool: command.tool,
      args: command.input,
      result,
      at: new Date().toISOString(),
    };
    const commandMessages = [...messages, commandResult];
    const needsModelFollowThrough = result.complete === false && providerReady();
    setAssistant({
      pending: needsModelFollowThrough,
      messages: commandMessages,
    });
    await persistAssistantHistory();
    if (!needsModelFollowThrough) return;

    try {
      /* A deterministic shortcut can start the operation, but it cannot call a
         shortfall "done." Hand the real result to the agent so it can retry
         with broader/deeper discovery and then explain the outcome. */
      await runAgentLoop({
        transcript: commandMessages,
        onEntry: (entry) => setAssistant({ messages: [...getState().assistant.messages, entry] }),
      });
      setAssistant({ pending: false });
      await persistAssistantHistory();
    } catch (error) {
      console.error(error);
      setAssistant({
        pending: false,
        messages: [...getState().assistant.messages, {
          id: uid(),
          role: "system",
          blocked: true,
          who: error.blocked ? "Not connected" : "Request failed",
          text: error.message || "The assistant request did not complete.",
          at: new Date().toISOString(),
        }],
      });
      await persistAssistantHistory().catch((historyError) => console.error("Could not save assistant history", historyError));
    }
    return;
  }

  if (!providerReady()) {
    setAssistant({
      pending: false,
      messages: [...messages, {
        id: uid(),
        role: "system",
        blocked: true,
        who: "Not answered",
        text: "No AI provider is connected, so this was not answered. Commands like “go”, “stop”, “status”, “next” and “revenue” work now and run real operations.",
        at: new Date().toISOString(),
      }],
    });
    await persistAssistantHistory();
    return;
  }

  try {
    /* The loop appends as it goes, so a multi-step request shows each tool
       landing instead of freezing until the whole chain finishes. Tools run
       through the same registry the commands use, so the model can only do
       things the application can already do. */
    await runAgentLoop({
      transcript: messages,
      onEntry: (entry) => setAssistant({ messages: [...getState().assistant.messages, entry] }),
    });
    setAssistant({ pending: false });
    await persistAssistantHistory();
  } catch (error) {
    console.error(error);
    setAssistant({
      pending: false,
      messages: [...getState().assistant.messages, {
        id: uid(),
        role: "system",
        blocked: true,
        who: error.blocked ? "Not connected" : "Request failed",
        text: error.message || "The assistant request did not complete.",
        at: new Date().toISOString(),
      }],
    });
    await persistAssistantHistory().catch((historyError) => console.error("Could not save assistant history", historyError));
  }
}

/* ---------- discovery ---------- */

async function runDiscovery(values) {
  setDiscovery({
    status: "running",
    runId: null,
    results: [],
    selected: [],
    error: "",
    progress: { phase: "scan", completed: 0, total: 1, scanned: 0, leads: 0 },
    summary: null,
  });

  try {
    const search = await runDiscoverySearch({
      apiKey: values.api_key,
      location: values.location,
      businessType: values.business_type,
      radiusKm: number(values.radius_km, 15),
      limit: number(values.limit, 50),
      depth: values.depth || "standard",
      minConfidence: number(values.min_confidence, 70),
      minRating: number(values.min_rating, 0),
      noWebsite: values.no_website !== false,
      mustHaveEmail: Boolean(values.must_have_email),
      mustHavePhone: Boolean(values.must_have_phone),
      skipKnown: values.skip_known !== false,
      verify: Boolean(values.verify),
    }, {
      onProgress: (progress) => setDiscovery({ progress }),
      onRunCreated: (record) => setDiscovery({ runId: record.id }),
    });

    setDiscovery({
      status: "completed",
      results: search.results,
      selected: [],
      progress: null,
      summary: search.summary,
      error: "",
    });
    const excluded = Number(search.summary?.excludedExistingWebsite || 0);
    toast(
      "Search finished",
      `${search.results.length} businesses found${excluded ? ` · ${excluded} official site${excluded === 1 ? "" : "s"} filtered` : ""}.`,
    );
  } catch (error) {
    console.error(error);
    setDiscovery({ status: "failed", progress: null, error: error.message || "The search could not finish." });
  }
}

async function saveDiscovery(ids) {
  if (!ids.length) return;
  const result = await run(() => saveDiscoveryCandidates(ids));
  if (!result) return;
  const selected = new Set(getState().discovery.selected.map(String));
  ids.forEach((value) => selected.delete(String(value)));
  setDiscovery({ selected: [...selected] });
  toast("Saved to leads", `${result.saved.length} added${result.duplicates.length ? `, ${result.duplicates.length} already known` : ""}.`);
  closeModal();
}

async function rejectDiscovery(ids) {
  if (!ids.length) return;
  await run(() => rejectDiscoveryCandidates(ids), "Rejected");
  const selected = new Set(getState().discovery.selected.map(String));
  ids.forEach((value) => selected.delete(String(value)));
  setDiscovery({ selected: [...selected] });
  closeModal();
}

/* ---------- batch outreach ---------- */

async function prepareBatch() {
  const { data } = getState();
  const settings = preferences();
  const eligible = data.leads.filter((lead) => {
    const demo = demoForLead(lead.id);
    const exists = data.drafts.some((draft) => String(draft.lead_id) === String(lead.id) && draft.kind === "initial");
    return demo && !exists && !["won", "lost"].includes(lead.status);
  }).slice(0, 25);

  if (!eligible.length) {
    toast("Nothing to prepare", "Leads need a demo and no existing outreach email.", "info");
    return;
  }

  await run(async () => {
    for (const lead of eligible) {
      await createOutreachDraft(lead, { price: settings.default_site_price, status: "ready" });
    }
    await logActivity("email_batch_prepared", "Outreach batch prepared", `${eligible.length} emails ready to send.`);
  }, "Batch prepared", `${eligible.length} emails ready.`);
}

/* ---------- export ---------- */

function exportLeads() {
  const fields = ["business_name", "contact_name", "email", "phone", "address", "city", "region", "category", "website_status", "lead_score", "status", "deal_value", "last_contacted_at", "follow_up_at"];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [fields.join(","), ...getState().data.leads.map((lead) => fields.map((key) => quote(lead[key])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
  toast("Export started");
}

/* ---------- pipeline drag ---------- */

export function bindBoardDrag() {
  document.querySelectorAll(".deal[draggable='true']").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      card.classList.add("dragging");
      event.dataTransfer?.setData("text/plain", card.dataset.leadId);
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });

  document.querySelectorAll(".board__list").forEach((column) => {
    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      column.classList.add("is-over");
    });
    column.addEventListener("dragleave", () => column.classList.remove("is-over"));
    column.addEventListener("drop", async (event) => {
      event.preventDefault();
      column.classList.remove("is-over");
      const leadId = event.dataTransfer?.getData("text/plain") || document.querySelector(".deal.dragging")?.dataset.leadId;
      const stage = column.dataset.stage;
      const lead = findRecord("leads", leadId);
      if (!lead || !PIPELINE_STAGES.some((item) => item.id === stage) || lead.status === stage) return;
      await run(() => updatePipeline(lead.id, stage), "Moved", `${lead.business_name} → ${stage.replaceAll("_", " ")}`);
    });
  });
}
