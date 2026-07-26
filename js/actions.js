import { navigate } from "./core/router.js";
import { getState, setState } from "./core/state.js";
import { escapeHtml, uid } from "./core/utils.js";
import {
  createRecord,
  deleteRecord,
  markNotificationsRead,
  resolveApproval,
  seedWorkspace,
  startManualRun,
  updateProfilePreferences,
  updateRecord,
  uploadDemoBundle,
} from "./services/data.js";
import { signOut } from "./services/auth.js";
import { closeCommandPalette } from "./components/command-palette.js";
import {
  openAnalysisForm,
  openClientForm,
  openClientHandoff,
  openCommunicationForm,
  openCostLimitForm,
  openDemoDetails,
  openDemoForm,
  openDraftForm,
  openFollowUpForm,
  openGoalForm,
  openLeadDetails,
  openLeadForm,
  openPricingForm,
  openTemplateForm,
  openTransactionForm,
  openUploadForm,
} from "./components/forms.js";
import { setMobileNav } from "./components/shell.js";
import { closeModal, formDataObject, openModal, toast } from "./components/ui.js";

const demoProgression = {
  brief: "building",
  building: "qa",
  qa: "ready",
};

function record(collection, id) {
  return getState().data[collection].find((item) => String(item.id) === String(id));
}

function cleanObject(value) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item === "" ? null : item]));
}

