// Shared Chromium launch for the .tools scripts (fork, 2026-11-06). Every script renders WebGL on the real GPU:
// without these args headless Chromium falls back to SwiftShader (CPU), which held a renderer at ~145% CPU and
// 2.5-4 GB on the shared server. Any --use-angle= the caller passes is replaced. A Windows Chrome/Edge path that
// doesn't exist here (the upstream scripts' default) falls back to Playwright's Linux Chromium.
// Still run one browser at a time, through ~/.local/bin/lowpri: the 6 GB card is shared.
import fs from 'node:fs';
import os from 'node:os';

export const GPU_ARGS = ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'];
export const LOCAL_CHROME = `${os.homedir()}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;

export function gpuArgs(args = []) {
  return [...GPU_ARGS, ...args.filter(a => !/^--use-angle=/.test(a) && !GPU_ARGS.includes(a))];
}

// The WebGL renderer a fresh page gets, e.g. "ANGLE (NVIDIA, Vulkan 1.3.277 (... GTX 1660 Ti ...))".
export async function webglRenderer(browser) {
  const ctx = await browser.newContext(), page = await ctx.newPage();
  try {
    return await page.evaluate(() => { const c = document.createElement('canvas'), g = c.getContext('webgl2') || c.getContext('webgl');
      if (!g) return 'no WebGL'; const e = g.getExtension('WEBGL_debug_renderer_info'); return String(g.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : g.RENDERER)); });
  } finally { await ctx.close(); }
}

// Launches, prints the renderer, and refuses to run on a software renderer (SwiftShader / llvmpipe / no WebGL):
// KINO_ALLOW_SOFTWARE_GL=1 turns that into a warning.
export async function launchChromium(chromium, opts = {}) {
  const exe = opts.executablePath && fs.existsSync(opts.executablePath) ? opts.executablePath
    : fs.existsSync(LOCAL_CHROME) ? LOCAL_CHROME : opts.executablePath;
  const browser = await chromium.launch({ ...opts, executablePath: exe, args: gpuArgs(opts.args) });
  let gl;
  try { gl = await webglRenderer(browser); } catch (e) { gl = 'check failed: ' + e.message; }
  console.log(`[browser] WebGL renderer: ${gl}`);
  if (!/NVIDIA/i.test(gl)) {
    const msg = `[browser] NOT ON THE GPU (${gl}): WebGL would render on the CPU and load the shared server`;
    if (process.env.KINO_ALLOW_SOFTWARE_GL === '1') console.warn(msg + ' (KINO_ALLOW_SOFTWARE_GL=1, continuing)');
    else { await browser.close(); throw new Error(msg + '. Set KINO_ALLOW_SOFTWARE_GL=1 to run anyway.'); }
  }
  return browser;
}
