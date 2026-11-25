// npm install playwright-core in a separate QA environment, then point NODE_PATH to it.
const { chromium } = require("playwright-core");
const { spawn } = require("node:child_process");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const assert = require("node:assert/strict");
async function run() {
  const dir = mkdtempSync(join(tmpdir(), "balltime-ui-"));
  const port = 18765,
    url = "http://127.0.0.1:" + port;
  const proc = spawn(
    process.env.BALLTIME_PYTHON || "python",
    ["-m", "uvicorn", "backend.app.main:app", "--port", String(port)],
    { env: { ...process.env, BALLTIME_DATA: dir }, stdio: "ignore" },
  );
  let browser;
  try {
    let online = false;
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(url + "/matches")).ok) {
          online = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    assert(online, "Test server must start");
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu"],
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
    });
    const errors = [],
      external = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (!r.url().startsWith(url) && !r.url().startsWith("data:"))
        external.push(r.url());
    });
    await page.goto(url);
    await page
      .getByRole("heading", { name: "Practice court · Demo" })
      .waitFor();
    await page.getByRole("button", { name: "Play clip at 0:01" }).click();
    await page.getByRole("heading", { name: "Rally 2", exact: true }).waitFor();
    await page.locator("video").evaluate((v) => v.play());
    await page.waitForFunction(
      () => document.querySelector("video")?.currentTime > 0.1,
    );
    await page.locator("video").evaluate((v) => v.pause());
    await page.getByLabel("Show ball trail and player tracks").check();
    await page.locator("svg.overlay rect").first().waitFor();
    if (process.env.BALLTIME_SCREENSHOT)
      await page.screenshot({ path: process.env.BALLTIME_SCREENSHOT });
    await page.getByRole("button", { name: "Star clip" }).click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('button[aria-label="Star clip"]')
          .getAttribute("aria-pressed") === "true",
    );
    await page.getByRole("button", { name: "＋ New" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Back set");
    await page.getByLabel("Shortcut", { exact: true }).selectOption("9");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Back set 9" }).waitFor();
    await page.keyboard.press("9");
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (e) =>
          e.textContent.includes("Back set 9") &&
          e.getAttribute("aria-pressed") === "true",
      ),
    );
    await page.keyboard.press("Control+z");
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (e) =>
          e.textContent.includes("Back set 9") &&
          e.getAttribute("aria-pressed") === "false",
      ),
    );
    await page.keyboard.press("Control+Shift+z");
    await page
      .getByRole("button", { name: "Include Back set", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll(".film article").length === 1,
    );
    await page.getByRole("button", { name: "Clear all", exact: true }).click();
    await page
      .getByRole("checkbox", { name: "Select clip 1", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "Select clip 2", exact: true })
      .check();
    await page.locator(".bulk").getByRole("button", { name: "Export" }).click();
    await page.getByLabel("Format").selectOption("reel");
    await page.getByLabel("Extra seconds before").fill("2");
    await page.getByRole("button", { name: "Start export" }).click();
    await page.getByRole("link", { name: "Download export" }).waitFor();
    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
    await page.getByRole("dialog").waitFor();
    await page.getByLabel("Keyboard layout").selectOption("courtsense");
    await page.keyboard.press("Escape");
    await page.locator("h1").click();
    await page.keyboard.press("e");
    await page.getByRole("heading", { name: "Rally 3", exact: true }).waitFor();
    await page.keyboard.press("q");
    await page.getByRole("heading", { name: "Rally 2", exact: true }).waitFor();
    await page.getByLabel("Playing position").selectOption("Setter");
    await page.getByLabel("Contact", { exact: true }).selectOption("Set");
    await page.getByLabel("Set quality").selectOption("In rhythm");
    await page.getByLabel("Outcome", { exact: true }).selectOption("Kill");
    await page.getByLabel("Reviewed and confirmed").check();
    await page
      .getByRole("button", { name: "Save coaching", exact: true })
      .click();
    await page.getByRole("button", { name: "Kill · 1", exact: true }).waitFor();
    await page.getByRole("button", { name: "Kill · 1", exact: true }).click();
    await page
      .getByRole("button", { name: "Clear outcome evidence (1 clips)" })
      .click();
    await page
      .getByText("Games and YouTube bookmarks", { exact: true })
      .click();
    await page.getByLabel("Opponent / game name").fill("Integration pool");
    await page.getByRole("button", { name: "Add game", exact: true }).click();
    await page.waitForFunction(() =>
      [
        ...document.querySelectorAll('select[aria-label="Game filter"] option'),
      ].some((o) => o.textContent.includes("Integration pool")),
    );
    await page
      .getByText("Games and YouTube bookmarks", { exact: true })
      .click();
    await page
      .getByText("Import earlier CourtSense analysis", { exact: true })
      .click();
    const oldBackup = {
      version: 1,
      plays: [
        {
          id: "browser-legacy",
          mediaId: "demo-old",
          mediaName: "Practice court",
          start: 4,
          end: 5,
          position: "Setter",
          action: "Set",
          player: "Imported player",
          quality: "In rhythm",
          outcome: "Kill",
          notes: "Imported browser check",
        },
      ],
    };
    await page
      .getByLabel("CourtSense backup")
      .setInputFiles({
        name: "courtsense.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(oldBackup)),
      });
    await page.getByLabel("This recording is the selected match video").check();
    await page
      .getByRole("button", { name: "Import saved plays", exact: true })
      .click();
    await page.waitForFunction(() =>
      document.querySelector(".center").textContent.includes("11 of 11"),
    );
    await page
      .getByText("Import earlier CourtSense analysis", { exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(
      "Passed playback, star, custom hotkey, undo/redo, filtering, bulk export, shortcuts, mobile width and local-only HTTP requests.",
    );
  } finally {
    await browser?.close();
    proc.kill();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
