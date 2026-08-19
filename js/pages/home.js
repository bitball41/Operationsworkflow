/** Agency operating dashboard: attention, snapshot, today, pipeline, health. */
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, greeting, isToday, relativeTime, statusLabel, sum } from "../core/utils.js";
import { btn, empty, healthDot, icon, metricGrid, pageHeader, pill, row, rows, section, table, td } from "../components/ui.js";
import { agencySummary, attentionItems, clientLifecycleRows, commissionAmount, pipelineCounts } from "../services/operations.js";
import { currentMember, isOwner } from "../services/permissions.js";
import { clientName } from "./shared.js";

const CLOSED_LEADS = new Set(["won", "lost"]);
const CLOSED_FOLLOW_UPS = new Set(["sent", "replied", "completed", "dead", "skipped", "cancelled"]);

function assignedTo(memberId, value) {
  return memberId && String(value || "") === String(memberId);
}

function callQueue(data, memberId) {
  const now = Date.now();
  return data.leads
    .filter((lead) => assignedTo(memberId, lead.assigned_team_member_id) && !CLOSED_LEADS.has(lead.status))
    .sort((left, right) => {
      const leftDue = left.follow_up_at ? new Date(left.follow_up_at).getTime() : Number.POSITIVE_INFINITY;
      const rightDue = right.follow_up_at ? new Date(right.follow_up_at).getTime() : Number.POSITIVE_INFINITY;
      return Number(leftDue > now) - Number(rightDue > now)
        || leftDue - rightDue
        || Number(Boolean(right.phone)) - Number(Boolean(left.phone))
        || Number(right.lead_score || 0) - Number(left.lead_score || 0);
    });
}

function attentionAction(item) {
  if (item.route === "payments") return "Collect";
  if (item.route === "follow-ups") return "Follow up";
  if (item.route === "inbox") return "Review";
  if (item.route === "voice-agents" || item.route === "automation-studio") return "Inspect";
  if (item.route === "tasks") return "Open";
  return "Open";
}

