/**
 * Lead Discovery, Leads and Pipeline.
 *
 * Discovery keeps the real OpenScout engine and shows three inputs: niche,
 * location, how many. Everything else lives under Advanced with defaults that
 * match the business model (no website, deduplicated, skip contacted).
 */
import { AUTOMATION_OPPORTUNITIES, PIPELINE_STAGES } from "../config.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, formatNumber, relativeTime, statusLabel, sum } from "../core/utils.js";
import {
  advanced,
  bar,
  btn,
  checkbox,
  empty,
  field,
  icon,
  input,
  notice,
  pill,
  row,
  rows,
  score,
  section,
  select,
  stats,
  table,
  td,
} from "../components/ui.js";
import { canUseDirectWebsiteVerification, workerHoldsMapsKey } from "../services/openscout/adapter.js";
import { renderCalling } from "./agency.js";
import { filterSelect, locationOf, searchInput, viewTabs } from "./shared.js";

/** One sales screen: do the next call, move the pipeline, review leads, or find more. */
export function renderSalesCenter() {
  const { data, routeParams } = getState();
  const view = ["work", "pipeline", "leads", "discover"].includes(routeParams.view) ? routeParams.view : "work";
  const openLeads = data.leads.filter((lead) => !["won", "lost"].includes(lead.status));
  const dueFollowUps = data.followUps.filter((item) => (
    !["sent", "replied", "completed", "dead", "skipped", "cancelled"].includes(item.status)
    && item.due_at && new Date(item.due_at) <= new Date()
  ));
  const upcomingMeetings = data.meetings.filter((meeting) => (
    new Date(meeting.starts_at).getTime() >= Date.now() && !["cancelled", "lost"].includes(meeting.outcome)
  ));
  const body = view === "pipeline" ? renderPipeline()
    : view === "leads" ? renderLeads()
      : view === "discover" ? renderDiscovery()
        : renderCalling();

  return `<div class="stack crm-center">
    <section class="crm-center__head">
      <div><span class="eyebrow">Lead &rarr; demo &rarr; close</span><h2>Sales</h2><p>One queue for the work that moves a real business forward.</p></div>
      <div class="crm-center__pulse">
        <span><b>${openLeads.length}</b> open leads</span>
        <span><b>${dueFollowUps.length}</b> due follow-ups</span>
        <span><b>${upcomingMeetings.length}</b> upcoming meetings</span>
      </div>
    </section>
    ${viewTabs("view", [["work", "Call next"], ["pipeline", "Pipeline"], ["leads", "Lead list"], ["discover", "Find leads"]], view)}
    ${body}
  </div>`;
}

/* ---------- discovery ---------- */

function discoveryRows(state) {
  if (state.discovery.results.length) return state.discovery.results;
  const latest = state.data.discoveryRuns[0];
  return latest ? state.data.discoveryResults.filter((item) => item.run_id === latest.id) : [];
}

function progressLine(discovery) {
  if (discovery.status !== "running") return "";
  const progress = discovery.progress || {};
  const completed = Number(progress.completed || 0);
  const total = Math.max(Number(progress.total || 1), completed, 1);
  const percent = Math.min(98, Math.round((completed / total) * 100));
  const phaseLabel = progress.phase === "verify" ? "Checking websites"
    : progress.phase === "presence" ? "Checking web presence and public emails"
      : progress.phase === "email" ? "Finding public emails"
      : "Searching";
  return `
    <div class="progress-line">
      <span class="spin"></span>
      <span>${escapeHtml(phaseLabel)} · ${formatNumber(progress.scanned || 0)} scanned · ${formatNumber(progress.leads || 0)} found</span>
      ${bar(percent, "accent")}
      <b class="num">${percent}%</b>
    </div>
  `;
}

function websiteAuditLine(summary) {
  const checked = Number(summary?.webPresenceChecked || 0);
  if (!checked) return "";
  const excluded = Number(summary?.excludedExistingWebsite || 0);
  const uncertain = Number(summary?.inconclusiveWebsiteChecks || 0);
  return `
    <p class="faint">
      Web checked ${formatNumber(checked)} ·
      ${formatNumber(excluded)} official site${excluded === 1 ? "" : "s"} filtered ·
      ${formatNumber(uncertain)} uncertain
    </p>
  `;
}

