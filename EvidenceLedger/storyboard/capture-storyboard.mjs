import puppeteer from "/private/tmp/tradeoff-lens-storyboard-tools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outputDir = "/Users/henry/friendly-octo-memory/EvidenceLedger/storyboard/raw";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickButtonByText(page, label) {
  await page.evaluate((targetLabel) => {
    const elements = Array.from(document.querySelectorAll("button"));
    const match = elements.find((element) =>
      element.textContent?.trim().includes(targetLabel)
    );

    if (match instanceof HTMLElement) {
      match.click();
    }
  }, label);
}

async function captureAnalysisPane(page, filename) {
  const panel = await page.$(".panel--analysis");

  if (!panel) {
    throw new Error("Could not find analysis panel for storyboard capture.");
  }

  const box = await panel.boundingBox();

  if (!box) {
    throw new Error("Could not read analysis panel bounds for storyboard capture.");
  }

  await page.screenshot({
    path: path.join(outputDir, filename),
    clip: {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    },
  });
}

await mkdir(outputDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1540, height: 1120, deviceScaleFactor: 1 },
});

try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5175", { waitUntil: "networkidle0" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });

  await clickButtonByText(page, "Incident review");
  await delay(300);
  await captureAnalysisPane(page, "01-claims.png");

  await clickButtonByText(page, "Contested");
  await delay(250);
  await captureAnalysisPane(page, "02-contested.png");

  await clickButtonByText(page, "Gaps");
  await delay(250);
  await captureAnalysisPane(page, "03-gaps.png");

  await clickButtonByText(page, "Matrix");
  await delay(250);
  await captureAnalysisPane(page, "04-matrix.png");
} finally {
  await browser.close();
}
