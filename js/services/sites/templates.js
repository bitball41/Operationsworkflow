/**
 * User-owned site templates.
 *
 * Source files stay as text on the template record. Binary assets are uploaded
 * unchanged to Supabase Storage and referenced through a small manifest; they
 * are never converted to base64 or compressed by this application.
 */
import { CONFIG } from "../../config.js";
import { getState } from "../../core/state.js";
import { slugify } from "../../core/utils.js";
import { createRecord, deleteRecord, updateRecord } from "../data.js";
import { getSupabase } from "../supabase.js";

const SOURCE_LIMIT = 1_000_000;
const ASSET_LIMIT = 15 * 1024 * 1024;
const ASSET_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
]);

function safeAssetName(name) {
  const raw = String(name || "asset").replace(/\\/g, "/").split("/").pop();
  const dot = raw.lastIndexOf(".");
  const base = dot > 0 ? raw.slice(0, dot) : raw;
  const extension = dot > 0 ? raw.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return `${slugify(base) || "asset"}${extension ? `.${extension}` : ""}`;
}

export function normalizeTemplateAssetPaths(files, assets = []) {
  const normalized = { ...files };
  for (const file of assets) {
    const original = String(file?.name || "").replace(/\\/g, "/").split("/").pop();
    const safe = safeAssetName(original);
    if (!original || original === safe) continue;
    const encoded = encodeURIComponent(original);
    const replacements = [
      [`./assets/${original}`, `./assets/${safe}`],
      [`./assets/${encoded}`, `./assets/${safe}`],
      [`assets/${original}`, `assets/${safe}`],
      [`assets/${encoded}`, `assets/${safe}`],
    ];
    for (const name of Object.keys(normalized)) {
      let source = String(normalized[name] || "");
      replacements.forEach(([from, to]) => { source = source.split(from).join(to); });
      normalized[name] = source;
    }
  }
  return normalized;
}

function validateSources(files) {
  for (const name of ["index.html", "style.css", "script.js"]) {
    const source = String(files?.[name] || "");
    if (!source.trim() && name === "index.html") throw new Error("index.html cannot be empty.");
    if (source.length > SOURCE_LIMIT) throw new Error(`${name} is larger than 1 MB.`);
  }
}

function validateAssets(assets) {
  const names = new Set();
  for (const file of assets) {
    if (!ASSET_TYPES.has(file.type)) throw new Error(`${file.name} is not a supported image type.`);
    if (file.size > ASSET_LIMIT) throw new Error(`${file.name} is larger than 15 MB.`);
    const name = safeAssetName(file.name);
    if (names.has(name)) throw new Error(`Two assets resolve to the same name: ${name}.`);
    names.add(name);
  }
}

async function uploadAssets(templateId, assets) {
  if (!assets.length) return [];
  if (getState().storage !== "cloud") {
    throw new Error("Sign in to Supabase before uploading template images.");
  }

  const client = await getSupabase();
  const prefix = `${getState().user.id}/templates/${templateId}/assets`;
  const uploaded = [];

  try {
    for (const file of assets) {
      const name = safeAssetName(file.name);
      const storagePath = `${prefix}/${name}`;
      const { error } = await client.storage.from(CONFIG.storageBucket).upload(storagePath, file, {
        upsert: false,
        cacheControl: "31536000",
        contentType: file.type,
      });
      if (error) throw error;
      uploaded.push({
        name,
        path: `assets/${name}`,
        storage_path: storagePath,
        content_type: file.type,
        size: file.size,
      });
    }
    return uploaded;
  } catch (error) {
    if (uploaded.length) {
      await client.storage.from(CONFIG.storageBucket).remove(uploaded.map((asset) => asset.storage_path)).catch(() => {});
    }
    throw error;
  }
}

export async function createCustomTemplate({ name, category, description = "", files, assets = [] }) {
  const templateName = String(name || "").trim();
  const templateCategory = String(category || "").trim();
  if (!templateName) throw new Error("Template name is required.");
  if (!templateCategory) throw new Error("Template category is required.");
  const portableFiles = normalizeTemplateAssetPaths(files, assets);
  validateSources(portableFiles);
  validateAssets(assets);

  const template = await createRecord("templates", {
    name: templateName,
    category: templateCategory,
    description: String(description || "").trim(),
    source_kind: "custom",
    layout_key: "custom",
    status: "active",
    is_active: true,
    use_count: 0,
    files: portableFiles,
    asset_manifest: [],
  });

  try {
    const manifest = await uploadAssets(template.id, assets);
    return manifest.length
      ? updateRecord("templates", template.id, { asset_manifest: manifest })
      : template;
  } catch (error) {
    await deleteRecord("templates", template.id).catch(() => {});
    throw error;
  }
}

export async function deleteCustomTemplate(template) {
  if (!template || template.source_kind !== "custom") throw new Error("Only uploaded templates can be deleted.");
  const usedBy = getState().data.demos.filter((demo) => String(demo.template_id) === String(template.id));
  if (usedBy.length) {
    throw new Error(`This template is used by ${usedBy.length} demo${usedBy.length === 1 ? "" : "s"}. Rebuild those demos with another template before deleting it.`);
  }
  const paths = (template.asset_manifest || []).map((asset) => asset.storage_path).filter(Boolean);
  if (paths.length && getState().storage === "cloud") {
    const client = await getSupabase();
    const { error } = await client.storage.from(CONFIG.storageBucket).remove(paths);
    if (error) throw error;
  }
  await deleteRecord("templates", template.id);
}

/**
 * Replaces relative asset paths with short-lived signed URLs for the private
 * template preview. The stored source itself remains portable and relative.
 */
export async function filesForTemplatePreview(template, files) {
  const manifest = template?.asset_manifest || [];
  if (!manifest.length || getState().storage !== "cloud") return { ...files };

  const client = await getSupabase();
  const paths = manifest.map((asset) => asset.storage_path);
  const { data, error } = await client.storage.from(CONFIG.storageBucket).createSignedUrls(paths, 60 * 60);
  if (error) throw error;

  const signedByPath = new Map((data || []).map((entry) => [entry.path, entry.signedUrl]));
  const resolved = { ...files };
  for (const asset of manifest) {
    const signed = signedByPath.get(asset.storage_path);
    if (!signed) continue;
    for (const name of Object.keys(resolved)) {
      resolved[name] = String(resolved[name] || "")
        .split(`./${asset.path}`).join(signed)
        .split(asset.path).join(signed);
    }
  }
  return resolved;
}

/** Downloads original bytes for R2 deployment. */
export async function downloadTemplateAssets(manifest = []) {
  if (!manifest.length) return [];
  if (getState().storage !== "cloud") throw new Error("Template assets are not available outside the Supabase workspace.");
  const client = await getSupabase();
  const assets = [];
  for (const item of manifest) {
    const { data, error } = await client.storage.from(CONFIG.storageBucket).download(item.storage_path);
    if (error) throw error;
    assets.push({ path: item.path, blob: data, contentType: item.content_type || data.type || "application/octet-stream" });
  }
  return assets;
}