export function renderDiscovery() {
  const state = getState();
  const { data, routeParams, discovery } = state;
  const fromWorker = workerHoldsMapsKey();
  const hasKey = fromWorker;
  const canVerify = canUseDirectWebsiteVerification();
  const lastQuery = data.discoveryRuns[0]?.query || {};
  const runSummary = discovery.summary || data.discoveryRuns[0]?.summary || null;
  const allRows = discoveryRows(state);
  const query = (routeParams.q || "").toLowerCase();
  const decision = routeParams.decision || "pending";
  const selected = new Set(discovery.selected.map(String));

  const results = allRows
    .filter((item) => (decision === "all" || item.decision === decision))
    .filter((item) => !query || `${item.business_name} ${item.normalized_data?.category} ${item.normalized_data?.city} ${item.normalized_data?.email}`.toLowerCase().includes(query))
    .sort((a, b) => Number(b.lead_score || 0) - Number(a.lead_score || 0));

  return `
    <div class="stack">
      ${hasKey ? "" : notice(
        "Google Maps is not configured",
        "Lead Discovery uses the Google Places API through OpenScout. Add GOOGLE_MAPS_API_KEY to the Cloudflare Worker; keys are never saved in the browser.",
        { tone: "warn", iconName: "info" },
      )}

      <form class="finder" data-form="discovery">
        <div class="finder__primary">
          ${field("Niche", input("business_type", lastQuery.businessType || "", { placeholder: "tree service", required: true }))}
          ${field("Location", input("location", lastQuery.location || "", { placeholder: "Arlington, TX", required: true }))}
          ${field("How many", input("limit", lastQuery.limit || 50, { type: "number", attrs: 'min="1" max="250"' }))}
          <button class="btn btn--primary" type="submit"${discovery.status === "running" ? " disabled" : ""}>
            ${icon("radar")}<span>${discovery.status === "running" ? "Searching…" : "Find leads"}</span>
          </button>
        </div>


        ${advanced("Advanced", `
          <div class="field-grid">
            ${field("Search radius", select("radius_km", [5, 10, 15, 25, 40, 60, 80].map((value) => ({ value, label: `${value} km` })), lastQuery.radiusKm || 15))}
            ${field("Scan depth", select("depth", [
              { value: "quick", label: "Quick" },
              { value: "standard", label: "Standard" },
              { value: "deep", label: "Deep" },
            ], lastQuery.depth || "standard"))}
            ${field("Minimum fit score", input("min_confidence", 70, { type: "number", attrs: 'min="0" max="100"' }))}
            ${field("Minimum rating", input("min_rating", 0, { type: "number", attrs: 'min="0" max="5" step="0.1"' }))}
          </div>
          ${checkbox("no_website", "Only businesses with no official website", Boolean(lastQuery.filters?.noWebsite))}
          ${checkbox("must_have_email", "Require a public email address", false)}
          ${checkbox("must_have_phone", "Require a phone number", true)}
          ${checkbox("skip_known", "Skip businesses already in leads", true)}
          ${checkbox("verify", canVerify ? "Verify ambiguous links live" : "Verify ambiguous links live (local preview only)", canVerify, canVerify ? "" : "disabled")}
          <p class="faint">OpenScout keeps source evidence and deduplication. Website presence is context unless the optional no-website filter is enabled; opportunity tags are conservative inferences that must be verified during outreach.</p>
        `)}

        ${discovery.error ? notice("Search could not finish", discovery.error, { tone: "error", iconName: "alert" }) : ""}
        ${progressLine(discovery)}
      </form>

      ${section("Results", {
        count: results.length,
        actions: `
          ${searchInput("Search results", routeParams.q || "")}
          ${filterSelect("decision", ["pending", "saved", "rejected", "duplicate"].map((value) => ({ value, label: statusLabel(value) })), decision, "All decisions")}
          ${selected.size ? btn(`Save ${selected.size} to leads`, { action: "discovery-save-selected", variant: "primary", size: "sm" }) : ""}
          ${selected.size ? btn("Reject", { action: "discovery-reject-selected", size: "sm" }) : ""}
        `,
        body: `${websiteAuditLine(runSummary)}${table({
          columns: ["Business", "Category", "Location", "Fit", "Opportunity", "Contact", "Website", ""],
          rows: results.map((item) => {
            const lead = item.normalized_data || {};
            const source = item.raw_source_metadata?.openscout || {};
            const presence = item.raw_source_metadata?.web_presence || lead.source_metadata?.web_presence || {};
            const isPending = item.decision === "pending";
            const websiteLabel = presence.status === "unknown"
              ? "Check uncertain"
              : lead.has_website ? "Has site" : lead.website_status || "No official site found";
            const websiteTone = presence.status === "unknown" || lead.has_website ? "warning" : "connected";
            return `<tr>
              ${td("Business", `<label class="check">${isPending ? `<input type="checkbox" data-action="discovery-select" data-id="${item.id}"${selected.has(String(item.id)) ? " checked" : ""} aria-label="Select ${escapeHtml(item.business_name)}">` : ""}<strong>${escapeHtml(item.business_name)}</strong></label>`)}
              ${td("Category", escapeHtml(lead.category || "—"))}
              ${td("Location", escapeHtml(locationOf(lead) || "—"))}
              ${td("Fit", `${score(item.lead_score)}${source.rating ? `<span class="faint"> ${source.rating}★ / ${formatNumber(source.ratingCount || 0)}</span>` : ""}`)}
              ${td("Opportunity", `<div class="tag-list">${(lead.opportunity_tags || []).slice(0, 3).map((tag) => `<span class="tag">${escapeHtml(AUTOMATION_OPPORTUNITIES.find(([id]) => id === tag)?.[1] || statusLabel(tag))}</span>`).join("") || '<span class="faint">Review manually</span>'}</div>`)}
              ${td("Contact", `<div class="cell"><strong>${escapeHtml(lead.phone || "—")}</strong><span>${escapeHtml(lead.email || "No public email")}</span></div>`)}
              ${td("Website", pill(websiteTone, websiteLabel))}
              ${td("", `<span class="cell-actions">
                ${isPending ? btn("Save", { action: "discovery-save", size: "sm", variant: "primary", attrs: `data-id="${item.id}"` }) : pill(item.decision)}
                ${isPending ? btn("Reject", { action: "discovery-reject", size: "sm", attrs: `data-id="${item.id}"` }) : ""}
                ${btn("", { action: "discovery-inspect", iconName: "chevron", size: "sm", attrs: `data-id="${item.id}" aria-label="Details"` })}
              </span>`)}
            </tr>`;
          }),
          emptyState: empty({
            title: discovery.status === "running" ? "Searching…" : allRows.length ? "No results match this filter" : "No searches yet",
            message: allRows.length ? "Change the decision filter or search text." : "Enter a niche and location above to find local service businesses with reviewable automation-fit signals.",
          }),
        })}`,
      })}

      ${data.discoveryRuns.length ? section("Recent searches", {
        body: rows(data.discoveryRuns.slice(0, 5).map((run) => row({
          main: `${run.query?.businessType || "Businesses"} · ${run.query?.location || "Unknown"}`,
          sub: `${formatNumber(run.result_count || 0)} found · ${formatNumber(run.saved_count || 0)} saved`,
          action: "discovery-open-run",
          id: run.id,
          side: `<span class="faint">${relativeTime(run.created_at)}</span>${icon("chevron")}`,
        }))),
      }) : ""}
    </div>
  `;
}

