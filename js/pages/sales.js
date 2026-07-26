import { PIPELINE_STAGES } from "../config.js";
import { pageHead, scoreBar } from "../components/ui.js";
import { getState } from "../core/state.js";
import { escapeHtml, sum } from "../core/utils.js";
import { getStoredApiKey } from "../services/openscout/adapter.js";
import {
  badge,
  button,
  byId,
  checkboxCell,
  compactMetric,
  daysBetween,
  demoForLead,
  dueLabel,
  formatCurrency,
  formatDate,
  formatNumber,
  icon,
  linkOut,
  primaryCell,
  sectionCard,
  statusLabel,
  tableEmpty,
} from "./shared.js";

function latestDiscoveryRows(data, state) {
  if (state.discovery.results.length) return state.discovery.results;
  const latest = data.discoveryRuns[0];
  return latest ? data.discoveryResults.filter((item) => item.run_id === latest.id) : [];
}

function discoveryProgress(discovery) {
  if (discovery.status !== "running") return "";
  const progress = discovery.progress || {};
  const completed = Number(progress.completed || 0);
  const total = Math.max(Number(progress.total || 1), completed, 1);
  const percentage = Math.min(99, Math.round((completed / total) * 100));
  const label = progress.phase === "verify"
    ? "Verifying candidate websites"
    : `Scanning adaptive map tiles · ${completed}/${total}`;
  return `
    <div class="discovery-progress">
      <span class="agent-orb"><i></i></span>
      <div><strong>${escapeHtml(label)}</strong><span>${formatNumber(progress.scanned || 0)} businesses scanned · ${formatNumber(progress.leads || 0)} candidates</span><div class="progress"><i style="width:${percentage}%"></i></div></div>
      <b>${percentage}%</b>
    </div>
  `;
}

