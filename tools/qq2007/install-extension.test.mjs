import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { installExtension, restoreExtension } from "./install-extension.mjs";

const rendererFixture = `((cssText, artDataUrl, themeConfig) => {
  const ART_ATTRS = [
    "data-dream-art-wide",
  ];
  const THEME = themeConfig || {};
  const setAttribute = () => {};
  const applyRootState = (root) => {
    const shell = resolvedShell();
    setAttribute(root, "data-dream-shell", shell);
  };
  const syncRouteState = () => {
    let chrome = document.getElementById("codex-dream-skin-chrome");
    if (!chrome || chrome.parentElement !== document.body) {
      chrome = document.createElement("div");
      chrome.id = "codex-dream-skin-chrome";
      chrome.innerHTML = \`<div class="dream-skin-brand"></div>\`;
    }
  };
  const cleanup = () => {
    for (const name of ART_ATTRS) document.documentElement?.removeAttribute(name);
  };
})();
`;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "qq2007-extension-"));
  const engine = path.join(root, "engine");
  const source = path.join(root, "source");
  await mkdir(path.join(engine, "assets"), { recursive: true });
  await mkdir(source, { recursive: true });
  await writeFile(path.join(engine, "assets", "renderer-inject.js"), rendererFixture);
  await writeFile(path.join(engine, "assets", "dream-skin.css"), ".codex-dream-skin{}\n");
  await writeFile(path.join(source, "qq2007-chrome.html"), '<div id="dream-skin-qq2007" data-qq2007-version="4" aria-hidden="true"></div>\n');
  await writeFile(path.join(source, "qq2007-extension.css"), [
    "#dream-skin-qq2007 { pointer-events: none; }",
    ".qq2007-codex-art { background-image: url(\"__QQ2007_CODEX_PROFILE__\"); }",
    ".qq2007-avatar-art { background-image: url(\"__QQ2007_AVATAR_PROFILE__\"); }",
    ".qq2007-left-avatar { background-image: url(\"__QQ2007_PENGUIN_PROFILE__\"); }",
  ].join("\n"));
  await writeFile(path.join(source, "profile-codex.png"), Buffer.from("codex-profile"));
  await writeFile(path.join(source, "profile-avatar.png"), Buffer.from("avatar-profile"));
  await writeFile(path.join(source, "profile-penguin.png"), Buffer.from("penguin-profile"));
  return { engine, source };
}

