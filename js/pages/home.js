/** Agency command center: money, sales, delivery health, and the next work. */
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, greeting, isToday, relativeTime } from "../core/utils.js";
import { btn, empty, icon, pill, row, rows, section, stats, table, td } from "../components/ui.js";
import { agencySummary, attentionItems, clientLifecycleRows, commissionAmount } from "../services/operations.js";
import { currentMember } from "../services/permissions.js";
import { clientName, timeline } from "./shared.js";

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
      <div class="greeting employee-dashboard__greeting">
        <div>
          <span class="eyebrow">Sales workspace</span>
          <h2>${escapeHtml(greeting())}, ${escapeHtml(firstName)}</h2>
          <p>${escapeHtml(new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}</p>
        </div>
        ${btn("Start calling", { action: "navigate", attrs: 'data-route-target="calling"', variant: "primary", iconName: "phone" })}
      </div>

      ${section("Today", {
        subtitle: "Only recorded employee activity is counted",
        body: stats([
          ["Calls", callsToday.length],
          ["Contacts", contactsToday.length],
          ["Meetings", meetingsToday.length],
          ["Assigned leads", queue.length],
          ["Follow-ups", followUps.length],
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
      body: empty({ title: "Nothing urgent", message: "Overdue follow-ups, tasks, invoices, and automation failures appear here." }),
    });
  }

  return section("Needs attention", {
    count: items.length,
    body: rows(items.slice(0, 7).map((item) => row({
      main: item.title,
      sub: item.detail,
      iconName: item.iconName,
      tone: item.tone,
      action: "navigate",
      attrs: `data-route-target="${item.route}"${item.params ? ` data-route-params="${escapeHtml(JSON.stringify(item.params))}"` : ""}`,
      side: `${item.at ? `<span class="faint">${relativeTime(item.at)}</span>` : ""}${icon("chevron")}`,
    }))),
  });
}

export function renderHome() {
  const { data } = getState();
  const summary = agencySummary();
  const clients = clientLifecycleRows(data);
  const name = currentMember()?.full_name || data.profile?.full_name || "Connor";
  const callsToday = data.salesCalls.filter((call) => isToday(call.called_at || call.created_at));
  const contactsToday = callsToday.filter((call) => !["no_answer", "voicemail", "gatekeeper", "wrong_number"].includes(call.outcome));

  return `
    <div class="stack">
      <div class="greeting">
        <h2>${escapeHtml(greeting())}, ${escapeHtml(name.split(" ")[0])}</h2>
        <p>${escapeHtml(new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))}</p>
      </div>

      ${section("Agency pulse", {
        subtitle: "Collected revenue and current operating state",
        body: stats([
          ["Total revenue", formatCurrency(summary.totalRevenue)],
          ["MRR", formatCurrency(summary.monthlyRecurringRevenue)],
          ["Setup revenue · month", formatCurrency(summary.setupRevenueThisMonth)],
          ["Active clients", summary.activeClients],
          ["Automations live", summary.automationsLive, summary.automationsRequiringAttention ? `${summary.automationsRequiringAttention} need attention` : "all stored records clear"],
          ["Gross margin · month", summary.estimatedGrossMargin == null ? "—" : `${summary.estimatedGrossMargin.toFixed(1)}%`, "estimate from recorded revenue and costs"],
        ]),
      })}

      <div class="split split--even">
        ${section("Sales now", {
          actions: btn("Open Calling", { action: "navigate", attrs: 'data-route-target="calling"', size: "sm", variant: "primary" }),
          body: stats([
            ["Pipeline", summary.leadsInPipeline],
            ["Scheduled meetings", summary.meetingsScheduled],
            ["Calls today", callsToday.length, `${contactsToday.length} contacts`],
            ["Deals won", summary.dealsWon, `${summary.salesConversionRate.toFixed(1)}% closed-deal conversion`],
          ]),
        })}
        ${section("Cash and delivery", {
          actions: btn("Automation Studio", { action: "navigate", attrs: 'data-route-target="automation-studio"', size: "sm" }),
          body: stats([
            ["Outstanding", formatCurrency(summary.outstandingPayments)],
            ["Costs · month", formatCurrency(summary.usageCostsThisMonth, 2)],
            ["Upcoming tasks", summary.upcomingTasks],
            ["Attention", summary.automationsRequiringAttention, "stored automation errors only"],
          ]),
        })}
      </div>

      ${attentionSection()}

      ${section("Every client · next action", {
        subtitle: "Derived automatically from payment, onboarding, agent, deployment, and service records",
        actions: btn("Open client workspace", { action: "navigate", attrs: 'data-route-target="clients"', size: "sm", variant: "primary" }),
        body: table({
          columns: ["Client", "Happening now", "Next action", "Progress", ""],
          rows: clients.map((item) => `<tr>
            ${td("Client", `<div class="cell"><strong>${escapeHtml(clientName(data, item.client))}</strong><span>${escapeHtml(item.client.contact_name || item.client.email || "No contact recorded")}</span></div>`)}
            ${td("Happening now", pill(item.currentStage, item.currentLabel))}
            ${td("Next action", `<strong>${escapeHtml(item.nextAction)}</strong>`)}
            ${td("Progress", `${item.progress}%`)}
            ${td("", btn(item.action.label, { action: item.action.action, attrs: item.action.attrs, size: "sm", variant: item.tone === "green" ? "" : "primary" }))}
          </tr>`),
          emptyState: empty({ title: "No clients yet", message: "A won lead automatically becomes a client with onboarding and delivery records." }),
        }),
      })}

      ${section("Recent activity", {
        actions: btn("View all", { action: "navigate", attrs: 'data-route-target="activity"', size: "sm" }),
        body: timeline(data.activity, 8),
      })}

      ${data.leads.length ? "" : section("Start the operating flow", {
        body: rows([
          row({ main: "Discover automation-fit businesses", sub: "Search a niche and location, then review evidence-backed opportunity tags", iconName: "radar", action: "navigate", attrs: 'data-route-target="discovery"', side: icon("chevron") }),
          row({ main: "Add your internal team records", sub: "Set assignments and commission rules without creating application accounts", iconName: "user", action: "navigate", attrs: 'data-route-target="team"', side: icon("chevron") }),
          row({ main: "Review secure integrations", sub: "Provider connections stay server-side and unavailable actions are labeled honestly", iconName: "plug", action: "navigate", attrs: 'data-route-target="integrations"', side: icon("chevron") }),
        ]),
      })}
    </div>
  `;
}
