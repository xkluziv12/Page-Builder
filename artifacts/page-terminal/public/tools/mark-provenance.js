/**
 * Shared, reusable provenance control for the self-contained static build
 * tools (Page Rebuild, No-GMB, Hub+Spoke, Blogs, Service Pages, TechnoCycle
 * copies). Each tool is a standalone HTML document with no shared build step
 * (see page-terminal/CLAUDE.md) — this file is the one sanctioned exception:
 * a plain <script src> include, no bundler, no framework coupling, safe to
 * load from any relative depth under public/tools/.
 *
 * These tools cannot verify HOW their content was actually produced (Claude
 * CLI vs Claude web vs a direct API vs the Replit Agent) — the browser has no
 * way to detect that. So this widget asks the operator to confirm it, rather
 * than assuming Claude by default. The default is always "unknown".
 *
 * Usage: `<script src="mark-provenance.js" data-tool="Page Rebuild (STS)"></script>`
 * placed anywhere in the document (reads its own data-tool attribute via
 * document.currentScript). Renders a small floating widget; the operator's
 * selection is available via `window.MarkProvenance.get()`. Operators can
 * paste final page HTML into the widget and copy/download that artifact with
 * a machine-readable provenance comment embedded; a sidecar JSON manifest is
 * also available. Never stores prompts, responses, or secrets — only the
 * operator-confirmed source metadata, timestamp, and tool name.
 */
