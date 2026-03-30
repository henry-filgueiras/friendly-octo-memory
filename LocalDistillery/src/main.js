import { analyzeText, buildDefaultToggles, buildJsonExport, buildMarkdownExport, getSectionConfig } from "./analyzer.js";
import { demoText } from "./demoText.js";
import { clearState, loadState, saveState } from "./storage.js";

const MODES = ["Notes", "Meeting", "Research", "Logs", "Spec"];
const STRENGTHS = ["light", "medium", "aggressive"];

const state = {
  text: "",
  mode: "Notes",
  strength: "medium",
  inputMeta: {
    name: "",
    size: 0,
    characters: 0,
  },
  toggles: buildDefaultToggles(),
  analysis: null,
};

const sourceText = document.querySelector("#source-text");
const modeSelect = document.querySelector("#mode-select");
const strengthSelect = document.querySelector("#strength-select");
const sectionToggles = document.querySelector("#section-toggles");
const resultsList = document.querySelector("#results-list");
const metadataStrip = document.querySelector("#input-metadata");
const emptyState = document.querySelector("#empty-state");
const fileInput = document.querySelector("#file-input");
const dropzone = document.querySelector("#dropzone");
const loadDemoButton = document.querySelector("#load-demo-button");
const clearButton = document.querySelector("#clear-button");
const exportMdButton = document.querySelector("#export-md-button");
const exportJsonButton = document.querySelector("#export-json-button");
const sectionTemplate = document.querySelector("#result-section-template");

bootstrap();

function bootstrap() {
  hydrateControls();
  restoreSavedState();
  bindEvents();
  runAnalysis();
}

function hydrateControls() {
  for (const mode of MODES) {
    modeSelect.append(new Option(mode, mode));
  }

  for (const strength of STRENGTHS) {
    strengthSelect.append(new Option(titleCase(strength), strength));
  }

  renderSectionToggles();
}

function restoreSavedState() {
  const saved = loadState();
  if (!saved) {
    syncFormToState();
    return;
  }

  state.text = saved.text || "";
  state.mode = saved.mode || state.mode;
  state.strength = saved.strength || state.strength;
  state.inputMeta = saved.inputMeta || state.inputMeta;
  state.toggles = { ...state.toggles, ...(saved.toggles || {}) };
  syncFormToState();
  renderSectionToggles();
}

function bindEvents() {
  sourceText.addEventListener("input", () => {
    updateInput({
      text: sourceText.value,
      inputMeta: {
        ...state.inputMeta,
        name: state.inputMeta.name || "Pasted text",
        size: estimateByteSize(sourceText.value),
        characters: sourceText.value.length,
      },
    });
  });

  sourceText.addEventListener("paste", () => {
    window.requestAnimationFrame(() => {
      updateInput({
        text: sourceText.value,
        inputMeta: {
          name: "Pasted text",
          size: estimateByteSize(sourceText.value),
          characters: sourceText.value.length,
        },
      });
    });
  });

  modeSelect.addEventListener("change", () => {
    state.mode = modeSelect.value;
    persistAndRender();
  });

  strengthSelect.addEventListener("change", () => {
    state.strength = strengthSelect.value;
    persistAndRender();
  });

  sectionToggles.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    state.toggles[target.name] = target.checked;
    persistAndRender(false);
  });

  fileInput.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (file) await loadFile(file);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("active");
    });
  });

  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, () => {
      dropzone.classList.remove("active");
    });
  });

  dropzone.addEventListener("drop", async (event) => {
    event.preventDefault();
    const [file] = event.dataTransfer?.files || [];
    if (file) await loadFile(file);
  });

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });

  loadDemoButton.addEventListener("click", () => {
    updateInput({
      text: demoText,
      inputMeta: {
        name: "Demo sample",
        size: estimateByteSize(demoText),
        characters: demoText.length,
      },
    });
  });

  clearButton.addEventListener("click", () => {
    state.text = "";
    state.analysis = null;
    state.inputMeta = { name: "", size: 0, characters: 0 };
    clearState();
    syncFormToState();
    render();
  });

  exportMdButton.addEventListener("click", () => {
    if (!state.analysis) return;
    const markdown = buildMarkdownExport({
      inputMeta: state.inputMeta,
      mode: state.mode,
      strength: state.strength,
      sections: state.analysis.sections,
      toggles: state.toggles,
    });
    downloadFile("local-distillery-export.md", "text/markdown", markdown);
  });

  exportJsonButton.addEventListener("click", () => {
    if (!state.analysis) return;
    const json = buildJsonExport({
      inputMeta: state.inputMeta,
      mode: state.mode,
      strength: state.strength,
      sections: state.analysis.sections,
      toggles: state.toggles,
      stats: state.analysis.stats,
    });
    downloadFile("local-distillery-export.json", "application/json", json);
  });

  resultsList.addEventListener("click", async (event) => {
    const button = event.target.closest(".copy-button");
    if (!button) return;
    const sectionId = button.dataset.sectionId;
    const section = state.analysis?.sections[sectionId];
    if (section == null) return;
    const value = Array.isArray(section) ? section.join("\n") : section;
    const copied = await copyText(value);
    button.textContent = copied ? "Copied" : "Select manually";
    window.setTimeout(() => {
      button.textContent = "Copy";
    }, 1200);
  });
}

