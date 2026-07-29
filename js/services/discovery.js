/**
 * Lead discovery, callable from anywhere.
 *
 * The search used to live inside the Discovery page's submit handler, which
 * meant the assistant could talk about leads but never go and find any — the
 * one thing this business starts every day by doing. It is a service now, so
 * the form, a command and an AI tool all run the identical search and write the
 * identical records.
 */
import { getState } from "../core/state.js";
import {
  completeDiscoveryRun,
  createDiscoveryRun,
  failDiscoveryRun,
  saveDiscoveryCandidates,
} from "./data.js";
import { discoverWithOpenScout, resolveMapsKey } from "./openscout/adapter.js";

export const DISCOVERY_DEFAULTS = Object.freeze({
  radiusKm: 15,
  limit: 50,
  depth: "standard",
  minConfidence: 70,
  minRating: 0,
  noWebsite: true,
  mustHaveEmail: true,
  mustHavePhone: false,
  skipKnown: true,
  verify: false,
});

export class DiscoveryError extends Error {
  constructor(message, { blocked = false } = {}) {
    super(message);
    this.name = "DiscoveryError";
    this.blocked = blocked;
  }
}

export function normalizeDiscoveryQuery(input = {}) {
  const number = (value, fallback) => (Number.isFinite(Number(value)) && value !== "" && value !== null ? Number(value) : fallback);
  const businessType = String(input.businessType || input.business_type || "")
    .trim()
    .replace(/^leads?\s+(?:on|for)\s+/i, "")
    .replace(/\s+business(?:es)?$/i, "")
    .trim();
  return {
    location: String(input.location || "").trim(),
    businessType,
    radiusKm: number(input.radiusKm ?? input.radius_km, DISCOVERY_DEFAULTS.radiusKm),
    limit: Math.max(1, Math.min(250, number(input.limit, DISCOVERY_DEFAULTS.limit))),
    depth: String(input.depth || DISCOVERY_DEFAULTS.depth),
    minConfidence: number(input.minConfidence ?? input.min_confidence, DISCOVERY_DEFAULTS.minConfidence),
    minRating: number(input.minRating ?? input.min_rating, DISCOVERY_DEFAULTS.minRating),
    filters: {
      noWebsite: true,
      mustHaveEmail: true,
      mustHavePhone: Boolean(input.mustHavePhone ?? input.must_have_phone),
      skipKnown: (input.skipKnown ?? input.skip_known ?? DISCOVERY_DEFAULTS.skipKnown) !== false,
      verify: Boolean(input.verify),
    },
  };
}

/**
 * Runs one discovery search end to end: creates the run record, calls the
 * OpenScout engine, applies the filters the engine does not own, and stores the
 * candidates as pending discovery results.
 *
 * @returns {Promise<{runId: string, results: Array, summary: object, query: object}>}
 */
export async function runDiscoverySearch(input = {}, { onProgress, onRunCreated } = {}) {
  const query = normalizeDiscoveryQuery(input);
  if (!query.location) throw new DiscoveryError("A location is required, e.g. \"Austin, TX\".");
  if (!query.businessType) throw new DiscoveryError("A business type is required, e.g. \"plumber\".");

  const apiKey = String((await resolveMapsKey()) || "").trim();
  if (!apiKey) {
    throw new DiscoveryError(
      "No Google Maps key available. Set GOOGLE_MAPS_API_KEY on the Cloudflare Worker.",
      { blocked: true },
    );
  }

  const runRecord = await createDiscoveryRun(query);
  onRunCreated?.(runRecord);
  try {
    const result = await discoverWithOpenScout({
      apiKey,
      location: query.location,
      businessType: query.businessType,
      radiusKm: query.radiusKm,
      limit: query.limit,
      depth: query.depth,
      minConfidence: query.minConfidence,
      verify: query.filters.verify,
      mustHavePhone: query.filters.mustHavePhone,
      mustHaveEmail: query.filters.mustHaveEmail,
      strictlyBlankWebsite: query.filters.noWebsite,
    }, onProgress);

    /* Post-filters the engine does not own. */
    let leads = result.leads;
    if (query.minRating > 0) {
      leads = leads.filter((lead) => Number(lead.source_metadata?.openscout?.rating || 0) >= query.minRating);
    }
    if (query.filters.skipKnown) {
      const known = new Set(getState().data.leads.map((lead) => String(lead.source_key || "")));
      leads = leads.filter((lead) => !known.has(String(lead.source_key || "")));
    }

    const stored = await completeDiscoveryRun(runRecord.id, { ...result, leads });
    return { runId: runRecord.id, results: stored, summary: result, query };
  } catch (error) {
    await failDiscoveryRun(runRecord.id, error.message || "Search failed.");
    throw error;
  }
}

/**
 * Search, then keep every candidate found. This is what "find me 20 plumbers in
 * Austin" means when an assistant asks for it — a review queue nobody looks at
 * is not an answer.
 */
export async function discoverAndSaveLeads(input = {}) {
  const search = await runDiscoverySearch(input);
  const saved = search.results.length
    ? await saveDiscoveryCandidates(search.results.map((result) => result.id))
    : { saved: [], duplicates: [] };
  return { ...search, saved: saved.saved, duplicates: saved.duplicates };
}
