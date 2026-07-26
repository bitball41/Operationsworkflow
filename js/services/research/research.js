/**
 * Business research boundary.
 *
 * Today it returns only the facts already stored on the lead (from OpenScout).
 * A browser-capable research tool plugs in behind `researchBusiness` later
 * without changing callers: automation already treats extra findings as
 * optional enrichment.
 */
import { isConnected } from "../integrations.js";

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

  /* Reserved for the browser research tool. */
  return { known, enriched: null, connected: true, note: "Research tool connected but not implemented." };
}
