import { constants as fsConstants } from "node:fs";
import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RENDERER_START = "<!-- QQ2007 EXTENSION START -->";
const RENDERER_END = "<!-- QQ2007 EXTENSION END -->";
const CSS_START = "/* QQ2007 EXTENSION START */";
const CSS_END = "/* QQ2007 EXTENSION END */";

function pathsFor(engineRoot) {
  const assets = path.resolve(engineRoot, "assets");
  const renderer = path.join(assets, "renderer-inject.js");
  const css = path.join(assets, "dream-skin.css");
  return {
    renderer,
    css,
    rendererBackup: `${renderer}.qq2007-base`,
    cssBackup: `${css}.qq2007-base`,
  };
}

function requireAnchor(value, pattern, label) {
  if (!pattern.test(value)) throw new Error(`Renderer anchor missing: ${label}`);
}

function patchRenderer(renderer, chromeHtml) {
  if (renderer.includes(RENDERER_START)) return renderer;
  requireAnchor(renderer, /const ART_ATTRS = \[/, "ART_ATTRS");
  requireAnchor(renderer, /const applyRootState = \(root\) => \{/, "applyRootState");
  requireAnchor(renderer, /const shell = resolvedShell\(\);/, "resolved shell");
  requireAnchor(renderer, /chrome\.innerHTML = `/, "chrome template");
  requireAnchor(renderer, /if \(!chrome \|\| chrome\.parentElement !== document\.body\) \{/, "chrome creation guard");
  const chromeLookup = /let chrome = document\.getElementById\((?:CHROME_ID|"codex-dream-skin-chrome")\);/;
  requireAnchor(renderer, chromeLookup, "chrome lookup");

  let next = renderer.replace(
    /const ART_ATTRS = \[/,
    'const ART_ATTRS = [\n    "data-dream-theme-id",\n    "data-dream-pet-surface",\n    "data-dream-pet-activity",',
  );
  next = next.replace(
    /const shell = resolvedShell\(\);/,
    'const shell = resolvedShell();\n    setAttribute(root, "data-dream-theme-id", THEME.id || "custom");\n    root.toggleAttribute("data-dream-pet-surface", location.href.includes("avatar-overlay"));\n    root.toggleAttribute("data-dream-pet-activity", location.search.includes("surfaceId=activity-slot"));',
  );
  next = next.replace(
    /if \(!chrome \|\| chrome\.parentElement !== document\.body\) \{/,
    'if (!chrome || chrome.parentElement !== document.body || (THEME.id === "retro-qq-2007" && !chrome.querySelector(\'[data-qq2007-version="4"]\'))) {',
  );
  next = next.replace(chromeLookup, (lookup) =>
    `${lookup}\n    if (location.href.includes("avatar-overlay")) {\n      let petReset = document.getElementById("qq-pet-surface-reset");\n      if (!petReset) {\n        petReset = document.createElement("style");\n        petReset.id = "qq-pet-surface-reset";\n        (document.head || document.documentElement).appendChild(petReset);\n      }\n      petReset.textContent = "html,body{background:transparent!important;background-image:none!important}#chatgpt-dream-skin-operation{display:none!important}";\n      document.body?.style.setProperty("background", "transparent", "important");\n      document.body?.style.setProperty("background-image", "none", "important");\n      if (location.search.includes("surfaceId=activity-slot")) {\n        document.querySelector("#root")?.style.removeProperty("display");\n      }\n      chrome?.remove();\n      return;\n    }`);
  next = next.replace(
    /chrome\.innerHTML = `/,
    `chrome.innerHTML = \`${RENDERER_START}\n${chromeHtml.trim()}\n${RENDERER_END}\n`,
  );
  return next;
}

function dataUrl(bytes) {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function patchCss(css, extension, codexProfile, avatarProfile, penguinProfile) {
  if (css.includes(CSS_START)) return css;
  const rendered = extension
    .replaceAll("__QQ2007_CODEX_PROFILE__", dataUrl(codexProfile))
    .replaceAll("__QQ2007_AVATAR_PROFILE__", dataUrl(avatarProfile))
    .replaceAll("__QQ2007_PENGUIN_PROFILE__", dataUrl(penguinProfile));
  if (/__QQ2007_(?:CODEX|AVATAR|PENGUIN)_PROFILE__/.test(rendered)) {
    throw new Error("QQ 2007 profile placeholder replacement failed");
  }
  return `${css.trimEnd()}\n\n${CSS_START}\n${rendered.trim()}\n${CSS_END}\n`;
}

async function writePairAtomic(rendererPath, renderer, cssPath, css) {
  const token = `${process.pid}.${Date.now()}`;
  const rendererTemp = `${rendererPath}.${token}.tmp`;
  const cssTemp = `${cssPath}.${token}.tmp`;
  await writeFile(rendererTemp, renderer, { mode: 0o600, flag: "wx" });
  await writeFile(cssTemp, css, { mode: 0o600, flag: "wx" });
  await rename(rendererTemp, rendererPath);
  await rename(cssTemp, cssPath);
}

export async function installExtension(engineRoot, sourceRoot) {
  const files = pathsFor(engineRoot);
  const [renderer, css, chrome, extension, codexProfile, avatarProfile, penguinProfile] = await Promise.all([
    readFile(files.renderer, "utf8"),
    readFile(files.css, "utf8"),
    readFile(path.resolve(sourceRoot, "qq2007-chrome.html"), "utf8"),
    readFile(path.resolve(sourceRoot, "qq2007-extension.css"), "utf8"),
    readFile(path.resolve(sourceRoot, "profile-codex.png")),
    readFile(path.resolve(sourceRoot, "profile-avatar.png")),
    readFile(path.resolve(sourceRoot, "profile-penguin.png")),
  ]);
  const patchedRenderer = patchRenderer(renderer, chrome);
  const patchedCss = patchCss(css, extension, codexProfile, avatarProfile, penguinProfile);
  requireAnchor(patchedRenderer, /"data-dream-theme-id"/, "theme id attribute");
  requireAnchor(patchedRenderer, /id="dream-skin-qq2007"/, "QQ chrome");
  if (!patchedCss.includes(CSS_START)) throw new Error("CSS extension validation failed");

  if (patchedRenderer === renderer && patchedCss === css) return { changed: false };
  await copyFile(files.renderer, files.rendererBackup, fsConstants.COPYFILE_EXCL).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  await copyFile(files.css, files.cssBackup, fsConstants.COPYFILE_EXCL).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  await writePairAtomic(files.renderer, patchedRenderer, files.css, patchedCss);
  return { changed: true };
}

export async function restoreExtension(engineRoot) {
  const files = pathsFor(engineRoot);
  const [renderer, css] = await Promise.all([
    readFile(files.rendererBackup),
    readFile(files.cssBackup),
  ]);
  await writePairAtomic(files.renderer, renderer, files.css, css);
  return { restored: true };
}

async function main(argv) {
  const [action, ...args] = argv;
  const value = (name) => {
    const index = args.indexOf(`--${name}`);
    if (index < 0 || !args[index + 1]) throw new Error(`Missing --${name}`);
    return args[index + 1];
  };
  const engine = value("engine");
  if (action === "install") {
    const result = await installExtension(engine, value("source"));
    console.log(result.changed ? "QQ 2007 extension installed." : "QQ 2007 extension already installed.");
  } else if (action === "restore") {
    await restoreExtension(engine);
    console.log("QQ 2007 extension restored to base assets.");
  } else {
    throw new Error("Usage: install-extension.mjs install --engine <path> --source <path> | restore --engine <path>");
  }
}

if (path.resolve(process.argv[1] || "") === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