async function loadFile(file) {
  if (!/\.(txt|md|json|jsonl)$/i.test(file.name)) {
    window.alert("Unsupported file type. Please use .txt, .md, .json, or .jsonl.");
    return;
  }

  const text = await file.text();
  updateInput({
    text,
    inputMeta: {
      name: file.name,
      size: file.size,
      characters: text.length,
    },
  });
}

function updateInput({ text, inputMeta }) {
  state.text = text;
  state.inputMeta = {
    name: inputMeta.name || "Pasted text",
    size: inputMeta.size || estimateByteSize(text),
    characters: inputMeta.characters || text.length,
  };
  sourceText.value = text;
  persistAndRender();
}

function persistAndRender(runAnalyzer = true) {
  if (runAnalyzer) {
    runAnalysis();
  } else {
    persistState();
    render();
  }
}

function runAnalysis() {
  const trimmed = state.text.trim();
  state.analysis = trimmed ? analyzeText(trimmed, state.mode, state.strength) : null;
  persistState();
  render();
}

function persistState() {
  saveState({
    text: state.text,
    mode: state.mode,
    strength: state.strength,
    inputMeta: state.inputMeta,
    toggles: state.toggles,
  });
}

function render() {
  renderMetadata();
  renderEmptyState();
  renderResults();
}

function renderSectionToggles() {
  sectionToggles.innerHTML = "";
  for (const section of getSectionConfig()) {
    const label = document.createElement("label");
    label.className = "toggle-chip";
    label.innerHTML = `
      <input type="checkbox" name="${section.id}" ${state.toggles[section.id] ? "checked" : ""} />
      <span>${section.label}</span>
    `;
    sectionToggles.append(label);
  }
}

function renderMetadata() {
  metadataStrip.innerHTML = "";
  const pills = [];

  if (state.inputMeta.name) {
    pills.push(`File: ${state.inputMeta.name}`);
  }

  if (state.inputMeta.size) {
    pills.push(`Size: ${formatBytes(state.inputMeta.size)}`);
  }

  if (state.text.length) {
    pills.push(`Characters: ${state.text.length.toLocaleString()}`);
  }

  pills.push(`Mode: ${state.mode}`);

  for (const value of pills) {
    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = value;
    metadataStrip.append(pill);
  }
}

function renderEmptyState() {
  emptyState.classList.toggle("hidden", state.text.trim().length > 0);
}

function renderResults() {
  resultsList.innerHTML = "";

  if (!state.analysis) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder-card";
    placeholder.innerHTML = `
      <div>
        <h3>No distillation yet</h3>
        <p>Paste text or drop a local file to generate summaries, actions, motifs, and concept lists.</p>
      </div>
    `;
    resultsList.append(placeholder);
    return;
  }

  for (const section of getSectionConfig()) {
    if (!state.toggles[section.id]) continue;

    const node = sectionTemplate.content.firstElementChild.cloneNode(true);
    const data = state.analysis.sections[section.id];
    node.querySelector(".result-kicker").textContent = section.kicker;
    node.querySelector("h3").textContent = section.label;
    const copyButton = node.querySelector(".copy-button");
    copyButton.dataset.sectionId = section.id;
    node.querySelector(".result-body").append(renderSectionValue(data));
    resultsList.append(node);
  }
}

function renderSectionValue(value) {
  if (Array.isArray(value)) {
    const list = document.createElement("ul");
    const safeValues = value.length > 0 ? value : ["None detected"];
    for (const item of safeValues) {
      const li = document.createElement("li");
      li.textContent = item;
      list.append(li);
    }
    return list;
  }

  const pre = document.createElement("pre");
  pre.textContent = value || "None detected";
  return pre;
}

function syncFormToState() {
  sourceText.value = state.text;
  modeSelect.value = state.mode;
  strengthSelect.value = state.strength;
}

function downloadFile(filename, mimeType, contents) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function estimateByteSize(text) {
  return new Blob([text]).size;
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function copyText(value) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const helper = document.createElement("textarea");
  helper.value = value;
  helper.setAttribute("readonly", "");
  helper.style.position = "absolute";
  helper.style.left = "-9999px";
  document.body.append(helper);
  helper.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  helper.remove();
  return copied;
}
