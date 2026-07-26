import { OUTREACH_BODY, PIPELINE_STAGES } from "./config.js";
import { closeCommandPalette } from "./components/command-palette.js";
import {
  openApprovalDetails,
  openCalendarForm,
  openClientDetails,
  openClientForm,
  openDemoDetails,
  openDemoForm,
  openDeploymentLogs,
  openDiscoveryDetails,
  openDraftForm,
  openExpenseForm,
  openFollowUpForm,
  openLeadDetails,
  openLeadForm,
  openMaintenanceForm,
  openNoteForm,
  openPaymentForm,
  openPricingForm,
  openProjectForm,
  openTaskForm,
  openTemplateForm,
  openUploadForm,
} from "./components/forms.js";
import { setMobileNav } from "./components/shell.js";
import { closeModal, formDataObject, openModal, toast } from "./components/ui.js";
import { navigate } from "./core/router.js";
import { getState, setDiscovery, setState } from "./core/state.js";
import { escapeHtml, slugify } from "./core/utils.js";
import { signOut } from "./services/auth.js";
import {
  completeDiscoveryRun,
  createDiscoveryRun,
  createRecord,
  createRecords,
  deleteRecord,
  failDiscoveryRun,
  logActivity,
  markNotificationsRead,
  rejectDiscoveryCandidates,
  resolveApproval,
  saveDiscoveryCandidates,
  seedWorkspace,
  startManualRun,
  updateProfilePreferences,
  updateRecord,
  uploadDemoBundle,
} from "./services/data.js";
import {
  discoverWithOpenScout,
  getStoredApiKey,
  setStoredApiKey,
} from "./services/openscout/adapter.js";

const PROJECT_STAGES = ["payment_received", "changes", "client_review", "domain_setup", "launch", "live"];
const SAFE_DELETE_COLLECTIONS = new Set(["leads", "tasks", "notes", "templates", "demos", "expenses"]);

function record(collection, id) {
  return getState().data[collection]?.find((item) => String(item.id) === String(id));
}

function cleanObject(value) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item === "" ? null : item]));
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function run(action, successTitle = "", successMessage = "") {
  try {
    const result = await action();
    if (successTitle) toast(successTitle, successMessage);
    return result;
  } catch (error) {
    console.error(error);
    toast("Action failed", error.message || "Please try again.", "error");
    return null;
  }
}

function closePanels() {
  setState({
    agentPanelOpen: false,
    approvalPanelOpen: false,
    notificationPanelOpen: false,
    mobileNavOpen: false,
  });
  setMobileNav(false);
}

function updateRouteParam(key, value) {
  const { route, routeParams } = getState();
  const params = { ...routeParams };
  if (value === "" || value === "all" || value == null) delete params[key];
  else params[key] = value;
  navigate(route, params);
}

function personalizedOutreach(lead, demo, amount) {
  return OUTREACH_BODY
    .replaceAll("[Business Name]", lead?.business_name || "[Business Name]")
    .replaceAll("[link]", demo?.preview_url || "[preview link]")
    .replace("$400", `$${number(amount, 400)}`);
}

