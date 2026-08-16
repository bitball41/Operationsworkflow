import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const output = fileURLToPath(new URL("../voice-demo/app.js", import.meta.url));

await build({
  bundle: true,
  entryPoints: [fileURLToPath(new URL("../voice-demo/src/app.js", import.meta.url))],
  format: "esm",
  minify: true,
  outfile: output,
  platform: "browser",
  target: "es2022",
});

// Some upstream license comments contain trailing spaces. Normalizing only
// line endings keeps the committed browser bundle deterministic and makes
// `git diff --check` useful without removing those notices.
const bundle = await readFile(output, "utf8");
await writeFile(output, bundle.replace(/[\t ]+$/gm, ""), "utf8");
