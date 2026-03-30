(function () {
  const DEFAULT_STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for", "from",
    "had", "has", "have", "he", "her", "his", "i", "if", "in", "into", "is", "it",
    "its", "itself", "more", "no", "not", "of", "on", "or", "our", "she", "should",
    "so", "than", "that", "the", "their", "them", "there", "they", "this", "to", "too",
    "up", "us", "was", "we", "were", "what", "when", "where", "which", "who", "will",
    "with", "you", "your",
  ]);

  const SECTION_CONFIG = [
    { id: "summary", label: "One-line summary", kicker: "Synopsis" },
    { id: "digest", label: "Short bullet digest", kicker: "Digest" },
    { id: "actions", label: "Action items", kicker: "Follow-up" },
    { id: "questions", label: "Open questions", kicker: "Unknowns" },
    { id: "motifs", label: "Repeated terms / motifs", kicker: "Patterns" },
    { id: "entities", label: "Concept / entity list", kicker: "Concepts" },
    { id: "graph", label: "Concept graph", kicker: "Topology" },
  ];

  const MODE_HINTS = {
    Notes: ["note", "idea", "summary", "follow-up", "next step"],
    Meeting: ["decision", "owner", "timeline", "follow-up", "risk"],
    Research: ["finding", "evidence", "question", "hypothesis", "theme"],
    Logs: ["error", "warning", "timestamp", "repeated event", "anomaly"],
    Spec: ["requirement", "constraint", "decision", "scope", "interface"],
  };

  const STRENGTH_PROFILES = {
    light: { digestCount: 5, motifCount: 8, entityCount: 12, phraseSize: 2 },
    medium: { digestCount: 4, motifCount: 6, entityCount: 10, phraseSize: 3 },
    aggressive: { digestCount: 3, motifCount: 5, entityCount: 8, phraseSize: 3 },
  };

  const STORAGE_KEY = "local-distillery-state-v2";
  const MODES = ["Notes", "Meeting", "Research", "Logs", "Spec"];
  const STRENGTHS = ["light", "medium", "aggressive"];
  const demoText = `# Product Sync - Local Distillery

Date: 2026-03-22
Attendees: Maya, Theo, Priya, Jordan

We agreed the browser-only requirement is non-negotiable. The offline promise needs to be explicit in the UI, in the README, and in the export metadata. Priya noted that users are going to paste long research notes, sprint writeups, and log snippets, so speed matters more than trying to be clever.

Action items:
- Jordan to add a visible "no network required" badge in the shell.
- Maya to tighten the demo content so first-run users immediately understand the product.
- Priya to define a plugin-style analyzer interface after v1 lands.

Open questions:
- Should we treat repeated headings as motifs or structure?
- How should the tool rank log lines with timestamps versus error lines?
- Do we want a future diff mode that compares two local files side by side?

Decisions:
- Keep v1 deterministic and local only.
- Avoid AI APIs, embeddings, auth, or analytics.
- Support text, markdown, JSON, and JSONL in the first release.

Notes:
The spec keeps returning to a few themes: local-only processing, information distillation, deterministic heuristics, fast feedback, and compact console-style UI. Theo repeated that "meeting notes become artifacts" should feel obvious after ten seconds. Priya repeated that the heuristics should stay explainable. Maya wants the digest to emphasize outcomes, decisions, and follow-up work rather than generic summaries.

TODO check whether checkbox lines like [ ] ship glossary mode after launch should be extracted.
[ ] Add a glossary stretch goal if the rest of the experience stays clean.
[ ] Review export shape for markdown and JSON parity.

The research backlog mentions timeline extraction, glossary generation, JSONL field inspection, and a future semantic analyzer running via WASM. Another note asks whether entity extraction should include products, teams, dates, and environments.

Why does the current draft bury the strongest promise halfway down the page?
What is the minimum useful summary when a user drops 8,000 lines of logs?

Repeated phrases:
local-only processing
deterministic heuristics
fast feedback
plugin-style analyzer
local-only processing`;

  const state = {
    text: "",
    mode: "Notes",
    strength: "medium",
    autoDistill: true,
    dirty: false,
    inputMeta: { name: "", size: 0, characters: 0 },
    toggles: Object.fromEntries(SECTION_CONFIG.map(function (section) { return [section.id, true]; })),
    analysis: null,
  };

  const sourceText = document.querySelector("#source-text");
  const modeSelect = document.querySelector("#mode-select");
  const strengthSelect = document.querySelector("#strength-select");
  const autoDistillToggle = document.querySelector("#auto-distill-toggle");
  const sectionToggles = document.querySelector("#section-toggles");
  const resultsList = document.querySelector("#results-list");
  const metadataStrip = document.querySelector("#input-metadata");
  const sourceState = document.querySelector("#source-state");
  const emptyState = document.querySelector("#empty-state");
  const fileInput = document.querySelector("#file-input");
  const chooseFileButton = document.querySelector("#choose-file-button");
  const fileStatus = document.querySelector("#file-status");
  const dropzone = document.querySelector("#dropzone");
  const loadDemoButton = document.querySelector("#load-demo-button");
  const clearButton = document.querySelector("#clear-button");
  const exportMdButton = document.querySelector("#export-md-button");
  const exportJsonButton = document.querySelector("#export-json-button");
  const sectionTemplate = document.querySelector("#result-section-template");
  const distillButton = document.querySelector("#distill-button");
  const inputStatus = document.querySelector("#input-status");
  const outputStatus = document.querySelector("#output-status");

  bootstrap();

  function bootstrap() {
    hydrateControls();
    restoreSavedState();
    bindEvents();
    syncFormToState();
    if (state.text.trim()) {
      runAnalysis();
    } else {
      render();
      setInputStatus("Paste text or choose a local file. Auto-distill is on by default, or you can click Distill now.");
    }
  }

  function hydrateControls() {
    modeSelect.innerHTML = "";
    strengthSelect.innerHTML = "";
    MODES.forEach(function (mode) { modeSelect.append(new Option(mode, mode)); });
    STRENGTHS.forEach(function (strength) { strengthSelect.append(new Option(titleCase(strength), strength)); });
    renderSectionToggles();
  }

  function restoreSavedState() {
    const saved = loadState();
    if (!saved) return;
    state.text = saved.text || "";
    state.mode = saved.mode || state.mode;
    state.strength = saved.strength || state.strength;
    state.autoDistill = typeof saved.autoDistill === "boolean" ? saved.autoDistill : state.autoDistill;
    state.inputMeta = saved.inputMeta || state.inputMeta;
    state.toggles = { ...state.toggles, ...(saved.toggles || {}) };
  }

  function bindEvents() {
    sourceText.addEventListener("input", function () {
      setEditorText(sourceText.value, {
        name: state.inputMeta.name || "Pasted text",
        size: estimateByteSize(sourceText.value),
        characters: sourceText.value.length,
      }, "editor");
    });

    sourceText.addEventListener("keydown", function (event) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        runAnalysis();
        setInputStatus("Distilled current editor contents via keyboard shortcut.");
      }
    });

    modeSelect.addEventListener("change", function () {
      state.mode = modeSelect.value;
      state.text.trim() ? runAnalysis() : persistStateAndRender();
    });

    strengthSelect.addEventListener("change", function () {
      state.strength = strengthSelect.value;
      state.text.trim() ? runAnalysis() : persistStateAndRender();
    });

    autoDistillToggle.addEventListener("change", function () {
      state.autoDistill = autoDistillToggle.checked;
      if (state.autoDistill && state.dirty && state.text.trim()) {
        runAnalysis();
        setInputStatus("Auto-distill turned on. Refreshed the artifact from the current editor contents.");
        return;
      }
      persistStateAndRender();
      setInputStatus(state.autoDistill
        ? "Auto-distill is on. Edits refresh the artifact immediately."
        : "Auto-distill is off. Edit freely, then click Distill now when ready.");
    });

    sectionToggles.addEventListener("change", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      state.toggles[target.name] = target.checked;
      persistStateAndRender();
    });

    fileInput.addEventListener("change", async function (event) {
      const files = event.target.files || [];
      if (files[0]) await loadFile(files[0]);
      fileInput.value = "";
    });

    ["dragenter", "dragover"].forEach(function (eventName) {
      dropzone.addEventListener(eventName, function (event) {
        event.preventDefault();
        dropzone.classList.add("active");
      });
    });

    ["dragleave", "dragend", "drop"].forEach(function (eventName) {
      dropzone.addEventListener(eventName, function () {
        dropzone.classList.remove("active");
      });
    });

    dropzone.addEventListener("drop", async function (event) {
      event.preventDefault();
      const files = (event.dataTransfer && event.dataTransfer.files) || [];
      if (files[0]) await loadFile(files[0]);
    });

    chooseFileButton.addEventListener("click", function () {
      openFilePicker();
    });

    dropzone.addEventListener("click", function (event) {
      if (event.target.closest("#choose-file-button")) return;
      openFilePicker();
    });

    dropzone.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openFilePicker();
      }
    });

    loadDemoButton.addEventListener("click", loadDemo);
    emptyState.addEventListener("click", loadDemo);

    distillButton.addEventListener("click", function () {
      runAnalysis();
      setInputStatus("Distilled current editor contents.");
    });

    clearButton.addEventListener("click", function () {
      state.text = "";
      state.analysis = null;
      state.dirty = false;
      state.inputMeta = { name: "", size: 0, characters: 0 };
      clearState();
      syncFormToState();
      render();
      setFileStatus("No file selected yet.");
      setInputStatus("Cleared the editor. Paste text, drop a file, or load the demo to start again.");
    });

    exportMdButton.addEventListener("click", function () {
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

    exportJsonButton.addEventListener("click", function () {
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

    resultsList.addEventListener("click", async function (event) {
      const button = event.target.closest(".copy-button");
      if (!button) return;
      const sectionId = button.dataset.sectionId;
      const section = state.analysis && state.analysis.sections[sectionId];
      if (section == null) return;
      const value = Array.isArray(section) ? section.join("\n") : section;
      const copied = await copyText(value);
      button.textContent = copied ? "Copied" : "Select manually";
      window.setTimeout(function () { button.textContent = "Copy"; }, 1200);
    });
  }

  async function loadFile(file) {
    if (!isAcceptedFile(file)) {
      window.alert("Unsupported file type. Please use a local text-like file such as .txt, .md, .json, .jsonl, .log, or .js.");
      return;
    }

    const text = await file.text();
    setFileStatus('Loaded "' + file.name + '" (' + formatBytes(file.size) + ').');
    setEditorText(text, {
      name: file.name,
      size: file.size,
      characters: text.length,
    }, "file");
  }

  function loadDemo() {
    setFileStatus("Using bundled demo text.");
    setEditorText(demoText, {
      name: "Demo sample",
      size: estimateByteSize(demoText),
      characters: demoText.length,
    }, "demo");
  }

  function setEditorText(text, inputMeta, sourceKind) {
    state.text = text;
    state.inputMeta = {
      name: inputMeta.name || "Pasted text",
      size: inputMeta.size || estimateByteSize(text),
      characters: inputMeta.characters || text.length,
    };
    sourceText.value = text;

    if (!text.trim()) {
      state.analysis = null;
      state.dirty = false;
      persistStateAndRender();
      setInputStatus("Editor is empty. Paste text, drop a file, or load the demo.");
      return;
    }

    if (state.autoDistill || sourceKind === "file" || sourceKind === "demo") {
      runAnalysis();
      if (sourceKind === "file") {
        setInputStatus('Loaded "' + state.inputMeta.name + '" into the editor and distilled it.');
      } else if (sourceKind === "demo") {
        setInputStatus("Loaded demo text into the editor and distilled it.");
      } else {
        setInputStatus("Editor updated and distilled automatically.");
      }
      return;
    }

    state.dirty = true;
    persistStateAndRender();
    setInputStatus("Editor updated. Click Distill now to refresh the artifact.");
  }

  function runAnalysis() {
    const trimmed = state.text.trim();
    state.analysis = trimmed ? analyzeText(trimmed, state.mode, state.strength) : null;
    state.dirty = false;
    persistStateAndRender();
  }

  function persistStateAndRender() {
    persistState();
    render();
  }

  function persistState() {
    saveState({
      text: state.text,
      mode: state.mode,
      strength: state.strength,
      autoDistill: state.autoDistill,
      inputMeta: state.inputMeta,
      toggles: state.toggles,
    });
  }

  function render() {
    syncFormToState();
    renderMetadata();
    renderSourceState();
    renderEmptyState();
    renderOutputStatus();
    renderResults();
  }

  function renderSectionToggles() {
    sectionToggles.innerHTML = "";
    SECTION_CONFIG.forEach(function (section) {
      const label = document.createElement("label");
      label.className = "toggle-chip";
      label.innerHTML = '<input type="checkbox" name="' + section.id + '"' + (state.toggles[section.id] ? " checked" : "") + ' /><span>' + section.label + '</span>';
      sectionToggles.append(label);
    });
  }

  function renderMetadata() {
    metadataStrip.innerHTML = "";
    const pills = [];
    if (state.inputMeta.name) pills.push("Source: " + state.inputMeta.name);
    if (state.inputMeta.size) pills.push("Size: " + formatBytes(state.inputMeta.size));
    if (state.text.length) pills.push("Characters: " + state.text.length.toLocaleString());
    pills.push("Mode: " + state.mode);
    pills.push("Compression: " + titleCase(state.strength));
    pills.forEach(function (value) {
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.textContent = value;
      metadataStrip.append(pill);
    });
  }

  function renderSourceState() {
    sourceState.innerHTML = "";
    const chips = [];
    chips.push(state.autoDistill ? "Live distillation on" : "Live distillation off");
    if (state.inputMeta.name) chips.push(state.inputMeta.name);
    if (state.dirty) chips.push("Pending refresh");
    chips.forEach(function (value) {
      const chip = document.createElement("span");
      chip.className = "source-chip";
      chip.textContent = value;
      sourceState.append(chip);
    });
  }

  function renderEmptyState() {
    emptyState.classList.toggle("hidden", state.text.trim().length > 0);
  }

  function renderOutputStatus() {
    if (!state.text.trim()) {
      outputStatus.textContent = "Waiting for source material. Load the demo to preview the full artifact.";
      return;
    }

    if (!state.analysis) {
      outputStatus.textContent = state.dirty
        ? "Editor changed. Distill when you are ready."
        : "No distilled artifact yet.";
      return;
    }

    const enabledCount = SECTION_CONFIG.filter(function (section) { return state.toggles[section.id]; }).length;
    outputStatus.textContent =
      "Distilled " +
      state.analysis.stats.words.toLocaleString() +
      " words into " +
      enabledCount +
      " visible sections." +
      (state.dirty ? " Editor changes are pending." : "");
  }

  function renderResults() {
    resultsList.innerHTML = "";
    if (!state.analysis) {
      const placeholder = document.createElement("div");
      placeholder.className = "placeholder-card";
      placeholder.innerHTML = state.text.trim()
        ? "<div><h3>Ready to distill</h3><p>Your source is loaded. Use auto-distill or click Distill now to generate the artifact.</p></div>"
        : "<div><h3>No distillation yet</h3><p>Paste text, drop a local file, or load the demo to generate summaries, actions, motifs, and concept lists.</p></div>";
      resultsList.append(placeholder);
      return;
    }

    SECTION_CONFIG.forEach(function (section) {
      if (!state.toggles[section.id]) return;
      const node = sectionTemplate.content.firstElementChild.cloneNode(true);
      const data = state.analysis.sections[section.id];
      node.querySelector(".result-kicker").textContent = section.kicker;
      node.querySelector("h3").textContent = section.label;
      node.querySelector(".copy-button").dataset.sectionId = section.id;
      node.querySelector(".result-body").append(renderSectionValue(data));
      resultsList.append(node);
    });
  }

  function renderSectionValue(value) {
    if (Array.isArray(value)) {
      const list = document.createElement("ul");
      (value.length ? value : ["None detected"]).forEach(function (item) {
        const li = document.createElement("li");
        li.append(renderMarkdownFragment(item));
        list.append(li);
      });
      return list;
    }

    if (value && value.type === "graph") {
      return renderConceptGraph(value);
    }

    const container = document.createElement("div");
    container.className = "markdown-fragment";
    container.append(renderMarkdownFragment(value || "None detected"));
    return container;
  }

  function renderConceptGraph(graph) {
    const container = document.createElement("div");
    container.className = "graph-panel";

    if (!graph.nodes.length) {
      container.append(renderMarkdownFragment("No graphable concepts detected."));
      return container;
    }

    const meta = document.createElement("p");
    meta.className = "graph-meta";
    meta.textContent = "Co-occurrence graph from nearby concepts. Mermaid source is included below.";
    container.append(meta);

    container.append(buildGraphSvg(graph));

    const details = document.createElement("details");
    details.className = "graph-source";
    const summary = document.createElement("summary");
    summary.textContent = "Mermaid source";
    details.append(summary);
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = graph.mermaid;
    pre.append(code);
    details.append(pre);
    container.append(details);

    return container;
  }

  function buildGraphSvg(graph) {
    const width = 560;
    const height = 320;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("class", "graph-svg");

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.34;
    const positions = {};

    graph.nodes.forEach(function (node, index) {
      const angle = (Math.PI * 2 * index) / Math.max(graph.nodes.length, 1) - Math.PI / 2;
      positions[node.id] = {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      };
    });

    graph.edges.forEach(function (edge) {
      const source = positions[edge.source];
      const target = positions[edge.target];
      if (!source || !target) return;
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", source.x);
      line.setAttribute("y1", source.y);
      line.setAttribute("x2", target.x);
      line.setAttribute("y2", target.y);
      line.setAttribute("class", "graph-edge");
      line.setAttribute("stroke-width", String(1 + edge.weight * 0.7));
      svg.append(line);
    });

    graph.nodes.forEach(function (node) {
      const position = positions[node.id];
      const group = document.createElementNS(ns, "g");
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", position.x);
      circle.setAttribute("cy", position.y);
      circle.setAttribute("r", String(18 + Math.min(node.weight, 5) * 2));
      circle.setAttribute("class", "graph-node");
      group.append(circle);

      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", position.x);
      label.setAttribute("y", position.y + 4);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "graph-label");
      label.textContent = truncateLabel(node.label, 18);
      group.append(label);
      svg.append(group);
    });

    return svg;
  }

  function renderMarkdownFragment(text) {
    const fragment = document.createDocumentFragment();
    const normalized = String(text || "").replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();

      if (!trimmed) {
        index += 1;
        continue;
      }

      const fenceMatch = trimmed.match(/^```(.*)$/);
      if (fenceMatch) {
        const block = [];
        index += 1;
        while (index < lines.length && !lines[index].trim().startsWith("```")) {
          block.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = block.join("\n");
        pre.append(code);
        fragment.append(pre);
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = Math.min(6, headingMatch[1].length + 1);
        const heading = document.createElement("h" + level);
        appendInlineMarkdown(heading, headingMatch[2]);
        fragment.append(heading);
        index += 1;
        continue;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        const ul = document.createElement("ul");
        while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
          const li = document.createElement("li");
          appendInlineMarkdown(li, lines[index].trim().replace(/^[-*]\s+/, ""));
          ul.append(li);
          index += 1;
        }
        fragment.append(ul);
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        const ol = document.createElement("ol");
        while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
          const li = document.createElement("li");
          appendInlineMarkdown(li, lines[index].trim().replace(/^\d+\.\s+/, ""));
          ol.append(li);
          index += 1;
        }
        fragment.append(ol);
        continue;
      }

      const paragraphLines = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        if (!current) break;
        if (/^(#{1,6})\s+/.test(current) || /^[-*]\s+/.test(current) || /^\d+\.\s+/.test(current) || /^```/.test(current)) break;
        paragraphLines.push(current);
        index += 1;
      }
      const paragraph = document.createElement("p");
      appendInlineMarkdown(paragraph, paragraphLines.join(" "));
      fragment.append(paragraph);
    }

    return fragment;
  }

  function appendInlineMarkdown(parent, text) {
    const pattern = /(\[[^\]]+\]\([^\)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parent.append(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const token = match[0];
      if (token[0] === "`") {
        const code = document.createElement("code");
        code.textContent = token.slice(1, -1);
        parent.append(code);
      } else if (token[0] === "[") {
        const linkMatch = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
        if (linkMatch) {
          const anchor = document.createElement("a");
          anchor.textContent = linkMatch[1];
          anchor.href = linkMatch[2];
          anchor.target = "_blank";
          anchor.rel = "noreferrer noopener";
          parent.append(anchor);
        } else {
          parent.append(document.createTextNode(token));
        }
      } else if (token.startsWith("**") || token.startsWith("__")) {
        const strong = document.createElement("strong");
        strong.textContent = token.slice(2, -2);
        parent.append(strong);
      } else {
        const em = document.createElement("em");
        em.textContent = token.slice(1, -1);
        parent.append(em);
      }

      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
      parent.append(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function syncFormToState() {
    sourceText.value = state.text;
    modeSelect.value = state.mode;
    strengthSelect.value = state.strength;
    autoDistillToggle.checked = state.autoDistill;
    distillButton.textContent = state.dirty ? "Distill now" : "Refresh artifact";
  }

  function analyzeText(text, mode, strength) {
    const profile = STRENGTH_PROFILES[strength] || STRENGTH_PROFILES.medium;
    const normalized = normalizeText(text);
    const lines = normalized.lines;
    const sentences = splitSentences(normalized.joined);
    const headings = detectHeadings(lines);
    const frequency = countTerms(normalized.joined);
    const rankedSentences = rankSentences(sentences, frequency, mode);
    const digest = buildDigest(rankedSentences, normalized.joined, profile);

    return {
      sections: {
        summary: buildSummary(rankedSentences, headings, mode, normalized.joined),
        digest: digest,
        actions: extractActions(lines, mode),
        questions: extractQuestions(lines, sentences),
        motifs: extractMotifs(normalized.joined, frequency, profile),
        entities: extractEntities(lines, normalized.joined, profile.entityCount),
        graph: buildConceptGraph(lines, normalized.joined, profile.entityCount),
      },
      stats: {
        characters: text.length,
        words: normalized.joined.trim() ? normalized.joined.trim().split(/\s+/).length : 0,
        sentences: sentences.length,
        headings: headings.length,
      },
    };
  }

  function buildMarkdownExport(payload) {
    const lines = [
      "# Local Distillery Export",
      "",
      "- Mode: " + payload.mode,
      "- Compression: " + payload.strength,
      "- Generated locally: yes",
      "- Source name: " + (payload.inputMeta.name || "Pasted text"),
      "- Character count: " + payload.inputMeta.characters,
      "",
    ];

    SECTION_CONFIG.forEach(function (section) {
      if (!payload.toggles[section.id]) return;
      lines.push("## " + section.label);
      lines.push("");
      const value = payload.sections[section.id];
      if (Array.isArray(value)) {
        if (!value.length) {
          lines.push("- None detected");
        } else {
          value.forEach(function (item) { lines.push("- " + item); });
        }
      } else if (value && value.type === "graph") {
        if (!value.nodes.length) {
          lines.push("None detected");
        } else {
          lines.push("```mermaid");
          lines.push(value.mermaid);
          lines.push("```");
        }
      } else {
        lines.push(value || "None detected");
      }
      lines.push("");
    });

    return lines.join("\n");
  }

  function buildJsonExport(payload) {
    return JSON.stringify({
      app: "Local Distillery",
      generatedLocally: true,
      mode: payload.mode,
      strength: payload.strength,
      source: payload.inputMeta,
      stats: payload.stats,
      enabledSections: payload.toggles,
      output: payload.sections,
    }, null, 2);
  }

  function normalizeText(text) {
    const joined = text.replace(/\r\n/g, "\n").replace(/\t/g, "  ").trim();
    return {
      joined: joined,
      lines: joined ? joined.split("\n").map(function (line) { return line.trim(); }) : [],
    };
  }

  function splitSentences(text) {
    if (!text) return [];
    const normalized = text.replace(/\n+/g, ' ');
    const chunks = normalized.match(/[^.!?]+[.!?]?/g) || [];
    const cleaned = chunks.map(function (sentence) { return sentence.trim(); }).filter(Boolean);
    const longEnough = cleaned.filter(function (sentence) { return sentence.length > 24; });
    return longEnough.length ? longEnough : cleaned;
  }

  function detectHeadings(lines) {
    return lines.filter(function (line) {
      if (!line) return false;
      if (/^#{1,6}\s+/.test(line)) return true;
      if (/^[A-Z][A-Za-z0-9 /:-]{2,40}:$/.test(line)) return true;
      return /^[A-Z0-9][A-Z0-9 /-]{4,50}$/.test(line);
    });
  }

  function countTerms(text) {
    const counts = new Map();
    const tokens = text.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || [];
    tokens.forEach(function (token) {
      if (DEFAULT_STOP_WORDS.has(token)) return;
      counts.set(token, (counts.get(token) || 0) + 1);
    });
    return counts;
  }

  function rankSentences(sentences, frequency, mode) {
    const hints = MODE_HINTS[mode] || [];
    return sentences
      .map(function (sentence, index) { return { sentence: sentence, score: scoreSentence(sentence, frequency, hints, index) }; })
      .sort(function (a, b) { return b.score - a.score; })
      .map(function (entry) { return entry.sentence; });
  }

  function scoreSentence(sentence, frequency, hints, index) {
    const tokens = sentence.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || [];
    const seen = new Set();
    let score = 0;

    tokens.forEach(function (token) {
      if (DEFAULT_STOP_WORDS.has(token) || seen.has(token)) return;
      seen.add(token);
      score += Math.min(frequency.get(token) || 0, 6);
    });

    if (/[0-9]/.test(sentence)) score += 1.5;
    if (/decision|agreed|must|should|need|risk|blocked|owner|action/i.test(sentence)) score += 4;
    if (sentence.length > 210) score -= 2;
    if (index < 3) score += 1.5;
    hints.forEach(function (hint) {
      if (sentence.toLowerCase().includes(hint)) score += 2;
    });
    return score;
  }

  function buildSummary(rankedSentences, headings, mode, normalizedText) {
    const lead = rankedSentences[0] || extractLeadFragment(normalizedText) || ("Local distillation output for " + mode.toLowerCase() + " input.");
    const headingHint = headings[0] ? " Focus area: " + cleanHeading(headings[0]) + "." : "";
    return (cleanSentence(lead) + headingHint).trim();
  }

  function buildDigest(rankedSentences, normalizedText, profile) {
    const digest = rankedSentences.slice(0, profile.digestCount).map(cleanSentence).filter(Boolean);
    if (digest.length) return digest;
    const fallback = extractLeadFragment(normalizedText);
    return fallback ? [fallback] : [];
  }

  function extractActions(lines, mode) {
    const actionLines = [];
    const imperativeHints = /\b(todo|action item|next step|follow up|owner|assign|ship|review|add|fix|update|define|check|investigate|document|decide|create|compare|extract)\b/i;

    lines.forEach(function (line) {
      if (!line) return;
      if (/^\[[ xX]?\]\s+/.test(line) || /^[-*]\s+\[[ xX]?\]/.test(line)) {
        actionLines.push(line.replace(/^[-*]\s+/, ""));
        return;
      }
      if (/^[-*]\s+/.test(line) && imperativeHints.test(line)) {
        actionLines.push(line.replace(/^[-*]\s+/, ""));
        return;
      }
      if (imperativeHints.test(line) && line.length < 180) {
        actionLines.push(line);
      }
    });

    const unique = uniq(actionLines.map(cleanListItem));
    if (unique.length) return unique.slice(0, 10);
    return mode === "Meeting" ? ["No explicit action items detected in the current text."] : [];
  }

  function extractQuestions(lines, sentences) {
    const questionLines = lines.filter(function (line) { return /[?]$/.test(line); });
    const interrogatives = sentences.filter(function (sentence) {
      return /^(who|what|when|where|why|how|should|could|would|do|does|is|are)\b/i.test(sentence.trim());
    });
    return uniq(questionLines.concat(interrogatives).map(cleanListItem)).slice(0, 10);
  }

  function extractMotifs(text, frequency, profile) {
    const phrases = new Map();
    const tokens = text.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || [];
    for (let i = 0; i <= tokens.length - profile.phraseSize; i += 1) {
      const slice = tokens.slice(i, i + profile.phraseSize);
      if (slice.some(function (token) { return DEFAULT_STOP_WORDS.has(token); })) continue;
      const phrase = slice.join(" ");
      phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
    }

    const repeatedPhrases = Array.from(phrases.entries())
      .filter(function (entry) { return entry[1] > 1; })
      .sort(function (a, b) { return b[1] - a[1]; })
      .slice(0, profile.motifCount)
      .map(function (entry) { return entry[0] + " (" + entry[1] + ")"; });

    const repeatedTerms = Array.from(frequency.entries())
      .filter(function (entry) { return entry[1] > 1; })
      .sort(function (a, b) { return b[1] - a[1]; })
      .slice(0, profile.motifCount)
      .map(function (entry) { return entry[0] + " (" + entry[1] + ")"; });

    const motifs = uniq(repeatedPhrases.concat(repeatedTerms)).slice(0, profile.motifCount);
    if (motifs.length) return motifs;

    return Array.from(frequency.entries())
      .sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); })
      .slice(0, Math.min(profile.motifCount, 5))
      .map(function (entry) { return entry[0]; });
  }

  function buildConceptGraph(lines, text, limit) {
    const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}|[A-Z]{2,}(?:-[A-Z]{2,})?|\d{4}-\d{2}-\d{2})\b/g;
    const bannedSingles = new Set(["The", "This", "That", "These", "Those", "A", "An"]);
    const frequency = countTerms(text);
    const nodeWeights = new Map();
    const edgeWeights = new Map();

    lines.forEach(function (line) {
      const entityMatches = (line.match(entityPattern) || []).map(function (item) { return item.trim(); }).filter(function (item) {
        return item.length > 1 && !bannedSingles.has(item);
      });
      const keywordMatches = (line.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || []).filter(function (token) {
        return !DEFAULT_STOP_WORDS.has(token);
      }).map(titleCase);
      const concepts = uniq(entityMatches.concat(keywordMatches)).slice(0, Math.max(limit, 8));

      concepts.forEach(function (concept) {
        nodeWeights.set(concept, (nodeWeights.get(concept) || 0) + 1);
      });

      for (let i = 0; i < concepts.length; i += 1) {
        for (let j = i + 1; j < concepts.length; j += 1) {
          const pair = [concepts[i], concepts[j]].sort().join("|||");
          edgeWeights.set(pair, (edgeWeights.get(pair) || 0) + 1);
        }
      }
    });

    if (nodeWeights.size === 0) {
      Array.from(frequency.entries()).slice(0, Math.min(limit, 6)).forEach(function (entry) {
        nodeWeights.set(titleCase(entry[0]), entry[1]);
      });
    }

    const nodes = Array.from(nodeWeights.entries())
      .sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); })
      .slice(0, Math.min(limit, 8))
      .map(function (entry) {
        return { id: slugify(entry[0]), label: entry[0], weight: entry[1] };
      });

    const allowed = new Set(nodes.map(function (node) { return node.label; }));
    const edges = Array.from(edgeWeights.entries())
      .map(function (entry) {
        const parts = entry[0].split("|||");
        return { sourceLabel: parts[0], targetLabel: parts[1], weight: entry[1] };
      })
      .filter(function (edge) { return allowed.has(edge.sourceLabel) && allowed.has(edge.targetLabel); })
      .sort(function (a, b) { return b.weight - a.weight || a.sourceLabel.localeCompare(b.sourceLabel); })
      .slice(0, 12)
      .map(function (edge) {
        return {
          source: slugify(edge.sourceLabel),
          target: slugify(edge.targetLabel),
          weight: edge.weight,
        };
      });

    const mermaidLines = ["graph TD"];
    nodes.forEach(function (node) {
      mermaidLines.push('  ' + node.id + '["' + escapeMermaidLabel(node.label) + '"]');
    });
    edges.forEach(function (edge) {
      mermaidLines.push("  " + edge.source + " -->|" + edge.weight + "| " + edge.target);
    });

    return {
      type: "graph",
      nodes: nodes,
      edges: edges,
      mermaid: mermaidLines.join("\n"),
    };
  }

  function extractEntities(lines, text, limit) {
    const entityCounts = new Map();
    const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}|[A-Z]{2,}(?:-[A-Z]{2,})?|\d{4}-\d{2}-\d{2})\b/g;
    const bannedSingles = new Set(["The", "This", "That", "These", "Those", "A", "An"]);

    lines.forEach(function (line) {
      const matches = line.match(entityPattern) || [];
      matches.forEach(function (match) {
        const normalized = match.trim();
        if (normalized.length < 2 || bannedSingles.has(normalized)) return;
        entityCounts.set(normalized, (entityCounts.get(normalized) || 0) + 1);
      });
    });

    const entities = Array.from(entityCounts.entries())
      .sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); })
      .slice(0, limit)
      .map(function (entry) { return entry[1] > 1 ? entry[0] + " (" + entry[1] + ")" : entry[0]; });

    if (entities.length) return entities;

    return Array.from(countTerms(text).entries())
      .sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); })
      .slice(0, Math.min(limit, 6))
      .map(function (entry) { return titleCase(entry[0]); });
  }

  function extractLeadFragment(text) {
    if (!text) return "";
    const fragment = text.split(/\n+/)[0] || text;
    return cleanSentence(fragment).replace(/[.!?]+$/, "") + (/[.!?]$/.test(fragment) ? fragment.match(/[.!?]+$/)[0][0] : ".");
  }

  function cleanSentence(sentence) {
    return sentence.replace(/\s+/g, " ").replace(/^[-*]\s+/, "").trim();
  }

  function cleanHeading(heading) {
    return heading.replace(/^#+\s*/, "").replace(/:$/, "").trim();
  }

  function cleanListItem(item) {
    return item.replace(/^[-*]\s+/, "").replace(/^\[[ xX]?\]\s+/, "").replace(/\s+/g, " ").trim();
  }

  function uniq(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function saveState(payload) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      void error;
    }
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      void error;
      return null;
    }
  }

  function clearState() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      void error;
    }
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
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function estimateByteSize(text) {
    return new Blob([text]).size;
  }

  function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function truncateLabel(value, limit) {
    return value.length > limit ? value.slice(0, limit - 1) + "..." : value;
  }

  function slugify(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "node";
  }

  function escapeMermaidLabel(value) {
    return value.replace(/"/g, "'");
  }

  function openFilePicker() {
    fileInput.click();
  }

  function setFileStatus(message) {
    fileStatus.textContent = message;
  }

  function setInputStatus(message) {
    inputStatus.textContent = message;
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
    } catch (error) {
      void error;
      copied = false;
    }

    helper.remove();
    return copied;
  }

  function isAcceptedFile(file) {
    const name = file.name.toLowerCase();
    const acceptedExtensions = [".txt", ".md", ".json", ".jsonl", ".log", ".js"];
    if (acceptedExtensions.some(function (extension) { return name.endsWith(extension); })) {
      return true;
    }
    return /^text\//.test(file.type) || /^application\/(json|javascript)/.test(file.type);
  }
})();