export async function handleActionClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const directLink = event.target.closest("a[href]");
  if (directLink && !directLink.hasAttribute("data-action") && directLink !== target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  event.preventDefault();

  if (document.getElementById("command-palette-root").innerHTML && action !== "close-command-palette") {
    closeCommandPalette();
  }

  switch (action) {
    case "navigate": {
      const params = target.dataset.routeId ? { id: target.dataset.routeId } : {};
      navigate(target.dataset.routeTarget, params);
      closePanels();
      break;
    }
    case "route-filter":
      updateRouteParam(target.dataset.key, target.dataset.value);
      break;
    case "open-mobile-nav":
      setState({ mobileNavOpen: true });
      setMobileNav(true);
      break;
    case "close-modal":
      closeModal();
      break;
    case "close-command-palette":
      closeCommandPalette();
      break;
    case "close-panels":
      closePanels();
      break;
    case "open-orchestrator":
      setState({ agentPanelOpen: true, approvalPanelOpen: false, notificationPanelOpen: false });
      break;
    case "open-approvals":
      setState({ approvalPanelOpen: true, agentPanelOpen: false, notificationPanelOpen: false });
      break;
    case "toggle-discovery-selection": {
      const selected = new Set(getState().discovery.selected);
      if (target.checked) selected.add(id);
      else selected.delete(id);
      setDiscovery({ selected: [...selected] });
      break;
    }
    case "select-all-discovery": {
      const pendingIds = [...document.querySelectorAll('input[data-action="toggle-discovery-selection"]')].map((input) => input.dataset.id);
      setDiscovery({ selected: target.checked ? pendingIds : [] });
      break;
    }
    case "save-discovery":
      await saveDiscovery([id]);
      break;
    case "save-selected-discovery":
      await saveDiscovery(getState().discovery.selected);
      break;
    case "reject-discovery":
      await rejectDiscovery([id]);
      break;
    case "reject-selected-discovery":
      await rejectDiscovery(getState().discovery.selected);
      break;
    case "inspect-discovery": {
      const result = record("discoveryResults", id);
      if (result) openDiscoveryDetails(result);
      break;
    }
    case "open-discovery-run": {
      const runRecord = record("discoveryRuns", id);
      if (!runRecord) break;
      const results = getState().data.discoveryResults.filter((item) => item.run_id === id);
      setDiscovery({ runId: id, results, selected: [], summary: runRecord.summary || null, status: "idle", error: "" });
      break;
    }
    case "new-lead":
      openLeadForm();
      break;
    case "open-lead": {
      const lead = record("leads", id || target.dataset.leadId);
      if (lead) openLeadDetails(lead);
      break;
    }
    case "edit-lead": {
      const lead = record("leads", id);
      if (lead) openLeadForm(lead);
      break;
    }
    case "toggle-lead-selection":
      break;
    case "select-all-leads":
      document.querySelectorAll('input[data-action="toggle-lead-selection"]').forEach((input) => { input.checked = target.checked; });
      break;
    case "bulk-lead-stage": {
      const stage = document.getElementById("lead-bulk-stage")?.value;
      const ids = [...document.querySelectorAll('input[data-action="toggle-lead-selection"]:checked')].map((input) => input.dataset.id);
      if (!stage || !ids.length) {
        toast("Choose leads and a stage", "Select at least one row before applying.", "error");
        break;
      }
      await run(async () => {
        await Promise.all(ids.map((leadId) => updateRecord("leads", leadId, { status: stage })));
        await logActivity("pipeline_moved", "Bulk pipeline update", `${ids.length} leads moved to ${stage.replaceAll("_", " ")}.`, { metadata: { lead_ids: ids, stage } });
      }, "Pipeline updated", `${ids.length} leads moved.`);
      break;
    }
    case "compose-for-lead":
      closeModal();
      navigate("outreach", { lead: id });
      break;
    case "new-task":
      openTaskForm();
      break;
    case "open-task": {
      const task = record("tasks", id);
      if (task) openTaskForm(task);
      break;
    }
    case "toggle-task": {
      const task = record("tasks", id);
      if (!task) break;
      await run(() => updateRecord("tasks", id, { status: task.status === "completed" ? "pending" : "completed" }), task.status === "completed" ? "Task reopened" : "Task completed");
      break;
    }
    case "new-calendar-event":
      openCalendarForm();
      break;
    case "calendar-day":
      openCalendarForm(target.dataset.date);
      break;
    case "shift-calendar": {
      const current = /^\d{4}-\d{2}$/.test(getState().routeParams.month || "") ? new Date(`${getState().routeParams.month}-01T12:00:00`) : new Date();
      current.setMonth(current.getMonth() + number(target.dataset.direction));
      updateRouteParam("month", `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`);
      break;
    }
    case "calendar-today":
      updateRouteParam("month", "");
      break;
    case "new-template":
      openTemplateForm();
      break;
    case "edit-template": {
      const template = record("templates", id);
      if (template) openTemplateForm(template);
      break;
    }
    case "duplicate-template": {
      const template = record("templates", id);
      if (!template) break;
      await run(() => createRecord("templates", {
        name: `${template.name} Copy`,
        category: template.category,
        description: template.description,
        preview_url: template.preview_url,
        desktop_preview_url: template.desktop_preview_url,
        mobile_preview_url: template.mobile_preview_url,
        accent_color: template.accent_color,
        layout_key: template.layout_key,
        is_active: false,
        status: "draft",
        use_count: 0,
      }), "Template duplicated");
      break;
    }
    case "preview-template": {
      const template = record("templates", id);
      if (!template) break;
      openModal({
        title: template.name,
        subtitle: `${template.category} template preview`,
        body: `<div class="template-preview template-preview--modal" style="--template-color:${escapeHtml(template.accent_color || "#8f75ff")}"></div><p class="message-preview" style="margin-top:14px">${escapeHtml(template.description || "Reusable template")}</p>`,
        footer: `${buttonMarkup("Close", "close-modal", "ghost")}<button class="button button--primary" data-action="use-template" data-id="${template.id}">Use template</button>`,
      });
      break;
    }
    case "use-template":
      openDemoForm({ templateId: id });
      break;
    case "new-demo":
      openDemoForm({ leadId: target.dataset.leadId || "" });
      break;
    case "open-demo": {
      const demo = record("demos", id);
      if (demo) openDemoDetails(demo);
      break;
    }
    case "open-studio":
      closeModal();
      navigate("studio", { demo: id });
      break;
    case "submit-studio":
      document.getElementById("studio-form")?.requestSubmit();
      break;
    case "studio-viewport": {
      const canvas = document.querySelector(".studio-canvas");
      canvas?.classList.toggle("is-mobile", target.dataset.size === "mobile");
      document.querySelectorAll("[data-action='studio-viewport']").forEach((button) => button.classList.toggle("is-active", button === target));
      break;
    }
    case "preview-demo": {
      const demo = record("demos", id);
      if (demo?.preview_url) window.open(demo.preview_url, "_blank", "noopener,noreferrer");
      else navigate("studio", { demo: id });
      break;
    }
    case "copy-demo-link": {
      const demo = record("demos", id);
      if (!demo?.preview_url) {
        toast("Preview URL is not set", "Open Website Studio or edit the demo first.", "error");
        break;
      }
      await copyText(demo.preview_url);
      toast("Preview link copied");
      break;
    }
    case "archive-demo":
      await run(() => updateRecord("demos", id, { status: "archived" }), "Demo archived");
      closeModal();
      break;
    case "convert-demo": {
      const demo = record("demos", id);
      if (!demo) break;
      const existing = getState().data.clients.find((client) => client.lead_id === demo.lead_id);
      if (existing) {
        closeModal();
        openClientDetails(existing);
      } else {
        closeModal();
        openClientForm(null, demo.lead_id);
      }
      break;
    }
    case "upload-demo":
      openUploadForm(id);
      break;
    case "deployment-logs": {
      const deployment = record("deployments", id);
      if (deployment) openDeploymentLogs(deployment);
      break;
    }
    case "deployment-placeholder": {
      const deployment = record("deployments", id);
      if (!deployment) break;
      const kind = target.dataset.kind;
      await run(() => createRecord("approvals", {
        entity_type: "deployment",
        entity_id: deployment.id,
        approval_type: "site_publish",
        title: `${kind === "rollback" ? "Rollback" : deployment.status === "live" ? "Redeploy" : "Deploy"} ${deployment.domain || "client site"}`,
        summary: "Cloudflare is not connected. This records approval intent only and does not change an external deployment.",
        payload: { deployment_id: deployment.id, kind, version: deployment.version },
        status: "pending",
        risk_level: "high",
        requested_by_agent: "orchestrator",
      }), "Deployment approval created", "No external deployment occurred.");
      break;
    }
    case "new-draft":
      navigate("outreach", target.dataset.leadId ? { lead: target.dataset.leadId } : {});
      break;
    case "edit-draft": {
      const draft = record("drafts", id);
      if (draft) openDraftForm(draft);
      break;
    }
    case "batch-outreach":
      await prepareBatchOutreach();
      break;
    case "placeholder-ai":
      toast("AI provider not connected", "The interface is ready; no external model call was made.");
      break;
    case "schedule-placeholder":
      toast("Scheduling is a placeholder", "Connect Gmail and the sending service before scheduling.");
      break;
    case "apply-outreach-template":
      applyOutreachTemplate(target.dataset.template);
      break;
    case "open-thread":
      closeModal();
      navigate("inbox", { ...getState().routeParams, thread: id });
      break;
    case "new-follow-up":
      openFollowUpForm();
      break;
    case "draft-follow-up": {
      const followUp = record("followUps", id);
      const lead = record("leads", followUp?.lead_id);
      if (!followUp || !lead) break;
      const draft = await run(() => createRecord("drafts", {
        lead_id: lead.id,
        kind: "follow_up",
        subject: `Quick follow-up — ${lead.business_name}`,
        body: followUp.suggested_text || `Hey,\n\nJust checking in on the website preview I sent for ${lead.business_name}. Happy to adjust anything you want.\n\nConnor`,
        status: "draft",
      }), "Follow-up draft created");
      if (draft) openDraftForm(draft);
      break;
    }
    case "snooze-follow-up": {
      const due = new Date();
      due.setDate(due.getDate() + 2);
      await run(() => updateRecord("followUps", id, { status: "snoozed", due_at: due.toISOString() }), "Follow-up snoozed", "Moved two days.");
      break;
    }
    case "follow-up-status":
      await run(() => updateRecord("followUps", id, {
        status: target.dataset.status,
        completed_at: ["replied", "completed", "dead", "sent"].includes(target.dataset.status) ? new Date().toISOString() : null,
      }), "Follow-up updated");
      break;
    case "new-client":
      openClientForm();
      break;
    case "open-client": {
      const client = record("clients", id);
      if (client) openClientDetails(client);
      break;
    }
    case "edit-client": {
      const client = record("clients", id);
      if (client) openClientForm(client);
      break;
    }
    case "new-project":
      openProjectForm();
      break;
    case "open-project": {
      const project = record("projects", id);
      if (project) openProjectForm(project);
      break;
    }
    case "advance-project": {
      const project = record("projects", id);
      if (!project) break;
      const current = PROJECT_STAGES.indexOf(project.status);
      const next = PROJECT_STAGES[Math.min(current + 1, PROJECT_STAGES.length - 1)];
      const progress = Math.round((PROJECT_STAGES.indexOf(next) / (PROJECT_STAGES.length - 1)) * 100);
      await run(() => updateRecord("projects", id, { status: next, progress }), "Project advanced", `Now in ${next.replaceAll("_", " ")}.`);
      break;
    }
    case "new-maintenance":
      openMaintenanceForm();
      break;
    case "open-maintenance": {
      const subscription = record("maintenanceSubscriptions", id);
      if (subscription) openMaintenanceForm(subscription);
      break;
    }
    case "maintenance-request-status": {
      const request = record("maintenanceRequests", id);
      if (!request) break;
      const complete = request.status !== "completed";
      await run(() => updateRecord("maintenanceRequests", id, { status: complete ? "completed" : "new", completed_at: complete ? new Date().toISOString() : null }), complete ? "Request completed" : "Request reopened");
      break;
    }
    case "new-payment":
      openPaymentForm();
      break;
    case "new-expense":
      openExpenseForm();
      break;
    case "edit-expense": {
      const expense = record("expenses", id);
      if (expense) openExpenseForm(expense);
      break;
    }
    case "new-pricing-experiment":
      openPricingForm();
      break;
    case "edit-pricing": {
      const experiment = record("pricingExperiments", id);
      if (experiment) openPricingForm(experiment);
      break;
    }
    case "new-note":
      openNoteForm();
      break;
    case "open-note": {
      const note = record("notes", id);
      if (note) openNoteForm(note);
      break;
    }
    case "toggle-note-pin": {
      const note = record("notes", id);
      if (note) await run(() => updateRecord("notes", id, { is_pinned: !note.is_pinned }), note.is_pinned ? "Note unpinned" : "Note pinned");
      break;
    }
    case "archive-note":
      await run(() => updateRecord("notes", id, { is_archived: true }), "Note archived");
      closeModal();
      break;
    case "integration-placeholder":
      toast(`${target.dataset.provider} setup is deferred`, "The card and data boundary are ready; credentials and external calls were intentionally not added.");
      break;
    case "inspect-approval": {
      const approval = record("approvals", id);
      if (approval) openApprovalDetails(approval);
      break;
    }
    case "resolve-approval":
      await resolveApprovalAction(id, target.dataset.status);
      break;
    case "queue-agent-run":
      await run(() => startManualRun(target.dataset.title || "Review priority pipeline"), "Orchestrator plan queued", "No external AI call was made.");
      break;
    case "agent-control": {
      const status = target.dataset.status;
      await run(async () => {
        await updateRecord("agentRuns", id, { status, current_step: status === "paused" ? "Paused by operator" : status === "cancelled" ? "Cancelled by operator" : "Resumed by operator" });
        await createRecord("agentEvents", { run_id: id, agent_type: "orchestrator", event_type: `run_${status}`, title: `Workflow ${status}`, detail: "Operator control used from the persistent panel." });
      }, `Workflow ${status}`);
      break;
    }
    case "mark-notifications-read":
      await run(markNotificationsRead);
      break;
    case "open-notification": {
      const notification = record("notifications", id);
      if (notification && !notification.is_read) await updateRecord("notifications", id, { is_read: true });
      if (target.dataset.routeTarget) navigate(target.dataset.routeTarget);
      closePanels();
      break;
    }
    case "request-delete": {
      if (!SAFE_DELETE_COLLECTIONS.has(target.dataset.collection)) break;
      await run(() => createRecord("approvals", {
        entity_type: target.dataset.collection,
        entity_id: id,
        approval_type: "record_delete",
        title: `Delete ${target.dataset.label || "record"}`,
        summary: "Permanent deletion is blocked until this approval is reviewed.",
        payload: { collection: target.dataset.collection, id, label: target.dataset.label || "record" },
        status: "pending",
        risk_level: "high",
        requested_by_agent: "system",
      }), "Delete request queued", "Review it in the Approval Queue.");
      closeModal();
      break;
    }
    case "seed-workspace":
      await run(seedWorkspace, "Starter workspace loaded", "Realistic records are now available.");
      break;
    case "export-leads":
      exportLeads();
      break;
    case "sign-out":
      await run(signOut, "Signed out");
      break;
    case "exit-preview":
      localStorage.removeItem("operations-preview");
      location.reload();
      break;
    default:
      break;
  }
}

