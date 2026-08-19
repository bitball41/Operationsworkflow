/** Agency-specific operating workspaces introduced by the AI-services pivot. */
import { AUTOMATION_OPPORTUNITIES, CALL_OUTCOMES } from "../config.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, formatDate, formatNumber, isToday, relativeTime, statusLabel, sum } from "../core/utils.js";
import { bar, btn, empty, field, input, notice, pageHeader, pill, row, rows, section, select, stats, table, td, textarea } from "../components/ui.js";
import { commissionAmount, getNextCallLead } from "../services/operations.js";
import { currentMemberId, isOwner, isSalesperson, ownerOnlyNotice } from "../services/permissions.js";
import { byId, clientName, filterSelect, searchInput, viewTabs } from "./shared.js";

function memberName(data, id) {
  return byId(data.teamMembers, id)?.full_name || "Unassigned";
}

function leadName(data, id) {
  return byId(data.leads, id)?.business_name || "Unknown lead";
}

function clientBusiness(data, client) {
  return clientName(data, client) || "Client";
}

function callHistory(data, routeParams = {}) {
  const query = String(routeParams.q || "").toLowerCase();
  const outcome = routeParams.outcome || "all";
  const salesRows = data.salesCalls
    .filter((call) => outcome === "all" || call.outcome === outcome)
    .filter((call) => {
      const lead = byId(data.leads, call.lead_id);
      return !query || `${lead?.business_name || ""} ${call.outcome} ${call.notes || ""}`.toLowerCase().includes(query);
    });
  const agentRows = data.voiceConversations.filter((conversation) => (
    !query || `${conversation.caller_name || ""} ${conversation.summary || ""} ${conversation.problem || ""}`.toLowerCase().includes(query)
  ));

  return `
    ${section("Call history", {
      subtitle: "Recorded sales outcomes and signed agent conversations",
      actions: `${searchInput("Search calls", routeParams.q || "")}${filterSelect("outcome", CALL_OUTCOMES.map(([value, label]) => ({ value, label })), outcome, "All outcomes")}`,
      body: table({
        columns: ["Who", "Context", "Outcome", "When", ""],
        rows: [
          ...salesRows.map((call) => {
            const lead = byId(data.leads, call.lead_id);
            return `<tr>
              ${td("Who", `<div class="cell"><strong>${escapeHtml(lead?.business_name || "Lead")}</strong><span>${escapeHtml(memberName(data, call.salesperson_id))}</span></div>`)}
              ${td("Context", escapeHtml(call.pain_point || call.notes || "Sales call"))}
              ${td("Outcome", pill(call.outcome))}
              ${td("When", `${relativeTime(call.called_at || call.created_at)}`)}
              ${td("", btn("Lead", { action: "lead-open", size: "sm", attrs: `data-id="${call.lead_id}"` }))}
            </tr>`;
          }),
          ...agentRows.slice(0, 20).map((conversation) => `<tr data-action="voice-conversation-open" data-id="${conversation.id}">
            ${td("Who", `<div class="cell"><strong>${escapeHtml(conversation.caller_name || conversation.caller_phone || "Unknown caller")}</strong><span>Agent call${conversation.duration_seconds == null ? "" : ` · ${Math.round(Number(conversation.duration_seconds))}s`}</span></div>`)}
            ${td("Context", escapeHtml(conversation.problem || conversation.summary || "No summary returned"))}
            ${td("Outcome", pill(conversation.status || conversation.call_successful || "completed"))}
            ${td("When", relativeTime(conversation.started_at || conversation.created_at))}
            ${td("", btn("Open", { action: "voice-conversation-open", size: "sm", attrs: `data-id="${conversation.id}"` }))}
          </tr>`),
        ],
        emptyState: empty({ title: "No recorded calls", message: "Save a sales outcome or wait for a signed agent post-call record." }),
      }),
    })}
  `;
}