(function () {
  "use strict";

  var SOURCE_KINDS = [
    { value: "unknown", label: "Unknown / not recorded (default)" },
    { value: "claude-cli", label: "Claude CLI" },
    { value: "claude-web", label: "Claude web chat" },
    { value: "direct-api", label: "Direct provider API" },
    { value: "replit-agent", label: "Replit Agent" },
    { value: "operator-input", label: "Operator typed/edited by hand" },
  ];

  var STORAGE_KEY = "mark_provenance_selection_v1";

  function currentScriptTool() {
    var script = document.currentScript;
    if (script && script.getAttribute) {
      return script.getAttribute("data-tool") || document.title || "unknown-tool";
    }
    return document.title || "unknown-tool";
  }

  var TOOL_NAME = currentScriptTool();

  function loadSaved() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY + ":" + TOOL_NAME);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveSelection(sel) {
    try {
      window.localStorage.setItem(STORAGE_KEY + ":" + TOOL_NAME, JSON.stringify(sel));
    } catch (e) {
      /* best-effort only; never block the operator on storage failure */
    }
  }

  var state = loadSaved() || { sourceKind: "unknown", provider: "", model: "" };

  function get() {
    return {
      sourceKind: state.sourceKind || "unknown",
      provider: state.provider || null,
      model: state.model || null,
    };
  }

  function manifest(extra) {
    var sel = get();
    var m = {
      tool: TOOL_NAME,
      generatedAt: new Date().toISOString(),
      // Only true once the operator has actually picked something other than
      // the "unknown / not recorded" default — never claim confirmation that
      // didn't happen just because the widget was opened.
      operatorConfirmed: sel.sourceKind !== "unknown",
      sourceKind: sel.sourceKind,
      provider: sel.provider,
      model: sel.model,
    };
    if (extra && typeof extra === "object") {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k) && !(k in m)) m[k] = extra[k];
      }
    }
    return m;
  }

  function commentBlock(extra) {
    return "<!-- mark-provenance " + JSON.stringify(manifest(extra)) + " -->";
  }

  function embedProvenance(content, extra) {
    var text = String(content || "");
    var comment = commentBlock(extra);
    var closingBody = /<\/body\s*>/i;
    if (closingBody.test(text)) return text.replace(closingBody, comment + "\n</body>");
    return text.replace(/\s+$/, "") + "\n" + comment + "\n";
  }

  function downloadManifest(extra, filenamePrefix) {
    var data = manifest(extra);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var prefix = (filenamePrefix || TOOL_NAME).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
    a.href = url;
    a.download = prefix + "-provenance-" + Date.now() + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function downloadArtifact(content, filenamePrefix) {
    var data = embedProvenance(content);
    var blob = new Blob([data], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var prefix = (filenamePrefix || TOOL_NAME).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
    a.href = url;
    a.download = prefix + "-with-provenance-" + Date.now() + ".html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === "style") node.style.cssText = attrs[k];
        else node.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach(function (c) {
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function renderWidget() {
    if (document.getElementById("mark-provenance-widget")) return;

    var panel = el("div", {
      id: "mark-provenance-widget",
      style:
        "position:fixed;bottom:12px;right:12px;z-index:2147483000;" +
        "background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:8px;" +
        "padding:8px 10px;font:11px/1.4 -apple-system,Segoe UI,sans-serif;" +
        "box-shadow:0 4px 16px rgba(0,0,0,.35);max-width:260px;",
    });

    var toggle = el(
      "div",
      { style: "cursor:pointer;font-weight:600;display:flex;justify-content:space-between;align-items:center;" },
      ["Provenance: " + labelFor(state.sourceKind), el("span", { style: "opacity:.6;margin-left:6px;" }, ["▾"])],
    );

    var body = el("div", { style: "margin-top:6px;display:none;" });

    var select = el("select", {
      style: "width:100%;margin-bottom:4px;background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:4px;padding:3px;",
    });
    SOURCE_KINDS.forEach(function (opt) {
      var o = el("option", { value: opt.value }, [opt.label]);
      if (opt.value === state.sourceKind) o.setAttribute("selected", "selected");
      select.appendChild(o);
    });

    var providerInput = el("input", {
      type: "text",
      placeholder: "Provider (e.g. Gemini, DeepSeek)",
      value: state.provider || "",
      style: "width:100%;margin-bottom:4px;background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:4px;padding:3px;box-sizing:border-box;",
    });
    providerInput.value = state.provider || "";

    var modelInput = el("input", {
      type: "text",
      placeholder: "Model (e.g. gemini-3-flash)",
      style: "width:100%;margin-bottom:6px;background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:4px;padding:3px;box-sizing:border-box;",
    });
    modelInput.value = state.model || "";

    var artifactInput = el("textarea", {
      placeholder: "Paste the generated page HTML here to attach provenance",
      rows: "5",
      style: "width:100%;margin-bottom:6px;background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:4px;padding:4px;box-sizing:border-box;resize:vertical;",
    });

    var copyArtifactBtn = el(
      "button",
      {
        type: "button",
        style: "width:100%;margin-bottom:4px;background:#059669;color:#fff;border:0;border-radius:4px;padding:5px 6px;cursor:pointer;font:inherit;",
      },
      ["Copy HTML + provenance"],
    );

    var downloadArtifactBtn = el(
      "button",
      {
        type: "button",
        style: "width:100%;margin-bottom:4px;background:#047857;color:#fff;border:0;border-radius:4px;padding:5px 6px;cursor:pointer;font:inherit;",
      },
      ["Download HTML + provenance"],
    );

    var downloadBtn = el(
      "button",
      {
        type: "button",
        style: "width:100%;background:#2563eb;color:#fff;border:0;border-radius:4px;padding:5px 6px;cursor:pointer;font:inherit;",
      },
      ["⬇ Download provenance manifest"],
    );

    function persist() {
      state = {
        sourceKind: select.value,
        provider: providerInput.value.trim(),
        model: modelInput.value.trim(),
      };
      saveSelection(state);
      toggle.firstChild.textContent = "Provenance: " + labelFor(state.sourceKind);
    }

    select.addEventListener("change", persist);
    providerInput.addEventListener("input", persist);
    modelInput.addEventListener("input", persist);
    copyArtifactBtn.addEventListener("click", function () {
      persist();
      if (!artifactInput.value.trim()) return;
      navigator.clipboard.writeText(embedProvenance(artifactInput.value)).then(function () {
        copyArtifactBtn.textContent = "Copied with provenance";
        setTimeout(function () {
          copyArtifactBtn.textContent = "Copy HTML + provenance";
        }, 1500);
      });
    });
    downloadArtifactBtn.addEventListener("click", function () {
      persist();
      if (!artifactInput.value.trim()) return;
      downloadArtifact(artifactInput.value);
    });
    downloadBtn.addEventListener("click", function () {
      persist();
      downloadManifest();
    });

    toggle.addEventListener("click", function () {
      body.style.display = body.style.display === "none" ? "block" : "none";
    });

    body.appendChild(select);
    body.appendChild(providerInput);
    body.appendChild(modelInput);
    body.appendChild(artifactInput);
    body.appendChild(copyArtifactBtn);
    body.appendChild(downloadArtifactBtn);
    body.appendChild(downloadBtn);
    panel.appendChild(toggle);
    panel.appendChild(body);
    document.body.appendChild(panel);
  }

  function labelFor(value) {
    for (var i = 0; i < SOURCE_KINDS.length; i++) {
      if (SOURCE_KINDS[i].value === value) return SOURCE_KINDS[i].label.replace(" (default)", "");
    }
    return "Unknown";
  }

  function init() {
    if (document.body) renderWidget();
    else document.addEventListener("DOMContentLoaded", renderWidget);
  }

  window.MarkProvenance = {
    get: get,
    manifest: manifest,
    commentBlock: commentBlock,
    embedProvenance: embedProvenance,
    downloadArtifact: downloadArtifact,
    downloadManifest: downloadManifest,
  };

  init();
})();
