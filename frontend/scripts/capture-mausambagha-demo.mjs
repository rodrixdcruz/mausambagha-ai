// One-shot capture script: COMPLETE judge demo of MausamBagha AI (WeatherGPT).
// Records EVERY user-facing feature, in tour order, against the LIVE site:
//   1. login + judge role                6. 7-day forecast
//   2. dashboard: weather card           7. shelter map + list + walking directions
//   3. explainable risk cards            8. SOS emergency modal (opened + closed)
//   4. overall risk gauge                9. judge console: ALL 5 scenarios + live restore
//   5. grounded AI chat + 3D presenter
// The auto-opening feature tour is DISMISSED before capture (per request).
//
// Capture architecture: page.screenshot() intermittently/then-constantly stalls
// in headless Chrome on this machine, so frames come from the CDP *screencast*
// stream instead — Chrome PUSHES a frame on every repaint (the 3D presenter
// animates constantly, so frames flow). Encoding walks wall-clock 0.5 s
// buckets and repeats the newest frame in each, giving TRUE real-time
// playback with zero coverage gaps. Hard gates abort rather than encode a
// broken step. JUSER/JPASS via environment — never printed, never stored.
// Output: docs/demo/mausambagha-demo.mp4 (1280x800, silent).
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
const BUCKET_MS = 500                       // output granularity: 2 fps real-time

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--lang=en-US', '--window-size=1280,800'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })

// ── CDP screencast: frames arrive pushed, never pulled ────────────────────
// The 3D presenter animates constantly (~20 fps), so keep only the newest
// frame per BUCKET_MS — full time coverage at bounded memory (≤ ~2 fps).
const cdp = await page.createCDPSession()
const cast = []                              // { at, png } — one per bucket
let lastKeptAt = 0
let decoding = Promise.resolve()
await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: 1280, maxHeight: 800 })
cdp.on('Page.screencastFrame', (f) => {
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  const at = Date.now()
  const b64 = f.data
  // Decode off the event path; ordering is preserved by chaining.
  decoding = decoding.then(async () => {
    try {
      const png = PNG.sync.read(Buffer.from(b64, 'base64'))
      if (cast.length === 0 || at - lastKeptAt >= BUCKET_MS) {
        cast.push({ at, png })
        lastKeptAt = at
      } else {
        cast[cast.length - 1] = { at: cast[cast.length - 1].at, png }  // newest in bucket
      }
    } catch { /* undecodable frame — skip */ }
  })
})

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
const abort = async (code, msg) => {
  console.error(msg)
  await browser.close()
  process.exit(code)
}

// ── 1. Login page + judge sign-in ──────────────────────────────────────────
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 90000 })
await sleep(5000)                                     // branded login page
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
if (!onDashboard) await abort(2, 'LOGIN FAILED — abort')

// The judge session auto-fires the guided feature tour — dismiss it so the
// dashboard is captured unobstructed (replayable in-app via the ✨ button).
if (await page.evaluate(() => !!document.querySelector('[role="dialog"]'))) {
  await page.keyboard.press('Escape')
  await sleep(1200)
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /skip|close|✕|×/i.test(b.innerText) || /close|skip/i.test(b.getAttribute('aria-label') || ''))
    if (btn) btn.click()
  })
  await sleep(1500)
}
if (await page.evaluate(() => !!document.querySelector('[role="dialog"]')))
  await abort(5, 'FEATURE TOUR WOULD NOT DISMISS — abort')

// ── 2–9. Every feature, in tour order ─────────────────────────────────────
for (const id of ['weather', 'risk-cards', 'risk-gauge']) {
  const ok = await tourEl(id)
  if (!ok) console.error(`feature section missing: ${id}`)
  await sleep(4500)
}
// 5. AI chat: ask a real question, let the grounded answer + 3D presenter show
await tourEl('chat')
await sleep(2000)
const chatInput = await page.$('[data-tour="chat"] input')
if (chatInput) {
  await chatInput.type('What should I do today?', { delay: 40 })
  await page.keyboard.press('Enter')
  await sleep(12000)                                  // answer streams in
} else console.error('chat input not found')
// 6. Forecast
await tourEl('forecast'); await sleep(4500)
// 7. Shelter map + list + walking directions
await tourEl('shelter-map'); await sleep(4500)
await tourEl('shelter-list'); await sleep(2500)
const dirsClicked = await clickText('directions') || await clickText('route')
await sleep(9000)
if (dirsClicked) { await page.keyboard.press('Escape'); await sleep(1500) }
// 8. SOS modal
await tourEl('sos')
await clickText('sos')
await sleep(4500)
await page.keyboard.press('Escape')
await sleep(2000)

// 9. Judge console: ALL five scenarios, each visibly reacting, then live restore
const opened = await clickText('judge panel') || await clickText('🧑')
const panelVisible = await page.evaluate(() => !!document.querySelector('[role="dialog"]'))
if (!opened || !panelVisible) await abort(3, 'JUDGE PANEL FAILED — abort')
await sleep(3000)
for (const [label, dwell] of [
  ['heavy rainfall', 8000], ['heatwave', 8000], ['thunderstorm', 8000],
  ['flood risk', 11000],    // longest: the emergency cascade fires
  ['smog', 8000],
]) {
  await clickText(label)
  await sleep(dwell)
}
await clickText('live data')                          // snap back to real observations
await sleep(5000)
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    /close|✕|×/i.test(b.innerText) || /close/i.test(b.getAttribute('aria-label') || ''))
  if (btn) btn.click()
})
await sleep(4000)                                     // closing shot: clean live dashboard

await cdp.send('Page.stopScreencast')
await decoding                                        // finish pending decodes

// ── Encode: wall-clock buckets → true real-time playback ──────────────────
if (cast.length < 60) {
  console.error(`TOO FEW CAST FRAMES (${cast.length}) — recording is broken; no output written`)
  await browser.close()
  process.exit(4)
}
const t0 = cast[0].at
const tEnd = cast[cast.length - 1].at
const W = 1280
const H = cast[0].png.height
const enc = await hamPkg.createH264MP4Encoder()
enc.width = W
enc.height = H
enc.frameRate = 1000 / BUCKET_MS
enc.quantizationParameter = 23
enc.initialize()

let fi = 0
const started = Date.now()
for (let bucket = t0; bucket <= tEnd; bucket += BUCKET_MS) {
  while (fi + 1 < cast.length && cast[fi + 1].at <= bucket) fi++
  enc.addFrameRgba(cast[fi].png.data)
}
await enc.finalize()
const data = enc.FS.readFile(enc.outputFilename)
const out = path.join(OUT, 'mausambagha-demo.mp4')
fs.writeFileSync(out, Buffer.from(data))
console.log(`MP4 written: ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB, ${cast.length} cast frames, ${Math.round((tEnd - t0) / 1000)}s real time, encoded in ${Math.round((Date.now() - started) / 1000)}s)`)
await browser.close()
