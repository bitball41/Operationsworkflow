/**
 * Publish boundary for demo sites.
 *
 * Connected workspaces upload immutable versions to the Worker's R2 binding.
 * Unconnected workspaces still record exactly what happened and keep the
 * bundle openable in a real browser tab from the stored files.
 */
import { slugify } from "../../core/utils.js";
import { getState } from "../../core/state.js";
import { publishDemoBundle } from "../api.js";
import { composeDocument } from "./bundle.js";
import { downloadTemplateAssets } from "./templates.js";

export function previewSlug(demo, lead) {
  return demo?.slug || slugify(lead?.business_name || demo?.name || "demo");
}

/**
 * Builds the preview link for a demo. Without a configured domain it falls back
 * to the app origin's /p route, which the same Worker can serve.
 */
export function previewUrl(slug, previewDomain) {
  const configured = String(previewDomain || "").replace(/^https?:\/\//, "").replace(/\/+$/, "").trim();
  if (configured) return `https://${configured}/${slug}`;
  const origin = String(globalThis.location?.origin || "").replace(/\/+$/, "");
  return origin ? `${origin}/p/${slug}` : `/p/${slug}`;
}

export function hostingConnected() {
  return getState().services?.hosting?.configured === true;
}

/**
 * Returns the publish record to store on the demo. `hosted` is only true once a
 * hosting provider is actually connected and the upload succeeded.
 */
export async function publishBundle({ demo, lead, files, previewDomain }) {
  const slug = previewSlug(demo, lead);
  const publicNumber = demo?.public_number;
  const url = publicNumber
    ? previewUrl(publicNumber, previewDomain || getState().services?.hosting?.domain)
    : previewUrl(slug, previewDomain);

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

  if (!publicNumber) {
    throw new Error("This demo has no public number. Apply the latest Supabase migration and reload the workspace.");
  }

  const assets = await downloadTemplateAssets(demo?.content?.assets || []);
  const published = await publishDemoBundle({
    demoId: demo.id,
    publicNumber,
    files,
    assets,
  });
  return {
    slug: String(publicNumber),
    url: published.url,
    hosted: true,
    state: "published",
    at: published.published_at || new Date().toISOString(),
    provider: published.provider || "cloudflare-r2",
    version: published.version,
    bytes: published.bytes,
    note: "Published to Cloudflare R2.",
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
