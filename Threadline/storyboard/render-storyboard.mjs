import puppeteer from "/private/tmp/tradeoff-lens-storyboard-tools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import path from "node:path";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sourcePath = "file:///Users/henry/friendly-octo-memory/Threadline/storyboard/storyboard.html";
const outputPath = "/Users/henry/friendly-octo-memory/Threadline/storyboard/threadline-storyboard.png";

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1548, height: 2220, deviceScaleFactor: 1 },
});

try {
  const page = await browser.newPage();
  await page.goto(sourcePath, { waitUntil: "networkidle0" });
  await page.screenshot({
    path: path.resolve(outputPath),
    fullPage: true,
  });
} finally {
  await browser.close();
}
