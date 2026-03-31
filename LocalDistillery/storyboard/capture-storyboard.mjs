import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "/private/tmp/tradeoff-lens-storyboard-tools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const appUrl = "http://127.0.0.1:4173/";
const outputDir = "/Users/henry/friendly-octo-memory/LocalDistillery/storyboard/raw";
const demoText = `# Local Distillery Demo

Date: 2026-03-30
Attendees: Maya, Theo, Priya

We need the local-only promise to be obvious in the first few seconds. The tool should turn messy notes into a one-line summary, a short digest, action items, open questions, motifs, and a concept graph without sending data anywhere.

Action items:
- Tighten the demo so the artifact feels useful immediately.
- Keep the heuristics deterministic and explainable.
- Make export paths obvious for markdown and JSON.

Open questions:
- How compact should the summary be for long research notes?
- Should repeated headings count as motifs?

Repeated themes:
local-only processing
deterministic heuristics
compact artifact
local-only processing
`;

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
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
      height: 1300,
      deviceScaleFactor: 1,
    },
    args: ["--no-sandbox"],
  });

  const page = await browser.newPage();
  await page.goto(appUrl, { waitUntil: "networkidle0" });
  await page.waitForSelector("h1");
  await capture(page, "01-empty-start.png");

  await page.evaluate((text) => {
    const textarea = document.querySelector("#source-text");
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Missing source textarea");
    }

    textarea.value = text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }, demoText);
  await page.waitForFunction(
    () => document.querySelectorAll(".result-card").length >= 4,
    { timeout: 4000 }
  );
  await capture(page, "02-demo-overview.png");

  await page.evaluate(() => {
    const actionsCard = Array.from(document.querySelectorAll(".result-card")).find((card) =>
      card.textContent?.includes("Action items")
    );
    actionsCard?.scrollIntoView({ behavior: "instant", block: "center" });
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  await capture(page, "03-artifact-sections.png");

  await page.evaluate(() => {
    const graphCard = Array.from(document.querySelectorAll(".result-card")).find((card) =>
      card.textContent?.includes("Concept graph")
    );
    graphCard?.scrollIntoView({ behavior: "instant", block: "center" });
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  await capture(page, "04-concept-graph.png");

  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