export function renderDiscovery() {
  const state = getState();
  const { data, routeParams, discovery } = state;
  const savedKey = Boolean(getStoredApiKey());
  const run = discovery.runId ? byId(data.discoveryRuns, discovery.runId) : data.discoveryRuns[0];
  const allRows = latestDiscoveryRows(data, state);
  const query = (routeParams.q || "").toLowerCase();
  const decision = routeParams.decision || "pending";
  const sort = routeParams.sort || "score_desc";
  let rows = allRows.filter((row) => (
    (decision === "all" || row.decision === decision)
    && (!query || `${row.business_name} ${row.normalized_data?.category} ${row.normalized_data?.city} ${row.normalized_data?.phone}`.toLowerCase().includes(query))
  ));
  rows = [...rows].sort((a, b) => {
    if (sort === "name") return a.business_name.localeCompare(b.business_name);
    if (sort === "city") return String(a.normalized_data?.city || "").localeCompare(String(b.normalized_data?.city || ""));
    return Number(b.lead_score || 0) - Number(a.lead_score || 0);
  });
  const selected = new Set(discovery.selected);
  const summary = discovery.summary || run?.summary || {};

  return `
    ${pageHead(
      "Lead Discovery",
      "Operations Workflow’s lead finder, powered by the actual OpenScout Google Places engine.",
      `<span class="engine-chip">${icon("radar")} OpenScout engine · connected</span>`,
    )}
    <section class="card discovery-console">
      <header class="card__head">
        <div><h3>Search for businesses without websites</h3><p>API key stays in this browser. It is never written to Supabase.</p></div>
        <span class="key-state ${savedKey ? "is-saved" : ""}">${icon(savedKey ? "check-circle-2" : "circle-alert")} ${savedKey ? "Google Maps key saved locally" : "Google Maps key required"}</span>
      </header>
      <form class="discovery-form" data-form="discovery-search">
        <div class="discovery-form__primary">
          <label class="field"><span>Location / metro</span><input name="location" required value="${escapeHtml(run?.query?.location || "Dallas–Fort Worth, TX")}" placeholder="Dallas–Fort Worth, TX"></label>
          <label class="field"><span>City</span><input name="city" value="${escapeHtml(run?.query?.city || "")}" placeholder="Optional city override"></label>
          <label class="field"><span>Industry / business type</span><input name="business_type" required value="${escapeHtml(run?.query?.businessType || "tree service")}" placeholder="tree service"></label>
          <label class="field"><span>Google Maps browser key</span><input name="api_key" type="password" autocomplete="off" placeholder="${savedKey ? "Saved — enter only to replace" : "AIza…"}"></label>
        </div>
        <div class="discovery-form__secondary">
          <label class="field"><span>Radius</span><select name="radius_km">${[5, 10, 15, 25, 40, 60].map((value) => `<option value="${value}" ${Number(run?.query?.radiusKm || 15) === value ? "selected" : ""}>${value} km</option>`).join("")}</select></label>
          <label class="field"><span>Leads wanted</span><input name="limit" type="number" min="1" max="250" value="${Number(run?.query?.limit || 50)}"></label>
          <label class="field"><span>Scan depth</span><select name="depth"><option value="quick">Quick</option><option value="standard" selected>Standard</option><option value="deep">Deep</option></select></label>
          <label class="field"><span>Minimum score</span><input name="min_confidence" type="number" min="0" max="100" value="70"></label>
        </div>
        <div class="discovery-options">
          <label><input type="checkbox" name="no_website" checked> Must not have a real website</label>
          <label><input type="checkbox" name="must_have_phone"> Must have phone</label>
          <label class="is-disabled" title="OpenScout does not return email addresses"><input type="checkbox" name="must_have_email" disabled> Must have email <small>needs enrichment integration</small></label>
          <label><input type="checkbox" name="verify" checked> Verify ambiguous links live</label>
          <button class="button button--primary" type="submit" ${discovery.status === "running" ? "disabled" : ""}>${icon("radar")}<span>${discovery.status === "running" ? "Searching…" : "Search with OpenScout"}</span></button>
        </div>
      </form>
      ${discovery.error ? `<div class="inline-alert inline-alert--error">${icon("circle-alert")}<div><strong>Discovery could not finish</strong><span>${escapeHtml(discovery.error)}</span></div></div>` : ""}
      ${discoveryProgress(discovery)}
    </section>
    ${run ? `<section class="discovery-summary">
      ${compactMetric("Scanned", formatNumber(run.scanned_count || summary.scanned || 0), "source listings")}
      ${compactMetric("Candidates", formatNumber(run.result_count || allRows.length), "normalized results")}
      ${compactMetric("Duplicates", formatNumber(run.duplicate_count || summary.mergedDuplicates || 0), "merged or matched")}
      ${compactMetric("Saved", formatNumber(run.saved_count || allRows.filter((item) => item.decision === "saved").length), "available everywhere")}
      ${compactMetric("Accuracy est.", `${Number(summary.estimatedAccuracy || 0)}%`, summary.verified ? `${summary.verified} verified` : "OpenScout estimate")}
    </section>` : ""}
    <div class="toolbar">
      <div class="toolbar__group">
        <label class="inline-search">${icon("search")}<input data-route-search placeholder="Search results" value="${escapeHtml(routeParams.q || "")}"></label>
        <select class="compact-select" data-action="route-select" data-key="decision">
          ${["pending", "saved", "rejected", "duplicate", "all"].map((value) => `<option value="${value}" ${decision === value ? "selected" : ""}>${value === "all" ? "All decisions" : statusLabel(value)}</option>`).join("")}
        </select>
        <select class="compact-select" data-action="route-select" data-key="sort">
          <option value="score_desc" ${sort === "score_desc" ? "selected" : ""}>Highest score</option>
          <option value="name" ${sort === "name" ? "selected" : ""}>Business name</option>
          <option value="city" ${sort === "city" ? "selected" : ""}>City</option>
        </select>
      </div>
      <div class="toolbar__group">
        <span class="selection-count">${selected.size} selected</span>
        ${button("Reject", { action: "reject-selected-discovery", variant: "danger", attrs: selected.size ? "" : "disabled" })}
        ${button("Save to leads", { action: "save-selected-discovery", iconName: "plus", variant: "primary", attrs: selected.size ? "" : "disabled" })}
      </div>
    </div>
    <section class="card">
      <div class="table-wrap">
        <table class="data-table responsive-table discovery-table">
          <thead><tr><th>${rows.some((item) => item.decision === "pending") ? `<input type="checkbox" data-action="select-all-discovery" aria-label="Select all pending results">` : ""}</th><th>Business</th><th>Location</th><th>Contact</th><th>Website</th><th>Score</th><th>Source</th><th>Decision</th><th></th></tr></thead>
          <tbody>${rows.map((item) => {
            const lead = item.normalized_data || {};
            return `<tr>
              <td data-label="Select">${item.decision === "pending" ? checkboxCell(item.id, selected.has(item.id), "toggle-discovery-selection") : ""}</td>
              <td data-label="Business">${primaryCell(item.business_name, lead.category || "Local business")}</td>
              <td data-label="Location">${primaryCell([lead.city, lead.region].filter(Boolean).join(", ") || "Unknown", lead.address || "")}</td>
              <td data-label="Contact">${primaryCell(lead.phone || "No phone", lead.email || "Email not supplied by OpenScout")}</td>
              <td data-label="Website">${badge(lead.has_website ? "warning" : "connected", item.website_status || lead.website_status || "No website")}</td>
              <td data-label="Score">${scoreBar(item.lead_score || 0, Number(item.lead_score) >= 90 ? "#37d690" : "#8f75ff")}</td>
              <td data-label="Source">${linkOut(lead.listing_url, "Google listing")}</td>
              <td data-label="Decision">${badge(item.decision, statusLabel(item.decision))}</td>
              <td data-label="Actions"><div class="row-actions">
                ${item.decision === "pending" ? `<button class="button button--ghost" data-action="reject-discovery" data-id="${item.id}">Reject</button><button class="button button--secondary" data-action="save-discovery" data-id="${item.id}">Save</button>` : ""}
                <button class="icon-button icon-button--small" data-action="inspect-discovery" data-id="${item.id}" aria-label="Inspect source metadata">${icon("chevron-right")}</button>
              </div></td>
            </tr>`;
          }).join("") || tableEmpty(9, run ? "No results match these filters" : "Ready to discover", run ? "Change the result filters or start another search." : "Add a browser Google Maps key and run a real OpenScout search.")}</tbody>
        </table>
      </div>
    </section>
    ${data.discoveryRuns.length ? sectionCard(
      "Recent discovery runs",
      "Past searches remain inspectable for debugging and repeat work",
      `<div class="run-history">${data.discoveryRuns.slice(0, 6).map((item) => `
        <button data-action="open-discovery-run" data-id="${item.id}">
          <span>${icon("radar")}</span>
          <span><strong>${escapeHtml(item.query?.businessType || "Local businesses")}</strong><small>${escapeHtml(item.query?.location || "Unknown location")} · ${formatDate(item.created_at, { year: "numeric" })}</small></span>
          ${badge(item.status, statusLabel(item.status))}
          <b>${formatNumber(item.result_count || 0)} results</b>
          ${icon("chevron-right")}
        </button>
      `).join("")}</div>`,
    ) : ""}
  `;
}