function opportunityTags(lead) {
  const labels = new Map(AUTOMATION_OPPORTUNITIES);
  return (lead?.opportunity_tags || []).map((tag) => labels.get(tag) || statusLabel(tag));
}

/** One top-level workspace for the calls and demos that move leads forward. */
export function renderSalesActivity() {
  const { data, routeParams } = getState();
  const view = routeParams.view === "demos" ? "demos" : "calls";
  const upcoming = data.meetings.filter((meeting) => (
    new Date(meeting.starts_at).getTime() >= Date.now()
    && !["cancelled", "lost"].includes(meeting.outcome)
  ));

  return `<div class="stack crm-center">
    ${pageHeader({
      title: "Calls",
      subtitle: "Work the next conversation, then keep a searchable record of outcomes.",
    })}
    <div class="crm-center__pulse">
      <span><b>${upcoming.length}</b> upcoming meetings</span>
      <span><b>${data.meetings.filter((meeting) => meeting.outcome === "proposal_needed").length}</b> need proposals</span>
      <span><b>${data.salesCalls.length}</b> recorded calls</span>
    </div>
    ${viewTabs("view", [["calls", "Queue & history"], ["demos", "Demos & meetings"]], view)}
    ${view === "demos" ? renderMeetings() : renderCalling()}
  </div>`;
}

