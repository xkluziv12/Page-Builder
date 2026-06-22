import { useState } from "react";
import "./terminal.css";
import PromptManager from "./views/PromptManager";
import PromptLibrary from "./views/PromptLibrary";

type Tool = {
  label: string;
  icon: string;
  file: string;
};

type View = {
  label: string;
  icon: string;
  key: "prompt-manager" | "prompt-library";
};

const BASE = import.meta.env.BASE_URL;

const TOOLS: Tool[] = [
  { label: "Page Rebuild", icon: "fas fa-sync-alt", file: "index.html" },
  { label: "Page Rebuild (No GMB)", icon: "fas fa-store-slash", file: "no-gmb.html" },
  { label: "Hub + Spoke", icon: "fas fa-sitemap", file: "hub-spoke.html" },
  { label: "New Pages", icon: "fas fa-plus-circle", file: "new-pages.html" },
  { label: "Marketing", icon: "fas fa-bullhorn", file: "marketing.html" },
  { label: "Service Pages", icon: "fas fa-cogs", file: "page-terminal.html" },
  { label: "Blogs", icon: "fas fa-blog", file: "blog-terminal.html" },
  { label: "A.I. Pages", icon: "fas fa-robot", file: "ai-pages.html" },
];

const VIEWS: View[] = [
  { label: "Prompt Library", icon: "fas fa-book-open", key: "prompt-library" },
  { label: "Prompt Manager", icon: "fas fa-pen-to-square", key: "prompt-manager" },
];

type Active =
  | { kind: "tool"; index: number }
  | { kind: "view"; key: View["key"] };

function App() {
  const [active, setActive] = useState<Active>({ kind: "tool", index: 0 });
  const [menuOpen, setMenuOpen] = useState(false);

  const selectTool = (index: number) => {
    setActive({ kind: "tool", index });
    setMenuOpen(false);
  };

  const selectView = (key: View["key"]) => {
    setActive({ kind: "view", key });
    setMenuOpen(false);
  };

  const activeTool = active.kind === "tool" ? TOOLS[active.index] : null;

  return (
    <div className="pt-app">
      <nav className="pt-nav">
        <div className="pt-nav-inner">
          <button
            type="button"
            className="pt-brand"
            onClick={() => selectTool(0)}
          >
            <div className="pt-brand-icon">M</div>
            <div className="pt-brand-text">Page Terminal</div>
          </button>

          <div className="pt-switch" role="group" aria-label="Switch system">
            <span className="pt-switch-seg active" aria-current="true">
              OLD
            </span>
            <a className="pt-switch-seg" href="/mission-control/">
              NEW
            </a>
          </div>

          <button
            type="button"
            className="pt-toggle"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle menu"
          >
            <i className="fas fa-bars" />
          </button>

          <div className={`pt-menu${menuOpen ? " open" : ""}`}>
            <div className="pt-tools">
              {TOOLS.map((tool, index) => (
                <button
                  type="button"
                  key={tool.file}
                  className={`pt-item${
                    active.kind === "tool" && index === active.index
                      ? " active"
                      : ""
                  }`}
                  onClick={() => selectTool(index)}
                >
                  <i className={tool.icon} />
                  {tool.label}
                </button>
              ))}
            </div>
            <span className="pt-divider" aria-hidden="true" />
            <div className="pt-views">
              {VIEWS.map((view) => (
                <button
                  type="button"
                  key={view.key}
                  className={`pt-item${
                    active.kind === "view" && active.key === view.key
                      ? " active"
                      : ""
                  }`}
                  onClick={() => selectView(view.key)}
                >
                  <i className={view.icon} />
                  {view.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-frame-wrapper">
        {activeTool ? (
          <iframe
            key={activeTool.file}
            src={`${BASE}tools/${activeTool.file}`}
            title={`M.A.R.K. — ${activeTool.label}`}
            allow="clipboard-write; clipboard-read"
          />
        ) : active.kind === "view" && active.key === "prompt-manager" ? (
          <div className="pt-view-scroll">
            <PromptManager />
          </div>
        ) : (
          <div className="pt-view-scroll">
            <PromptLibrary />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
