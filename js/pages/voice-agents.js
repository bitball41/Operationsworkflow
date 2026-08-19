import { btn, empty, icon, notice, pageHeader, pill, section, stats, table, td } from "../components/ui.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatDateTime, formatNumber, relativeTime, statusLabel } from "../core/utils.js";
import { isOwner } from "../services/permissions.js";
import { byId, clientName } from "./shared.js";

function readiness(data, client, agent, provider) {
  const onboarding = data.onboardingRecords.find((item) => item.client_id === client?.id);
  const calendar = data.integrations.find((item) => item.provider === "calendar_provider");
  return [
    ["ElevenLabs API", provider.connected === true, provider.connected ? "Authenticated server-side" : "Connection has not passed"],
    ["Post-call webhook", provider.webhook_configured === true, provider.webhook_configured ? "Signed delivery secret is stored" : "Webhook secret is not verified"],
    ["Provider agent", Boolean(agent?.provider_agent_id), agent ? agent.name : "Create and link the agent"],
    ["Live calendar", calendar?.status === "connected", calendar?.status === "connected" ? "Availability can be verified" : "No booking provider connected"],
    ["Dedicated AI number", Boolean(client?.dedicated_ai_number), client?.dedicated_ai_number || "Not assigned"],
    ["Forwarding path", Boolean(client?.phone_routing_mode && client.phone_routing_mode !== "not_configured"), client?.phone_routing_mode ? statusLabel(client.phone_routing_mode) : "Not configured"],
    ["Onboarding rulebook", onboarding?.status === "complete", onboarding ? `${onboarding.progress || 0}% complete` : "Not started"],
  ];
}

function workflowPanel(data, client, agent, provider) {
  if (!client) return "";
  const checks = readiness(data, client, agent, provider);
  const project = data.projects.find((item) => item.client_id === client.id);
  const automation = data.automations.find((item) => item.client_id === client.id);
  const projectTasks = data.projectTasks.filter((item) => item.project_id === project?.id);
  const passed = checks.filter(([, ok]) => ok).length;
  return `<section class="client-os card">
    <div class="client-os__head">
      <div>
        <span class="demo-label">EXAMPLE CLIENT &middot; NOT REAL REVENUE</span>
        <h2>${escapeHtml(clientName(data, client))}</h2>
        <p>Roofing receptionist build sheet, CRM context, activation gates, and provider state in one place.</p>
      </div>
      <div class="client-os__score"><strong>${passed}/${checks.length}</strong><span>activation gates</span></div>
    </div>
    <div class="client-os__grid">
      <div class="readiness-list">
        ${checks.map(([label, ok, detail]) => `<div class="readiness-item${ok ? " is-ready" : ""}">
          <span class="readiness-item__icon">${icon(ok ? "check" : "clock")}</span>
          <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></span>
        </div>`).join("")}
      </div>
      <div class="workflow-brief">
        <div><span>Offer</span><strong>$2,500 activation + $997/month</strong></div>
        <div><span>Call flow</span><strong>Answer &rarr; qualify &rarr; verified booking &rarr; summary</strong></div>
        <div><span>Routing</span><strong>Public number &rarr; dedicated AI number &rarr; private transfer line</strong></div>
        <div><span>Safety</span><strong>Never claim tool success; never transfer back into the forwarded number</strong></div>
        <div><span>Delivery</span><strong>${escapeHtml(project?.deployment_status ? statusLabel(project.deployment_status) : "Not deployed")}</strong></div>
        <div><span>Agent record</span><strong>${escapeHtml(automation?.status ? statusLabel(automation.status) : "Draft not linked")}</strong></div>
      </div>
    </div>
    ${projectTasks.length ? `<div class="activation-track">${projectTasks.map((task) => `<span class="activation-track__step${task.status === "completed" ? " is-done" : ""}">${icon(task.status === "completed" ? "check" : "circle")}<b>${escapeHtml(task.title)}</b></span>`).join("")}</div>` : ""}
  </section>`;
}