export function renderCalling() {
  const { data, routeParams } = getState();
  const assigneeId = routeParams.assignee || (isSalesperson() ? currentMemberId() : "");
  const lead = getNextCallLead({ leadId: routeParams.lead || "", assigneeId });
  const callsToday = data.salesCalls.filter((call) => (
    isToday(call.called_at || call.created_at)
    && (!isSalesperson() || String(call.salesperson_id || "") === String(currentMemberId()))
  ));
  const contacts = callsToday.filter((call) => !["no_answer", "voicemail", "gatekeeper", "wrong_number"].includes(call.outcome));
  const booked = callsToday.filter((call) => call.outcome === "meeting_booked");
  const closes = data.leads.filter((item) => item.status === "won" && isToday(item.stage_entered_at || item.updated_at));

  if (!lead) {
    return `<div class="stack">
      ${section("Today", { body: stats([
        ["Calls", callsToday.length], ["Contacts", contacts.length], ["Meetings", booked.length], ["Closes", closes.length],
      ]) })}
      ${empty({ title: "No lead is ready to call", message: "Assign or save an open lead, or clear the salesperson filter." })}
      ${callHistory(data, routeParams)}
    </div>`;
  }

  const tags = opportunityTags(lead);
  return `
    <div class="stack">
      ${section("Today", { body: stats([
        ["Calls", callsToday.length],
        ["Contacts", contacts.length],
        ["Meetings booked", booked.length],
        ["Closes", closes.length],
        ["Contact rate", `${callsToday.length ? ((contacts.length / callsToday.length) * 100).toFixed(1) : "0.0"}%`],
      ]) })}

      ${notice("Manual call record", "Use the phone link to start the call, then save the real outcome here. Operations does not claim a call was placed or recorded by a provider.", { iconName: "phone" })}

      <section class="calling-workspace">
        <div class="calling-workspace__lead">
          <span class="eyebrow">Next assigned lead</span>
          <h2>${escapeHtml(lead.business_name)}</h2>
          <p>${escapeHtml([lead.category, lead.city, lead.region].filter(Boolean).join(" · ") || "Local service business")}</p>
          <div class="btn-row">
            ${lead.phone ? `<a class="btn btn--primary" href="tel:${escapeHtml(lead.phone)}">Call ${escapeHtml(lead.phone)}</a>` : pill("warning", "No phone number")}
            ${btn("Lead details", { action: "lead-open", attrs: `data-id="${lead.id}"` })}
          </div>

          <dl class="detail-list">
            <div><dt>Contact</dt><dd>${escapeHtml(lead.contact_name || "Unknown")}</dd></div>
            <div><dt>Salesperson</dt><dd>${escapeHtml(memberName(data, lead.assigned_team_member_id))}</dd></div>
            <div><dt>Calls attempted</dt><dd>${formatNumber(lead.calls_attempted || 0)}</dd></div>
            <div><dt>Last contacted</dt><dd>${lead.last_contacted_at ? relativeTime(lead.last_contacted_at) : "Never"}</dd></div>
            <div><dt>Activation value</dt><dd>${formatCurrency(lead.quoted_setup_fee || lead.deal_value || 0)}</dd></div>
            <div><dt>Monthly value</dt><dd>${formatCurrency(lead.quoted_monthly_fee || 0)}</dd></div>
          </dl>

          <div class="tag-list">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("") || '<span class="faint">No inferred opportunity tags; qualify manually.</span>'}</div>
        </div>

        <div class="calling-workspace__guide">
          <h3>Offer and call guide</h3>
          <p><strong>Offer:</strong> unlimited AI receptionist and appointment booking for a $2,500 activation fee plus $997 per month.</p>
          <p><strong>Opening:</strong> “I help local service businesses capture calls they miss, qualify the caller, and book the right next step. How are missed or after-hours calls handled today?”</p>
          <p><strong>Qualify:</strong> ask about call volume, appointment or quote flow, current phone/calendar/CRM tools, response time, and when a human must take over.</p>
          <p><strong>Objections:</strong> do not promise savings or performance. Offer a workflow review, clarify that humans stay in control, and record the actual concern.</p>
        </div>

        <form class="calling-workspace__result stack--tight" data-form="sales-call" data-lead-id="${lead.id}">
          <h3>Record outcome</h3>
          ${field("Outcome", select("outcome", CALL_OUTCOMES.map(([value, label]) => ({ value, label })), "", { placeholder: "Choose the real outcome", required: true }))}
          <div class="call-outcome-grid" aria-label="Quick call outcomes">
            ${CALL_OUTCOMES.map(([value, label]) => `<button class="call-outcome" type="button" data-action="call-outcome" data-outcome="${value}"${["no_answer", "voicemail", "gatekeeper", "wrong_number"].includes(value) ? ' data-quick-save="true"' : ""}>${escapeHtml(label)}</button>`).join("")}
          </div>
          <p class="faint">No answer, voicemail, gatekeeper, and wrong number save immediately. Other outcomes stay selected so you can add the real details.</p>
          ${field("Quick notes", textarea("notes", "", { attrs: 'rows="3"', placeholder: "What happened and what matters next?" }))}
          <div class="field-grid">
            ${field("Objection", input("objection", "", { placeholder: "e.g. worried about call quality" }))}
            ${field("Pain point", input("pain_point", "", { placeholder: "e.g. missed after-hours calls" }))}
            ${field("Next follow-up", input("next_follow_up_at", "", { type: "datetime-local" }))}
            ${field("Meeting time", input("meeting_starts_at", "", { type: "datetime-local" }), { hint: "required only when meeting booked" })}
          </div>
          <div class="btn-row">
            <button class="btn btn--primary" type="submit">Save result & next lead</button>
          </div>
        </form>
      </section>
      ${callHistory(data, routeParams)}
    </div>
  `;
}

