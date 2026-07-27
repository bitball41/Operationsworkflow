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
  defaultModel: "claude-opus-5",
  /* `high` is the API default and the right floor for operations reasoning.
     Raise to "xhigh" if assistant answers come back shallow. */
  defaultEffort: "high",
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
