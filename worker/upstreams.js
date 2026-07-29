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
  allowedPaths: Object.freeze([
    "me",
    "company",
    "company/memberships",
    "company/payments",
    "company/products",
    "company/plans",
  ]),
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
  url: "https://yswxdsagoywzevwgarbf.supabase.co",
  rest: "https://yswxdsagoywzevwgarbf.supabase.co/rest/v1",
});

export const OUTLOOK = Object.freeze({
  authorize(tenant = "common") {
    return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`;
  },
  token(tenant = "common") {
    return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  },
  sendMail: "https://graph.microsoft.com/v1.0/me/sendMail",
  messages: "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages",
  reply(messageId) {
    return `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/reply`;
  },
  /* The fields the Inbox actually renders. Asking for the whole message body of
     every mail would cost far more bandwidth than the dashboard can use. */
  messageFields: [
    "id",
    "conversationId",
    "subject",
    "from",
    "toRecipients",
    "receivedDateTime",
    "bodyPreview",
    "isRead",
    "webLink",
  ].join(","),
  /* Mail.Read is what turns the Inbox from an empty page into replies you can
     classify. Adding it changes the consent screen, so an existing connection
     has to be reconnected once before inbox sync works. */
  scopes: Object.freeze([
    "openid",
    "profile",
    "email",
    "offline_access",
    "https://graph.microsoft.com/Mail.Send",
    "https://graph.microsoft.com/Mail.Read",
  ]),
});
