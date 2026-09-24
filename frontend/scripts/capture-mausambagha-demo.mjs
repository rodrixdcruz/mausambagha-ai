// One-shot capture script: COMPLETE judge demo of MausamBagha AI (WeatherGPT).
// Records EVERY user-facing feature, in tour order, against the LIVE site:
//   1. login + judge role                7. shelter map + list + walking directions
//   2. dashboard: weather card           8. SOS emergency modal (opened + closed)
//   3. explainable risk cards            9. feature tour (✨, 3 steps)
//   4. overall risk gauge               10. judge console: ALL 5 scenarios + live restore
//   5. grounded AI chat + 3D presenter
//   6. 7-day forecast
// Hard gates abort rather than encode a broken step. JUSER/JPASS via env.
// Output: docs/demo/mausambagha-demo.mp4 (1280x800, 5 fps, silent).
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
const FPS = 5
const FRAME_MS = 1000 / FPS

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--lang=en-US', '--window-size=1280,800'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })

const frames = []   // { png, at } — timestamps make playback true real-time
let captureFailures = 0
let recording = true
async function snap() {
  const buf = await page.screenshot({ type: 'png' })
  frames.push({ png: PNG.sync.read(buf), at: Date.now() })
}
;(async () => {
  while (recording) {
    const t0 = Date.now()
    try { await snap() } catch (e) {
      captureFailures++
      if (captureFailures <= 3) console.error('snap failed:', String(e.message).slice(0, 80))
    }
    const wait = FRAME_MS - (Date.now() - t0)
    if (wait > 0) await sleep(wait)
  }
})()

const clickText = (txt) => page.evaluate((t) => {
  const el = [...document.querySelectorAll('button, [role="radio"], [role="tab"], a')]
    .find((b) => b.innerText.trim().toLowerCase().includes(t.toLowerCase()))
  if (el) { el.click(); return true }
  return false
}, txt)
const tourEl = (id) => page.evaluate((tid) => {
  const el = document.querySelector(`[data-tour="${tid}"]`)
  if (el) el.scrollIntoView({ block: 'center' })
  return !!el
}, id)

// ── 1. Login page + judge sign-in ──────────────────────────────────────────
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 90000 })
await sleep(5000)
await page.type('input[autocomplete="username"]', USER, { delay: 60 })
await page.type('input[type="password"]', PASS, { delay: 40 })
await clickText('judge')
await sleep(1500)
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => /sign in|login/i.test(b.innerText))
  if (btn) btn.click()
})
await sleep(8000)
const onDashboard = await page.evaluate(() =>
  !document.querySelector('input[type="password"]') && document.body.innerText.length > 200)
if (!onDashboard) { console.error('LOGIN FAILED — abort'); recording = false; await sleep(400); await browser.close(); process.exit(2) }

// ── 2–6. Every dashboard feature, tour order ──────────────────────────────
for (const [id, dwell] of [['weather', 5000], ['risk-cards', 5000], ['risk-gauge', 5000]]) {
  const ok = await tourEl(id)
  if (!ok) console.error(`feature section missing: ${id}`)
  await sleep(dwell)
}
// 5. AI chat: ask a real question, let the grounded answer + 3D presenter show
await tourEl('chat')
await sleep(2000)
const chatInput = await page.$('[data-tour="chat"] input')
if (chatInput) {
  await chatInput.type('What should I do today?', { delay: 40 })
  await page.keyboard.press('Enter')
  await sleep(12000)                                 // answer streams in
} else console.error('chat input not found')
// 6. Forecast
await tourEl('forecast'); await sleep(5000)
// 7. Shelter map + list + walking directions
await tourEl('shelter-map'); await sleep(5000)
await tourEl('shelter-list'); await sleep(3000)
const dirsClicked = await clickText('directions')
if (!dirsClicked) await clickText('route')
await sleep(9000)
await page.keyboard.press('Escape')
await sleep(1500)
// 8. SOS modal
await tourEl('sos')
await clickText('sos')
await sleep(5000)
await page.keyboard.press('Escape')
await sleep(2000)

// 9. Feature tour: open via ✨ and advance 3 steps
await clickText('feature tour') || await clickText('✨')
await sleep(4000)
for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await sleep(4000) }
await page.keyboard.press('Escape')
await sleep(2000)

// 10. Judge console: ALL five scenarios, each visibly reacting, then live restore
const opened = await clickText('judge panel') || await clickText('🧑')
const panelVisible = await page.evaluate(() => !!document.querySelector('[role="dialog"]'))
if (!opened || !panelVisible) { console.error('JUDGE PANEL FAILED — abort'); recording = false; await sleep(400); await browser.close(); process.exit(3) }
await sleep(3000)
for (const [label, dwell] of [
  ['heavy rainfall', 9000], ['heatwave', 9000], ['thunderstorm', 9000],
  ['flood risk', 12000],    // longest: the emergency cascade fires
  ['smog', 9000],
]) {
  await clickText(label)
  await sleep(dwell)
}
await clickText('live data')                          // snap back to real observations
await sleep(6000)
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    /close|✕|×/i.test(b.innerText) || /close/i.test(b.getAttribute('aria-label') || ''))
  if (btn) btn.click()
})
await sleep(5000)                                     // closing shot: clean live dashboard

recording = false
await sleep(500)

// ── Encode ─────────────────────────────────────────────────────────────────
// Real-time pacing: captures may lag the target fps (screenshot latency),
// so derive the actual rate from timestamps instead of assuming FPS.
const wallS = frames.length > 1 ? (frames[frames.length - 1].at - frames[0].at) / 1000 : 1
const actualFps = Math.min(10, Math.max(1, frames.length / Math.max(wallS, 1)))
const enc = await hamPkg.createH264MP4Encoder()
enc.width = 1280
enc.height = 800
enc.frameRate = Math.round(actualFps * 1000) / 1000
enc.quantizationParameter = 23
enc.initialize()
for (const f of frames) enc.addFrameRgba(f.png.data)
await enc.finalize()
const data = enc.FS.readFile(enc.outputFilename)
const out = path.join(OUT, 'mausambagha-demo.mp4')
fs.writeFileSync(out, Buffer.from(data))
console.log(`MP4 written: ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB, ${frames.length} frames @ ${actualFps.toFixed(2)} fps = ${Math.round(wallS)}s real time, ${captureFailures} capture failures)`)
if (frames.length < 200) {
  console.error('TOO FEW FRAMES — recording is broken; deleting output')
  fs.rmSync(out)
  process.exit(4)
}
await browser.close()
