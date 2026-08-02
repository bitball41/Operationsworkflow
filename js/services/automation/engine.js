/**
 * Automation engine.
 *
 * One lead at a time, the same fixed sequence, built from the deterministic
 * operations layer. The AI is not in this loop — it only ever decides to start
 * or stop it, or supplies copy for a step. That keeps throughput high and the
 * behaviour predictable.
 */
import { AUTOMATION_DEFAULTS } from "../../config.js";
import { INITIAL_AUTOMATION, getState, setAutomation } from "../../core/state.js";
import { sleep, uid } from "../../core/utils.js";
import { createRecord, logActivity, preferences, savePreferences, updateRecord } from "../data.js";
import {
  createFollowUp,
  createOrUpdateDemo,
  createOutreachDraft,
  getNextLead,
  leadById,
  markContacted,
  pickTemplateForLead,
  publishDemo,
  sendDraft,
} from "../operations.js";
import { canSend } from "../email/outreach.js";
import { researchBusiness } from "../research/research.js";

export const AUTOMATION_STEPS = Object.freeze([
  { id: "select", label: "Select lead" },
  { id: "gather", label: "Gather info" },
  { id: "research", label: "Research" },
  { id: "template", label: "Pick template" },
  { id: "build", label: "Build site" },
  { id: "publish", label: "Publish demo" },
  { id: "draft", label: "Draft email" },
  { id: "send", label: "Send email" },
  { id: "pipeline", label: "Update pipeline" },
  { id: "followup", label: "Schedule follow-up" },
]);

const MAX_EVENTS = 80;

let controller = null;

export function automationSettings() {
  if (getState().automationSettings) return getState().automationSettings;
  const settings = { ...AUTOMATION_DEFAULTS, ...(preferences().automation || {}) };
  getState().automationSettings = settings;
  return settings;
}

export async function saveAutomationSettings(patch) {
  const next = { ...automationSettings(), ...patch };
  getState().automationSettings = next;
  await savePreferences({ automation: next });
  setAutomation({});
  return next;
}

export function isRunning() {
  return getState().automation.status === "running";
}

/** True when the loop can complete every step for real. */
export function canSendForReal() {
  return canSend();
}

function emit({ level = "info", title, detail = "", leadId = null }) {
  const automation = getState().automation;
  const event = { id: uid(), at: new Date().toISOString(), level, title, detail, leadId };
  setAutomation({ events: [event, ...automation.events].slice(0, MAX_EVENTS) });
  return event;
}

async function persistEvent(runId, eventType, title, detail) {
  try {
    await createRecord("agentEvents", {
      run_id: runId,
      agent_type: "orchestrator",
      event_type: eventType,
      title,
      detail,
    });
  } catch (error) {
    console.warn("Could not persist automation event", error);
  }
}

function setStep(stepId, leadName) {
  const index = AUTOMATION_STEPS.findIndex((step) => step.id === stepId);
  const step = AUTOMATION_STEPS[index];
  setAutomation({
    currentStep: step?.label || "",
    stepIndex: index,
    completedSteps: AUTOMATION_STEPS.slice(0, Math.max(0, index)).map((item) => item.id),
    currentLeadName: leadName || getState().automation.currentLeadName,
  });
}

/**
 * Runs the whole sequence for one lead. Returns a result describing exactly
 * what happened, including steps that were blocked by a missing integration.
 */