export async function handleFormSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const type = form.dataset.form;
  const id = form.dataset.id;
  const values = cleanObject(formDataObject(form));
  const submitter = event.submitter;
  const submit = submitter || form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;

  if (type === "discovery-search") {
    await executeDiscovery(values);
    if (submit) submit.disabled = false;
    return;
  }

  const result = await run(async () => {
    switch (type) {
      case "lead": {
        const payload = {
          ...values,
          email: values.email || null,
          website_status: values.has_website ? "Has website" : "No website",
          qualification_score: number(values.lead_score),
          opportunity_score: number(values.lead_score),
          lead_score: number(values.lead_score),
          asking_price: number(values.deal_value, 400),
          deal_value: number(values.deal_value, 400),
          last_contacted_at: iso(values.last_contacted_at),
          follow_up_at: iso(values.follow_up_at),
          tags: values.tags ? values.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
          listing_url: values.listing_url || null,
          google_maps_url: values.listing_url || null,
          discovered_at: id ? record("leads", id)?.discovered_at : new Date().toISOString(),
        };
        delete payload.tags_text;
        const saved = id ? await updateRecord("leads", id, payload) : await createRecord("leads", payload);
        await logActivity(id ? "lead_updated" : "lead_created", id ? "Lead updated" : "Lead created", saved.business_name, { lead_id: saved.id });
        return saved;
      }
      case "task": {
        const payload = { ...values, due_at: iso(values.due_at), tags: values.tags ? values.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [], created_by: "user" };
        return id ? updateRecord("tasks", id, payload) : createRecord("tasks", payload);
      }
      case "calendar": {
        const payload = { ...values, starts_at: iso(values.starts_at), ends_at: null, all_day: Boolean(values.all_day) };
        return id ? updateRecord("calendarEvents", id, payload) : createRecord("calendarEvents", payload);
      }
      case "template": {
        const payload = { ...values, is_active: values.status === "active", use_count: id ? record("templates", id)?.use_count || 0 : 0 };
        return id ? updateRecord("templates", id, payload) : createRecord("templates", payload);
      }
      case "demo": {
        const lead = record("leads", values.lead_id);
        const payload = {
          ...values,
          name: values.name || `${lead?.business_name || "Prospect"} Demo`,
          slug: values.slug || slugify(values.name || lead?.business_name || `demo-${Date.now()}`),
          qa_score: id ? record("demos", id)?.qa_score || 0 : 0,
          qa_checklist: id ? record("demos", id)?.qa_checklist || {} : {},
          brief: id ? record("demos", id)?.brief || {} : {},
          business_info: id ? record("demos", id)?.business_info || {} : { name: lead?.business_name, phone: lead?.phone, email: lead?.email, address: lead?.address },
          content: id ? record("demos", id)?.content || {} : { headline: `${lead?.business_name || "Local service"} — local service done right`, services: ["Primary service", "Emergency help", "Free estimates"] },
          theme: id ? record("demos", id)?.theme || {} : { primary: "#172437", accent: "#6fb87b" },
        };
        const saved = id ? await updateRecord("demos", id, payload) : await createRecord("demos", payload);
        if (lead) await updateRecord("leads", lead.id, { status: values.status === "ready" ? "demo_ready" : lead.status === "new" ? "qualified" : lead.status });
        if (!id) await logActivity("demo_created", "Demo created", saved.name, { lead_id: saved.lead_id });
        return saved;
      }
      case "studio": {
        const demo = record("demos", id);
        if (!demo) throw new Error("Choose a demo first.");
        const sectionControls = [...document.querySelectorAll('[form="studio-form"][name^="section_"]')];
        const hiddenSections = sectionControls.filter((input) => !input.checked).map((input) => input.name.replace("section_", ""));
        return updateRecord("demos", id, {
          template_id: values.template_id,
          business_info: { ...(demo.business_info || {}), name: values.business_name, phone: values.phone, email: values.email, address: values.address, hours: values.hours },
          content: { ...(demo.content || {}), headline: values.headline, description: values.description, services: (values.services || "").split("\n").map((item) => item.trim()).filter(Boolean), cta: values.cta, hidden_sections: hiddenSections },
          theme: { ...(demo.theme || {}), primary: values.primary, accent: values.accent },
        });
      }
      case "outreach-draft": {
        const mode = submitter?.dataset.submitMode || "approval";
        return saveOutreachDraft(values, mode);
      }
      case "draft": {
        const mode = submitter?.dataset.submitMode || "draft";
        const status = mode === "approval" ? "pending_approval" : "draft";
        const draft = await updateRecord("drafts", id, { subject: values.subject, body: values.body, kind: values.kind, status });
        if (mode === "approval") await ensureEmailApproval(draft);
        return draft;
      }
      case "thread-reply": {
        const draft = await createRecord("drafts", { lead_id: form.dataset.leadId, kind: "reply", subject: `Re: ${record("emailThreads", form.dataset.threadId)?.subject || "Website preview"}`, body: values.body, status: "pending_approval" });
        await ensureEmailApproval(draft, "reply");
        return draft;
      }
      case "follow-up": {
        const payload = { ...values, sequence_number: number(values.sequence_number, 1), due_at: iso(values.due_at), status: id ? record("followUps", id)?.status || "scheduled" : "scheduled" };
        const saved = id ? await updateRecord("followUps", id, payload) : await createRecord("followUps", payload);
        await updateRecord("leads", values.lead_id, { follow_up_at: payload.due_at });
        return saved;
      }
      case "client": {
        const lead = record("leads", values.lead_id);
        const payload = {
          ...values,
          contact_name: values.contact_name || lead?.contact_name || null,
          email: values.email || lead?.email || null,
          phone: values.phone || lead?.phone || null,
          agreed_price: number(values.agreed_price, 400),
          amount_received: number(values.amount_received),
          payment_status: number(values.amount_received) >= number(values.agreed_price, 400) ? "paid" : "pending",
          project_status: id ? record("clients", id)?.project_status || "payment_received" : "payment_received",
          maintenance_status: id ? record("clients", id)?.maintenance_status || "inactive" : "inactive",
          support_requests: id ? record("clients", id)?.support_requests || 0 : 0,
          closed_at: id ? record("clients", id)?.closed_at : new Date().toISOString(),
          handoff_checklist: id ? record("clients", id)?.handoff_checklist || {} : {},
        };
        const saved = id ? await updateRecord("clients", id, payload) : await createRecord("clients", payload);
        if (lead) await updateRecord("leads", lead.id, { status: "won" });
        if (!id) await logActivity("client_created", "Client created", lead?.business_name || "Won lead converted", { lead_id: lead?.id, client_id: saved.id });
        return saved;
      }
      case "project": {
        const site = getState().data.clientSites.find((item) => item.client_id === values.client_id);
        const payload = { ...values, site_id: site?.id || null, progress: number(values.progress), requested_edits: (values.requested_edits || "").split("\n").map((item) => item.trim()).filter(Boolean) };
        return id ? updateRecord("projects", id, payload) : createRecord("projects", payload);
      }
      case "maintenance": {
        const payload = { ...values, monthly_amount: number(values.monthly_amount, 50), hosting_included: Boolean(values.hosting_included), domain_managed: Boolean(values.domain_managed), cancelled_on: values.status === "cancelled" ? new Date().toISOString().slice(0, 10) : null };
        const saved = id ? await updateRecord("maintenanceSubscriptions", id, payload) : await createRecord("maintenanceSubscriptions", payload);
        const client = record("clients", values.client_id);
        if (client) await updateRecord("clients", client.id, { maintenance_status: values.status });
        return saved;
      }
      case "payment": {
        const payload = { ...values, amount: number(values.amount), fee_amount: number(values.fee_amount), paid_at: iso(values.paid_at), refund_state: values.status === "refunded" ? "refunded" : "none", source: "manual" };
        return id ? updateRecord("payments", id, payload) : createRecord("payments", payload);
      }
      case "expense": {
        const payload = { ...values, amount: number(values.amount) };
        return id ? updateRecord("expenses", id, payload) : createRecord("expenses", payload);
      }
      case "pricing": {
        const payload = { ...values, offer_amount: number(values.offer_amount), sent_count: number(values.sent_count), reply_count: number(values.reply_count), close_count: number(values.close_count), revenue: number(values.revenue), started_at: values.status === "active" ? record("pricingExperiments", id)?.started_at || new Date().toISOString() : record("pricingExperiments", id)?.started_at || null, ended_at: values.status === "complete" ? new Date().toISOString() : null };
        return id ? updateRecord("pricingExperiments", id, payload) : createRecord("pricingExperiments", payload);
      }
      case "note": {
        const payload = { ...values, tags: values.tags ? values.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [], is_pinned: Boolean(values.is_pinned), is_archived: id ? record("notes", id)?.is_archived || false : false };
        return id ? updateRecord("notes", id, payload) : createRecord("notes", payload);
      }
      case "settings": {
        const preferences = {
          business_name: values.business_name,
          owner_name: values.owner_name,
          timezone: values.timezone,
          currency: values.currency,
          theme: values.theme,
          default_site_price: number(values.default_site_price, 400),
          maintenance_price: number(values.maintenance_price, 50),
          default_offer: values.default_offer,
          default_email: values.default_email,
          signature: values.signature,
          follow_up_days: String(values.follow_up_days || "").split(",").map((item) => number(item.trim())).filter((item) => item > 0),
          ai_behavior: values.ai_behavior,
          daily_cost_limit: number(values.daily_cost_limit, 10),
          preview_domain: values.preview_domain,
          default_template_id: values.default_template_id,
        };
        await updateProfilePreferences(preferences);
        const existing = getState().data.settings.find((item) => item.key === "workspace");
        return existing ? updateRecord("settings", existing.id, { value: preferences }) : createRecord("settings", { key: "workspace", value: preferences });
      }
      case "orchestrator-message": {
        const runRecord = record("agentRuns", id);
        if (!runRecord) {
          const created = await startManualRun("Operator-directed workflow");
          return updateRecord("agentRuns", created.id, { messages: [{ role: "user", text: values.message, at: new Date().toISOString() }] });
        }
        return updateRecord("agentRuns", id, { messages: [...(runRecord.messages || []), { role: "user", text: values.message, at: new Date().toISOString() }] });
      }
      case "upload-demo": {
        const file = form.querySelector('input[type="file"]')?.files?.[0];
        if (!file) throw new Error("Choose a file first.");
        return uploadDemoBundle(id, file);
      }
      default:
        throw new Error("Unknown form action.");
    }
  });

  if (result) {
    if (!["studio", "outreach-draft", "thread-reply", "orchestrator-message"].includes(type)) closeModal();
    const labels = {
      lead: id ? "Lead updated" : "Lead added",
      task: "Task saved",
      calendar: "Calendar event saved",
      template: "Template saved",
      demo: "Demo saved",
      studio: "Website changes saved",
      "outreach-draft": submitter?.dataset.submitMode === "draft" ? "Draft saved" : "Approval requested",
      draft: submitter?.dataset.submitMode === "approval" ? "Approval requested" : "Draft saved",
      "thread-reply": "Reply approval requested",
      "follow-up": "Follow-up saved",
      client: "Client saved",
      project: "Project saved",
      maintenance: "Maintenance plan saved",
      payment: "Payment saved",
      expense: "Expense saved",
      pricing: "Experiment saved",
      note: "Note saved",
      settings: "Settings saved",
      "orchestrator-message": "Direction recorded",
      "upload-demo": "Demo version uploaded",
    };
    toast(labels[type] || "Saved");
  } else if (submit) {
    submit.disabled = false;
  }
}

