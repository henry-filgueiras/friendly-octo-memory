import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "/private/tmp/tradeoff-lens-storyboard-tools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const appUrl = "http://127.0.0.1:5173/";
const outputDir = "/Users/henry/friendly-octo-memory/TradeoffLens/storyboard/raw";

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function clickByText(page, selector, text) {
  const clicked = await page.evaluate(
    ({ selector, text }) => {
      const candidates = Array.from(document.querySelectorAll(selector));
      const target = candidates.find((node) =>
        node.textContent?.replace(/\s+/g, " ").trim().includes(text)
      );

      if (!target) {
        return false;
      }

      target.click();
      return true;
    },
    { selector, text }
  );

  if (!clicked) {
    throw new Error(`Could not find ${selector} with text "${text}"`);
  }
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function capture(page, filename) {
  await page.screenshot({
    path: path.join(outputDir, filename),
    fullPage: true,
  });
}

async function run() {
  await ensureDir(outputDir);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    defaultViewport: {
      width: 1600,
      height: 1180,
      deviceScaleFactor: 1,
    },
    args: ["--no-sandbox"],
  });

  const page = await browser.newPage();
  await page.goto(appUrl, { waitUntil: "networkidle0" });
  await page.waitForSelector("h1");
  await clickByText(page, "button", "Choosing a car");
  await wait(300);
  await capture(page, "01-demo-overview.png");

  await clickByText(page, "button", "Tesla Model 3");
  await wait(250);
  await capture(page, "02-candidate-explanation.png");

  await clickByText(page, "button", "Pairwise");
  await wait(250);
  await capture(page, "03-pairwise.png");

  await clickByText(page, "button", "Pareto frontier");
  await wait(250);
  await capture(page, "04-pareto-frontier.png");

  await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll(".slider-row"));
    const target = labels.find((node) =>
      node.textContent?.includes("Purchase price")
    );

    if (!target) {
      return false;
    }

    const slider = target.querySelector("input[type='range']");

    if (!(slider instanceof HTMLInputElement)) {
      return false;
    }

    slider.value = "60";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  });
  await wait(250);
  await capture(page, "05-sensitivity.png");

  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
