import puppeteer from "/private/tmp/tradeoff-lens-storyboard-tools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import path from "node:path";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sourcePath =
  "file:///Users/henry/friendly-octo-memory/apps/lens-workbench/storyboard/constellation-storyboard.html";
const outputPath =
  "/Users/henry/friendly-octo-memory/apps/lens-workbench/storyboard/workspace-constellation-storyboard.png";

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  defaultViewport: { width: 1680, height: 2080, deviceScaleFactor: 1 },
});

try {
  const page = await browser.newPage();
  await page.goto(sourcePath, { waitUntil: "networkidle0" });
  const main = await page.$("main");

  if (!main) {
    throw new Error("Storyboard main element not found.");
  }

  await main.screenshot({
    path: path.resolve(outputPath),
  });
} finally {
  await browser.close();
}
