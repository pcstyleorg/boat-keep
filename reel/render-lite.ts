// Low-resource renderer for a scene.html that exposes window.seek(t) and window.ready.
//
//   bun render-lite.ts <scene.html> <out.mp4> [--fps 60] [--seconds 15]
//   bun render-lite.ts <scene.html> --stills 0.5 3.2 ...      → stills/t<time>.png beside the scene
//
// Runs at background priority (macOS efficiency cores), one render at a time across all scenes,
// with JPEG frames and the hardware H.264 encoder.
import { chromium } from "playwright-core";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

if (process.platform === "darwin" && !process.env.RENDER_LITE_BG) {
  const r = spawnSync("taskpolicy", ["-b", process.execPath, ...process.argv.slice(1)], {
    stdio: "inherit", env: { ...process.env, RENDER_LITE_BG: "1" },
  });
  process.exit(r.status ?? 1);
}

const args = process.argv.slice(2);
const flag = (name: string, dflt: string) => { const i = args.indexOf(name); return i < 0 ? dflt : args[i + 1]; };
const scene = resolve(args[0] ?? "");
const stillsAt = args.includes("--stills") ? args.slice(args.indexOf("--stills") + 1).map(Number) : null;
const out = stillsAt ? "" : resolve(args[1] ?? "");
const fps = +flag("--fps", "60"), seconds = +flag("--seconds", "15");
if (!args[0] || (!stillsAt && (!args[1] || args[1].startsWith("--")))) {
  console.error(readFileSync(import.meta.path, "utf8").split("\n").slice(2, 7).join("\n").replace(/^\/\/ ?/gm, ""));
  process.exit(2);
}

// One render at a time, across every scene.
const lock = `${import.meta.dir}/.render-lock`;
for (let waited = 0; ; waited++) {
  try { mkdirSync(lock); writeFileSync(`${lock}/pid`, `${process.pid}`); break; } catch {}
  let pid = 0; try { pid = +readFileSync(`${lock}/pid`, "utf8"); } catch {}
  let alive = false; try { if (pid) { process.kill(pid, 0); alive = true; } } catch {}
  if (!alive && waited > 1) { rmSync(lock, { recursive: true, force: true }); continue; }
  if (waited === 0) console.error(`waiting for another render (pid ${pid})`);
  await Bun.sleep(2000);
}
const unlock = () => rmSync(lock, { recursive: true, force: true });
process.on("exit", unlock);
for (const s of ["SIGINT", "SIGTERM"] as const) process.on(s, () => process.exit(130));

const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: exe, args: ["--disable-gpu-vsync", "--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`file://${scene}`, { waitUntil: "networkidle" });
await page.evaluate(() => (window as any).ready);
const cdp = await page.context().newCDPSession(page);
const seek = (t: number) => page.evaluate((t) => (window as any).seek(t), t);
const grab = async (format: "png" | "jpeg") =>
  Buffer.from((await cdp.send("Page.captureScreenshot", { format, quality: format === "jpeg" ? 92 : undefined, optimizeForSpeed: true })).data, "base64");

if (stillsAt) {
  const dir = `${dirname(scene)}/stills`;
  mkdirSync(dir, { recursive: true });
  for (const t of stillsAt) { await seek(t); await Bun.write(`${dir}/t${t}.png`, await grab("png")); }
  console.error(`${stillsAt.length} stills in ${dir}`);
} else {
  const total = Math.round(fps * seconds), t0 = Date.now();
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", `${fps}`, "-c:v", "mjpeg", "-i", "-",
    "-vf", "scale=in_range=pc:out_range=tv,format=yuv420p", "-color_range", "tv",
    "-c:v", "h264_videotoolbox", "-b:v", "16M", "-tag:v", "avc1", "-movflags", "+faststart", out],
    { stdio: ["pipe", "inherit", "inherit"] });
  for (let i = 0; i < total; i++) {
    await seek(i / fps);
    if (!ff.stdin.write(await grab("jpeg"))) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % (fps * 2) === 0) console.error(`frame ${i}/${total}`);
  }
  ff.stdin.end();
  const code = await new Promise((r) => ff.on("close", r));
  console.error(code === 0 ? `${out}: ${total} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s` : `ffmpeg failed (${code})`);
}
await browser.close();