export function renderMyDay() {
  const { data } = getState();
  const member = currentMember();
  const memberId = member?.id || "";
  const queue = callQueue(data, memberId);
  const leadIds = new Set(queue.map((lead) => String(lead.id)));
  const calls = data.salesCalls.filter((call) => assignedTo(memberId, call.salesperson_id));
  const callsToday = calls.filter((call) => isToday(call.called_at || call.created_at));
  const contactsToday = callsToday.filter((call) => !["no_answer", "voicemail", "gatekeeper", "wrong_number"].includes(call.outcome));
  const meetingsToday = data.meetings.filter((meeting) => assignedTo(memberId, meeting.salesperson_id) && isToday(meeting.starts_at));
  const upcomingMeetings = data.meetings
    .filter((meeting) => assignedTo(memberId, meeting.salesperson_id) && new Date(meeting.starts_at).getTime() >= Date.now() && !["cancelled", "lost"].includes(meeting.outcome))
    .slice(0, 5);
  const followUps = data.followUps
    .filter((item) => leadIds.has(String(item.lead_id)) && !CLOSED_FOLLOW_UPS.has(item.status))
    .sort((left, right) => new Date(left.due_at || 0) - new Date(right.due_at || 0));
  const commissions = data.commissions.filter((item) => assignedTo(memberId, item.salesperson_id));
  const commissionTotal = commissions
    .filter((item) => ["pending", "earned"].includes(item.status))
    .reduce((total, item) => total + Number(item.calculated_commission ?? commissionAmount(item)), 0);
  const leadById = new Map(data.leads.map((lead) => [String(lead.id), lead]));
  const firstName = member?.full_name?.split(" ")[0] || "there";

  return `
    <div class="stack employee-dashboard">
      ${pageHeader({
        title: `${greeting()}, ${firstName}`,
        subtitle: new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
        actions: btn("Start calling", { action: "navigate", attrs: 'data-route-target="calling"', variant: "primary", iconName: "phone" }),
      })}

      ${section("Today", {
        subtitle: "Only recorded employee activity is counted",
        body: metricGrid([
          ["Calls", callsToday.length],
          ["Contacts", contactsToday.length],
          ["Meetings", meetingsToday.length],
          ["Commission due", formatCurrency(commissionTotal)],
        ]),
      })}

      <div class="employee-grid">
        ${section("Call queue", {
          count: queue.length,
          actions: btn("Open queue", { action: "navigate", attrs: 'data-route-target="calling"', size: "sm" }),
          body: queue.length ? `<div class="mobile-action-list">${queue.slice(0, 6).map((lead, index) => `
            <article class="mobile-action-card${index === 0 ? " is-next" : ""}">
              <div>
                <span class="eyebrow">${index === 0 ? "Up next" : escapeHtml(lead.status.replaceAll("_", " "))}</span>
                <strong>${escapeHtml(lead.business_name)}</strong>
                <small>${escapeHtml([lead.category, lead.city].filter(Boolean).join(" · "))}${lead.follow_up_at ? ` · ${escapeHtml(relativeTime(lead.follow_up_at))}` : ""}</small>
              </div>
              <div class="mobile-action-card__actions">
                ${lead.phone ? `<a class="btn btn--primary btn--sm" href="tel:${escapeHtml(lead.phone)}">Call</a>` : pill("warning", "No phone")}
                ${btn("Record", { action: "navigate", attrs: `data-route-target="calling" data-route-params="${escapeHtml(JSON.stringify({ lead: lead.id }))}"`, size: "sm" })}
              </div>
            </article>`).join("")}</div>` : empty({ title: "Queue clear", message: "No open leads are assigned to you." }),
        })}

        ${section("Follow-ups", {
          count: followUps.length,
          actions: btn("View all", { action: "navigate", attrs: 'data-route-target="follow-ups"', size: "sm" }),
          body: followUps.length ? rows(followUps.slice(0, 5).map((item) => {
            const lead = leadById.get(String(item.lead_id));
            return row({
              main: lead?.business_name || "Assigned lead",
              sub: `${item.due_at ? relativeTime(item.due_at) : "No due time"} · attempt ${item.sequence_number || 1}`,
              iconName: "timer",
              action: "navigate",
              attrs: `data-route-target="calling" data-route-params="${escapeHtml(JSON.stringify({ lead: item.lead_id }))}"`,
              side: icon("chevron"),
            });
          })) : empty({ title: "No open follow-ups", message: "Scheduled callbacks for your assigned leads appear here." }),
        })}
      </div>

      <div class="employee-grid">
        ${section("Meetings", {
          count: upcomingMeetings.length,
          actions: btn("Calendar", { action: "navigate", attrs: 'data-route-target="meetings"', size: "sm" }),
          body: upcomingMeetings.length ? rows(upcomingMeetings.map((meeting) => row({
            main: meeting.title,
            sub: `${new Date(meeting.starts_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${leadById.get(String(meeting.lead_id))?.business_name || "Client meeting"}`,
            iconName: "calendar",
            action: "meeting-open",
            attrs: `data-id="${meeting.id}"`,
            side: icon("chevron"),
          }))) : empty({ title: "No upcoming meetings", message: "Meetings you book from a call appear here." }),
        })}

        ${section("Recent results", {
          actions: btn("All calls", { action: "navigate", attrs: 'data-route-target="calling"', size: "sm" }),
          body: calls.length ? rows(calls.slice(0, 5).map((call) => row({
            main: leadById.get(String(call.lead_id))?.business_name || "Lead",
            sub: `${call.outcome.replaceAll("_", " ")} · ${relativeTime(call.called_at || call.created_at)}`,
            iconName: call.outcome === "meeting_booked" ? "check-circle" : "phone",
            side: pill(call.outcome),
          }))) : empty({ title: "No recorded results", message: "Save real call outcomes to build your personal stats." }),
        })}
      </div>
    </div>
  `;
}

function attentionSection() {
  const items = attentionItems();
  if (!items.length) {
    return section("Needs attention", {
      body: empty({ title: "Nothing urgent", message: "Agent issues, missed follow-ups, overdue tasks, and blocked delivery work appear here." }),
    });
  }

  return section("Needs attention", {
    count: items.length,
    body: `<div class="attention-list">${items.slice(0, 7).map((item) => `
      <div class="attention-item">
        ${healthDot(item.tone || "amber")}
        <div class="attention-item__copy">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.detail || "")}</span>
        </div>
        <div class="attention-item__meta">
          ${item.at ? `<span class="faint">${relativeTime(item.at)}</span>` : ""}
          ${pill(item.tone === "red" ? "error" : item.tone === "green" ? "healthy" : "warning", item.tone === "red" ? "Issue" : item.tone === "green" ? "Ready" : "Action")}
          ${btn(attentionAction(item), {
            action: "navigate",
            size: "sm",
            variant: item.tone === "red" ? "primary" : "",
            attrs: `data-route-target="${item.route}"${item.params ? ` data-route-params="${escapeHtml(JSON.stringify(item.params))}"` : ""}`,
          })}
        </div>
      </div>
    `).join("")}</div>`,
  });
}

