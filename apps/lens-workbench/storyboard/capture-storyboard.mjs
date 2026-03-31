import puppeteer from "/private/tmp/tradeoff-lens-storyboard-tools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outputDir = "/Users/henry/friendly-octo-memory/apps/lens-workbench/storyboard/raw";
const appUrl = "http://127.0.0.1:4174";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickButtonByText(page, label, occurrence = 0) {
  const clicked = await page.evaluate(
    (targetLabel, targetOccurrence) => {
      const elements = Array.from(document.querySelectorAll("button"));
      const matches = elements.filter((element) =>
        element.textContent?.trim().includes(targetLabel)
      );
      const match = matches[targetOccurrence];

      if (match instanceof HTMLElement) {
        match.scrollIntoView({ block: "center" });
        match.click();
        return true;
      }

      return false;
    },
    label,
    occurrence
  );

  if (!clicked) {
    throw new Error(`Button not found: ${label} [${occurrence}]`);
  }
}

await mkdir(outputDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  defaultViewport: { width: 1440, height: 2200, deviceScaleFactor: 1 },
});

try {
  const page = await browser.newPage();
  await page.goto(appUrl, { waitUntil: "networkidle0" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await delay(250);

  await page.screenshot({
    path: path.join(outputDir, "01-home.png"),
    fullPage: true,
  });

  await clickButtonByText(page, "Plan pressure to evidence seed");
  await delay(250);
  await page.screenshot({
    path: path.join(outputDir, "02-recipe.png"),
    fullPage: true,
  });

  await clickButtonByText(page, "Apply selected transform");
  await delay(250);
  await page.screenshot({
    path: path.join(outputDir, "03-derived.png"),
    fullPage: true,
  });

  await clickButtonByText(page, "Promote derived artifact to continue recipe");
  await delay(250);
  await clickButtonByText(page, "Fork from here", 1);
  await delay(250);
  await page.screenshot({
    path: path.join(outputDir, "04-fork.png"),
    fullPage: true,
  });
} finally {
  await browser.close();
}
