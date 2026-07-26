import { PIPELINE_STAGES } from "../config.js";
import { icon } from "../core/icons.js";
import { getState } from "../core/state.js";
import { escapeHtml, formatCurrency, formatDate, relativeTime, statusLabel } from "../core/utils.js";
import { badge, button, emptyState, pageHead, scoreBar } from "../components/ui.js";

function matchesStage(lead, stage) {
  return (stage.includes || [stage.id]).includes(lead.status);
}

export function renderPipeline() {
  const { data } = getState();
  return `
    ${pageHead(
      "Pipeline",
      "Move prospects through the exact sales-to-fulfillment path. Drag cards between stages.",
      `${badge("active", `${data.leads.filter((lead) => lead.status === "won").length} won`)}${button("New lead", { action: "new-lead", iconName: "plus", variant: "primary" })}`,
    )}
    <div class="toolbar">
      <div class="toolbar__group">
        <button class="filter-button is-active" type="button">${icon("columns-3")}All active</button>
        <button class="filter-button" type="button" data-action="navigate" data-route-target="approvals">${icon("shield-check")}Needs approval</button>
      </div>
      <span style="color:var(--muted);font-size:9px">${data.leads.length} total prospects</span>
    </div>
    ${data.leads.length ? `
      <section class="pipeline">
        ${PIPELINE_STAGES.map((stage) => {
          const leads = data.leads.filter((lead) => matchesStage(lead, stage));
          return `
            <article class="pipeline-column" data-stage="${stage.id}">
              <header class="pipeline-column__head">
                <span><i style="--stage-color:${stage.color}"></i>${escapeHtml(stage.label)}</span>
                <b>${leads.length}</b>
              </header>
              <div class="pipeline-list">
                ${leads.map((lead) => `
                  <div class="pipeline-card" draggable="true" data-lead-id="${lead.id}" data-action="open-lead">
                    <div class="pipeline-card__top">
                      <div><h4>${escapeHtml(lead.business_name)}</h4><p>${escapeHtml(lead.category || "Uncategorized")} · ${escapeHtml(lead.city || "No city")}</p></div>
                      <span class="pipeline-score">${lead.qualification_score || 0}</span>
                    </div>
                    <div class="pipeline-card__foot">
                      <span>${escapeHtml(lead.next_action || "No next action")}</span>
                      <span>${formatCurrency(lead.asking_price || 400)}</span>
                    </div>
                  </div>
                `).join("") || `<div style="padding:18px 8px;color:var(--faint);font-size:9px;text-align:center">Drop prospect here</div>`}
              </div>
            </article>
          `;
        }).join("")}
      </section>
    ` : `<section class="card">${emptyState({ iconName: "columns-3", title: "Pipeline is empty", message: "Add a lead manually now; OpenScout will feed the same pipeline later.", action: "new-lead", actionLabel: "Add first lead" })}</section>`}
  `;
}

