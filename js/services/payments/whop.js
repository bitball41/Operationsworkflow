/* Payment ingestion is webhook-only. Keep this compatibility export so shared
   accounting tests can import the normalizer without exposing a browser sync. */
export { toPaymentRecord } from "./normalize.js";
