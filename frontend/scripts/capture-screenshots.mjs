// One-shot capture script for README screenshots. Drives system Chrome
// headless against the LIVE deployment (default) or a local dev server
// (set BASE). Authenticates as the judge account using JPASS from the
// environment — the rotated public-site password is never hardcoded or
// printed. Captures: login, dashboard, in-app shelter routing, and the
// judge demo console with an active scenario, saving into docs/screenshots/.
// puppeteer-core is installed --no-save, so this leaves no dependency
// footprint in package.json.
//
// Usage (from frontend/):  JPASS=<rotated judge password> node scripts/capture-screenshots.mjs
// Local dev alternative:   BASE=http://localhost:5173 JPASS=judge123 node scripts/capture-screenshots.mjs
import puppeteer from 'puppeteer-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.BASE || 'https://weathergpt-web.onrender.com'
const JPASS = process.env.JPASS || 'judge123'
const OUT = '../docs/screenshots'
const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// React controlled inputs need the native setter + input event.
const typeInto = (page, selector, value) =>
  page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel)
      if (!el) return false
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    },
    selector,
    value,
  )

const clickButtonByText = (page, matcher) =>
  page.evaluate((m) => {
    const btns = [...document.querySelectorAll('button')]
    const b =
      typeof m === 'string'
        ? btns.find((x) => x.textContent.trim().toLowerCase().includes(m))
        : btns.find((x) => m.test(x.textContent.trim()))
    if (b) {
      b.click()
      return true
    }
    return false
  }, matcher)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
})

try {
  const page = await browser.newPage()
  await page.setViewport(VIEWPORT)

  // ---- 1. Login screen (pristine, before typing) ----
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(2500) // fonts + animated weather backdrop settle
  await page.screenshot({ path: `${OUT}/login.png` })
  console.log('captured login.png')

  // ---- Log in as judge (role card + rotated password via env) ----
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 20000 })
  await typeInto(page, 'input[autocomplete="username"]', 'judge')
  await typeInto(page, 'input[type="password"]', JPASS)
  await page.evaluate(() => {
    const judge = [...document.querySelectorAll('button[role="radio"]')].find((b) =>
      /judge/i.test(b.textContent),
    )
    if (judge) judge.click()
  })
  await sleep(300)
  await clickButtonByText(page, 'sign in')
  // Login may take a while on a cold free-tier backend; wait for the map.
  await page.waitForSelector('.leaflet-container', { timeout: 90000 })
  // Judge sign-in auto-opens the guided tour (it mounts a beat later, after
  // first data); wait for it, then dismiss with Escape so the hero shot
  // shows the app itself, not the spotlight overlay.
  await page
    .waitForFunction(() => document.body.innerText.includes('FEATURE 1/'), { timeout: 20000 })
    .catch(() => {})
  await page.keyboard.press('Escape')
  await page
    .waitForFunction(() => !document.body.innerText.includes('FEATURE 1/'), { timeout: 8000 })
    .catch(() => {})
  await sleep(4000) // weather, forecast, 3D avatar and map tiles settle

  // ---- 2. Dashboard with weather + risk + 3D avatar ----
  await page.screenshot({ path: `${OUT}/dashboard.png` })
  console.log('captured dashboard.png')

  // ---- 3. Map routing: click the first shelter's in-app Directions ----
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const d = btns.find((b) => b.textContent.includes('Directions'))
    d?.scrollIntoView({ block: 'center' })
    return !!d
  })
  await sleep(600)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    btns.find((b) => b.textContent.includes('Directions'))?.click()
  })
  // wait for the OSRM route panel to appear with distance/ETA text
  await page.waitForFunction(() => document.body.innerText.includes('km ·'), { timeout: 45000 })
  await sleep(2500) // flyToBounds animation finishes
  await page.screenshot({ path: `${OUT}/map-routing.png` })
  console.log('captured map-routing.png')

  // ---- 4. Judge demo console with an active scenario ----
  // Open the console from the top bar, pick Heavy Rainfall, wait for the
  // SIMULATED banner + ESTIMATE labels to appear, then shoot.
  await clickButtonByText(page, 'demo')
  await page.waitForFunction(
    () => !!document.querySelector('aside') && document.body.innerText.includes('Judge demo console'),
    { timeout: 15000 },
  )
  // Click the Heavy rainfall card scoped to the console, then require its
  // ACTIVE badge — the console's static disclaimer already contains the
  // word SIMULATED, so that string alone proves nothing.
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('aside button')].find((b) =>
      b.textContent.includes('Heavy rainfall'),
    )
    if (card) card.click()
  })
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('aside button')].some(
        (b) => b.textContent.includes('Heavy rainfall') && /active/i.test(b.textContent),
      ),
    { timeout: 45000 },
  )
  await sleep(4000) // app refetches under the bent scenario; cards relabel ESTIMATE
  await page.screenshot({ path: `${OUT}/judge-demo-console.png` })
  console.log('captured judge-demo-console.png')
} finally {
  await browser.close()
}
