/**
 * Turns a lead plus a template into a real site bundle (index.html, style.css,
 * script.js). Demos store these files, so the Studio preview, the published
 * demo, and the file editor all read the same source.
 */
import { FALLBACK_TEMPLATE_KEY, TEMPLATE_CATALOG, scoreTemplateMatch, templateByKey } from "../../data/site-templates.js";
import { fillTemplate, titleCase } from "../../core/utils.js";
import { renderLayout } from "./layouts.js";

export const BUNDLE_FILES = ["index.html", "style.css", "script.js"];

function runtimeEntryForRecord(record) {
  if (record?.source_kind !== "custom") return templateByKey(record?.layout_key);
  const fallback = templateByKey(FALLBACK_TEMPLATE_KEY);
  return {
    ...fallback,
    key: `custom:${record.id}`,
    name: record.name,
    category: record.category,
    keywords: String(record.category || "").toLowerCase().split(/\W+/).filter(Boolean),
    layout: "custom",
    files: record.files || {},
    theme: { ...fallback.theme, accent: record.accent_color || fallback.theme.accent },
  };
}

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
  if (entry.layout === "custom") {
    const values = {
      ...site,
      business: site.business || "Your Business",
      category: site.category || "",
      city: site.city || "",
      region: site.region || "",
      phone: site.phone || "",
      email: site.email || "",
      address: site.address || "",
      hours: site.hours || "",
      cta: site.cta || "Get a quote",
      accent: entry.theme?.accent || "#2563eb",
    };
    return Object.fromEntries(BUNDLE_FILES.map((name) => [
      name,
      fillTemplate(String(entry.files?.[name] || ""), values),
    ]));
  }
  const { html, css, js } = renderLayout(entry.layout, site, entry.theme);
  return { "index.html": html, "style.css": css, "script.js": js };
}

export function buildBundleForLead(lead, catalogEntry, overrides = {}) {
  const site = siteFromLead(lead, catalogEntry, overrides);
  return { site, files: buildBundle(catalogEntry, site) };
}

export function buildBundleForTemplateRecord(lead, record, overrides = {}) {
  return buildBundleForLead(lead, runtimeEntryForRecord(record), overrides);
}

/**
 * Inlines CSS/JS so a bundle can render inside a sandboxed iframe.
 * Pass `scripts: false` for static thumbnails that do not allow scripting.
 */
export function composeDocument(files = {}, { scripts = true } = {}) {
  const html = files["index.html"] || "<!doctype html><title>Empty demo</title><p>No files yet.</p>";
  const css = files["style.css"] || "";
  const js = files["script.js"] || "";
  let document_ = html.replace(
    /<link\b[^>]*href=["'](?:\.\/)?style\.css["'][^>]*>/i,
    `<style>\n${css}\n</style>`,
  );
  if (document_ === html && css) {
    const style = `<style>\n${css}\n</style>`;
    document_ = /<\/head>/i.test(document_) ? document_.replace(/<\/head>/i, `${style}</head>`) : `${style}${document_}`;
  }

  const beforeScript = document_;
  document_ = document_.replace(
    /<script\b[^>]*src=["'](?:\.\/)?script\.js["'][^>]*><\/script>/i,
    scripts ? `<script>\n${js}\n</script>` : "",
  );
  if (scripts && js && document_ === beforeScript) {
    const script = `<script>\n${js}\n</script>`;
    document_ = /<\/body>/i.test(document_) ? document_.replace(/<\/body>/i, `${script}</body>`) : `${document_}${script}`;
  }
  return document_;
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
      const entry = runtimeEntryForRecord(record);
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
  return runtimeEntryForRecord(record);
}

export { TEMPLATE_CATALOG, templateByKey };