export async function handleControlChange(event) {
  const target = event.target;
  const action = target.dataset.action;
  if (!action) return;
  if (action === "route-select") {
    updateRouteParam(target.dataset.key, target.value);
    return;
  }
  if (action === "outreach-lead-select") {
    navigate("outreach", { ...getState().routeParams, lead: target.value });
    return;
  }
  if (action === "classify-thread") {
    await run(() => updateRecord("emailThreads", target.dataset.id, { classification: target.value, intent: target.value, is_unread: false }), "Thread classified");
    return;
  }
  if (action === "studio-demo-select") {
    navigate("studio", { demo: target.value });
  }
}

export function handleRouteSearch(value) {
  updateRouteParam("q", value.trim());
}

export function bindPipelineDrag() {
  document.querySelectorAll(".pipeline-card[draggable='true']").forEach((card) => {
    card.addEventListener("dragstart", () => card.classList.add("dragging"));
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });
  document.querySelectorAll(".pipeline-column").forEach((column) => {
    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      column.classList.add("is-dragover");
    });
    column.addEventListener("dragleave", () => column.classList.remove("is-dragover"));
    column.addEventListener("drop", async (event) => {
      event.preventDefault();
      column.classList.remove("is-dragover");
      const card = document.querySelector(".pipeline-card.dragging");
      if (!card) return;
      const stage = column.dataset.stage;
      const lead = record("leads", card.dataset.leadId);
      if (!lead || !PIPELINE_STAGES.some((item) => item.id === stage) || lead.status === stage) return;
      await run(async () => {
        await updateRecord("leads", lead.id, { status: stage });
        await logActivity("pipeline_moved", "Pipeline moved", `${lead.business_name} moved from ${lead.status.replaceAll("_", " ")} to ${stage.replaceAll("_", " ")}.`, { lead_id: lead.id });
      }, "Pipeline updated", `Moved to ${stage.replaceAll("_", " ")}.`);
    });
  });
}