/* ---------- leads ---------- */

function nextStep(data, lead) {
  if (["won", "lost"].includes(lead.status)) return statusLabel(lead.status);
  if (lead.status === "meeting_scheduled") return "Prepare discovery meeting";
  if (lead.status === "demo_completed") return "Send proposal";
  if (lead.status === "proposal_sent") return "Follow up on proposal";
  if (lead.status === "negotiating") return "Resolve pricing and next action";
  if (lead.status === "follow_up_later") return lead.follow_up_at ? `Follow up ${relativeTime(lead.follow_up_at)}` : "Set a follow-up";
  if (["contacted", "interested"].includes(lead.status)) return "Follow up";
  return "Call lead";
}

export function renderLeads() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const stage = routeParams.stage || "all";
  const assignee = routeParams.assignee || "all";
  const qualification = routeParams.qualification || "all";
  const opportunity = routeParams.opportunity || "all";
  const callState = routeParams.call || "all";
  const contact = routeParams.contact || "all";
  const sort = routeParams.sort || "score";

  const leads = data.leads
    .filter((lead) => (stage === "all" || lead.status === stage))
    .filter((lead) => assignee === "all" || (assignee === "unassigned" ? !lead.assigned_team_member_id : String(lead.assigned_team_member_id) === assignee))
    .filter((lead) => qualification === "all" || lead.qualification_status === qualification)
    .filter((lead) => opportunity === "all" || (lead.opportunity_tags || []).includes(opportunity))
    .filter((lead) => callState === "all" || (callState === "called" ? Number(lead.calls_attempted || 0) > 0 : Number(lead.calls_attempted || 0) === 0))
    .filter((lead) => contact === "all"
      || (contact === "phone" && Boolean(lead.phone))
      || (contact === "email" && Boolean(lead.email))
      || (contact === "both" && Boolean(lead.phone) && Boolean(lead.email))
      || (contact === "none" && !lead.phone && !lead.email))
    .filter((lead) => !query || `${lead.business_name} ${lead.category} ${lead.city} ${lead.phone} ${lead.email}`.toLowerCase().includes(query))
    .sort((a, b) => {
      if (sort === "name") return a.business_name.localeCompare(b.business_name);
      if (sort === "recent") return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
      if (sort === "value") return Number(b.deal_value || 0) - Number(a.deal_value || 0);
      return Number(b.lead_score || 0) - Number(a.lead_score || 0);
    });

  const open = data.leads.filter((lead) => !["won", "lost"].includes(lead.status));

  return `
    <div class="stack">
      ${section("", {
        body: stats([
          ["Leads", formatNumber(data.leads.length)],
          ["Uncontacted", formatNumber(data.leads.filter((lead) => !lead.last_contacted_at && !["won", "lost"].includes(lead.status)).length)],
          ["Open value", formatCurrency(sum(open, (lead) => lead.deal_value || lead.asking_price))],
          ["Won", formatNumber(data.leads.filter((lead) => lead.status === "won").length)],
        ]),
      })}

      <div class="toolbar">
        ${searchInput("Search business, city, phone…", routeParams.q || "")}
        ${filterSelect("stage", PIPELINE_STAGES.map((item) => ({ value: item.id, label: item.label })), stage, "All stages")}
        ${filterSelect("assignee", [{ value: "unassigned", label: "Unassigned" }, ...data.teamMembers.map((member) => ({ value: member.id, label: member.full_name }))], assignee, "All salespeople")}
        ${filterSelect("qualification", ["unreviewed", "potential", "qualified", "unqualified"].map((value) => ({ value, label: statusLabel(value) })), qualification, "All qualifications")}
        ${filterSelect("opportunity", AUTOMATION_OPPORTUNITIES.map(([value, label]) => ({ value, label })), opportunity, "All opportunities")}
        ${filterSelect("call", [{ value: "uncalled", label: "Not called" }, { value: "called", label: "Called" }], callState, "All call states")}
        ${filterSelect("contact", [{ value: "phone", label: "Has phone" }, { value: "email", label: "Has email" }, { value: "both", label: "Phone + email" }, { value: "none", label: "No contact" }], contact, "All contact availability")}
        <select class="select-sm" data-action="route-select" data-key="sort" aria-label="Sort">
          <option value="score"${sort === "score" ? " selected" : ""}>Best score</option>
          <option value="recent"${sort === "recent" ? " selected" : ""}>Recently updated</option>
          <option value="value"${sort === "value" ? " selected" : ""}>Highest value</option>
          <option value="name"${sort === "name" ? " selected" : ""}>Name</option>
        </select>
        <span class="toolbar__spacer"></span>
        ${btn("Export", { action: "leads-export", iconName: "download", size: "sm" })}
        ${btn("Add lead", { action: "lead-new", iconName: "plus", variant: "primary", size: "sm" })}
      </div>

      ${table({
        columns: ["Business", "Location", "Fit", "Stage", "Next step", ""],
        rows: leads.map((lead) => `<tr data-action="lead-open" data-id="${lead.id}">
          ${td("Business", `<div class="cell"><strong>${escapeHtml(lead.business_name)}</strong><span>${escapeHtml(lead.category || "Uncategorised")}${lead.phone ? ` · ${escapeHtml(lead.phone)}` : ""}</span></div>`)}
          ${td("Location", escapeHtml(locationOf(lead) || "—"))}
          ${td("Fit", score(lead.lead_score))}
          ${td("Stage", pill(lead.status))}
          ${td("Next step", escapeHtml(nextStep(data, lead)))}
          ${td("", `<span class="cell-actions">${btn("Call", { action: "navigate", size: "sm", attrs: `data-route-target="calling" data-route-params='${escapeHtml(JSON.stringify({ lead: lead.id }))}' data-stop-row` })}${icon("chevron")}</span>`)}
        </tr>`),
        emptyState: empty({
          title: data.leads.length ? "No leads match" : "No leads yet",
          message: data.leads.length ? "Clear the search or stage filter." : "Find local service businesses in Lead Discovery.",
          action: data.leads.length ? "" : "navigate",
          actionLabel: "Open Lead Discovery",
          actionAttrs: 'data-route-target="discovery"',
        }),
      })}
    </div>
  `;
}