export function renderDiscovery() {
  const { data } = getState();
  const discovered = data.leads.filter((lead) => lead.status === "discovered");
  return `
    ${pageHead("Lead discovery", "OpenScout will own automated discovery. This page is already shaped around its future candidate feed.", button("Add manually", { action: "new-lead", iconName: "plus", variant: "primary" }))}
    <section class="grid grid--sidebar">
      <div class="section-stack">
        <article class="card">
          <header class="card__head">
            <div><h3>Discovery criteria</h3><p>Saved inputs for the future OpenScout adapter</p></div>
            ${badge("pending", "Manual mode")}
          </header>
          <div class="card__body">
            <div class="field-row">
              <label class="field" style="margin-top:0"><span>Market</span><input value="DFW, Texas" aria-label="Discovery market"></label>
              <label class="field" style="margin-top:0"><span>Business type</span><input value="Local home & personal services" aria-label="Business type"></label>
            </div>
            <div class="field-row">
              <label class="field"><span>Website condition</span><select><option>No website</option><option>Missing or weak website</option></select></label>
              <label class="field"><span>Minimum review strength</span><select><option>4.3+ rating / 15+ reviews</option><option>4.0+ rating / 10+ reviews</option></select></label>
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:14px">${button("Save discovery brief", { action: "save-discovery-brief", iconName: "check" })}</div>
          </div>
        </article>

        <article class="card">
          <header class="card__head">
            <div><h3>Candidate inbox</h3><p>Unqualified businesses waiting for a human decision</p></div>
            <span class="badge badge--muted">${discovered.length} candidates</span>
          </header>
          ${discovered.length ? `<div class="table-wrap"><table class="data-table">
            <thead><tr><th>Business</th><th>Location</th><th>Web presence</th><th>Score</th><th>Source</th><th></th></tr></thead>
            <tbody>${discovered.map((lead) => `
              <tr data-action="open-lead" data-id="${lead.id}">
                <td><div class="cell-primary"><strong>${escapeHtml(lead.business_name)}</strong><span>${escapeHtml(lead.category || "Uncategorized")}</span></div></td>
                <td>${escapeHtml([lead.city, lead.region].filter(Boolean).join(", ") || "—")}</td>
                <td>${badge(lead.website_url ? "analyzed" : "pending", lead.website_url ? "Website found" : "No website")}</td>
                <td>${scoreBar(lead.qualification_score, "var(--blue)")}</td>
                <td>${escapeHtml(lead.source || "Manual")}</td>
                <td><button class="button button--secondary" data-action="qualify-lead" data-id="${lead.id}">Qualify</button></td>
              </tr>
            `).join("")}</tbody>
          </table></div>` : emptyState({ iconName: "radar", title: "No new candidates", message: "Add a lead manually or connect OpenScout later." })}
        </article>
      </div>

      <aside class="section-stack">
        <article class="card">
          <header class="card__head"><div><h3>OpenScout adapter</h3><p>External integration intentionally deferred</p></div></header>
          <div class="card__body">
            <div style="display:grid;place-items:center;width:46px;height:46px;border-radius:13px;background:var(--blue-soft);color:var(--blue);font-weight:850">OS</div>
            <h3 style="margin-top:14px;font-size:13px">Connector slot is ready</h3>
            <p style="margin-top:6px;color:var(--muted);font-size:10px">Discovery results will insert into <code style="color:var(--text-soft)">leads</code> with source payloads preserved for re-scoring.</p>
            <div class="settings-list" style="margin-top:14px">
              <div class="settings-row"><div><strong>Candidate ingestion</strong><p>Schema ready</p></div>${badge("active", "Ready")}</div>
              <div class="settings-row"><div><strong>API credentials</strong><p>Not configured</p></div>${badge("pending", "Later")}</div>
              <div class="settings-row"><div><strong>Scheduled searches</strong><p>Not active</p></div>${badge("pending", "Later")}</div>
            </div>
          </div>
        </article>
        <article class="card">
          <header class="card__head"><div><h3>Qualification rules</h3><p>What earns pipeline attention</p></div></header>
          <div class="card__body" style="display:grid;gap:10px">
            ${[
              ["No owned website", "+35"],
              ["Strong recent reviews", "+25"],
              ["Visible owner contact", "+20"],
              ["Clear service area", "+10"],
              ["Weak response signals", "−20"],
            ].map(([label, score]) => `<div style="display:flex;justify-content:space-between;color:var(--text-soft);font-size:10px"><span>${label}</span><strong style="color:${score.startsWith("−") ? "var(--red)" : "var(--green)"}">${score}</strong></div>`).join("")}
          </div>
        </article>
      </aside>
    </section>
  `;
}