export function renderVoiceAgents() {
  const { data, services } = getState();
  const provider = services.elevenlabs || { configured: false, connected: false, webhook_configured: false };
  const agents = data.voiceAgents.filter((item) => item.provider_deleted_at == null);
  const conversations = data.voiceConversations;
  const exampleClient = data.clients.find((item) => item.is_example === true);
  const exampleAgent = agents.find((item) => item.client_id === exampleClient?.id);
  const realAgents = agents.filter((item) => !item.is_example && item.client_id);
  const realConversations = conversations.filter((item) => !item.is_example);
  const agentsNeedingAttention = agents.filter((item) => (
    item.last_error || item.status === "error" || (!item.is_example && !item.client_id)
  ));
  const ownerActions = isOwner()
    ? `${btn("Sync ElevenLabs", { action: "voice-agent-sync", iconName: "refresh" })}${btn("Create agent", { action: "voice-agent-new", iconName: "plus", variant: "primary" })}`
    : pill("warning", "View only");

  return `<div class="stack voice-os">
    ${pageHeader({
      title: "Agents",
      subtitle: "Create, configure, and monitor ElevenLabs receptionists without putting a credential in the browser.",
      actions: ownerActions,
    })}
    ${provider.connected
      ? notice("ElevenLabs is connected", provider.webhook_configured ? "Agent actions and signed post-call ingestion are configured server-side." : "Agent actions work, but the signed post-call webhook still needs its secret.", { tone: provider.webhook_configured ? "success" : "warn", iconName: provider.webhook_configured ? "check-circle" : "alert" })
      : notice("ElevenLabs is not ready", "The dashboard cannot create or change agents until the server-side connection passes. No browser credential fallback is allowed.", { tone: "error", iconName: "lock" })}
    ${section("Operating totals", { body: stats([
      ["Client agents", formatNumber(realAgents.length), "Examples and unlinked agents excluded"],
      ["Real calls", formatNumber(realConversations.length), "Examples excluded"],
      ["Needs attention", formatNumber(agentsNeedingAttention.length), "Errors or agents without a client"],
      ["Webhook", provider.webhook_configured ? "Ready" : "Pending", "HMAC verified"],
    ]) })}
    ${workflowPanel(data, exampleClient, exampleAgent, provider)}
    ${section("Provider agents", {
      count: agents.length,
      body: table({
        columns: ["Agent", "Client", "Status", "Channel", "Activity", "Health", ""],
        rows: agents.map((agent) => {
          const client = byId(data.clients, agent.client_id);
          const recent = conversations.filter((item) => String(item.voice_agent_id) === String(agent.id)).length;
          const health = agent.last_error || agent.status === "error" ? "error" : agent.environment === "live" || agent.status === "live" ? "live" : (agent.status || agent.environment || "draft");
          return `<tr data-action="voice-agent-open" data-id="${agent.id}">
            ${td("Agent", `<div class="cell"><strong>${escapeHtml(agent.name)}</strong><span>${agent.is_example ? "Example · " : ""}${escapeHtml(agent.provider_agent_id || "Not synced")}</span></div>`)}
            ${td("Client", escapeHtml(client ? clientName(data, client) : "Not linked"))}
            ${td("Status", pill(agent.status || agent.environment || "draft"))}
            ${td("Channel", escapeHtml(agent.phone_number || client?.dedicated_ai_number || "Voice"))}
            ${td("Activity", recent ? `${recent} recent call${recent === 1 ? "" : "s"}` : (agent.last_synced_at ? relativeTime(agent.last_synced_at) : "No calls yet"))}
            ${td("Health", pill(health, agent.last_error ? "Error" : statusLabel(health)))}
            ${td("", isOwner() ? `<span class="cell-actions">${btn("Configure", { action: "voice-agent-open", size: "sm", attrs: `data-id="${agent.id}"` })}${btn("Delete", { action: "voice-agent-delete", variant: "danger", size: "sm", attrs: `data-id="${agent.id}"` })}</span>` : pill("warning", "View only"))}
          </tr>`;
        }),
        emptyState: empty({ title: "No ElevenLabs agents linked", message: "Create a provider agent for a client or sync agents that already exist.", action: isOwner() ? "voice-agent-new" : "", actionLabel: "Create the first agent" }),
      }),
    })}
    ${section("Recent post-call records", {
      count: conversations.length,
      body: table({
        columns: ["Caller", "Summary", "When", ""],
        rows: conversations.slice(0, 12).map((conversation) => `<tr data-action="voice-conversation-open" data-id="${conversation.id}">
          ${td("Caller", `<div class="cell"><strong>${escapeHtml(conversation.caller_name || conversation.caller_phone || "Unknown caller")}</strong><span>${conversation.is_example ? "Example &middot; " : ""}${escapeHtml(statusLabel(conversation.direction))}</span></div>`)}
          ${td("Summary", `<div class="cell"><strong>${escapeHtml(conversation.problem || conversation.summary || "No summary returned")}</strong><span>${escapeHtml(conversation.appointment_status || conversation.call_successful || statusLabel(conversation.status))}</span></div>`)}
          ${td("When", formatDateTime(conversation.started_at || conversation.created_at))}
          ${td("", btn("Open", { action: "voice-conversation-open", size: "sm", attrs: `data-id="${conversation.id}"` }))}
        </tr>`),
        emptyState: empty({ title: "No completed calls yet", message: "A real signed post-call transcription webhook will add the first conversation here. No sample call is fabricated." }),
      }),
    })}
  </div>`;
}
