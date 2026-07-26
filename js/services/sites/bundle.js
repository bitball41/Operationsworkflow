/**
 * Turns a lead plus a template into a real site bundle (index.html, style.css,
 * script.js). Demos store these files, so the Studio preview, the published
 * demo, and the file editor all read the same source.
 */
import { FALLBACK_TEMPLATE_KEY, TEMPLATE_CATALOG, scoreTemplateMatch, templateByKey } from "../../data/site-templates.js";
import { fillTemplate, titleCase } from "../../core/utils.js";
import { renderLayout } from "./layouts.js";

export const BUNDLE_FILES = ["index.html", "style.css", "script.js"];

/** Builds the content model handed to a layout. */
export function siteFromLead(lead = {}, catalogEntry, overrides = {}) {
  const entry = catalogEntry || templateByKey(FALLBACK_TEMPLATE_KEY);
  const source = lead.source_metadata?.openscout || lead.source_payload?.openscout || {};
  const city = lead.city || overrides.city || "your area";
  const category = lead.category || entry.category;
  const values = {
    business: lead.business_name || overrides.business || "Your Business",
    city,
    category,
    categoryLower: String(category).toLowerCase(),
  };

  const content = entry.content;
  return {
    business: values.business,
    category: titleCase(category),
    city: lead.city || "",
    region: lead.region || "",
    phone: lead.phone || "",
    email: lead.email || "",
    address: lead.address || "",
    rating: source.rating || null,
    ratingCount: source.ratingCount || 0,
    hours: overrides.hours || "Mon–Sat · 7am–6pm",
    eyebrow: fillTemplate(content.eyebrow, values),
    headline: fillTemplate(content.headline, values),
    subheadline: fillTemplate(content.subheadline, values),
    cta: content.cta,
    servicesHeadline: fillTemplate(content.servicesHeadline, values),
    services: content.services.map((service) => ({
      title: fillTemplate(service.title, values),
      text: fillTemplate(service.text, values),
    })),
    aboutHeadline: fillTemplate(content.aboutHeadline, values),
    aboutText: fillTemplate(content.aboutText, values),
    points: content.points.map((point) => fillTemplate(point, values)),
    contactText: fillTemplate(content.contactText, values),
    ctaHeadline: fillTemplate(content.ctaHeadline, values),
    ctaText: fillTemplate(content.ctaText, values),
    badgeValue: content.badgeValue,
    badgeLabel: content.badgeLabel,
    ...overrides,
  };
}

/** Produces the three bundle files. */
export function buildBundle(catalogEntry, site) {
  const entry = catalogEntry || templateByKey(FALLBACK_TEMPLATE_KEY);
  const { html, css, js } = renderLayout(entry.layout, site, entry.theme);
  return { "index.html": html, "style.css": css, "script.js": js };
}

export function buildBundleForLead(lead, catalogEntry, overrides = {}) {
  const site = siteFromLead(lead, catalogEntry, overrides);
  return { site, files: buildBundle(catalogEntry, site) };
}

/**
 * Inlines CSS/JS so a bundle can render inside a sandboxed iframe.
 * Pass `scripts: false` for static thumbnails that do not allow scripting.
 */
export function composeDocument(files = {}, { scripts = true } = {}) {
  const html = files["index.html"] || "<!doctype html><title>Empty demo</title><p>No files yet.</p>";
  const css = files["style.css"] || "";
  const js = files["script.js"] || "";
  return html
    .replace('<link rel="stylesheet" href="style.css">', `<style>\n${css}\n</style>`)
    .replace('<script src="script.js"></script>', scripts ? `<script>\n${js}\n</script>` : "");
}

export function bundleSize(files = {}) {
  return Object.values(files).reduce((total, value) => total + String(value).length, 0);
}

/**
 * Picks the best template record for a lead. Falls back to the neutral
 * template so automation never stalls on an unknown niche.
 */
export function chooseTemplate(lead, templateRecords = []) {
  const niche = String(lead?.category || "").trim();
  const searchable = `${niche} ${(lead?.tags || []).join(" ")}`.trim();
  const active = templateRecords.filter((item) => item.status !== "archived");
  const scored = active
    .map((record) => {
      const entry = templateByKey(record.layout_key);
      const byRecord = scoreTemplateMatch({ category: record.category || entry.category, keywords: entry.keywords }, searchable);
      const byEntry = scoreTemplateMatch(entry, searchable);
      return { record, entry, score: Math.max(byRecord, byEntry) };
    })
    .sort((a, b) => b.score - a.score || Number(b.record.use_count || 0) - Number(a.record.use_count || 0));

  const best = scored.find((item) => item.score > 0);
  if (best) return { ...best, reason: `${niche || "This niche"} matches the ${best.record.name} template.` };

  const fallbackRecord = active.find((item) => item.layout_key === FALLBACK_TEMPLATE_KEY) || active[0] || null;
  return {
    record: fallbackRecord,
    entry: templateByKey(fallbackRecord?.layout_key || FALLBACK_TEMPLATE_KEY),
    score: 0,
    reason: fallbackRecord
      ? `No template for ${niche || "this niche"} yet, using ${fallbackRecord.name}.`
      : "No templates available.",
  };
}

export function catalogForRecord(record) {
  return templateByKey(record?.layout_key);
}

export { TEMPLATE_CATALOG, templateByKey };