async function executeDiscovery(values) {
  const apiKey = String(values.api_key || getStoredApiKey() || "").trim();
  if (!apiKey) {
    setDiscovery({ status: "idle", error: "Add a Google Maps browser API key to run OpenScout.", progress: null });
    return;
  }
  if (values.api_key) setStoredApiKey(apiKey);
  const query = {
    location: values.location,
    city: values.city || "",
    businessType: values.business_type,
    radiusKm: number(values.radius_km, 15),
    limit: number(values.limit, 50),
    depth: values.depth,
    minConfidence: number(values.min_confidence, 70),
    filters: { noWebsite: Boolean(values.no_website), mustHavePhone: Boolean(values.must_have_phone), verify: Boolean(values.verify) },
  };
  let discoveryRun;
  try {
    discoveryRun = await createDiscoveryRun(query);
    setDiscovery({ status: "running", runId: discoveryRun.id, results: [], selected: [], error: "", progress: { phase: "scan", completed: 0, total: 1, scanned: 0, leads: 0 }, summary: null });
    const result = await discoverWithOpenScout({
      apiKey,
      location: values.city || values.location,
      businessType: values.business_type,
      radiusKm: number(values.radius_km, 15),
      limit: number(values.limit, 50),
      depth: values.depth,
      minConfidence: number(values.min_confidence, 70),
      verify: Boolean(values.verify),
      mustHavePhone: Boolean(values.must_have_phone),
      mustHaveEmail: false,
      strictlyBlankWebsite: Boolean(values.no_website),
    }, (progress) => setDiscovery({ progress }));
    const stored = await completeDiscoveryRun(discoveryRun.id, result);
    setDiscovery({ status: "completed", results: stored, selected: [], progress: null, summary: result, error: "" });
    toast("OpenScout search complete", `${stored.length} normalized candidates retained.`);
  } catch (error) {
    console.error(error);
    await failDiscoveryRun(discoveryRun?.id, error.message || "Discovery failed.");
    setDiscovery({ status: "failed", progress: null, error: error.message || "OpenScout could not complete the search." });
  }
}

