import { DEFAULT_EFFORT, DEFAULT_MODEL_ID } from "../js/data/models.js";

/**
 * Every external endpoint the Worker is allowed to talk to, in one file.
 *
 * Keeping the hosts and the allow lists here means the request handlers never
 * build a URL from caller-supplied input, so none of the routes can be turned
 * into an open proxy for the keys behind them.
 */

export const ANTHROPIC = Object.freeze({
  messages: "https://api.anthropic.com/v1/messages",
  version: "2023-06-01",
  /* Used only when the caller sends no model. The picker in Settings normally
     supplies one, and both are validated against js/data/models.js. */
  defaultModel: DEFAULT_MODEL_ID,
  /* Deliberately below the provider's own `high` default: this dashboard asks
     short operational questions, and effort is the largest cost lever. */
  defaultEffort: DEFAULT_EFFORT,
});

export const OPENAI = Object.freeze({
  responses: "https://api.openai.com/v1/responses",
  defaultModel: "gpt-5",
});

export const WHOP = Object.freeze({
  base: "https://api.whop.com/api/v5",
  /* Read-only surfaces this dashboard uses: who bought, and what was paid. */
  allowedPaths: Object.freeze(["me", "company/memberships", "company/payments", "company/products"]),
});

export const PLACES = Object.freeze({
  searchText: "https://places.googleapis.com/v1/places:searchText",
  defaultFieldMask: [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.nationalPhoneNumber",
    "places.websiteUri",
    "places.rating",
    "places.userRatingCount",
    "places.location",
    "places.primaryType",
    "places.googleMapsUri",
  ].join(","),
});

export const SUPABASE = Object.freeze({
  user: "https://yswxdsagoywzevwgarbf.supabase.co/auth/v1/user",
  publishableKey: "sb_publishable_Ah6QGx7Tpr-rBvaa4cQcPw_7djryJ9K",
});

export const OUTLOOK = Object.freeze({
  authorize(tenant = "common") {
    return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`;
  },
  token(tenant = "common") {
    return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  },
  sendMail: "https://graph.microsoft.com/v1.0/me/sendMail",
  scopes: Object.freeze([
    "openid",
    "profile",
    "email",
    "offline_access",
    "https://graph.microsoft.com/Mail.Send",
  ]),
});