export async function runLeadCycle(lead, settings = automationSettings(), runId = null) {
  const delay = Math.max(0, Number(settings.stepDelayMs) || 0);
  const owner = preferences();
  const result = { leadId: lead.id, leadName: lead.business_name, sent: false, blocked: null, demoId: null, draftId: null };

  setAutomation({ currentLeadId: lead.id, currentLeadName: lead.business_name });
  setStep("select", lead.business_name);
  await sleep(delay);

  setStep("gather");
  const gathered = leadById(lead.id) || lead;
  await sleep(delay);

  /* Research and template choice are independent — run them together. */
  setStep("research");
  const [research, choice] = await Promise.all([
    settings.research ? researchBusiness(gathered) : Promise.resolve({ connected: false, note: "Research skipped by settings." }),
    pickTemplateForLead(gathered),
  ]);
  if (research?.connected === false && research.note) result.researchNote = research.note;

  setStep("template");
  emit({ level: "info", title: `Template: ${choice.record.name}`, detail: choice.reason, leadId: lead.id });
  await sleep(delay);

  setStep("build");
  const { demo } = await createOrUpdateDemo(gathered, { templateRecord: choice.record });
  result.demoId = demo.id;
  await sleep(delay);

  setStep("publish");
  const published = await publishDemo(demo.id);
  if (!published.publish.hosted) {
    result.publishNote = published.publish.note;
  }
  await sleep(delay);

  setStep("draft");
  const { draft, price } = await createOutreachDraft(gathered, { price: settings.price || owner.default_site_price });
  result.draftId = draft.id;
  result.price = price;
  await sleep(delay);

  setStep("send");
  const send = await sendDraft(draft.id);
  if (send.sent) {
    result.sent = true;
    emit({ level: "done", title: `Email sent to ${lead.business_name}`, detail: draft.subject, leadId: lead.id });
  } else {
    result.blocked = send.reason || "Send blocked.";
    emit({ level: "warn", title: `Ready to send: ${lead.business_name}`, detail: send.reason || "Email transport not connected.", leadId: lead.id });
  }

  setStep("pipeline");
  if (send.sent) await markContacted(lead.id);
  else await updateRecord("leads", lead.id, { status: "ready_to_contact", stage_entered_at: new Date().toISOString() });
  await sleep(delay);

  setStep("followup");
  if (send.sent && settings.autoFollowUp) {
    await createFollowUp(lead.id, { days: settings.followUpDays, draftId: draft.id });
  }

  if (runId) {
    await persistEvent(
      runId,
      send.sent ? "lead_contacted" : "lead_prepared",
      `${lead.business_name} ${send.sent ? "contacted" : "prepared"}`,
      `Template ${choice.record.name} · demo ${published.demo.preview_url}${send.sent ? "" : ` · ${result.blocked}`}`,
    );
  }

  return result;
}

async function loop(runId, settings) {
  const skipIds = [];
  let consecutiveFailures = 0;

  while (!controller.stop) {
    const automation = getState().automation;
    const target = Number(settings.batchTarget) || AUTOMATION_DEFAULTS.batchTarget;
    if (automation.processed >= target) {
      await finish(runId, "completed", `Batch target of ${target} reached.`);
      return;
    }

    const lead = getNextLead({ niche: settings.niche, location: settings.location, skipIds });
    if (!lead) {
      await finish(runId, "completed", "No more qualified uncontacted leads. Run Lead Discovery to add more.");
      return;
    }
    skipIds.push(lead.id);

    try {
      const result = await runLeadCycle(lead, settings, runId);
      consecutiveFailures = 0;
      const current = getState().automation;
      setAutomation({
        processed: current.processed + 1,
        sent: current.sent + (result.sent ? 1 : 0),
      });
      await updateRecord("agentRuns", runId, {
        progress: Math.min(100, Math.round(((current.processed + 1) / target) * 100)),
        current_step: `${current.processed + 1}/${target} · last: ${lead.business_name}`,
      }).catch(() => {});
    } catch (error) {
      consecutiveFailures += 1;
      const failure = { leadId: lead.id, leadName: lead.business_name, reason: error.message, at: new Date().toISOString() };
      setAutomation({ failures: [failure, ...getState().automation.failures].slice(0, 20) });
      emit({ level: "error", title: `Failed: ${lead.business_name}`, detail: error.message, leadId: lead.id });
      await persistEvent(runId, "lead_failed", `${lead.business_name} failed`, error.message);
      if (consecutiveFailures >= (Number(settings.maxConsecutiveFailures) || 3)) {
        await finish(runId, "failed", `Stopped after ${consecutiveFailures} consecutive failures. Last error: ${error.message}`);
        return;
      }
    }
  }

  await finish(runId, "cancelled", controller.reason || "Stopped.");
}