export function renderMeetings() {
  const { data, routeParams } = getState();
  const query = String(routeParams.q || "").toLowerCase();
  const outcome = routeParams.outcome || "all";
  const now = new Date();
  const meetings = data.meetings
    .filter((meeting) => outcome === "all" || meeting.outcome === outcome)
    .filter((meeting) => !query || `${meeting.title} ${leadName(data, meeting.lead_id)} ${meeting.automation_proposed || ""}`.toLowerCase().includes(query))
    .sort((left, right) => {
      const leftUpcoming = new Date(left.starts_at) >= now ? 0 : 1;
      const rightUpcoming = new Date(right.starts_at) >= now ? 0 : 1;
      return leftUpcoming - rightUpcoming || new Date(left.starts_at) - new Date(right.starts_at);
    });
  const upcoming = data.meetings.filter((meeting) => new Date(meeting.starts_at) >= now && !["cancelled", "lost"].includes(meeting.outcome));

  return `<div class="stack">
    ${pageHeader({
      title: "Meetings",
      subtitle: "Upcoming first. Keep preparation notes and the next step on the record.",
      actions: btn("New meeting", { action: "meeting-new", iconName: "plus", variant: "primary" }),
    })}
    ${section("Meeting flow", { body: stats([
      ["Upcoming", upcoming.length],
      ["This week", upcoming.filter((meeting) => new Date(meeting.starts_at).getTime() < Date.now() + 7 * 86_400_000).length],
      ["Proposal needed", data.meetings.filter((meeting) => meeting.outcome === "proposal_needed").length],
      ["Technical discovery", data.meetings.filter((meeting) => meeting.outcome === "technical_discovery_required").length],
    ]) })}
    <div class="toolbar">
      ${searchInput("Search meetings", routeParams.q || "")}
      ${filterSelect("outcome", ["scheduled", "proposal_needed", "follow_up", "won", "lost", "technical_discovery_required", "cancelled"].map((value) => ({ value, label: statusLabel(value) })), outcome, "All outcomes")}
      <span class="toolbar__spacer"></span>
    </div>
    ${table({
      columns: ["Meeting", "Business", "When", "Salesperson", "Proposal", "Outcome", ""],
      rows: meetings.map((meeting) => `<tr data-action="meeting-open" data-id="${meeting.id}">
        ${td("Meeting", `<div class="cell"><strong>${escapeHtml(meeting.title)}</strong><span>${escapeHtml(meeting.biggest_pain_point || meeting.next_action || "Discovery details not recorded")}</span></div>`)}
        ${td("Business", escapeHtml(meeting.lead_id ? leadName(data, meeting.lead_id) : clientBusiness(data, byId(data.clients, meeting.client_id))))}
        ${td("When", `${formatDate(meeting.starts_at, { year: "numeric" })}<span class="faint"> · ${relativeTime(meeting.starts_at)}</span>`)}
        ${td("Salesperson", escapeHtml(memberName(data, meeting.salesperson_id)))}
        ${td("Proposal", `${formatCurrency(meeting.quoted_setup_fee || 0)} + ${formatCurrency(meeting.quoted_monthly_fee || 0)}/mo`)}
        ${td("Outcome", pill(meeting.outcome))}
        ${td("", btn("Open", { action: "meeting-open", size: "sm", attrs: `data-id="${meeting.id}"` }))}
      </tr>`),
      emptyState: empty({ title: "No meetings", message: "Book a discovery or demo meeting from Calling or add one here." }),
    })}
  </div>`;
}

export function renderOnboarding() {
  const { data, routeParams } = getState();
  const status = routeParams.status || "all";
  const items = data.clients
    .map((client) => ({ client, record: data.onboardingRecords.find((record) => String(record.client_id) === String(client.id)) }))
    .filter(({ record }) => status === "all" || (record?.status || "not_started") === status);
  return `<div class="stack">
    ${section("Progress", { body: stats([
      ["Not started", items.filter(({ record }) => !record || record.status === "not_started").length],
      ["In progress", items.filter(({ record }) => record?.status === "in_progress").length],
      ["Blocked", items.filter(({ record }) => record?.status === "blocked").length],
      ["Complete", items.filter(({ record }) => record?.status === "complete").length],
    ]) })}
    <div class="toolbar">
      ${filterSelect("status", ["not_started", "in_progress", "blocked", "complete"].map((value) => ({ value, label: statusLabel(value) })), status, "All statuses")}
    </div>
    ${items.length ? rows(items.map(({ client, record }) => row({
      main: clientBusiness(data, client),
      sub: record ? `${record.progress || 0}% · ${statusLabel(record.status)} · updated ${relativeTime(record.updated_at)}` : "Structured onboarding has not started",
      iconName: record?.status === "complete" ? "check-circle" : "check-square",
      side: `${record ? bar(record.progress || 0) : ""}${pill(record?.status || "not_started")}${btn(record ? "Open" : "Start", { action: "onboarding-open", size: "sm", attrs: `data-client-id="${client.id}"${record ? ` data-id="${record.id}"` : ""}` })}`,
    }))) : empty({ title: "No clients to onboard", message: "A won lead automatically creates a client and onboarding record." })}
  </div>`;
}

