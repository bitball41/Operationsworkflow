/**
 * Operations Workflow adapter for the unmodified OpenScout discovery engine.
 *
 * OpenScout owns search, classification, live verification, ranking, chain
 * exclusion and source-level duplicate merging. This file is deliberately the
 * boundary where an OpenScout place becomes an Operations Workflow record.
 */

import { getState } from "../../core/state.js";
import { fetchMapsKey } from "../api.js";

const ENGINE_VERSION = "openscout-2026-07-25";

export function getOpenScout() {
  const engine = window.OpenScout;
  if (!engine?.googlePlaces?.searchLeads || !engine?.classify) {
    throw new Error("OpenScout did not load. Refresh the dashboard and try again.");
  }
  return engine;
}

export function getStoredApiKey() {
  return getOpenScout().storage?.getApiKey?.() || "";
}

export function setStoredApiKey(value) {
  return getOpenScout().storage?.setApiKey?.(value) || "";
}

/** True when the Cloudflare Worker reports it is holding a Google Maps key. */
export function workerHoldsMapsKey() {
  return getState().services?.providers?.google_maps === true;
}

let workerKey = "";

/**
 * The Google Maps key to search with.
 *
 * Prefers the Worker's key so one key serves every browser and none of them
 * need it pasted in; falls back to whatever this browser has stored. A Maps
 * JavaScript key is public either way — restrict it by HTTP referrer.
 */
export async function resolveMapsKey() {
  if (workerHoldsMapsKey()) {
    if (workerKey) return workerKey;
    try {
      workerKey = await fetchMapsKey();
      if (workerKey) return workerKey;
    } catch (error) {
      console.warn("Worker Maps key unavailable, falling back to this browser's key", error);
    }
  }
  return getStoredApiKey();
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
    verify: verifyDirectly,
    locationGuess: options.locationGuess || null,
    onProgress,
  });

  let leads = result.leads.map((place) => normalizeLead(place, {
    category: options.businessType,
    location: options.location,
  }));

  if (options.mustHavePhone) leads = leads.filter((lead) => Boolean(lead.phone));
  if (options.mustHaveEmail) leads = leads.filter((lead) => Boolean(lead.email));
  if (options.strictlyBlankWebsite) {
    leads = leads.filter((lead) => lead.source_metadata?.openscout?.leadCategory === "none");
  }

  const requested = Math.max(1, Math.min(250, Number(options.limit) || 50));
  leads = leads.slice(0, requested);

  return {
    ...result,
    requested,
    leads,
    engineVersion: ENGINE_VERSION,
  };
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
  const noRealWebsite = Boolean(place.isLead ?? classification.isLead);
  const sourceKey = place.id || stableSourceKey(place);
  const leadScore = Math.max(0, Math.min(100, Number(place.confidence) || 0));

  return {
    business_name: String(place.name || "Unnamed business").trim(),
    contact_name: "",
    email: "",
    phone: String(place.phone || "").trim(),
    address: String(place.address || "").trim(),
    city: address.city,
    region: address.region,
    postal_code: address.postalCode,
    country: address.country,
    category: humanizeType(place.primaryType || context.category || "Local business"),
    source: "openscout",
    source_key: sourceKey,
    listing_url: place.googleMapsURL || "",
    website_url: sourceWebsite,
    has_website: !noRealWebsite,
    website_status: place.leadType || (noRealWebsite ? "No website" : "Has website"),
    qualification_score: leadScore,
    opportunity_score: leadScore,
    lead_score: leadScore,
    status: "new",
    priority: leadScore >= 92 ? "high" : leadScore < 78 ? "low" : "normal",
    asking_price: 400,
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
