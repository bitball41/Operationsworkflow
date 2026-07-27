/**
 * Business research boundary.
 *
 * It always returns the facts already stored on the lead, then adds markdown
 * from up to two public pages when the Worker's Browser Run binding is live.
 * Automation treats that enrichment as optional, so a blocked or missing page
 * never prevents the rest of the lead workflow.
 */
import { isConnected } from "../integrations.js";
import { browserResearch } from "../api.js";

export function canResearch() {
  return isConnected("research");
}

export async function researchBusiness(lead) {
  const source = lead?.source_metadata?.openscout || lead?.source_payload?.openscout || {};
  const known = {
    business: lead?.business_name || "",
    category: lead?.category || "",
    phone: lead?.phone || "",
    address: lead?.address || "",
    city: lead?.city || "",
    region: lead?.region || "",
    rating: source.rating || null,
    ratingCount: source.ratingCount || 0,
    listing: lead?.listing_url || "",
    website: lead?.website_url || "",
    signals: source.reasons || [],
  };

  if (!canResearch()) {
    return {
      known,
      enriched: null,
      connected: false,
      note: "Public research tool not connected — used the existing listing data only.",
    };
  }

  const urls = [...new Set([known.website, known.listing].filter(Boolean))].slice(0, 2);
  if (!urls.length) {
    return {
      known,
      enriched: { pages: [] },
      connected: true,
      note: "Browser research is connected, but this lead has no public URL to open.",
    };
  }

  const pages = [];
  const failures = [];
  for (const url of urls) {
    try {
      pages.push(await browserResearch(url));
    } catch (error) {
      failures.push({ url, error: error.message });
    }
  }
  return {
    known,
    enriched: { pages, failures },
    connected: true,
    note: pages.length
      ? `Browser research opened ${pages.length} public page${pages.length === 1 ? "" : "s"}.`
      : "Browser research could not open the lead's public pages.",
  };
}
