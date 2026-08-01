/** Agency command center: money, sales, delivery health, and the next work. */
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, greeting, isToday, relativeTime } from "../core/utils.js";
import { btn, empty, icon, pill, row, rows, section, stats } from "../components/ui.js";
import { agencySummary, attentionItems } from "../services/operations.js";
import { timeline } from "./shared.js";

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
  const name = data.profile?.full_name || "Connor";
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
