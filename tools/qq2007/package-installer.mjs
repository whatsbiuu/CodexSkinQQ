import { chmod, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const themeSource = path.join(repoRoot, "themes/retro-qq-2007");
const assetSource = path.join(here, "installer-assets");

const themeFiles = [
  "background.jpg", "profile-avatar.png", "profile-codex.png", "profile-penguin.png",
  "qq2007-chrome.html", "qq2007-extension.css", "theme.json",
];

export async function stageInstaller(outputRoot) {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(path.join(outputRoot, "theme"), { recursive: true });
  await mkdir(path.join(outputRoot, "tools"), { recursive: true });
  for (const file of themeFiles) await cp(path.join(themeSource, file), path.join(outputRoot, "theme", file));
  await cp(path.join(here, "install-extension.mjs"), path.join(outputRoot, "tools/install-extension.mjs"));
  for (const file of ["README.md", "安装 QQ2007 皮肤.command", "恢复原始皮肤.command"]) {
    await cp(path.join(assetSource, file), path.join(outputRoot, file));
  }
  await chmod(path.join(outputRoot, "安装 QQ2007 皮肤.command"), 0o755);
  await chmod(path.join(outputRoot, "恢复原始皮肤.command"), 0o755);
  return outputRoot;
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

export async function buildInstallerZip(output = path.join(repoRoot, "dist/Codex-QQ2007-Skin-macOS.zip")) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "qq2007-release-"));
  const folder = path.join(temporary, "Codex-QQ2007-Skin-macOS");
  await stageInstaller(folder);
  await mkdir(path.dirname(output), { recursive: true });
  await rm(output, { force: true });
  await run("/usr/bin/zip", ["-X", "-q", "-r", output, path.basename(folder)], temporary);
  await rm(temporary, { recursive: true, force: true });
  return output;
}

if (path.resolve(process.argv[1] || "") === path.resolve(fileURLToPath(import.meta.url))) {
  buildInstallerZip().then((output) => console.log(output)).catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
