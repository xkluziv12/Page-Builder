import { useState } from "react";
import "./terminal.css";

type Tool = {
  label: string;
  icon: string;
  file: string;
};

const BASE = import.meta.env.BASE_URL;
const CACHE_BUST = Date.now();

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

function App() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const selectTool = (index: number) => {
    setActiveIndex(index);
    setMenuOpen(false);
  };

  const activeTool = TOOLS[activeIndex];

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
                  className={`pt-item${index === activeIndex ? " active" : ""}`}
                  onClick={() => selectTool(index)}
                >
                  <i className={tool.icon} />
                  {tool.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-frame-wrapper">
        <iframe
          key={activeTool.file}
          src={`${BASE}tools/${activeTool.file}${import.meta.env.DEV ? `?v=${CACHE_BUST}` : ""}`}
          title={`M.A.R.K. — ${activeTool.label}`}
          allow="clipboard-write; clipboard-read"
        />
      </div>
    </div>
  );
}

export default App;