function todayItems(data) {
  const now = Date.now();
  const week = now + 7 * 86_400_000;
  const items = [];

  data.meetings
    .filter((meeting) => {
      const start = new Date(meeting.starts_at).getTime();
      return start >= now && start < week && !["cancelled", "lost"].includes(meeting.outcome);
    })
    .forEach((meeting) => {
      items.push({
        at: meeting.starts_at,
        kind: "Meeting",
        title: meeting.title,
        detail: data.leads.find((lead) => String(lead.id) === String(meeting.lead_id))?.business_name || "Scheduled meeting",
        iconName: "calendar",
        action: "meeting-open",
        attrs: `data-id="${meeting.id}"`,
      });
    });

  data.tasks
    .filter((task) => !["completed", "cancelled"].includes(task.status) && task.due_at)
    .filter((task) => isToday(task.due_at) || new Date(task.due_at).getTime() < now)
    .forEach((task) => {
      items.push({
        at: task.due_at,
        kind: new Date(task.due_at).getTime() < now && !isToday(task.due_at) ? "Overdue task" : "Task",
        title: task.title,
        detail: task.priority ? statusLabel(task.priority) : "Assigned work",
        iconName: "check-square",
        action: "task-open",
        attrs: `data-id="${task.id}"`,
      });
    });

  data.followUps
    .filter((item) => !CLOSED_FOLLOW_UPS.has(item.status) && item.due_at && new Date(item.due_at).getTime() <= now)
    .forEach((item) => {
      const lead = data.leads.find((entry) => String(entry.id) === String(item.lead_id));
      items.push({
        at: item.due_at,
        kind: "Follow-up",
        title: lead?.business_name || "Sales follow-up",
        detail: `Attempt ${item.sequence_number || 1}`,
        iconName: "timer",
        action: "navigate",
        attrs: `data-route-target="follow-ups" data-route-params="${escapeHtml(JSON.stringify({ view: "overdue" }))}"`,
      });
    });

  data.leads
    .filter((lead) => ["new", "ready_to_contact"].includes(lead.status) && lead.phone)
    .slice(0, 4)
    .forEach((lead) => {
      items.push({
        at: lead.follow_up_at || lead.updated_at,
        kind: "Call",
        title: lead.business_name,
        detail: [lead.category, lead.city].filter(Boolean).join(" · ") || "Ready to call",
        iconName: "phone",
        action: "navigate",
        attrs: `data-route-target="calling" data-route-params="${escapeHtml(JSON.stringify({ lead: lead.id }))}"`,
      });
    });

  return items.sort((left, right) => new Date(left.at || 0) - new Date(right.at || 0)).slice(0, 8);
}

