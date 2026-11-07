#!/usr/bin/env node
/**
 * Browser control for verify-rps. Invoked by ../bin/control-rps.
 * Speaks JSON on stdout for machine-readable results; human errors on stderr.
 *
 * Chrome is started once (`browser ensure`) and reused via CDP so in-memory
 * game state survives across click/snapshot commands.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.VERIFY_RPS_CHROME || '/usr/local/bin/google-chrome';

function statePath() {
  const runId = process.env.VERIFY_RPS_RUN_ID;
  if (!runId) throw new Error('VERIFY_RPS_RUN_ID is required');
  return path.join('/tmp', `verify-rps-${runId}`, 'state.json');
}

function loadState() {
  const p = statePath();
  if (!fs.existsSync(p)) throw new Error(`No launch state at ${p}. Run control-rps launch first.`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveState(state) {
  const p = statePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
}

function updateState(patch) {
  const state = { ...loadState(), ...patch };
  saveState(state);
  return state;
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

async function waitForPort(port, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    if (await portOpen(port)) return true;
    await sleep(100);
  }
  return false;
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

async function ensureBrowser() {
  let state = loadState();
  if (state.chromePid && pidAlive(state.chromePid) && state.cdpPort && (await portOpen(state.cdpPort))) {
    const browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${state.cdpPort}`,
      defaultViewport: null,
    });
    const pages = await browser.pages();
    let page = pages.find((p) => p.url().includes('index.html')) || pages[0];
    if (!page) page = await browser.newPage();
    if (!page.url().includes(state.url.replace(/\/$/, ''))) {
      await page.goto(state.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('#rock', { timeout: 15000 });
    }
    return { browser, page, state, connected: true };
  }

  // Pick a free CDP port
  const cdpPort = await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });

  const profile = state.chromeProfile;
  fs.mkdirSync(profile, { recursive: true });
  const chromeLog = path.join(path.dirname(statePath()), 'chrome.log');
  const out = fs.openSync(chromeLog, 'a');
  const child = spawn(
    CHROME,
    [
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      '--disable-gpu',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--window-size=1280,900',
      state.url,
    ],
    { stdio: ['ignore', out, out], detached: true }
  );
  child.unref();
  state = updateState({ chromePid: child.pid, cdpPort });

  if (!(await waitForPort(cdpPort, 100))) {
    throw new Error(`Chrome CDP port ${cdpPort} did not open. See ${chromeLog}`);
  }

  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${cdpPort}`,
    defaultViewport: null,
  });
  let page;
  for (let i = 0; i < 50; i++) {
    const pages = await browser.pages();
    page = pages.find((p) => p.url().includes('index.html')) || pages[0];
    if (page && page.url().includes('index.html')) break;
    await sleep(100);
  }
  if (!page) page = await browser.newPage();
  if (!page.url().includes('index.html')) {
    await page.goto(state.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await page.waitForSelector('#rock', { timeout: 30000 });
  return { browser, page, state, connected: true };
}

async function withPage(fn, { keepAlive = true } = {}) {
  const { browser, page } = await ensureBrowser();
  try {
    return await fn(page);
  } finally {
    // Disconnect without closing the browser so state persists.
    browser.disconnect();
    if (!keepAlive) {
      // reserved
    }
  }
}

async function readGame(page) {
  return {
    player: await page.$eval('#player-move', (el) => el.textContent),
    agent: await page.$eval('#agent-move', (el) => el.textContent),
    results: await page.$eval('#results', (el) => el.textContent),
    winRate: await page.$eval('#win-rate', (el) => el.textContent),
    themeLight: await page.evaluate(() => document.body.classList.contains('light-theme')),
    sound: await page.$eval('#sound-select', (el) => el.value),
    status: await page.$eval('#status', (el) => el.textContent),
    startGameLabel: await page.$eval('#start-game-btn', (el) => el.textContent),
    startGameDisabled: await page.$eval('#start-game-btn', (el) => el.disabled),
    visionDisplay: await page.$eval('#vision-column', (el) => getComputedStyle(el).display),
  };
}

async function cmdDoctor() {
  const state = loadState();
  const serverAlive = pidAlive(state.pid);
  const chromeAlive = state.chromePid ? pidAlive(state.chromePid) : null;
  let httpStatus = null;
  let titleOk = false;
  let scriptOk = false;
  let buttonsOk = false;
  try {
    const res = await fetch(state.url);
    httpStatus = res.status;
    const html = await res.text();
    titleOk = html.includes('<title>Rock Paper Scissors AI</title>');
    scriptOk = html.includes('rockpaperscissor.js');
    buttonsOk = html.includes('id="rock"') && html.includes('id="paper"') && html.includes('id="scissors"');
  } catch {
    httpStatus = 0;
  }
  const ok = serverAlive && httpStatus === 200 && titleOk && scriptOk && buttonsOk;
  const report = {
    ok,
    url: state.url,
    port: state.port,
    pid: state.pid,
    processAlive: serverAlive,
    chromePid: state.chromePid || null,
    chromeAlive,
    cdpPort: state.cdpPort || null,
    httpStatus,
    titleOk,
    scriptOk,
    buttonsOk,
    root: state.root,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!ok) process.exit(1);
}

async function cmdClick(args) {
  const id = args.id;
  const name = args.name;
  if (!id && !name) throw new Error('click requires --id <dom-id> or --name <button-text>');
  const result = await withPage(async (page) => {
    const before = await readGame(page);
    if (id) {
      await page.waitForSelector(`#${id}`, { timeout: 5000 });
      await page.click(`#${id}`);
    } else {
      await page.evaluate((buttonName) => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === buttonName);
        if (!btn) throw new Error(`No button named ${buttonName}`);
        btn.click();
      }, name);
    }
    await sleep(50);
    const after = await readGame(page);
    return { before, after };
  });
  console.log(JSON.stringify(result, null, 2));
}

async function cmdToggle(args) {
  const id = args.id || 'checkbox';
  const result = await withPage(async (page) => {
    await page.click(`#${id}`);
    await sleep(50);
    return {
      themeLight: await page.evaluate(() => document.body.classList.contains('light-theme')),
      checkboxChecked: await page.$eval('#checkbox', (el) => el.checked),
    };
  });
  console.log(JSON.stringify(result, null, 2));
}

async function cmdSelect(args) {
  const id = args.id || 'sound-select';
  const value = args.value;
  if (!value) throw new Error('select requires --value');
  const result = await withPage(async (page) => {
    await page.select(`#${id}`, value);
    await sleep(50);
    return {
      sound: await page.$eval('#sound-select', (el) => el.value),
      audioSrc: await page.$eval('#countdown-sound', (el) => el.getAttribute('src')),
    };
  });
  console.log(JSON.stringify(result, null, 2));
}

async function cmdKey(args) {
  const key = args.key;
  if (!key) throw new Error('key requires --key (e.g. Escape)');
  await withPage(async (page) => {
    await page.keyboard.press(key);
    await sleep(50);
  });
  console.log(JSON.stringify({ key }, null, 2));
}

async function cmdSnapshot(args) {
  const outPath = args.path;
  if (!outPath) throw new Error('snapshot requires --path');
  const result = await withPage(async (page) => {
    const snap = {
      title: await page.title(),
      h1: await page.$eval('h1', (el) => el.textContent.trim()),
      ...(await readGame(page)),
      buttons: await page.$$eval('#controls button', (els) =>
        els.map((e) => ({ id: e.id, text: e.textContent.trim() }))
      ),
      resetPresent: !!(await page.$('#reset-score-btn')),
    };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(snap, null, 2) + '\n');
    return { path: outPath, snap };
  });
  console.log(JSON.stringify(result, null, 2));
}

async function cmdScreenshot(args) {
  const outPath = args.path;
  if (!outPath) throw new Error('screenshot requires --path');
  await withPage(async (page) => {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath, fullPage: true });
  });
  console.log(JSON.stringify({ path: outPath }, null, 2));
}

async function cmdStopBrowser() {
  const state = loadState();
  if (state.chromePid && pidAlive(state.chromePid)) {
    try {
      process.kill(state.chromePid, 'SIGTERM');
    } catch {
      /* ignore */
    }
    for (let i = 0; i < 20; i++) {
      if (!pidAlive(state.chromePid)) break;
      await sleep(100);
    }
    if (pidAlive(state.chromePid)) {
      try {
        process.kill(state.chromePid, 'SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }
  updateState({ chromePid: null, cdpPort: null });
  console.log(JSON.stringify({ stopped: true }, null, 2));
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  switch (cmd) {
    case 'doctor':
      await cmdDoctor();
      break;
    case 'click':
      await cmdClick(args);
      break;
    case 'toggle':
      await cmdToggle(args);
      break;
    case 'select':
      await cmdSelect(args);
      break;
    case 'key':
      await cmdKey(args);
      break;
    case 'snapshot':
      await cmdSnapshot(args);
      break;
    case 'screenshot':
      await cmdScreenshot(args);
      break;
    case 'stop-browser':
      await cmdStopBrowser();
      break;
    case 'write-state': {
      const state = {
        pid: Number(args.pid),
        port: Number(args.port),
        url: args.url,
        root: args.root,
        chromeProfile: args['chrome-profile'],
        runId: process.env.VERIFY_RPS_RUN_ID,
        chromePid: null,
        cdpPort: null,
      };
      saveState(state);
      console.log(JSON.stringify(state, null, 2));
      break;
    }
    default:
      console.error(`Unknown control.mjs command: ${cmd}`);
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
