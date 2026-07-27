/**
 * Publish boundary for demo sites.
 *
 * Hosting is not connected yet, so publishing marks the demo as ready and
 * records exactly what happened. The bundle itself is always openable in a real
 * browser tab from the stored files, so a preview link is never a lie about
 * rendering — only about being hosted on a public domain.
 */
import { slugify } from "../../core/utils.js";
import { isConnected } from "../integrations.js";
import { composeDocument } from "./bundle.js";

export function previewSlug(demo, lead) {
  return demo?.slug || slugify(lead?.business_name || demo?.name || "demo");
}

/**
 * Builds the preview link for a demo. With no preview domain configured it
 * falls back to the origin the app is actually served from, so the URL is never
 * a domain nobody owns.
 */
export function previewUrl(slug, previewDomain) {
  const configured = String(previewDomain || "").replace(/^https?:\/\//, "").replace(/\/+$/, "").trim();
  if (configured) return `https://${configured}/${slug}`;
  const origin = String(globalThis.location?.origin || "").replace(/\/+$/, "");
  return origin ? `${origin}/p/${slug}` : `/p/${slug}`;
}

export function hostingConnected() {
  return isConnected("cloudflare");
}

/**
 * Returns the publish record to store on the demo. `hosted` is only true once a
 * hosting provider is actually connected and the upload succeeded.
 */
export async function publishBundle({ demo, lead, files, previewDomain }) {
  const slug = previewSlug(demo, lead);
  const url = previewUrl(slug, previewDomain);

  if (!hostingConnected()) {
    return {
      slug,
      url,
      hosted: false,
      state: "pending_hosting",
      at: new Date().toISOString(),
      provider: "none",
      note: "Bundle saved and previewable. Connect Cloudflare to serve it on the preview domain.",
      bytes: Object.values(files || {}).reduce((total, value) => total + String(value).length, 0),
    };
  }

  /* Reserved for the Cloudflare deployment call. */
  return {
    slug,
    url,
    hosted: false,
    state: "provider_not_implemented",
    at: new Date().toISOString(),
    provider: "cloudflare",
    note: "Cloudflare is marked connected but the deploy call is not implemented yet.",
  };
}

let openedUrls = [];

/** Opens the real generated site in a new tab. */
export function openBundleInTab(files) {
  const document_ = composeDocument(files);
  const url = URL.createObjectURL(new Blob([document_], { type: "text/html" }));
  openedUrls.push(url);
  if (openedUrls.length > 8) URL.revokeObjectURL(openedUrls.shift());
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  return Boolean(opened);
}

export function downloadBundle(files, name = "demo") {
  const parts = Object.entries(files).map(([file, content]) => `/* ---- ${file} ---- */\n${content}`);
  const url = URL.createObjectURL(new Blob([parts.join("\n\n")], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(name)}-bundle.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}