export function renderHome() {
  const { data } = getState();
  const summary = agencySummary();
  const clients = clientLifecycleRows(data);
  const name = currentMember()?.full_name || data.profile?.full_name || "Connor";
  const openLeads = data.leads.filter((lead) => !CLOSED_LEADS.has(lead.status));
  const pipelineValue = sum(openLeads, (lead) => lead.quoted_setup_fee || lead.deal_value || 0);
  const agentsLive = data.voiceAgents.filter((agent) => agent.provider_deleted_at == null && ["live", "active", "production"].includes(agent.environment || agent.status)).length
    || summary.automationsLive;
  const meetingsThisWeek = data.meetings.filter((meeting) => {
    const start = new Date(meeting.starts_at).getTime();
    return start >= Date.now() && start < Date.now() + 7 * 86_400_000 && !["cancelled", "lost"].includes(meeting.outcome);
  }).length;
  const stages = pipelineCounts().filter((stage) => !["won", "lost"].includes(stage.id) && stage.count);
  const maxStage = Math.max(...stages.map((stage) => stage.count), 1);
  const priorityDeals = openLeads
    .slice()
    .sort((left, right) => new Date(left.follow_up_at || 0) - new Date(right.follow_up_at || 0) || Number(right.lead_score || 0) - Number(left.lead_score || 0))
    .slice(0, 5);
  const today = todayItems(data);
  const healthRows = [
    ...clients.slice(0, 5).map((item) => ({
      tone: item.tone || "amber",
      title: clientName(data, item.client),
      detail: item.nextAction,
      when: item.client.updated_at,
      action: item.action,
    })),
    ...data.voiceAgents.filter((agent) => agent.provider_deleted_at == null).slice(0, 4).map((agent) => ({
      tone: agent.last_error || agent.status === "error" ? "red" : ["live", "active"].includes(agent.status || agent.environment) ? "green" : "amber",
      title: agent.name,
      detail: agent.last_error || statusLabel(agent.status || agent.environment || "draft"),
      when: agent.last_synced_at || agent.updated_at,
      action: { label: "Open", action: "voice-agent-open", attrs: `data-id="${agent.id}"` },
    })),
    ...(!data.voiceAgents.length ? data.automations.slice(0, 4).map((automation) => ({
      tone: automation.last_error ? "red" : automation.status === "live" ? "green" : "amber",
      title: automation.name,
      detail: automation.last_error || statusLabel(automation.status),
      when: automation.last_activity_at || automation.updated_at,
      action: { label: "Open", action: "automation-record-open", attrs: `data-id="${automation.id}"` },
    })) : []),
  ].slice(0, 6);

  return `
    <div class="stack">
      ${pageHeader({
        title: "Dashboard",
        subtitle: `${greeting()}, ${name.split(" ")[0]}. Here's what needs your attention.`,
        actions: `${isOwner() ? btn("Create agent", { action: "voice-agent-new", iconName: "plus", variant: "primary" }) : ""}${btn("Add lead", { action: "lead-new", iconName: "plus" })}`,
      })}

      ${attentionSection()}

      ${section("Agency snapshot", {
        body: metricGrid([
          ["Active clients", summary.activeClients],
          ["Agents live", agentsLive, summary.automationsRequiringAttention ? `${summary.automationsRequiringAttention} need review` : ""],
          ["Open pipeline", formatCurrency(pipelineValue), `${summary.leadsInPipeline} open leads`],
          ["Meetings this week", meetingsThisWeek, `MRR ${formatCurrency(summary.monthlyRecurringRevenue)}`],
        ]),
      })}

      ${section("Today", {
        subtitle: "What to do next",
        body: today.length ? `<div class="today-list">${today.map((item) => `
          <button class="today-item" type="button" data-action="${item.action}" ${item.attrs}>
            <span class="row__icon">${icon(item.iconName)}</span>
            <span class="today-item__copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.kind)} · ${escapeHtml(item.detail)}</span></span>
            <span class="today-item__meta"><span class="faint">${item.at ? relativeTime(item.at) : ""}</span>${icon("chevron")}</span>
          </button>
        `).join("")}</div>` : empty({ title: "Nothing queued for today", message: "Upcoming meetings, assigned tasks, and overdue follow-ups appear here." }),
      })}

      ${section("Sales pipeline", {
        subtitle: "Open stages and the next deal to work",
        actions: btn("Open sales", { action: "navigate", attrs: 'data-route-target="pipeline"', size: "sm" }),
        body: `<div class="pipeline-snapshot">
          <div class="stage-bars">${stages.length ? stages.map((stage) => `
            <div class="stage-bars__row">
              <span>${escapeHtml(stage.label)}</span>
              <span class="stage-bars__track"><i style="width:${Math.max(6, (stage.count / maxStage) * 100)}%"></i></span>
              <b>${stage.count}</b>
            </div>
          `).join("") : `<p class="faint">No open pipeline stages yet.</p>`}</div>
          ${priorityDeals.length ? table({
            columns: ["Deal", "Stage", "Owner", "Next"],
            rows: priorityDeals.map((lead) => {
              const owner = data.teamMembers.find((member) => String(member.id) === String(lead.assigned_team_member_id));
              return `<tr data-action="lead-open" data-id="${lead.id}">
                ${td("Deal", `<div class="cell"><strong>${escapeHtml(lead.business_name)}</strong><span>${formatCurrency(lead.quoted_setup_fee || lead.deal_value || 0)}</span></div>`)}
                ${td("Stage", pill(lead.status))}
                ${td("Owner", escapeHtml(owner?.full_name || "Unassigned"))}
                ${td("Next", escapeHtml(lead.follow_up_at ? relativeTime(lead.follow_up_at) : "Set follow-up"))}
              </tr>`;
            }),
          }) : empty({ title: "No open deals", message: "Add or discover a lead to fill the pipeline." })}
        </div>`,
      })}

      ${section("Client and agent health", {
        actions: btn("Open clients", { action: "navigate", attrs: 'data-route-target="clients"', size: "sm" }),
        body: healthRows.length ? `<div class="health-list">${healthRows.map((item) => `
          <div class="health-item">
            ${healthDot(item.tone)}
            <span class="health-item__copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></span>
            <span class="health-item__meta"><span class="faint">${item.when ? relativeTime(item.when) : ""}</span>${btn(item.action.label, { action: item.action.action, size: "sm", attrs: item.action.attrs })}</span>
          </div>
        `).join("")}</div>` : empty({ title: "No clients or agents yet", message: "Won deals create clients. Create an agent when a client is ready to deploy." }),
      })}
    </div>
  `;
}
