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

async function clickLastButtonByText(page, label) {
  const clicked = await page.evaluate((targetLabel) => {
    const matches = Array.from(document.querySelectorAll("button")).filter((element) =>
      element.textContent?.trim().includes(targetLabel)
    );
    const match = matches[matches.length - 1];

    if (match instanceof HTMLElement) {
      match.scrollIntoView({ block: "center" });
      match.click();
      return true;
    }

    return false;
  }, label);

  if (!clicked) {
    throw new Error(`Button not found: ${label} [last]`);
  }
}

async function screenshotSelector(page, selector, filename) {
  const element = await page.$(selector);

  if (!element) {
    throw new Error(`Element not found for selector: ${selector}`);
  }

  await element.screenshot({
    path: path.join(outputDir, filename),
  });
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
  page.on("dialog", async (dialog) => {
    await dialog.accept("Pressure checkpoint");
  });

  await page.goto(appUrl, { waitUntil: "networkidle0" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await delay(250);

  await clickButtonByText(page, "Plan pressure to evidence seed");
  await delay(200);
  await clickButtonByText(page, "Apply selected transform");
  await delay(200);
  await clickButtonByText(page, "Promote derived artifact to continue recipe");
  await delay(250);
  await clickLastButtonByText(page, "Fork from here");
  await delay(250);
  await clickButtonByText(page, "Transform applied");
  await delay(200);
  await clickButtonByText(page, "Mark checkpoint");
  await delay(200);
  await clickButtonByText(page, "Add to observed path");
  await delay(250);

  await screenshotSelector(
    page,
    ".workbench-dashboard__column--projection .lens-panel",
    "07-atlas-panel.png"
  );
  await screenshotSelector(page, ".atlas-detail-card", "08-atlas-detail.png");
  await screenshotSelector(page, ".projection-section", "09-atlas-transcript.png");
} finally {
  await browser.close();
}