export function renderAutomationStudio() {
  const { data, routeParams } = getState();
  const status = routeParams.status || "all";
  const automations = data.automations.filter((item) => status === "all" || item.status === status);
  return `<div class="stack">
    ${notice("Management layer", "Automation Studio stores configuration, versions, provider references, and operational state. Retell, Vapi, n8n, and other providers execute the automation; no live provider action is implied by a local record.", { iconName: "tool" })}
    ${section("Portfolio", { body: stats([
      ["Automations", data.automations.length],
      ["Live", data.automations.filter((item) => item.status === "live").length],
      ["Testing", data.automations.filter((item) => item.status === "testing").length],
      ["Needs attention", data.automations.filter((item) => item.last_error).length],
    ]) })}
    <div class="toolbar">
      ${filterSelect("status", ["designing", "building", "testing", "limited_launch", "live", "maintenance", "paused", "archived"].map((value) => ({ value, label: statusLabel(value) })), status, "All statuses")}
      <span class="toolbar__spacer"></span>
      ${isOwner() ? btn("New automation", { action: "automation-record-new", iconName: "plus", variant: "primary", size: "sm" }) : pill("warning", "View only")}
    </div>
    ${table({
      columns: ["Automation", "Client", "Type", "Provider", "Environment", "Status", "Version", ""],
      rows: automations.map((automation) => `<tr data-action="automation-record-open" data-id="${automation.id}">
        ${td("Automation", `<div class="cell"><strong>${escapeHtml(automation.name)}</strong><span>${escapeHtml(automation.last_error || "No stored error")}</span></div>`)}
        ${td("Client", escapeHtml(clientBusiness(data, byId(data.clients, automation.client_id))))}
        ${td("Type", escapeHtml(automation.automation_type))}
        ${td("Provider", escapeHtml(automation.provider || "Not selected"))}
        ${td("Environment", pill(automation.environment, statusLabel(automation.environment)))}
        ${td("Status", pill(automation.status))}
        ${td("Version", escapeHtml(automation.deployed_version || automation.development_version || "—"))}
        ${td("", isOwner() ? btn("Configure", { action: "automation-record-open", size: "sm", attrs: `data-id="${automation.id}"` }) : pill("warning", "View only"))}
      </tr>`),
      emptyState: empty({ title: "No automations", message: "Create the first management record after a client's project reaches design." }),
    })}
  </div>`;
}

export function renderAgencyDeployments() {
  const { data, routeParams } = getState();
  const status = routeParams.status || "all";
  const deployments = data.deployments.filter((item) => status === "all" || item.status === status);
  return `<div class="stack">
    ${notice("Deployment records are evidence, not execution", "A record tracks what was deployed to an external provider. Automatic deploy and rollback remain unavailable until a provider adapter is connected.", { iconName: "globe" })}
    ${section("State", { body: stats([
      ["Production", data.deployments.filter((item) => item.status === "production").length],
      ["Limited rollout", data.deployments.filter((item) => item.status === "limited_rollout").length],
      ["Staging", data.deployments.filter((item) => item.status === "staging").length],
      ["Failed", data.deployments.filter((item) => item.status === "failed").length],
    ]) })}
    <div class="toolbar">${filterSelect("status", ["staging", "limited_rollout", "production", "paused", "failed"].map((value) => ({ value, label: statusLabel(value) })), status, "All statuses")}</div>
    ${table({
      columns: ["Automation", "Client", "Version", "Provider", "Environment", "Deployed", "Status", "Rollback"],
      rows: deployments.map((deployment) => {
        const automation = byId(data.automations, deployment.automation_id);
        return `<tr>
          ${td("Automation", `<strong>${escapeHtml(automation?.name || deployment.domain || "Legacy deployment")}</strong>`)}
          ${td("Client", escapeHtml(clientBusiness(data, byId(data.clients, deployment.client_id))))}
          ${td("Version", escapeHtml(deployment.version || "—"))}
          ${td("Provider", escapeHtml(deployment.provider || automation?.provider || "—"))}
          ${td("Environment", escapeHtml(deployment.environment || "staging"))}
          ${td("Deployed", deployment.deployed_at ? relativeTime(deployment.deployed_at) : "Not recorded")}
          ${td("Status", pill(deployment.status))}
          ${td("Rollback", escapeHtml(deployment.rollback_version || "Metadata not set"))}
        </tr>`;
      }),
      emptyState: empty({ title: "No deployment records", message: "Add deployment tracking when an automation reaches staging." }),
    })}
  </div>`;
}

