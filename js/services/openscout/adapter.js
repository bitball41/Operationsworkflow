/**
 * Operations Workflow adapter for the unmodified OpenScout discovery engine.
 *
 * OpenScout owns search, classification, live verification, ranking, chain
 * exclusion and source-level duplicate merging. This file is deliberately the
 * boundary where an OpenScout place becomes an Operations Workflow record.
 */

import { getState } from "../../core/state.js";
import { fetchMapsKey, lookupBusinessPresence } from "../api.js";

const ENGINE_VERSION = "openscout-2026-07-25";

export function getOpenScout() {
  const engine = window.OpenScout;
  if (!engine?.googlePlaces?.searchLeads || !engine?.classify) {
    throw new Error("OpenScout did not load. Refresh the dashboard and try again.");
  }
  return engine;
}

/** True when the Cloudflare Worker reports it is holding a Google Maps key. */
export function workerHoldsMapsKey() {
  return getState().services?.providers?.google_maps === true;
}

let workerKey = "";

/**
 * The Google Maps key to search with.
 *
 * The Worker is the only source for the Maps key. It is still a browser key by
 * API design, so restrict it by HTTP referrer in Google Cloud.
 */
export async function resolveMapsKey() {
  if (workerHoldsMapsKey()) {
    if (workerKey) return workerKey;
    try {
      workerKey = await fetchMapsKey();
      if (workerKey) return workerKey;
    } catch (error) {
      console.warn("Worker Maps key unavailable", error);
    }
  }
  return "";
}

export async function guessLocation() {
  const engine = getOpenScout();
  try {
    return await engine.location.getBrowserLocation();
  } catch (gpsError) {
    try {
      return await engine.location.getApproximateLocationByIp();
    } catch {
      throw gpsError;
    }
  }
}

export async function discoverWithOpenScout(options, onProgress) {
  const engine = getOpenScout();
  const verifyDirectly = options.verify === true && canUseDirectWebsiteVerification();
  const result = await engine.googlePlaces.searchLeads({
    apiKey: options.apiKey,
    location: options.location,
    businessType: options.businessType,
    depth: options.depth,
    radiusKm: options.radiusKm,
    minConfidence: Number(options.minConfidence) || 0,
    includeAllBusinesses: options.requireNoOfficialWebsite !== true,
    verify: verifyDirectly,
    locationGuess: options.locationGuess || null,
    onProgress,
  });

  let leads = result.leads.map((place) => normalizeLead(place, {
    category: options.businessType,
    location: options.location,
  }));

  if (options.mustHavePhone) leads = leads.filter((lead) => Boolean(lead.phone));
  const requested = Math.max(1, Math.min(250, Number(options.limit) || 50));
  let presenceStats = {
    webPresenceChecked: 0,
    excludedExistingWebsite: 0,
    inconclusiveWebsiteChecks: 0,
    emailsMatched: 0,
  };
  if (options.requireNoOfficialWebsite || options.mustHaveEmail) {
    const screened = await screenLeadsForBusinessPresence(leads, {
      limit: requested,
      requireEmail: options.mustHaveEmail,
      excludeOfficialWebsite: options.requireNoOfficialWebsite === true,
      onProgress,
      lookup: options.presenceLookup || lookupBusinessPresence,
    });
    leads = screened.leads;
    presenceStats = screened.stats;
  }
  leads = leads.slice(0, requested);

  return {
    ...result,
    ...presenceStats,
    requested,
    leads,
    engineVersion: ENGINE_VERSION,
  };
}

/**
 * Checks OpenScout candidates for identity-matched first-party websites and
 * public email evidence. Confirmed websites are removed only for the optional
 * legacy no-website search. Otherwise website presence is retained as source
 * context. Public email becomes a filter only when explicitly required.
 */
