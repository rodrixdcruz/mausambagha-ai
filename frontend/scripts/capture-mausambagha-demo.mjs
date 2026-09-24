// One-shot capture script: judge-ready MP4 demo of MausamBagha AI (WeatherGPT).
// Drives system Chrome headless against the LIVE deployment, signs in with the
// judge account (JUSER/JPASS passed via environment — never printed, never
// written to disk), and records the full feature tour at 10 fps:
//   login page → sign-in as judge → dashboard (live weather + risk) →
//   judge demo console → scenario cascade (heavy rain → flood → heatwave)
//   → dashboard visibly reacting → shelter directions (walking mode).
// Frames are encoded H.264 MP4 in-process via h264-mp4-encoder (no ffmpeg).
// Output: docs/demo/mausambagha-demo.mp4 (~1280x800, silent).
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import hamPkg from 'h264-mp4-encoder'
import { PNG } from 'pngjs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'https://mausambagha-web.onrender.com'
const OUT = path.resolve('../docs/demo')
fs.mkdirSync(OUT, { recursive: true })

const USER = process.env.JUSER || 'judge'
const PASS = process.env.JPASS
if (!PASS) { console.error('JPASS not set — aborting'); process.exit(1) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const FPS = 5                                       // 5 fps: lighter capture load
const FRAME_MS = 1000 / FPS

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--lang=en-US', '--window-size=1280,800'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })

const frames = []
let captureFailures = 0
let recording = true
async function snap() {
  const buf = await page.screenshot({ type: 'png' })
  frames.push(PNG.sync.read(buf))   // keep RGBA pixels for the encoder
}
;(async () => {
  while (recording) {
    const t0 = Date.now()
    try {
      await snap()
    } catch (e) {
      captureFailures++
      if (captureFailures <= 3) console.error('snap failed:', String(e.message).slice(0, 80))
    }
    const wait = FRAME_MS - (Date.now() - t0)
    if (wait > 0) await sleep(wait)
  }
})()

const click = (txt) => page.evaluate((t) => {
  const el = [...document.querySelectorAll('button, [role="radio"], a')]
    .find((b) => b.innerText.trim().toLowerCase().includes(t.toLowerCase()))
  if (el) { el.click(); return true } return false
}, txt)

// ── 1. Login page + judge sign-in (~12 s) ──────────────────────────────────
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 90000 })   // SPA: login is on /
await sleep(5000)                                   // show the branded login page
await page.type('input[autocomplete="username"]', USER, { delay: 60 })
await page.type('input[type="password"]', PASS, { delay: 40 })
await click('judge')                                 // role card (text contains "judge")
await sleep(1500)
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')]
    .find((b) => /sign in|login/i.test(b.innerText))
  if (btn) btn.click()
})
await sleep(7000)                                    // auth + dashboard load

// Hard gate: never encode a video of a failed login.
const onDashboard = await page.evaluate(() =>
  !document.querySelector('input[type="password"]') && document.body.innerText.length > 200)
if (!onDashboard) {
  console.error('LOGIN DID NOT COMPLETE — aborting instead of encoding a broken video')
  await browser.close()
  process.exit(2)
}

// ── 2. Dashboard — live weather, risk, 3D avatar (~8 s) ────────────────────
await sleep(8000)

// ── 3. Judge demo console + scenario cascade (~40 s) ───────────────────────
const opened = await click('judge panel') || await click('🧑')   // open console
const panelVisible = await page.evaluate(() => !!document.querySelector('[role="dialog"]'))
if (!opened || !panelVisible) {
  console.error('JUDGE PANEL DID NOT OPEN — aborting')
  await browser.close()
  process.exit(3)
}
await sleep(3000)
await click('heavy rainfall'); await sleep(9000)     // dashboard reacts
await click('flood risk');     await sleep(9000)
await click('heatwave');       await sleep(9000)
// close the panel so the reacting dashboard is visible
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    /close|✕|×/i.test(b.innerText) || /close/i.test(b.getAttribute('aria-label') || ''))
  if (btn) btn.click()
})
await sleep(6000)

// ── 4. Normal scenario restore + shelter directions (~15 s) ────────────────
await click('judge panel') || await click('🧑')
await sleep(2000)
await click('normal'); await sleep(3000)
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    /close|✕|×/i.test(b.innerText) || /close/i.test(b.getAttribute('aria-label') || ''))
  if (btn) btn.click()
})
await sleep(2000)
await click('directions') || await click('shelter')  // walking-mode directions
await sleep(8000)

recording = false
await sleep(500)

// ── Encode MP4 (H.264, 10 fps, silent) ─────────────────────────────────────
const enc = await hamPkg.createH264MP4Encoder()
enc.width = 1280
enc.height = 800
enc.frameRate = FPS
enc.quantizationParameter = 23
enc.initialize()
for (const f of frames) enc.addFrameRgba(f.data)
await enc.finalize()
const data = enc.FS.readFile(enc.outputFilename)
const out = path.join(OUT, 'mausambagha-demo.mp4')
fs.writeFileSync(out, Buffer.from(data))
console.log(`MP4 written: ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB, ${frames.length} frames, ${captureFailures} capture failures)`)
if (frames.length < 50) {
  console.error('TOO FEW FRAMES — recording is broken; deleting output')
  fs.rmSync(out)
  process.exit(4)
}
await browser.close()