async function run(action, successTitle, successMessage = "") {
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

export async function handleActionClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  const leadId = target.dataset.leadId;

  if (action !== "open-lead" || !target.closest(".pipeline-card")) event.preventDefault();
  if (document.getElementById("command-palette-root").innerHTML && action !== "close-command-palette") closeCommandPalette();

  switch (action) {
    case "navigate":
      navigate(target.dataset.routeTarget);
      closePanels();
      break;
    case "finance-scope":
      navigate("finance", { scope: target.dataset.scope });
      break;
    case "prospect-filter":
      navigate("prospects", target.dataset.status === "all" ? {} : { status: target.dataset.status });
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
    case "delete-lead": {
      const lead = record("leads", id);
      if (!lead || !window.confirm(`Delete ${lead.business_name} and its linked workflow data?`)) break;
      closeModal();
      await run(() => deleteRecord("leads", id), "Prospect deleted", lead.business_name);
      break;
    }
    case "qualify-lead":
      await run(
        () => updateRecord("leads", id, { status: "qualified", next_action: "Complete site and review analysis" }),
        "Lead qualified",
        "Moved into the active pipeline.",
      );
      break;
    case "save-discovery-brief":
      await run(
        () => updateProfilePreferences({ discovery_market: "DFW, Texas", discovery_focus: "Local home & personal services" }),
        "Discovery brief saved",
        "OpenScout can use it when connected.",
      );
      break;
    case "seed-workspace":
      target.disabled = true;
      await run(seedWorkspace, "Starter workspace loaded", "Every sample record is editable and owner-scoped.");
      break;
    case "new-template":
      openTemplateForm();
      break;
    case "edit-template": {
      const template = record("templates", id);
      if (template) openTemplateForm(template);
      break;
    }
    case "use-template":
      openDemoForm({ templateId: id });
      break;
    case "new-demo":
      openDemoForm();
      break;
    case "open-demo": {
      const demo = record("demos", id);
      if (demo) openDemoDetails(demo);
      break;
    }
    case "upload-demo":
      openUploadForm(id);
      break;
    case "advance-demo": {
      const demo = record("demos", id);
      if (!demo) break;
      if (demo.status === "ready") {
        await run(async () => {
          const existing = getState().data.approvals.find((item) => item.entity_id === demo.id && item.approval_type === "demo_deploy" && item.status === "pending");
          if (existing) return existing;
          return createRecord("approvals", {
            entity_type: "demo",
            entity_id: demo.id,
            approval_type: "demo_deploy",
            title: `Publish ${demo.name}`,
            summary: "The demo is ready. Approval records permission to deploy; the Cloudflare API connection is still deferred, so no public deployment will occur yet.",
            payload: { demo_id: demo.id, qa_score: demo.qa_score || 0 },
            status: "pending",
            risk_level: "low",
            requested_by_agent: "designer",
          });
        }, "Deployment approval created", "Nothing was published externally.");
      } else {
        const next = demoProgression[demo.status];
        if (!next) break;
        await run(() => updateRecord("demos", id, { status: next }), "Demo advanced", `Now in ${next.replace("_", " ")}.`);
      }
      break;
    }
    case "new-draft":
      openDraftForm(null, leadId);
      break;
    case "edit-draft": {
      const draft = record("drafts", id);
      if (draft) openDraftForm(draft);
      break;
    }
    case "save-draft-only": {
      const form = document.getElementById("draft-form");
      if (form) {
        form.dataset.mode = "draft";
        form.requestSubmit();
      }
      break;
    }
    case "new-communication":
      openCommunicationForm();
      break;
    case "open-reply": {
      const message = record("communications", id);
      const lead = record("leads", message?.lead_id);
      if (!message) break;
      openModal({
        title: message.subject || "Inbound reply",
        subtitle: lead?.business_name || "Unknown prospect",
        body: `<div class="message-preview">${escapeHtml(message.body_preview || "No preview")}</div><div class="approval-card__meta" style="margin-top:12px"><span class="badge badge--green">${escapeHtml(message.sentiment || "unknown")}</span><span class="badge badge--purple">${escapeHtml((message.reply_classification || "unclassified").replaceAll("_", " "))}</span></div>`,
        footer: `${lead ? `<button class="button button--secondary" data-action="new-draft" data-lead-id="${lead.id}">Draft response</button>` : ""}<button class="button button--primary" data-action="close-modal">Close</button>`,
      });
      break;
    }
    case "new-follow-up":
      openFollowUpForm();
      break;
    case "manage-follow-up": {
      const followUp = record("followUps", id);
      if (!followUp) break;
      openModal({
        title: `Follow-up #${followUp.sequence_number}`,
        subtitle: record("leads", followUp.lead_id)?.business_name || "Unknown prospect",
        body: `<p style="color:var(--text-soft);font-size:11px">Due ${new Date(followUp.due_at).toLocaleString()}</p>`,
        footer: `<button class="button button--danger" data-action="set-follow-up-status" data-id="${followUp.id}" data-status="skipped">Skip</button><button class="button button--secondary" data-action="set-follow-up-status" data-id="${followUp.id}" data-status="drafted">Mark drafted</button><button class="button button--primary" data-action="set-follow-up-status" data-id="${followUp.id}" data-status="sent">Mark sent</button>`,
      });
      break;
    }
    case "set-follow-up-status":
      closeModal();
      await run(() => updateRecord("followUps", id, {
        status: target.dataset.status,
        completed_at: ["sent", "skipped"].includes(target.dataset.status) ? new Date().toISOString() : null,
      }), "Follow-up updated");
      break;
    case "manual-analysis":
      openAnalysisForm();
      break;
    case "resolve-approval":
      target.disabled = true;
      await run(() => resolveApproval(id, target.dataset.status), `Approval ${target.dataset.status.replace("_", " ")}`);
      break;
    case "new-pricing-experiment":
      openPricingForm();
      break;
    case "new-transaction":
      openTransactionForm(getState().routeParams.scope === "personal" ? "personal" : "business");
      break;
    case "new-finance-goal":
      openGoalForm();
      break;
    case "new-client":
      openClientForm();
      break;
    case "manage-client": {
      const client = record("clients", id);
      if (client) openClientHandoff(client);
      break;
    }
    case "queue-agent-run":
      await run(() => startManualRun(target.dataset.title || "Review priority pipeline"), "Manual run queued", "No model API was called.");
      break;
    case "toggle-setting": {
      const key = target.dataset.key;
      const current = getState().data.profile?.preferences?.[key] !== false;
      await run(() => updateProfilePreferences({ [key]: !current }), "Safeguard updated");
      break;
    }
    case "edit-cost-limit":
      openCostLimitForm();
      break;
    case "mark-notifications-read":
      await run(markNotificationsRead);
      break;
    case "open-notification":
      if (target.dataset.routeTarget) navigate(target.dataset.routeTarget);
      closePanels();
      break;
    case "export-leads":
      exportLeads();
      break;
    case "sign-out":
      closeModal();
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
  const values = cleanObject(formDataObject(form));
  const id = form.dataset.id;
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;

  const result = await run(async () => {
    switch (type) {
      case "lead": {
        const payload = {
          ...values,
          qualification_score: Number(values.qualification_score || 0),
          opportunity_score: Number(values.opportunity_score || 0),
          asking_price: Number(values.asking_price || 400),
          next_action_at: values.next_action_at ? new Date(values.next_action_at).toISOString() : null,
          tags: values.tags ? values.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
        };
        return id ? updateRecord("leads", id, payload) : createRecord("leads", payload);
      }
      case "template":
        return id ? updateRecord("templates", id, values) : createRecord("templates", { ...values, is_active: true, use_count: 0 });
      case "demo": {
        const lead = record("leads", values.lead_id);
        const demoId = uid();
        const demo = await createRecord("demos", {
          id: demoId,
          lead_id: values.lead_id,
          template_id: values.template_id,
          name: values.name || `${lead?.business_name || "Prospect"} Demo`,
          status: "brief",
          storage_prefix: `${getState().user?.id || "preview"}/demos/${demoId}`,
          brief: { goal: values.goal || "Generate qualified leads" },
          qa_checklist: { mobile: false, links: false, copy: false, speed: false },
        });
        await updateRecord("leads", values.lead_id, { status: "demo_building", next_action: "Build demo from selected template" });
        const template = record("templates", values.template_id);
        if (template) await updateRecord("templates", template.id, { use_count: Number(template.use_count || 0) + 1 });
        return demo;
      }
      case "draft": {
        const status = form.dataset.mode === "draft" ? "draft" : "pending_approval";
        const draft = id
          ? await updateRecord("drafts", id, { ...values, status })
          : await createRecord("drafts", { ...values, status });
        if (status === "pending_approval") {
          const lead = record("leads", values.lead_id);
          const existing = getState().data.approvals.find((item) => item.entity_id === draft.id && item.status === "pending");
          if (!existing) await createRecord("approvals", {
            entity_type: "message_draft",
            entity_id: draft.id,
            approval_type: "email_send",
            title: `Send ${values.kind.replace("_", " ")} email to ${lead?.business_name || "prospect"}`,
            summary: "Review the subject and body before Gmail is allowed to send.",
            payload: { subject: values.subject },
            status: "pending",
            risk_level: "medium",
            requested_by_agent: "writer",
          });
        }
        return draft;
      }
      case "communication": {
        const message = await createRecord("communications", { ...values, direction: "inbound", channel: "gmail", occurred_at: new Date().toISOString() });
        await updateRecord("leads", values.lead_id, { status: "replied", next_action: "Review reply and decide response" });
        await createRecord("notifications", { type: values.sentiment === "positive" ? "success" : "info", title: "Inbound reply logged", message: values.subject || "Manual reply record", action_route: "inbox", is_read: false });
        return message;
      }
      case "follow-up":
        await updateRecord("leads", values.lead_id, { status: "follow_up", next_action: `Follow-up #${values.sequence_number}`, next_action_at: new Date(values.due_at).toISOString() });
        return createRecord("followUps", { ...values, sequence_number: Number(values.sequence_number), due_at: new Date(values.due_at).toISOString(), status: "scheduled" });
      case "analysis": {
        const webScore = Number(values.website_score || 0);
        const reviewScore = Number(values.review_score || 0);
        const analysis = await createRecord("analyses", {
          ...values,
          website_score: webScore,
          review_score: reviewScore,
          website_findings: (values.website_findings || "").split("\n").filter(Boolean).map((label) => ({ label, severity: webScore === 0 ? "high" : webScore < 60 ? "medium" : "good" })),
          review_findings: (values.review_findings || "").split("\n").filter(Boolean).map((label) => ({ label, severity: reviewScore >= 75 ? "good" : "medium" })),
          analyzed_at: new Date().toISOString(),
        });
        await updateRecord("leads", values.lead_id, { status: "analyzed", next_action: "Choose template and create demo" });
        return analysis;
      }
      case "pricing":
        return createRecord("pricingExperiments", { ...values, offer_amount: Number(values.offer_amount), sent_count: 0, reply_count: 0, close_count: 0, revenue: 0, started_at: values.status === "active" ? new Date().toISOString() : null });
      case "transaction":
        return createRecord("financeTransactions", { ...values, amount: Number(values.amount), source: "manual" });
      case "goal":
        return createRecord("financeGoals", { ...values, target_amount: Number(values.target_amount), current_amount: Number(values.current_amount || 0), priority: getState().data.financeGoals.length + 1, is_complete: false });
      case "client":
        return createRecord("clients", { ...values, agreed_price: Number(values.agreed_price || 0), amount_received: Number(values.amount_received || 0), status: "onboarding", handoff_checklist: { content: false, domain: false, payment: false, launch: false }, closed_at: new Date().toISOString() });
      case "client-handoff": {
        const checklist = { content: Boolean(values.content), domain: Boolean(values.domain), payment: Boolean(values.payment), launch: Boolean(values.launch) };
        return updateRecord("clients", id, { status: values.status, domain: values.domain, production_url: values.production_url, agreed_price: Number(values.agreed_price || 0), amount_received: Number(values.amount_received || 0), handoff_checklist: checklist, completed_at: values.status === "completed" ? new Date().toISOString() : null });
      }
      case "cost-limit":
        return updateProfilePreferences({ daily_cost_limit: Number(values.daily_cost_limit) });
      case "upload-demo": {
        const file = form.querySelector('input[type="file"]').files[0];
        if (!file) throw new Error("Choose a file first.");
        const version = await uploadDemoBundle(id, file);
        const demo = record("demos", id);
        if (demo && demo.status === "brief") await updateRecord("demos", id, { status: "building" });
        return version;
      }
      default:
        throw new Error("Unknown form action.");
    }
  });

  if (result) {
    closeModal();
    const labels = {
      lead: id ? "Prospect updated" : "Lead added",
      template: id ? "Template updated" : "Template created",
      demo: "Demo created",
      draft: form.dataset.mode === "draft" ? "Draft saved" : "Approval requested",
      communication: "Reply logged",
      "follow-up": "Follow-up scheduled",
      analysis: "Analysis saved",
      pricing: "Experiment created",
      transaction: "Transaction added",
      goal: "Goal added",
      client: "Client created",
      "client-handoff": "Handoff updated",
      "cost-limit": "Cost guardrail saved",
      "upload-demo": "Version uploaded",
    };
    toast(labels[type] || "Saved");
  } else if (submit) {
    submit.disabled = false;
  }
}

export function bindPipelineDrag() {
  const cards = document.querySelectorAll(".pipeline-card[draggable='true']");
  const columns = document.querySelectorAll(".pipeline-column");
  cards.forEach((card) => {
    card.addEventListener("dragstart", () => card.classList.add("dragging"));
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });
  columns.forEach((column) => {
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
      await run(() => updateRecord("leads", card.dataset.leadId, { status: stage }), "Pipeline updated", `Moved to ${stage.replaceAll("_", " ")}.`);
    });
  });
}

function closePanels() {
  setState({ agentPanelOpen: false, notificationPanelOpen: false, mobileNavOpen: false });
  setMobileNav(false);
}

function exportLeads() {
  const fields = ["business_name", "contact_name", "email", "phone", "city", "region", "category", "status", "qualification_score", "opportunity_score", "asking_price", "next_action"];
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