async function saveDiscovery(ids) {
  if (!ids.length) return;
  const result = await run(() => saveDiscoveryCandidates(ids), "Discovery results saved");
  if (!result) return;
  const selected = new Set(getState().discovery.selected);
  ids.forEach((id) => selected.delete(id));
  setDiscovery({ selected: [...selected] });
  toast("Leads ready", `${result.saved.length} saved · ${result.duplicates.length} duplicates matched.`);
  if (document.getElementById("modal-root").innerHTML) closeModal();
}

async function rejectDiscovery(ids) {
  if (!ids.length) return;
  const result = await run(() => rejectDiscoveryCandidates(ids), "Discovery results rejected");
  if (!result) return;
  const selected = new Set(getState().discovery.selected);
  ids.forEach((id) => selected.delete(id));
  setDiscovery({ selected: [...selected] });
  if (document.getElementById("modal-root").innerHTML) closeModal();
}

async function saveOutreachDraft(values, mode) {
  const status = mode === "approval" ? "pending_approval" : "draft";
  const draft = await createRecord("drafts", {
    lead_id: values.lead_id,
    kind: "initial",
    subject: values.subject,
    body: values.body,
    status,
  });
  if (status === "pending_approval") await ensureEmailApproval(draft);
  return draft;
}

async function ensureEmailApproval(draft, kind = "outreach") {
  const existing = getState().data.approvals.find((item) => item.entity_id === draft.id && item.status === "pending");
  if (existing) return existing;
  const lead = record("leads", draft.lead_id);
  return createRecord("approvals", {
    entity_type: "message_draft",
    entity_id: draft.id,
    approval_type: kind === "reply" ? "email_send" : draft.kind === "follow_up" ? "follow_up_send" : "email_send",
    title: `Send ${kind} to ${lead?.business_name || "lead"}`,
    summary: "Review the recipient, subject, body, offer, and attached demo before sending.",
    payload: { lead_id: draft.lead_id, subject: draft.subject, draft_id: draft.id },
    status: "pending",
    risk_level: "medium",
    requested_by_agent: "writer",
  });
}