export async function screenLeadsForBusinessPresence(leads, {
  limit = 50,
  requireEmail = false,
  excludeOfficialWebsite = true,
  onProgress,
  lookup = lookupBusinessPresence,
} = {}) {
  const candidates = Array.isArray(leads) ? leads : [];
  const stats = {
    webPresenceChecked: 0,
    excludedExistingWebsite: 0,
    inconclusiveWebsiteChecks: 0,
    emailsMatched: 0,
  };
  if (!candidates.length) return { leads: [], stats };

  const matches = [];
  let cursor = 0;
  let completed = 0;
  let failed = 0;
  let firstError = null;
  /*
   * Browser Run currently permits one Quick Action at a time for this binding.
   * Parallel lead lookups produce 429s and, when email is required, turn a
   * healthy Places result into zero. Process candidates serially and let the
   * progress callback keep the UI informed.
   */
  const workerCount = Math.min(1, candidates.length);

  const runWorker = async () => {
    while (cursor < candidates.length && matches.length < limit) {
      const order = cursor;
      const lead = candidates[cursor];
      cursor += 1;
      try {
        const found = await lookup({
          business_name: lead.business_name,
          phone: lead.phone,
          address: lead.address,
          city: lead.city,
          region: lead.region,
          listing_url: lead.listing_url,
        });

        stats.webPresenceChecked += 1;
        const website = {
          status: ["found", "not_found", "unknown"].includes(found?.website?.status)
            ? found.website.status
            : "unknown",
          url: String(found?.website?.url || ""),
          evidence: String(found?.website?.evidence || ""),
          reason: String(found?.website?.reason || ""),
          searched_url: String(found?.website?.searched_url || ""),
          checked_at: String(found?.website?.checked_at || new Date().toISOString()),
        };

        if (website.status === "found" && excludeOfficialWebsite) {
          stats.excludedExistingWebsite += 1;
          continue;
        }
        if (website.status === "unknown") stats.inconclusiveWebsiteChecks += 1;

        const address = String(found?.email?.address || found?.email?.email || "").trim().toLowerCase();
        if (address) stats.emailsMatched += 1;
        if (!requireEmail || address) {
          const emailEvidence = address ? {
            source_url: String(found?.email?.source_url || ""),
            evidence: String(found?.email?.evidence || ""),
            score: Number(found?.email?.score) || 0,
            searched_url: String(found?.email?.searched_url || ""),
            checked_at: new Date().toISOString(),
          } : null;
          matches.push({
            order,
            lead: {
              ...lead,
              email: address,
              website_url: website.status === "found" ? website.url || lead.website_url : lead.website_url,
              has_website: website.status === "found" ? true : lead.has_website,
              website_status: website.status === "found"
                ? "Official website found"
                : website.status === "unknown" ? "Website check uncertain" : "No official site found",
              source_payload: {
                ...lead.source_payload,
                ...(emailEvidence ? { email: emailEvidence } : {}),
                web_presence: website,
              },
              source_metadata: {
                ...lead.source_metadata,
                ...(emailEvidence ? { email: emailEvidence } : {}),
                web_presence: website,
              },
            },
          });
        }
      } catch (error) {
        failed += 1;
        firstError ||= error;
        stats.webPresenceChecked += 1;
        stats.inconclusiveWebsiteChecks += 1;
        if (!requireEmail) {
          const website = {
            status: "unknown",
            url: "",
            evidence: String(error?.message || "Research unavailable."),
            reason: "The independent website check could not be completed.",
            searched_url: "",
            checked_at: new Date().toISOString(),
          };
          matches.push({
            order,
            lead: {
              ...lead,
              website_status: "Website check uncertain",
              source_payload: { ...lead.source_payload, web_presence: website },
              source_metadata: { ...lead.source_metadata, web_presence: website },
            },
          });
        }
      } finally {
        completed += 1;
        onProgress?.({
          phase: "presence",
          completed,
          total: candidates.length,
          scanned: completed,
          leads: matches.length,
        });
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, runWorker));
  if (requireEmail && completed && failed === completed && firstError) {
    throw new Error("Business web-presence checks could not run: " + (firstError.message || "research unavailable"));
  }

  onProgress?.({
    phase: "presence",
    completed,
    total: completed || 1,
    scanned: completed,
    leads: matches.length,
  });

  return {
    leads: matches
      .sort((a, b) => a.order - b.order)
      .slice(0, limit)
      .map((match) => match.lead),
    stats,
  };
}

/** Back-compatible helper for callers that only need the screened lead array. */
export async function enrichLeadsWithPublicEmails(leads, options = {}) {
  const screened = await screenLeadsForBusinessPresence(leads, {
    ...options,
    requireEmail: true,
  });
  return screened.leads;
}

export function canUseDirectWebsiteVerification() {
  const pageLocation = globalThis.location;
  if (!pageLocation) return false;
  if (pageLocation.protocol === "file:") return true;
  return ["localhost", "127.0.0.1", "[::1]"].includes(pageLocation.hostname);
}

export function normalizeLead(place, context = {}) {
  const address = splitAddress(place.address);
  const sourceWebsite = String(place.website || "").trim();
  const classification = place.classification || getOpenScout().classify.classifyWebsite(sourceWebsite);
  const noRealWebsite = Boolean(classification.isLead);
  const sourceKey = place.id || stableSourceKey(place);
  const leadScore = Math.max(0, Math.min(100, Number(place.confidence) || 0));
  const opportunity = inferAutomationOpportunity(place, context);

  return {
    business_name: String(place.name || "Unnamed business").trim(),
    contact_name: "",
    email: String(place.email || "").trim(),
    phone: String(place.phone || "").trim(),
    address: String(place.address || "").trim(),
    city: address.city,
    region: address.region,
    postal_code: address.postalCode,
    country: address.country,
    category: humanizeType(place.primaryType || context.category || "Local business"),
    service_type: humanizeType(context.category || place.primaryType || "Local service"),
    source: "openscout",
    source_key: sourceKey,
    listing_url: place.googleMapsURL || "",
    website_url: sourceWebsite,
    has_website: !noRealWebsite,
    website_status: place.leadType || (noRealWebsite ? "No website" : "Has website"),
    qualification_score: leadScore,
    opportunity_score: leadScore,
    opportunity_tags: opportunity.tags,
    opportunity_summary: opportunity.summary,
    qualification_status: "unreviewed",
    lead_score: leadScore,
    status: "new",
    priority: leadScore >= 92 ? "high" : leadScore < 78 ? "low" : "normal",
    asking_price: 2500,
    deal_value: 2500,
    quoted_setup_fee: null,
    quoted_monthly_fee: null,
    discovered_at: new Date().toISOString(),
    source_payload: {
      engine: ENGINE_VERSION,
      search_location: context.location || "",
      place_id: sourceKey,
      openscout: {
        leadTier: place.leadTier || classification.tier,
        leadCategory: place.leadCategory || classification.category,
        leadType: place.leadType || classification.type,
        confidence: leadScore,
        reasons: place.reasons || [],
        verification: place.verification || "",
        rating: place.rating || null,
        ratingCount: place.ratingCount || 0,
        businessStatus: place.businessStatus || "",
        primaryType: place.primaryType || "",
        types: place.types || [],
        lat: place.lat ?? null,
        lng: place.lng ?? null,
        mergedFrom: place.mergedFrom || 1,
        attributions: place.attributions || [],
        weakLink: place.weakLink || "",
      },
    },
    source_metadata: {
      engine: ENGINE_VERSION,
      place_id: sourceKey,
      openscout: {
        leadTier: place.leadTier || classification.tier,
        leadCategory: place.leadCategory || classification.category,
        leadType: place.leadType || classification.type,
        confidence: leadScore,
        reasons: place.reasons || [],
        verification: place.verification || "",
        rating: place.rating || null,
        ratingCount: place.ratingCount || 0,
        businessStatus: place.businessStatus || "",
        primaryType: place.primaryType || "",
        types: place.types || [],
        lat: place.lat ?? null,
        lng: place.lng ?? null,
        mergedFrom: place.mergedFrom || 1,
        attributions: place.attributions || [],
        weakLink: place.weakLink || "",
      },
    },
  };
}

/**
 * Produces reviewable opportunity tags from category and public listing facts.
 * These are fit signals, not claims about the business's private operations.
 */
export function inferAutomationOpportunity(place = {}, context = {}) {
  const text = [
    context.category,
    place.primaryType,
    ...(Array.isArray(place.types) ? place.types : []),
  ].join(" ").toLowerCase().replaceAll("_", " ");
  const tags = new Set();
  const matches = (terms) => terms.some((term) => text.includes(term));
  const appointment = matches(["dent", "clinic", "doctor", "chiropr", "salon", "spa", "barber", "veter", "therapy", "massage", "cleaning"]);
  const quoteBased = matches(["roof", "plumb", "hvac", "heating", "air conditioning", "electric", "landscap", "tree", "contract", "remodel", "paint", "moving", "pest", "garage", "floor", "fence", "concrete"]);
  const emergency = matches(["plumb", "hvac", "heating", "air conditioning", "locksmith", "towing", "restoration", "water damage", "electric"]);
  const supportHeavy = matches(["property management", "insurance", "legal", "attorney", "medical", "clinic", "veter", "home care"]);
  const reviewCount = Number(place.ratingCount || 0);

  if (reviewCount >= 100) tags.add("high_call_volume");
  if (appointment) {
    tags.add("appointment_based");
    tags.add("booking");
  }
  if (quoteBased) {
    tags.add("quote_based");
    tags.add("lead_follow_up");
  }
  if (emergency) {
    tags.add("emergency_service");
    tags.add("after_hours");
  }
  if (supportHeavy) tags.add("support_heavy");
  if (place.phone && (appointment || quoteBased || emergency)) tags.add("missed_call");

  const values = [...tags];
  return {
    tags: values,
    summary: values.length
      ? "Inferred from the business category and public listing signals; verify the workflow during outreach."
      : "No specific automation fit was inferred from public listing data; review manually.",
  };
}

export function toDiscoveryResult(lead, runId, decision = "pending") {
  return {
    run_id: runId,
    source: "openscout",
    source_key: lead.source_key,
    business_name: lead.business_name,
    normalized_data: lead,
    raw_source_metadata: lead.source_metadata || lead.source_payload || {},
    website_status: lead.website_status,
    lead_score: lead.lead_score,
    decision,
    duplicate_of_lead_id: null,
    decision_reason: decision === "rejected" ? "Rejected by operator" : "",
  };
}

export function duplicateKey(lead) {
  const placeId = lead.source_key || lead.source_metadata?.place_id;
  if (placeId) return `source:${placeId}`;
  const phone = String(lead.phone || "").replace(/\D/g, "");
  if (phone) return `phone:${phone}`;
  return `name:${String(lead.business_name || "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${String(lead.city || "").toLowerCase()}`;
}

export function splitAddress(rawAddress) {
  const parts = String(rawAddress || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return { city: "", region: "", postalCode: "", country: "" };
  const country = parts.length > 3 ? parts.at(-1) : "US";
  const regionPart = parts.length >= 2 ? parts.at(-2) : "";
  const regionMatch = regionPart.match(/\b([A-Z]{2})\s+([A-Z0-9 -]{3,10})$/i);
  return {
    city: parts.length >= 3 ? parts.at(-3) : parts[0] || "",
    region: regionMatch?.[1]?.toUpperCase() || regionPart,
    postalCode: regionMatch?.[2] || "",
    country,
  };
}

function stableSourceKey(place) {
  return [
    String(place.name || "").toLowerCase(),
    String(place.address || "").toLowerCase(),
    String(place.phone || "").replace(/\D/g, ""),
  ].join("|");
}

function humanizeType(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const OPENSCOUT_ENGINE_VERSION = ENGINE_VERSION;