/* ---------- pipeline ---------- */

function deal(data, lead) {
  const assignee = data.teamMembers.find((member) => String(member.id) === String(lead.assigned_team_member_id));
  const entered = new Date(lead.stage_entered_at || lead.updated_at || lead.created_at || Date.now());
  const age = Math.max(0, Math.floor((Date.now() - entered.getTime()) / 86_400_000));
  return `
    <article class="deal" draggable="true" data-lead-id="${lead.id}" data-action="lead-open" data-id="${lead.id}">
      <strong>${escapeHtml(lead.business_name)}</strong>
      <div class="deal__meta">
        <span>${escapeHtml(assignee?.full_name || "Unassigned")}</span>
        <span>${formatCurrency(lead.quoted_setup_fee || lead.deal_value || lead.asking_price || 0)}</span>
        <span>${escapeHtml(nextStep(data, lead))}</span>
        <span>${age}d in stage</span>
      </div>
    </article>
  `;
}

export function renderPipeline() {
  const { data, routeParams } = getState();
  const view = routeParams.view || "board";
  const query = (routeParams.q || "").toLowerCase();
  const leads = data.leads.filter((lead) => !query || `${lead.business_name} ${lead.category} ${lead.city}`.toLowerCase().includes(query));
  const open = leads.filter((lead) => !["won", "lost"].includes(lead.status));

  return `
    <div class="stack">
      <div class="toolbar">
        ${searchInput("Search the pipeline", routeParams.q || "")}
        ${viewTabs("view", [["board", "Board"], ["list", "List"]], view)}
        <span class="toolbar__spacer"></span>
        <span class="faint">${formatNumber(open.length)} open · ${formatCurrency(sum(open, (lead) => lead.deal_value || lead.asking_price))}</span>
      </div>

      ${view === "list" ? table({
        columns: ["Business", "Stage", "Value", "Last contact", "Follow-up", ""],
        rows: leads.map((lead) => `<tr data-action="lead-open" data-id="${lead.id}">
          ${td("Business", `<div class="cell"><strong>${escapeHtml(lead.business_name)}</strong><span>${escapeHtml(lead.category || "")}</span></div>`)}
          ${td("Stage", pill(lead.status))}
          ${td("Value", formatCurrency(lead.deal_value || lead.asking_price || 0))}
          ${td("Last contact", lead.last_contacted_at ? relativeTime(lead.last_contacted_at) : "Never")}
          ${td("Follow-up", lead.follow_up_at ? relativeTime(lead.follow_up_at) : "—")}
          ${td("", icon("chevron"))}
        </tr>`),
        emptyState: empty({ title: "Pipeline is empty", message: "Save leads from discovery to fill it." }),
      }) : `
        <div class="board">
          ${PIPELINE_STAGES.map((stage) => {
            const stageLeads = leads.filter((lead) => lead.status === stage.id);
            return `<section class="board__col" data-stage="${stage.id}">
              <header class="board__head"><span>${escapeHtml(stage.label)}</span><b>${stageLeads.length}</b></header>
              <div class="board__list" data-stage="${stage.id}">
                ${stageLeads.map((lead) => deal(data, lead)).join("") || `<p class="board__empty">Drop here</p>`}
              </div>
            </section>`;
          }).join("")}
        </div>
      `}
    </div>
  `;
}
