import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { stageInstaller } from "./package-installer.mjs";

const execFileAsync = promisify(execFile);
const rendererFixture = `(() => {
  const ART_ATTRS = [];
  const THEME = {};
  const setAttribute = () => {};
  const applyRootState = (root) => {
    const shell = resolvedShell();
  };
  const sync = () => {
    let chrome = document.getElementById("codex-dream-skin-chrome");
    if (!chrome || chrome.parentElement !== document.body) {
      chrome.innerHTML = \`base\`;
    }
  };
})();
`;

const expected = [
  "README.md",
  "theme/background.jpg",
  "theme/profile-avatar.png",
  "theme/profile-codex.png",
  "theme/profile-penguin.png",
  "theme/qq2007-chrome.html",
  "theme/qq2007-extension.css",
  "theme/theme.json",
  "tools/install-extension.mjs",
  "安装 QQ2007 皮肤.command",
  "恢复原始皮肤.command",
];

test("stages the complete privacy-safe macOS installer contract", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "qq2007-package-"));
  const root = await stageInstaller(path.join(temp, "Codex-QQ2007-Skin-macOS"));

  for (const relative of expected) await access(path.join(root, relative));
  const installMode = (await stat(path.join(root, "安装 QQ2007 皮肤.command"))).mode & 0o777;
  const restoreMode = (await stat(path.join(root, "恢复原始皮肤.command"))).mode & 0o777;
  assert.equal(installMode, 0o755);
  assert.equal(restoreMode, 0o755);

  const text = (
    await Promise.all(expected.filter((file) => /\.(?:md|json|html|css|mjs|command)$/.test(file)).map((file) => readFile(path.join(root, file), "utf8")))
  ).join("\n");
  assert.match(text, /QQ用户/);
  assert.doesNotMatch(text, /\/Users\//i);
});

test("preflights without writes, installs idempotently, creates launcher, and restores", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "qq2007-integration-"));
  const packageRoot = await stageInstaller(path.join(temp, "package"));
  const engine = path.join(temp, "engine");
  const desktop = path.join(temp, "Desktop");
  const app = path.join(temp, "Codex.app");
  await mkdir(path.join(engine, "assets"), { recursive: true });
  await mkdir(path.join(engine, "scripts"), { recursive: true });
  await writeFile(path.join(engine, "assets/renderer-inject.js"), rendererFixture);
  await writeFile(path.join(engine, "assets/dream-skin.css"), ".base{}\n");
  for (const script of ["switch-theme-macos.sh", "start-dream-skin-macos.sh"]) {
    await writeFile(path.join(engine, "scripts", script), "#!/bin/zsh\nexit 0\n", { mode: 0o755 });
  }
  const install = path.join(packageRoot, "安装 QQ2007 皮肤.command");
  const env = { ...process.env, DREAM_SKIN_ROOT: engine, CODEX_APP_PATH: app, DESKTOP_DIR: desktop, ALLOW_NON_MACOS_FOR_TESTS: "1" };

  await assert.rejects(execFileAsync("/bin/zsh", [install], { env }), /未找到 Codex/);
  await assert.rejects(access(path.join(engine, "themes/retro-qq-2007")));
  await mkdir(app);
  await execFileAsync("/bin/zsh", [install], { env });
  const rendererPath = path.join(engine, "assets/renderer-inject.js");
  const cssPath = path.join(engine, "assets/dream-skin.css");
  const installedRenderer = await readFile(rendererPath);
  const installedCss = await readFile(cssPath);
  await execFileAsync("/bin/zsh", [install], { env });
  assert.deepEqual(await readFile(rendererPath), installedRenderer);
  assert.deepEqual(await readFile(cssPath), installedCss);
  assert.match(await readFile(path.join(desktop, "Codex QQ2007.command"), "utf8"), /start-dream-skin-macos\.sh/);

  await execFileAsync("/bin/zsh", [path.join(packageRoot, "恢复原始皮肤.command")], { env });
  assert.equal(await readFile(rendererPath, "utf8"), rendererFixture);
  assert.equal(await readFile(cssPath, "utf8"), ".base{}\n");
  await access(path.join(engine, "themes/retro-qq-2007/theme.json"));
});