export function renderProspects() {
  const { data, routeParams } = getState();
  const filter = routeParams.status || "all";
  const leads = filter === "all" ? data.leads : data.leads.filter((lead) => lead.status === filter);
  const statuses = ["all", "qualified", "demo_building", "ready_to_contact", "contacted", "replied", "won"];

  return `
    ${pageHead("Prospects", "The lead database: useful operational detail without becoming a massive CRM.", button("New lead", { action: "new-lead", iconName: "plus", variant: "primary" }))}
    <div class="toolbar">
      <div class="toolbar__group">${statuses.map((status) => `<button class="filter-button ${filter === status ? "is-active" : ""}" data-action="prospect-filter" data-status="${status}">${status === "all" ? "All" : statusLabel(status)}</button>`).join("")}</div>
      <button class="filter-button" data-action="export-leads">${icon("upload")}Export</button>
    </div>
    <article class="card">
      ${leads.length ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Business</th><th>Stage</th><th>Qualification</th><th>Opportunity</th><th>Offer</th><th>Next action</th><th>Updated</th></tr></thead>
        <tbody>${leads.map((lead) => `
          <tr data-action="open-lead" data-id="${lead.id}">
            <td><div class="cell-primary"><strong>${escapeHtml(lead.business_name)}</strong><span>${escapeHtml(lead.category || "Uncategorized")} · ${escapeHtml(lead.city || "No city")}</span></div></td>
            <td>${badge(lead.status)}</td>
            <td>${scoreBar(lead.qualification_score, "var(--blue)")}</td>
            <td>${scoreBar(lead.opportunity_score, "var(--accent)")}</td>
            <td>${formatCurrency(lead.asking_price || 400)}</td>
            <td>${escapeHtml(lead.next_action || "—")}</td>
            <td>${relativeTime(lead.updated_at)}</td>
          </tr>
        `).join("")}</tbody>
      </table></div>` : emptyState({ iconName: "building-2", title: "No matching prospects", message: "Try a different stage or add a lead." })}
    </article>
  `;
}

export function renderAnalysis() {
  const { data } = getState();
  const unanalyzed = data.leads.filter((lead) => !data.analyses.some((analysis) => analysis.lead_id === lead.id));
  return `
    ${pageHead("Site & review analysis", "Separate web-quality evidence from review evidence, then turn both into a focused demo brief.", button("Analyze prospect", { action: "manual-analysis", iconName: "scan-search", variant: "primary" }))}
    <section class="grid grid--4 metric-grid-mobile">
      <article class="card metric-card"><div class="metric-card__top"><span>Analyzed</span><span class="metric-icon">${icon("scan-search")}</span></div><strong class="metric-value">${data.analyses.length}</strong><div class="metric-foot"><span>${unanalyzed.length} waiting</span></div></article>
      <article class="card metric-card"><div class="metric-card__top"><span>No website</span><span class="metric-icon" style="--metric-color:var(--yellow);--metric-soft:var(--yellow-soft)">${icon("globe")}</span></div><strong class="metric-value">${data.analyses.filter((item) => item.website_score === 0).length}</strong><div class="metric-foot"><span>Highest replacement potential</span></div></article>
      <article class="card metric-card"><div class="metric-card__top"><span>Strong reviews</span><span class="metric-icon" style="--metric-color:var(--green);--metric-soft:var(--green-soft)">${icon("star")}</span></div><strong class="metric-value">${data.analyses.filter((item) => item.review_score >= 80).length}</strong><div class="metric-foot"><span>80+ review score</span></div></article>
      <article class="card metric-card"><div class="metric-card__top"><span>Ready to brief</span><span class="metric-icon" style="--metric-color:var(--blue);--metric-soft:var(--blue-soft)">${icon("clipboard-check")}</span></div><strong class="metric-value">${data.analyses.filter((item) => item.opportunity_summary).length}</strong><div class="metric-foot"><span>With opportunity summary</span></div></article>
    </section>

    <section class="section-stack" style="margin-top:14px">
      ${data.analyses.map((analysis) => {
        const lead = data.leads.find((item) => item.id === analysis.lead_id);
        const webFindings = Array.isArray(analysis.website_findings) ? analysis.website_findings : [];
        const reviewFindings = Array.isArray(analysis.review_findings) ? analysis.review_findings : [];
        return `
          <article class="card">
            <header class="card__head">
              <div><h3>${escapeHtml(lead?.business_name || "Unknown prospect")}</h3><p>Analyzed ${formatDate(analysis.analyzed_at || analysis.updated_at)}</p></div>
              <div style="display:flex;gap:6px">${badge(lead?.status || "analyzed")}${button("Open prospect", { action: "open-lead", attrs: `data-id="${analysis.lead_id}"` })}</div>
            </header>
            <div class="card__body">
              <div class="grid grid--3">
                <div>
                  <span class="eyebrow">Website · ${analysis.website_score ?? "—"}</span>
                  <div style="display:grid;gap:8px;margin-top:11px">${webFindings.map((finding) => `<div style="display:flex;gap:8px;color:var(--text-soft);font-size:10px"><span style="color:${finding.severity === "good" ? "var(--green)" : finding.severity === "high" ? "var(--red)" : "var(--yellow)"}">${icon(finding.severity === "good" ? "check-circle-2" : "circle-alert")}</span><span>${escapeHtml(finding.label)}</span></div>`).join("") || `<span style="color:var(--muted);font-size:10px">No findings recorded.</span>`}</div>
                </div>
                <div>
                  <span class="eyebrow">Reviews · ${analysis.review_score ?? "—"}</span>
                  <div style="display:grid;gap:8px;margin-top:11px">${reviewFindings.map((finding) => `<div style="display:flex;gap:8px;color:var(--text-soft);font-size:10px"><span style="color:${finding.severity === "good" ? "var(--green)" : "var(--yellow)"}">${icon(finding.severity === "good" ? "star" : "circle-alert")}</span><span>${escapeHtml(finding.label)}</span></div>`).join("") || `<span style="color:var(--muted);font-size:10px">No findings recorded.</span>`}</div>
                </div>
                <div>
                  <span class="eyebrow">Opportunity brief</span>
                  <p style="margin-top:10px;color:var(--text-soft);font-size:10px;line-height:1.65">${escapeHtml(analysis.opportunity_summary || "No opportunity summary yet.")}</p>
                  <div style="margin-top:10px">${badge("approved", analysis.recommended_template || "Template not selected")}</div>
                </div>
              </div>
            </div>
          </article>
        `;
      }).join("") || `<article class="card">${emptyState({ iconName: "scan-search", title: "No analyses yet", message: "Record a manual analysis now; external website and review collectors connect here later.", action: "manual-analysis", actionLabel: "Analyze a prospect" })}</article>`}
    </section>
  `;
}

