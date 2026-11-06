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

export function launchChromium(chromium, opts = {}) {
  const exe = opts.executablePath && fs.existsSync(opts.executablePath) ? opts.executablePath
    : fs.existsSync(LOCAL_CHROME) ? LOCAL_CHROME : opts.executablePath;
  return chromium.launch({ ...opts, executablePath: exe, args: gpuArgs(opts.args) });
}
