// esbuild 打包:src/index.ts → 单个 .user.js(顶部带油猴 metadata)
import { build, context } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes("--watch");
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf8"),
);

// @description 是油猴 eslint userscripts/require-description 强制要求,不能省
// sourcemap:false + minify:false 双重约束:
//   1. inline base64 sourceMap 里有 globalThis 字符串,eslint 误判
//   2. minify 会合并赋值为 comma sequence,触发 no-sequences
const metaHeader = `// ==UserScript==
// @name         ${pkg.name}
// @namespace    darkwinoom/tampermonkey-bilibili-marks
// @version      ${pkg.version}
// @description  ${pkg.description}
// @match        https://www.bilibili.com/*
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

`;

const buildOptions = {
  entryPoints: [resolve(__dirname, "src/index.ts")],
  bundle: true,
  outfile: resolve(__dirname, "dist/bilibili-marks.user.js"),
  banner: { js: metaHeader },
  format: "iife",
  target: ["es2022"],
  platform: "browser",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  logLevel: "info",
  loader: { ".css": "text" },
};

if (isWatch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log("[build] watching for changes...");
} else {
  await build(buildOptions);
  console.log("[build] dist/bilibili-marks.user.js updated");
}