export function renderSubscriptions() {
  const { data, routeParams } = getState();
  const status = routeParams.status || "all";
  const subscriptions = data.maintenanceSubscriptions.filter((item) => status === "all" || item.status === status);
  const active = data.maintenanceSubscriptions.filter((item) => item.status === "active");
  return `<div class="stack">
    ${section("Recurring management", { body: stats([
      ["MRR", formatCurrency(sum(active, (item) => item.monthly_amount))],
      ["Active", active.length],
      ["Past due", data.maintenanceSubscriptions.filter((item) => item.status === "past_due").length],
      ["Cancelling", data.maintenanceSubscriptions.filter((item) => ["requested", "scheduled"].includes(item.cancellation_status)).length],
    ]) })}
    <div class="toolbar">
      ${filterSelect("status", ["active", "inactive", "past_due", "cancelled"].map((value) => ({ value, label: statusLabel(value) })), status, "All statuses")}
      <span class="toolbar__spacer"></span>
      ${isOwner() ? btn("Add subscription", { action: "subscription-new", iconName: "plus", variant: "primary", size: "sm" }) : pill("warning", "View only")}
    </div>
    ${table({
      columns: ["Client", "Plan", "Monthly", "Included usage", "Overage", "Next payment", "Status", ""],
      rows: subscriptions.map((subscription) => `<tr data-action="subscription-open" data-id="${subscription.id}">
        ${td("Client", `<strong>${escapeHtml(clientBusiness(data, byId(data.clients, subscription.client_id)))}</strong>`)}
        ${td("Plan", escapeHtml(subscription.plan_name || "Managed automation"))}
        ${td("Monthly", formatCurrency(subscription.monthly_amount))}
        ${td("Included usage", subscription.included_usage == null ? "Custom" : `${formatNumber(subscription.included_usage)} ${escapeHtml(subscription.usage_unit || "units")}`)}
        ${td("Overage", subscription.overage_rate == null ? "None" : `${formatCurrency(subscription.overage_rate, 4)} / ${escapeHtml(subscription.usage_unit || "unit")}`)}
        ${td("Next payment", formatDate(subscription.next_charge_on))}
        ${td("Status", pill(subscription.status))}
        ${td("", isOwner() ? btn("Edit", { action: "subscription-open", size: "sm", attrs: `data-id="${subscription.id}"` }) : pill("warning", "View only"))}
      </tr>`),
      emptyState: empty({ title: "No subscriptions", message: "Add recurring management billing after a client is active." }),
    })}
  </div>`;
}