test("installs once, remains byte-identical, and restores base assets", async () => {
  const { engine, source } = await fixture();
  await installExtension(engine, source);

  const rendererPath = path.join(engine, "assets", "renderer-inject.js");
  const cssPath = path.join(engine, "assets", "dream-skin.css");
  const renderer = await readFile(rendererPath, "utf8");
  const css = await readFile(cssPath, "utf8");

  assert.match(renderer, /"data-dream-theme-id"/);
  assert.match(renderer, /setAttribute\(root, "data-dream-theme-id", THEME\.id \|\| "custom"\)/);
  assert.match(renderer, /id="dream-skin-qq2007"/);
  assert.match(renderer, /data-qq2007-version="4"/);
  assert.match(renderer, /!chrome\.querySelector\('\[data-qq2007-version="4"\]'\)/);
  assert.match(renderer, /toggleAttribute\("data-dream-pet-surface", location\.href\.includes\("avatar-overlay"\)\)/);
  assert.match(renderer, /if \(location\.href\.includes\("avatar-overlay"\)\) \{[\s\S]*chrome\?\.remove\(\);\s*return;/);
  assert.match(renderer, /toggleAttribute\("data-dream-pet-activity", location\.search\.includes\("surfaceId=activity-slot"\)\)/);
  assert.match(renderer, /document\.body\?\.style\.setProperty\("background", "transparent", "important"\)/);
  assert.match(renderer, /petReset\.id = "qq-pet-surface-reset"/);
  assert.match(renderer, /html,body\{background:transparent!important;background-image:none!important\}/);
  assert.match(renderer, /#chatgpt-dream-skin-operation\{display:none!important\}/);
  assert.match(renderer, /location\.search\.includes\("surfaceId=activity-slot"\)[\s\S]*querySelector\("#root"\)\?\.style\.removeProperty\("display"\)/);
  assert.doesNotMatch(renderer, /querySelector\("#root"\)\?\.style\.setProperty\("display", "none", "important"\)/);
  assert.equal((renderer.match(/QQ2007 EXTENSION START/g) || []).length, 1);
  assert.equal((css.match(/QQ2007 EXTENSION START/g) || []).length, 1);
  assert.match(css, /data:image\/png;base64,/);
  assert.doesNotMatch(css, /__QQ2007_(?:CODEX|AVATAR|PENGUIN)_PROFILE__/);

  await installExtension(engine, source);
  assert.equal(await readFile(rendererPath, "utf8"), renderer);
  assert.equal(await readFile(cssPath, "utf8"), css);

  await restoreExtension(engine);
  assert.equal(await readFile(rendererPath, "utf8"), rendererFixture);
  assert.equal(await readFile(cssPath, "utf8"), ".codex-dream-skin{}\n");
});

test("rejects an engine whose renderer anchors changed", async () => {
  const { engine, source } = await fixture();
  await writeFile(path.join(engine, "assets", "renderer-inject.js"), "unknown renderer\n");
  await assert.rejects(installExtension(engine, source), /renderer anchor/i);
});

test("production chrome is non-interactive and responsive", async () => {
  const testRoot = path.dirname(fileURLToPath(import.meta.url));
  const themeRoot = path.resolve(testRoot, "../../themes/retro-qq-2007");
  const chrome = await readFile(path.join(themeRoot, "qq2007-chrome.html"), "utf8");
  const css = await readFile(path.join(themeRoot, "qq2007-extension.css"), "utf8");
  const codexProfile = await readFile(path.join(themeRoot, "profile-codex.png"));

  assert.match(chrome, /id="dream-skin-qq2007"[^>]+aria-hidden="true"/);
  assert.match(chrome, /qq2007-title/);
  assert.match(chrome, /qq2007-toolbar/);
  assert.match(chrome, /qq2007-profile/);
  assert.match(chrome, /qq2007-status/);
  assert.match(css, /#dream-skin-qq2007\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(css, /data-dream-theme-id="retro-qq-2007"/);
  assert.match(css, /@media \(max-width: 1199px\)/);
  assert.match(css, /@media \(max-width: 999px\)/);
  assert.match(css, /__QQ2007_CODEX_PROFILE__/);
  assert.match(css, /__QQ2007_AVATAR_PROFILE__/);
  assert.match(css, /\.qq2007-title\s*\{[^}]*position:\s*fixed[^}]*left:\s*0[^}]*right:\s*0/s);
  assert.match(css, /\.qq2007-toolbar\s*\{[^}]*position:\s*fixed[^}]*left:\s*0[^}]*right:\s*0/s);
  assert.match(css, /\.qq2007-status\s*\{[^}]*position:\s*fixed[^}]*left:\s*0[^}]*right:\s*0/s);
  assert.ok(codexProfile.byteLength > 100_000);
  assert.ok(codexProfile.readUInt32BE(20) > codexProfile.readUInt32BE(16));
  assert.doesNotMatch(chrome, /qq2007-codex[^>]*(?:onclick|dialog|popover|tooltip)/i);
  assert.match(chrome, /Codex 卜卜/);
  assert.doesNotMatch(chrome, /Codex 小蓝/);
});