function filteredLeads(data, routeParams) {
  const query = (routeParams.q || "").toLowerCase();
  const stage = routeParams.stage || "all";
  const category = routeParams.category || "all";
  const sort = routeParams.sort || "updated";
  let rows = data.leads.filter((lead) => (
    (stage === "all" || lead.status === stage)
    && (category === "all" || lead.category === category)
    && (!query || `${lead.business_name} ${lead.contact_name} ${lead.email} ${lead.phone} ${lead.city} ${lead.category}`.toLowerCase().includes(query))
  ));
  rows = [...rows].sort((a, b) => {
    if (sort === "score") return Number(b.lead_score || b.qualification_score || 0) - Number(a.lead_score || a.qualification_score || 0);
    if (sort === "name") return a.business_name.localeCompare(b.business_name);
    if (sort === "value") return Number(b.deal_value || b.asking_price || 0) - Number(a.deal_value || a.asking_price || 0);
    return new Date(b.updated_at) - new Date(a.updated_at);
  });
  return rows;
}

export function renderLeads() {
  const { data, routeParams } = getState();
  const rows = filteredLeads(data, routeParams);
  const categories = [...new Set(data.leads.map((lead) => lead.category).filter(Boolean))].sort();
  return `
    ${pageHead(
      "Leads",
      "The normalized prospect database shared by discovery, pipeline, demos, and outreach.",
      `${button("Export CSV", { action: "export-leads", iconName: "upload", variant: "secondary" })}${button("Add lead", { action: "new-lead", iconName: "plus", variant: "primary" })}`,
    )}
    <section class="kpi-strip kpi-strip--compact">
      ${compactMetric("Total", data.leads.length, "prospects")}
      ${compactMetric("No website", data.leads.filter((lead) => !lead.has_website).length, "primary segment")}
      ${compactMetric("Qualified+", data.leads.filter((lead) => !["new", "lost"].includes(lead.status)).length, "advanced")}
      ${compactMetric("Open value", formatCurrency(sum(data.leads.filter((lead) => !["won", "lost"].includes(lead.status)), (lead) => lead.deal_value || lead.asking_price)), "pipeline")}
    </section>
    <div class="toolbar">
      <div class="toolbar__group toolbar__group--grow">
        <label class="inline-search inline-search--wide">${icon("search")}<input data-route-search placeholder="Search business, contact, location…" value="${escapeHtml(routeParams.q || "")}"></label>
        <select class="compact-select" data-action="route-select" data-key="stage"><option value="all">All stages</option>${PIPELINE_STAGES.map((stage) => `<option value="${stage.id}" ${routeParams.stage === stage.id ? "selected" : ""}>${stage.label}</option>`).join("")}</select>
        <select class="compact-select" data-action="route-select" data-key="category"><option value="all">All categories</option>${categories.map((category) => `<option value="${escapeHtml(category)}" ${routeParams.category === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}</select>
        <select class="compact-select" data-action="route-select" data-key="sort"><option value="updated">Recently updated</option><option value="score" ${routeParams.sort === "score" ? "selected" : ""}>Highest score</option><option value="value" ${routeParams.sort === "value" ? "selected" : ""}>Highest value</option><option value="name" ${routeParams.sort === "name" ? "selected" : ""}>Name</option></select>
      </div>
      <div class="toolbar__group">
        <select id="lead-bulk-stage" class="compact-select"><option value="">Move selected…</option>${PIPELINE_STAGES.map((stage) => `<option value="${stage.id}">${stage.label}</option>`).join("")}</select>
        <button class="button button--secondary" data-action="bulk-lead-stage">Apply</button>
      </div>
    </div>
    <section class="card">
      <div class="table-wrap">
        <table class="data-table responsive-table">
          <thead><tr><th><input type="checkbox" data-action="select-all-leads" aria-label="Select all leads"></th><th>Business</th><th>Contact</th><th>Location</th><th>Score</th><th>Stage</th><th>Deal</th><th>Demo</th><th>Follow-up</th><th></th></tr></thead>
          <tbody>${rows.map((lead) => {
            const demo = demoForLead(data, lead.id);
            return `<tr data-action="open-lead" data-id="${lead.id}">
              <td data-label="Select" data-stop-action>${checkboxCell(lead.id, false, "toggle-lead-selection")}</td>
              <td data-label="Business">${primaryCell(lead.business_name, `${lead.category || "Uncategorized"} · ${lead.source || "manual"}`)}</td>
              <td data-label="Contact">${primaryCell(lead.contact_name || "No owner name", lead.email || lead.phone || "No contact details")}</td>
              <td data-label="Location">${primaryCell([lead.city, lead.region].filter(Boolean).join(", ") || "—", lead.address || "")}</td>
              <td data-label="Score">${scoreBar(lead.lead_score || lead.qualification_score || 0)}</td>
              <td data-label="Stage">${badge(lead.status, statusLabel(lead.status))}</td>
              <td data-label="Deal">${formatCurrency(lead.deal_value || lead.asking_price || 0)}</td>
              <td data-label="Demo">${demo ? badge(demo.status, statusLabel(demo.status)) : `<button class="text-link" data-action="new-demo" data-lead-id="${lead.id}">Create demo</button>`}</td>
              <td data-label="Follow-up">${escapeHtml(dueLabel(lead.follow_up_at))}</td>
              <td data-label="Actions"><button class="icon-button icon-button--small" data-action="open-lead" data-id="${lead.id}" aria-label="Open lead">${icon("chevron-right")}</button></td>
            </tr>`;
          }).join("") || tableEmpty(10, "No leads found", "Adjust the filters or save results from Lead Discovery.")}</tbody>
        </table>
      </div>
    </section>
  `;
}

function pipelineCard(data, lead) {
  const demo = demoForLead(data, lead.id);
  return `
    <article class="pipeline-card" draggable="true" data-lead-id="${lead.id}" data-action="open-lead" data-id="${lead.id}">
      <div class="pipeline-card__top">
        <div><h4>${escapeHtml(lead.business_name)}</h4><p>${escapeHtml([lead.category, lead.city].filter(Boolean).join(" · "))}</p></div>
        <span class="pipeline-score">${Number(lead.lead_score || lead.qualification_score || 0)}</span>
      </div>
      <div class="pipeline-card__meta">
        <span>${icon("circle-dollar-sign")} ${formatCurrency(lead.deal_value || lead.asking_price || 0)}</span>
        <span>${icon("clock")} ${daysBetween(lead.updated_at)}d in stage</span>
      </div>
      <div class="pipeline-card__foot">
        <span>${lead.last_contacted_at ? `Last contact ${formatDate(lead.last_contacted_at)}` : "Not contacted"}</span>
        ${demo ? badge(demo.status, statusLabel(demo.status)) : `<span>No demo</span>`}
      </div>
      ${lead.follow_up_at ? `<div class="pipeline-card__due">${icon("timer-reset")} ${escapeHtml(dueLabel(lead.follow_up_at))}</div>` : ""}
    </article>
  `;
}

export function renderPipeline() {
  const { data, routeParams } = getState();
  const query = (routeParams.q || "").toLowerCase();
  const view = routeParams.view || "kanban";
  const activeStages = PIPELINE_STAGES;
  const rows = data.leads.filter((lead) => !query || `${lead.business_name} ${lead.category} ${lead.city}`.toLowerCase().includes(query));
  const open = rows.filter((lead) => !["won", "lost"].includes(lead.status));
  const totalValue = sum(open, (lead) => lead.deal_value || lead.asking_price);
  return `
    ${pageHead(
      "Pipeline",
      "Move prospects from New through Won without losing demo, contact, or follow-up context.",
      button("Add lead", { action: "new-lead", iconName: "plus", variant: "primary" }),
    )}
    <section class="kpi-strip kpi-strip--compact">
      ${compactMetric("Open deals", open.length, "active stages")}
      ${compactMetric("Pipeline value", formatCurrency(totalValue), "potential")}
      ${compactMetric("Closing", rows.filter((lead) => lead.status === "closing").length, "late stage")}
      ${compactMetric("Won", rows.filter((lead) => lead.status === "won").length, "converted")}
    </section>
    <div class="toolbar">
      <label class="inline-search inline-search--wide">${icon("search")}<input data-route-search placeholder="Search the pipeline" value="${escapeHtml(routeParams.q || "")}"></label>
      <div class="tabs"><button class="tab ${view === "kanban" ? "is-active" : ""}" data-action="route-filter" data-key="view" data-value="kanban">Kanban</button><button class="tab ${view === "table" ? "is-active" : ""}" data-action="route-filter" data-key="view" data-value="table">Table</button></div>
    </div>
    ${view === "table" ? `
      <section class="card"><div class="table-wrap"><table class="data-table responsive-table">
        <thead><tr><th>Business</th><th>Stage</th><th>Value</th><th>Last contacted</th><th>Follow-up</th><th>Days in stage</th><th>Demo</th></tr></thead>
        <tbody>${rows.map((lead) => {
          const demo = demoForLead(data, lead.id);
          return `<tr data-action="open-lead" data-id="${lead.id}"><td data-label="Business">${primaryCell(lead.business_name, lead.category)}</td><td data-label="Stage">${badge(lead.status, statusLabel(lead.status))}</td><td data-label="Value">${formatCurrency(lead.deal_value || lead.asking_price)}</td><td data-label="Last contacted">${formatDate(lead.last_contacted_at)}</td><td data-label="Follow-up">${escapeHtml(dueLabel(lead.follow_up_at))}</td><td data-label="Days">${daysBetween(lead.updated_at)} days</td><td data-label="Demo">${demo ? badge(demo.status, statusLabel(demo.status)) : "—"}</td></tr>`;
        }).join("") || tableEmpty(7, "Pipeline is empty", "Add or save a lead to begin.")}</tbody>
      </table></div></section>
    ` : `
      <section class="pipeline" aria-label="Sales pipeline">
        ${activeStages.map((stage) => {
          const leads = rows.filter((lead) => lead.status === stage.id);
          return `<section class="pipeline-column" data-stage="${stage.id}">
            <header class="pipeline-column__head"><span><i style="--stage-color:${stage.color}"></i>${stage.label}</span><b>${leads.length} · ${formatCurrency(sum(leads, (lead) => lead.deal_value || lead.asking_price))}</b></header>
            <div class="pipeline-list">${leads.map((lead) => pipelineCard(data, lead)).join("") || `<div class="pipeline-empty">Drop leads here</div>`}</div>
          </section>`;
        }).join("")}
      </section>
    `}
  `;
}