export function renderCommissions() {
  const { data, routeParams } = getState();
  const status = routeParams.status || "all";
  const visible = isSalesperson()
    ? data.commissions.filter((item) => String(item.salesperson_id || "") === String(currentMemberId()))
    : data.commissions;
  const commissions = visible.filter((item) => status === "all" || item.status === status);
  const amount = (item) => Number(item.calculated_commission ?? commissionAmount(item));
  return `<div class="stack">
    ${notice("$350 activation commission", "A salesperson earns $350 when the client's $2,500 activation payment is collected. The $997 monthly subscription does not earn commission.", { iconName: "dollar" })}
    ${section("Commission ledger", { body: stats([
      ["Pending", formatCurrency(sum(visible.filter((item) => item.status === "pending"), amount))],
      ["Earned", formatCurrency(sum(visible.filter((item) => item.status === "earned"), amount))],
      ["Paid", formatCurrency(sum(visible.filter((item) => item.status === "paid"), amount))],
      ["Reversed", formatCurrency(sum(visible.filter((item) => item.status === "reversed"), amount))],
    ]) })}
    <div class="toolbar">${filterSelect("status", ["pending", "earned", "paid", "reversed"].map((value) => ({ value, label: statusLabel(value) })), status, "All statuses")}</div>
    ${table({
      columns: ["Salesperson", "Client", "Activation collected", "Commission", "Earned", "Status", ""],
      rows: commissions.map((commission) => `<tr>
        ${td("Salesperson", escapeHtml(memberName(data, commission.salesperson_id)))}
        ${td("Client", escapeHtml(clientBusiness(data, byId(data.clients, commission.client_id))))}
        ${td("Activation collected", formatCurrency(commission.collected_setup_revenue))}
        ${td("Commission", `<strong>${formatCurrency(amount(commission))}</strong>`)}
        ${td("Earned", formatDate(commission.earned_at || commission.created_at, { year: "numeric" }))}
        ${td("Status", pill(commission.status))}
        ${td("", isOwner() ? btn("Update", { action: "commission-open", size: "sm", attrs: `data-id="${commission.id}"` }) : pill("warning", "View only"))}
      </tr>`),
      emptyState: empty({ title: "No commissions", message: "A collected activation payment creates an earned $350 commission automatically." }),
    })}
  </div>`;
}

export function renderTeam() {
  const { data, routeParams } = getState();
  const status = routeParams.status || "active";
  const members = data.teamMembers.filter((member) => status === "all" || member.status === status);
  return `<div class="stack">
    ${pageHeader({
      title: "Team",
      subtitle: "Employees and contractors mapped from Cloudflare Access. This is not an application account list.",
      actions: isOwner() ? btn("Add team member", { action: "team-member-new", iconName: "plus", variant: "primary" }) : pill("warning", "View only"),
    })}
    ${notice("Cloudflare Access is the only sign-in boundary", isOwner() ? "Verified Access email claims map to active team records, and the Worker enforces owner and salesperson permissions." : ownerOnlyNotice("Team and permission administration"), { tone: isOwner() ? "success" : "warn", iconName: "user" })}
    <div class="toolbar">
      ${filterSelect("status", ["active", "inactive"].map((value) => ({ value, label: statusLabel(value) })), status, "All statuses")}
      <span class="toolbar__spacer"></span>
    </div>
    ${table({
      columns: ["Name", "Role", "Assigned leads", "Clients", "Commission", "Status", ""],
      rows: members.map((member) => `<tr data-action="team-member-open" data-id="${member.id}">
        ${td("Name", `<div class="cell"><strong>${escapeHtml(member.full_name)}</strong><span>${escapeHtml(member.access_email || "Access email not mapped")}</span></div>`)}
        ${td("Role", escapeHtml(statusLabel(member.role)))}
        ${td("Assigned leads", formatNumber(data.leads.filter((lead) => String(lead.assigned_team_member_id) === String(member.id)).length))}
        ${td("Clients", formatNumber(data.clients.filter((client) => String(client.primary_team_member_id) === String(member.id)).length))}
        ${td("Commission", formatCurrency(member.commission_min || 350))}
        ${td("Status", pill(member.status))}
        ${td("", isOwner() ? btn("Edit", { action: "team-member-open", size: "sm", attrs: `data-id="${member.id}"` }) : pill("warning", "View only"))}
      </tr>`),
      emptyState: empty({ title: "No team members", message: "Add assignment records without creating application accounts." }),
    })}
  </div>`;
}