test("deep restyle contains reference toolbar, rails, conversation, and composer affordances", async () => {
  const testRoot = path.dirname(fileURLToPath(import.meta.url));
  const themeRoot = path.resolve(testRoot, "../../themes/retro-qq-2007");
  const chrome = await readFile(path.join(themeRoot, "qq2007-chrome.html"), "utf8");
  const css = await readFile(path.join(themeRoot, "qq2007-extension.css"), "utf8");

  for (const token of [
    "qq2007-window-controls",
    "qq2007-tool-icon",
    "qq2007-left-profile",
    "qq2007-left-avatar",
    "qq2007-left-search",
    "qq2007-chat-caption",
    "qq2007-composer-tools",
    "qq2007-send",
    "qq2007-profile-tools",
    "qq2007-friend-search",
  ]) assert.match(chrome, new RegExp(token));

  for (const selector of [
    "qq2007-window-controls",
    "qq2007-tool-icon",
    "group/nav-section-title",
    "qq2007-left-profile",
    "qq2007-chat-caption",
    "qq2007-composer-tools",
    "qq2007-send",
  ]) assert.match(css, new RegExp(selector));

  assert.match(css, /main\.main-surface[^\n]*pre/);
  assert.match(css, /main\.main-surface[^\n]*code/);
  assert.match(css, /composer-surface-chrome[^}]*padding:\s*27px 8px 33px/s);
  assert.match(css, /qq2007-profile-tools/);
  assert.match(css, /qq2007-friend-search/);
  assert.doesNotMatch(chrome, /qq2007-sidebar-groups/);
  assert.match(css, /composer-surface-chrome[^}]*anchor-name:\s*--qq-composer/s);
  assert.match(css, /qq2007-send[^}]*anchor\(--qq-composer right\)/s);
  assert.match(css, /group\/nav-section-title[^}]*position:\s*sticky/s);
  assert.match(css, /data-dream-pet-surface="true"[^}]*#dream-skin-qq2007[^}]*display:\s*none\s*!important/s);
  assert.match(css, /data-dream-pet-surface[^}]*body[^}]*background:\s*transparent\s*!important/s);
  assert.doesNotMatch(css, /data-dream-pet-activity[^}]*#root[^}]*display:\s*none\s*!important/s);
  assert.match(css, /qq2007-left-avatar[^}]*__QQ2007_PENGUIN_PROFILE__/s);
  assert.doesNotMatch(chrome, /qq2007-left-avatar[^>]*>\s*C\s*</s);
  assert.match(css, /main\.main-surface[^}]*--qq-chat-font:\s*12px/s);
  assert.match(css, /main\.main-surface[^\n]*\[data-message-author-role\][^}]*margin-block:\s*4px/s);
  assert.match(css, /main\.main-surface[^\n]*pre[^}]*padding:\s*30px 12px 10px/s);
  assert.match(css, /qq2007-chat-caption[^}]*height:\s*27px/s);
  assert.match(css, /qq2007-title[^}]*height:\s*30px/s);
  assert.match(css, /qq2007-toolbar[^}]*top:\s*30px[^}]*height:\s*44px/s);
  assert.match(css, /group\/folder-row[^}]*min-height:\s*24px/s);
  assert.match(css, /app-shell-left-panel[^}]*padding-top:\s*74px/s);
  assert.match(css, /composer-surface-chrome[^}]*min-height:\s*132px/s);
  assert.match(css, /qq2007-send[^}]*width:\s*92px[^}]*height:\s*25px/s);
  assert.match(css, /qq2007-profile[^}]*width:\s*206px/s);
  assert.match(css, /qq2007-profile[^}]*grid-template-rows:\s*472px minmax\(280px,\s*1fr\)/s);
  assert.match(css, /qq2007-card h3[^}]*height:\s*25px/s);
  assert.match(css, /qq2007-codex-art[^}]*background:\s*center center \/ cover no-repeat url\("__QQ2007_CODEX_PROFILE__"\)/s);
  assert.match(css, /qq2007-codex-art[^}]*height:\s*auto[^}]*aspect-ratio:\s*2 \/ 3/s);
  assert.match(css, /qq2007-avatar-art[^}]*background:\s*center bottom \/ cover no-repeat url\("__QQ2007_AVATAR_PROFILE__"\)/s);
  assert.match(css, /body:has\(aside\[class\*="z-\[41\]"\]\[class\*="ml-auto"\]\)[^}]*qq2007-profile[^}]*display:\s*none\s*!important/s);
  assert.match(css, /body:has\(aside\[class\*="z-\[41\]"\]\[class\*="ml-auto"\]\)[^}]*main\.main-surface[^}]*padding-right:\s*0\s*!important/s);
  assert.match(css, /aside\[class\*="z-\[41\]"\]\[class\*="ml-auto"\][^\n]*button\[aria-label\^="关闭"\]\[aria-label\$="标签页"\][^}]*min-width:\s*58px/s);
  assert.match(css, /button\[aria-label\^="关闭"\]\[aria-label\$="标签页"\]::before[^}]*content:\s*"关闭"/s);
});