async function prepareBatchOutreach() {
  const { data } = getState();
  const eligible = data.leads.filter((lead) => {
    const demo = data.demos.find((item) => item.lead_id === lead.id && ["ready", "sent", "viewed"].includes(item.status));
    const exists = data.drafts.some((draft) => draft.lead_id === lead.id && draft.kind === "initial");
    return demo && !exists && lead.status !== "lost";
  }).slice(0, 20);
  if (!eligible.length) {
    toast("No batch candidates", "Candidates need a ready demo and no existing initial draft.", "error");
    return;
  }
  await run(async () => {
    const rows = eligible.map((lead) => {
      const demo = data.demos.find((item) => item.lead_id === lead.id);
      const amount = lead.deal_value || lead.asking_price || 400;
      return {
        lead_id: lead.id,
        kind: "initial",
        subject: `I made a website for ${lead.business_name}`,
        body: personalizedOutreach(lead, demo, amount),
        status: "draft",
      };
    });
    await createRecords("drafts", rows);
    await logActivity("email_batch_prepared", "Outreach batch prepared", `${rows.length} drafts created.`, { metadata: { lead_ids: eligible.map((lead) => lead.id) } });
  }, "Batch prepared", `${eligible.length} drafts created; nothing sent.`);
}

function applyOutreachTemplate(kind) {
  const form = document.querySelector('form[data-form="outreach-draft"]');
  if (!form) return;
  const lead = record("leads", form.elements.lead_id.value);
  const demo = getState().data.demos.find((item) => item.lead_id === lead?.id);
  const amount = form.elements.offer_amount.value;
  if (kind === "short") {
    form.elements.body.value = `Hey,\n\nI noticed ${lead?.business_name || "[Business Name]"} didn’t have a website, so I made a quick preview:\n\n${demo?.preview_url || "[preview link]"}\n\nIf you want it, I can customize it and launch it for $${amount}. If you don’t like it, you don’t pay.\n\nInterested?\n\nConnor`;
  } else if (kind === "changes") {
    form.elements.body.value = `Hey,\n\nI put together a website preview for ${lead?.business_name || "[Business Name]"}:\n\n${demo?.preview_url || "[preview link]"}\n\nEverything is editable—colors, photos, services, wording, and layout. I can make the changes you want, connect your domain, and launch it for $${amount}.\n\nWant me to adjust anything?\n\nConnor`;
  } else {
    form.elements.body.value = personalizedOutreach(lead, demo, amount);
  }
}

async function resolveApprovalAction(id, status) {
  const approval = record("approvals", id);
  if (!approval) return;
  const resolved = await run(() => resolveApproval(id, status), `Approval ${status}`);
  if (!resolved) return;
  if (status === "approved" && approval.approval_type === "record_delete") {
    const collection = approval.payload?.collection;
    const recordId = approval.payload?.id;
    if (SAFE_DELETE_COLLECTIONS.has(collection) && recordId) {
      await run(() => deleteRecord(collection, recordId), "Approved record deleted", approval.payload?.label || "");
    }
  }
  closeModal();
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement("textarea");
  input.value = value;
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function exportLeads() {
  const fields = ["business_name", "contact_name", "email", "phone", "address", "city", "region", "category", "source", "listing_url", "website_url", "website_status", "lead_score", "status", "deal_value", "discovered_at", "follow_up_at", "notes"];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [fields.join(","), ...getState().data.leads.map((lead) => fields.map((field) => quote(lead[field])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `operations-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  toast("Lead export created", "CSV download started.");
}

function buttonMarkup(label, action, variant) {
  return `<button class="button button--${variant}" data-action="${action}">${escapeHtml(label)}</button>`;
}
