import puppeteer from "/private/tmp/tradeoff-lens-storyboard-tools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import path from "node:path";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sourcePath =
  "file:///Users/henry/friendly-octo-memory/LocalDistillery/storyboard/storyboard.html";
const outputPath =
  "/Users/henry/friendly-octo-memory/LocalDistillery/storyboard/local-distillery-storyboard.png";

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  defaultViewport: { width: 1820, height: 2300, deviceScaleFactor: 1 },
});

try {
  const page = await browser.newPage();
  await page.goto(sourcePath, { waitUntil: "networkidle0" });
  const pageRoot = await page.$(".page");

  if (!pageRoot) {
    throw new Error("Storyboard root element not found.");
  }

  await pageRoot.screenshot({
    path: path.resolve(outputPath),
  });
} finally {
  await browser.close();
}
