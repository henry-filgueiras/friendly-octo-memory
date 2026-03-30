(function () {
  const STOPWORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by",
    "for", "from", "had", "has", "have", "he", "her", "hers", "him", "his",
    "i", "if", "in", "into", "is", "it", "its", "itself", "me", "more",
    "most", "my", "no", "not", "of", "on", "or", "our", "ours", "she",
    "so", "than", "that", "the", "their", "theirs", "them", "there", "they",
    "this", "those", "to", "too", "up", "us", "was", "we", "were", "what",
    "when", "where", "which", "who", "why", "will", "with", "you", "your",
    "yours"
  ]);

  let rafId = 0;
  let bodyObserver = null;

  function init() {
    injectStyles();
    bindSourceRefresh();
    bindDomRefresh();
    scheduleRender();
  }

  function injectStyles() {
    if (document.getElementById("ld-graph-style")) return;
    const style = document.createElement("style");
    style.id = "ld-graph-style";
    style.textContent = `
      .concept-graph-card {
        border-radius: 18px;
        border: 1px solid rgba(83, 61, 34, 0.14);
        background: var(--panel-strong);
        padding: 16px;
      }
      .concept-graph-stack {
        display: grid;
        gap: 14px;
      }
      .concept-graph-summary {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
      }
      .concept-graph-preview {
        border-radius: 18px;
        padding: 14px;
        border: 1px solid rgba(83, 61, 34, 0.1);
        background:
          radial-gradient(circle at top, rgba(163, 76, 33, 0.14), transparent 52%),
          linear-gradient(180deg, rgba(255, 248, 236, 0.96), rgba(255, 255, 255, 0.9));
      }
      .concept-graph-preview svg {
        display: block;
        width: 100%;
        height: auto;
      }
      .concept-graph-empty {
        margin: 0;
        padding: 22px 18px;
        border-radius: 14px;
        background: rgba(83, 61, 34, 0.05);
        color: var(--muted);
      }
      .concept-graph-details {
        border: 1px solid rgba(83, 61, 34, 0.1);
        border-radius: 14px;
        padding: 12px 14px;
        background: rgba(255, 255, 255, 0.7);
      }
      .concept-graph-details summary {
        cursor: pointer;
        color: var(--text);
        font-weight: 600;
      }
      .concept-graph-details pre {
        margin-top: 12px;
      }
      .concept-graph-edge {
        stroke: rgba(83, 61, 34, 0.3);
        stroke-linecap: round;
      }
      .concept-graph-node {
        fill: #fff6ea;
        stroke: rgba(83, 61, 34, 0.45);
        stroke-width: 1.5;
      }
      .concept-graph-node--hub {
        fill: var(--accent);
        stroke: rgba(83, 61, 34, 0.65);
      }
      .concept-graph-label {
        fill: var(--text);
        font: 600 13px var(--sans);
        text-anchor: middle;
      }
      .concept-graph-label--hub {
        fill: #fffaf3;
      }
    `;
    document.head.appendChild(style);
  }

  function bindSourceRefresh() {
    const textarea = document.querySelector("#source-text");
    if (!textarea || textarea.dataset.graphBound === "true") return;
    textarea.dataset.graphBound = "true";
    textarea.addEventListener("input", scheduleRender);
    textarea.addEventListener("change", scheduleRender);
  }

  function bindDomRefresh() {
    if (bodyObserver) return;
    bodyObserver = new MutationObserver(function () {
      bindSourceRefresh();
      scheduleRender();
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  function scheduleRender() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(function () {
      rafId = 0;
      renderGraphCard();
    });
  }

  function renderGraphCard() {
    const resultsList = document.querySelector("#results-list");
    const textarea = document.querySelector("#source-text");
    if (!resultsList || !textarea) return;

    let card = document.querySelector("#concept-graph-card");
    if (!card) {
      card = document.createElement("article");
      card.id = "concept-graph-card";
      card.className = "result-card concept-graph-card";
      card.innerHTML = [
        '<div class="result-header">',
        '  <div>',
        '    <p class="result-kicker">Topology</p>',
        '    <h3>Concept / entity graph</h3>',
        '  </div>',
        '  <button class="button button-ghost" type="button" data-copy-mermaid>Copy Mermaid</button>',
        '</div>',
        '<div class="concept-graph-stack">',
        '  <p class="concept-graph-summary" data-graph-summary></p>',
        '  <div class="concept-graph-preview" data-graph-preview></div>',
        '  <details class="concept-graph-details">',
        '    <summary>Mermaid source</summary>',
        '    <pre><code data-graph-mermaid></code></pre>',
        '  </details>',
        '</div>'
      ].join("");
      resultsList.appendChild(card);
    }

    const graph = buildGraph(textarea.value || "");
    const summary = card.querySelector("[data-graph-summary]");
    const preview = card.querySelector("[data-graph-preview]");
    const mermaid = card.querySelector("[data-graph-mermaid]");
    const copyButton = card.querySelector("[data-copy-mermaid]");

    mermaid.textContent = graph.fenced;
    copyButton.onclick = function () {
      copyText(graph.fenced, copyButton);
    };

    if (!textarea.value.trim()) {
      summary.textContent = "Paste or load material to map which extracted concepts actually travel together through the source.";
      preview.innerHTML = '<p class="concept-graph-empty">No source material yet.</p>';
      return;
    }

    if (!graph.nodes.length || !graph.edges.length) {
      summary.textContent = "The current draft does not have enough repeated concepts sharing the same sentence to draw a meaningful relationship graph yet.";
      preview.innerHTML = '<p class="concept-graph-empty">Need at least two connected concepts before the graph wakes up.</p>';
      return;
    }

    summary.textContent = "This view links concept and entity nodes when they co-occur inside the same sentence. The strongest node becomes the hub, and thicker lines mean more repeated co-occurrence.";
    preview.innerHTML = renderSvg(graph);
  }

  function buildGraph(text) {
    const cleanedText = String(text || "").trim();
    if (!cleanedText) {
      return makeEmptyGraph();
    }

    const sentences = splitSentences(cleanedText);
    const labels = extractGraphLabels(cleanedText).slice(0, 10);
    const nodeWeights = new Map();
    labels.forEach(function (label) {
      nodeWeights.set(label, countMatches(cleanedText, label));
    });

    const edgeScores = new Map();
    sentences.forEach(function (sentence) {
      const present = labels.filter(function (label) {
        return countMatches(sentence, label) > 0;
      });
      for (let i = 0; i < present.length; i += 1) {
        for (let j = i + 1; j < present.length; j += 1) {
          const key = [present[i], present[j]].sort().join("::");
          edgeScores.set(key, (edgeScores.get(key) || 0) + 1);
        }
      }
    });

    const edges = Array.from(edgeScores.entries())
      .map(function (entry) {
        const parts = entry[0].split("::");
        return {
          source: parts[0],
          target: parts[1],
          weight: entry[1]
        };
      })
      .sort(function (left, right) { return right.weight - left.weight; })
      .slice(0, 14);

    const connected = new Set();
    edges.forEach(function (edge) {
      connected.add(edge.source);
      connected.add(edge.target);
    });

    const nodes = labels
      .filter(function (label) { return connected.has(label); })
      .map(function (label) {
        return {
          id: slugify(label),
          label: label,
          weight: nodeWeights.get(label) || 1
        };
      })
      .sort(function (left, right) { return right.weight - left.weight || left.label.localeCompare(right.label); });

    if (!nodes.length || !edges.length) {
      return makeEmptyGraph(labels);
    }

    const mermaidLines = ["graph LR"];
    nodes.forEach(function (node) {
      mermaidLines.push('  ' + node.id + '["' + escapeMermaid(node.label) + '"]');
    });
    edges.forEach(function (edge) {
      mermaidLines.push('  ' + slugify(edge.source) + ' ---|' + edge.weight + '| ' + slugify(edge.target));
    });

    return {
      nodes: nodes,
      edges: edges,
      mermaid: mermaidLines.join("\n"),
      fenced: ["```mermaid", mermaidLines.join("\n"), "```"].join("\n")
    };
  }

  function makeEmptyGraph(labels) {
    const fallback = labels && labels.length ? labels[0] : "No concepts extracted yet";
    const mermaid = 'graph LR\n  source["' + escapeMermaid(fallback) + '"]';
    return {
      nodes: [],
      edges: [],
      mermaid: mermaid,
      fenced: ["```mermaid", mermaid, "```"].join("\n")
    };
  }

  function extractGraphLabels(text) {
    const entityLabels = extractEntityListFromUi();
    if (entityLabels.length >= 2) {
      return entityLabels;
    }

    const entityCounts = new Map();
    const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}|[A-Z]{2,}(?:-[A-Z]{2,})?|\d{4}-\d{2}-\d{2})\b/g;
    let match;
    while ((match = entityPattern.exec(text)) !== null) {
      const label = match[1].trim();
      if (label.length < 2 || STOPWORDS.has(label.toLowerCase())) continue;
      entityCounts.set(label, (entityCounts.get(label) || 0) + 2);
    }

    const termCounts = new Map();
    const terms = text.toLowerCase().match(/[a-z][a-z0-9'-]{3,}/g) || [];
    terms.forEach(function (term) {
      if (STOPWORDS.has(term)) return;
      termCounts.set(term, (termCounts.get(term) || 0) + 1);
    });

    return Array.from(entityCounts.entries())
      .sort(function (left, right) { return right[1] - left[1] || left[0].localeCompare(right[0]); })
      .map(function (entry) { return entry[0]; })
      .concat(
        Array.from(termCounts.entries())
          .sort(function (left, right) { return right[1] - left[1] || left[0].localeCompare(right[0]); })
          .map(function (entry) { return titleCase(entry[0]); })
      )
      .filter(function (value, index, array) {
        return array.findIndex(function (candidate) {
          return candidate.toLowerCase() === value.toLowerCase();
        }) === index;
      });
  }

  function extractEntityListFromUi() {
    const cards = Array.from(document.querySelectorAll(".result-card"));
    const entityCard = cards.find(function (card) {
      const heading = card.querySelector("h3");
      return heading && /concept\s*\/\s*entity list/i.test(heading.textContent || "");
    });
    if (!entityCard) return [];
    return Array.from(entityCard.querySelectorAll("li"))
      .map(function (item) {
        return item.textContent.replace(/\s+\(\d+\)$/, "").trim();
      })
      .filter(Boolean);
  }

  function splitSentences(text) {
    return text
      .replace(/\r/g, "\n")
      .split(/[.!?]+\s+|\n+/)
      .map(function (chunk) { return chunk.trim(); })
      .filter(Boolean);
  }

  function countMatches(text, label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matcher = new RegExp("\\b" + escaped + "\\b", "gi");
    const matches = text.match(matcher);
    return matches ? matches.length : 0;
  }

  function renderSvg(graph) {
    const width = 760;
    const height = 420;
    const centerX = width / 2;
    const centerY = height / 2;
    const orbit = Math.min(width, height) * 0.34;
    const positions = new Map();

    graph.nodes.forEach(function (node, index) {
      if (index === 0) {
        positions.set(node.id, { x: centerX, y: centerY, hub: true });
        return;
      }
      const angle = (-Math.PI / 2) + ((Math.PI * 2) * (index - 1)) / Math.max(1, graph.nodes.length - 1);
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * orbit,
        y: centerY + Math.sin(angle) * orbit,
        hub: false
      });
    });

    const edges = graph.edges.map(function (edge) {
      const from = positions.get(slugify(edge.source));
      const to = positions.get(slugify(edge.target));
      return '<line class="concept-graph-edge" x1="' + from.x + '" y1="' + from.y + '" x2="' + to.x + '" y2="' + to.y + '" stroke-width="' + (1 + edge.weight) + '"></line>';
    }).join("");

    const nodes = graph.nodes.map(function (node) {
      const position = positions.get(node.id);
      const radius = position.hub ? 46 : 34;
      const lines = wrapLabel(node.label, position.hub ? 16 : 14);
      const startY = position.y - ((lines.length - 1) * 8);
      const text = lines.map(function (line, index) {
        return '<tspan x="' + position.x + '" y="' + (startY + index * 16) + '">' + escapeHtml(line) + '</tspan>';
      }).join("");
      return [
        '<circle class="concept-graph-node' + (position.hub ? ' concept-graph-node--hub' : '') + '" cx="' + position.x + '" cy="' + position.y + '" r="' + radius + '"></circle>',
        '<text class="concept-graph-label' + (position.hub ? ' concept-graph-label--hub' : '') + '">' + text + '</text>'
      ].join("");
    }).join("");

    return '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Concept graph">' + edges + nodes + '</svg>';
  }

  function wrapLabel(label, maxChars) {
    if (label.length <= maxChars) return [label];
    const words = label.split(/\s+/);
    const lines = [];
    let current = "";
    words.forEach(function (word) {
      if (!current || (current + " " + word).trim().length <= maxChars) {
        current = current ? current + " " + word : word;
      } else {
        lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    return lines.slice(0, 3);
  }

  function slugify(value) {
    return "n_" + value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeMermaid(value) {
    return value.replace(/"/g, '\\"');
  }

  async function copyText(value, button) {
    let copied = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch (_error) {
        copied = false;
      }
    }

    if (!copied) {
      const helper = document.createElement("textarea");
      helper.value = value;
      helper.setAttribute("readonly", "");
      helper.style.position = "absolute";
      helper.style.left = "-9999px";
      document.body.appendChild(helper);
      helper.select();
      try {
        copied = document.execCommand("copy");
      } catch (_error) {
        copied = false;
      }
      helper.remove();
    }

    button.textContent = copied ? "Copied" : "Copy failed";
    setTimeout(function () {
      button.textContent = "Copy Mermaid";
    }, 1300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