async function finish(runId, status, reason) {
  controller = null;
  const automation = getState().automation;
  setAutomation({
    status: status === "cancelled" ? "stopped" : status === "failed" ? "error" : "idle",
    stoppedAt: new Date().toISOString(),
    stopReason: reason,
    currentStep: "",
    stepIndex: -1,
    currentLeadId: null,
    currentLeadName: "",
  });
  emit({ level: status === "failed" ? "error" : "done", title: status === "failed" ? "Automation stopped on error" : "Automation stopped", detail: reason });

  if (runId) {
    await updateRecord("agentRuns", runId, {
      status: status === "cancelled" ? "cancelled" : status,
      current_step: reason,
      completed_at: new Date().toISOString(),
      error_message: status === "failed" ? reason : null,
    }).catch(() => {});
  }
  await logActivity(
    "automation_run",
    `Automation ${status === "failed" ? "failed" : "finished"}`,
    `${automation.processed} lead${automation.processed === 1 ? "" : "s"} processed, ${automation.sent} sent. ${reason}`,
    { metadata: { run_id: runId } },
    "system",
  ).catch(() => {});
}

/**
 * Starts the batch. Safe to call from a keyword ("go"), a button, or a tool.
 */
export async function startAutomation(overrides = {}) {
  if (isRunning()) return { ok: false, reason: "Automation is already running." };

  const settings = await saveAutomationSettings(overrides);
  const first = getNextLead({ niche: settings.niche, location: settings.location });
  if (!first) {
    return { ok: false, reason: "No qualified uncontacted leads available. Run Lead Discovery first." };
  }

  let run = null;
  try {
    run = await createRecord("agentRuns", {
      agent_type: "orchestrator",
      title: "Outreach automation",
      objective: `Prepare and send up to ${settings.batchTarget} outreach emails`,
      status: "running",
      current_step: "Starting",
      progress: 0,
      estimated_cost: 0,
      context: { settings, sendConnected: canSend() },
      completed_steps: [],
      upcoming_steps: AUTOMATION_STEPS.map((step) => step.label),
      messages: [],
      started_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("Automation run record could not be created", error);
  }

  setAutomation({
    ...INITIAL_AUTOMATION,
    status: "running",
    runId: run?.id || null,
    startedAt: new Date().toISOString(),
    events: getState().automation.events,
  });
  emit({
    level: "info",
    title: "Automation started",
    detail: canSend()
      ? `Target ${settings.batchTarget} emails.`
      : `Target ${settings.batchTarget}. Outlook is not connected, so emails stop at "ready".`,
  });

  controller = { stop: false, reason: "" };
  loop(run?.id || null, settings).catch(async (error) => {
    console.error(error);
    await finish(run?.id || null, "failed", error.message);
  });

  return { ok: true, runId: run?.id || null, settings };
}

export function stopAutomation(reason = "Stopped manually.") {
  if (!controller) {
    if (isRunning()) setAutomation({ status: "stopped", stopReason: reason });
    return { ok: false, reason: "Automation is not running." };
  }
  controller.stop = true;
  controller.reason = reason;
  setAutomation({ status: "stopping", currentStep: "Finishing current lead…" });
  return { ok: true };
}

/** Runs the sequence once, for a single lead, outside the batch loop. */
export async function runOnce(leadId) {
  if (isRunning()) return { ok: false, reason: "Automation is already running." };
  const lead = leadById(leadId) || getNextLead();
  if (!lead) return { ok: false, reason: "No lead available." };
  setAutomation({ status: "running", startedAt: new Date().toISOString(), stopReason: "" });
  try {
    const result = await runLeadCycle(lead, automationSettings(), null);
    setAutomation({
      status: "idle",
      processed: getState().automation.processed + 1,
      sent: getState().automation.sent + (result.sent ? 1 : 0),
      currentStep: "",
      stepIndex: -1,
      currentLeadId: null,
      currentLeadName: "",
    });
    return { ok: true, result };
  } catch (error) {
    setAutomation({
      status: "error",
      stopReason: error.message,
      currentStep: "",
      stepIndex: -1,
      failures: [{ leadId: lead.id, leadName: lead.business_name, reason: error.message, at: new Date().toISOString() }, ...getState().automation.failures].slice(0, 20),
    });
    return { ok: false, reason: error.message };
  }
}
