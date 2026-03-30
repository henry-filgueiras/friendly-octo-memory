import puppeteer from "/private/tmp/tradeoff-lens-storyboard-tools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outputDir = "/Users/henry/friendly-octo-memory/Threadline/storyboard/raw";

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

await mkdir(outputDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1440, height: 1800, deviceScaleFactor: 1 },
});

try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5174", { waitUntil: "networkidle0" });
  await page.screenshot({
    path: path.join(outputDir, "01-home.png"),
    fullPage: true,
  });

  await clickButtonByText(page, "Launch a private beta");
  await delay(300);
  await page.screenshot({
    path: path.join(outputDir, "02-timeline.png"),
    fullPage: true,
  });

  await clickButtonByText(page, "Diagnostics");
  await delay(250);
  await page.screenshot({
    path: path.join(outputDir, "03-diagnostics.png"),
    fullPage: true,
  });

  await clickButtonByText(page, "Dependencies");
  await delay(250);
  await page.screenshot({
    path: path.join(outputDir, "04-dependencies.png"),
    fullPage: true,
  });

  await clickButtonByText(page, "Scenarios");
  await delay(250);
  await page.screenshot({
    path: path.join(outputDir, "05-scenarios.png"),
    fullPage: true,
  });
} finally {
  await browser.close();
}
