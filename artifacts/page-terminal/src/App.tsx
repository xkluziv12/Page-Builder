import { useEffect, useState } from "react";
import "./terminal.css";

type Brand = "sts" | "tc";

type Tool = {
  label: string;
  icon: string;
  file: string;
  tcFile?: string;
};

type BrandConfig = {
  mark: string;
  name: string;
  tagline: string;
  label: string;
};

const BASE = import.meta.env.BASE_URL;
const CACHE_BUST = Date.now();
const BRAND_KEY = "pageTerminalBrand";

const BRANDS: Record<Brand, BrandConfig> = {
  sts: {
    mark: "M",
    name: "Page Terminal",
    tagline: "",
    label: "STS",
  },
  tc: {
    mark: "T",
    name: "TechnoCycle",
    tagline: "Stewards of Yesterday\u2019s Technology",
    label: "TechnoCycle",
  },
};

const TOOLS: Tool[] = [
  { label: "Page Rebuild", icon: "fas fa-sync-alt", file: "index.html", tcFile: "technocycle/index.html" },
  { label: "Page Rebuild (No GMB)", icon: "fas fa-store-slash", file: "no-gmb.html", tcFile: "technocycle/no-gmb.html" },
  { label: "Hub + Spoke", icon: "fas fa-sitemap", file: "hub-spoke.html", tcFile: "technocycle/hub-spoke.html" },
  { label: "New Pages", icon: "fas fa-plus-circle", file: "new-pages.html" },
  { label: "Marketing", icon: "fas fa-bullhorn", file: "marketing.html" },
  { label: "Service Pages", icon: "fas fa-cogs", file: "page-terminal.html", tcFile: "technocycle/page-terminal.html" },
  { label: "Blogs", icon: "fas fa-blog", file: "blog-terminal.html" },
  { label: "A.I. Pages", icon: "fas fa-robot", file: "ai-pages.html" },
];

function resolveFile(tool: Tool, brand: Brand): string {
  if (brand === "tc" && tool.tcFile) return tool.tcFile;
  return tool.file;
}

function readStoredBrand(): Brand {
  try {
    const stored = localStorage.getItem(BRAND_KEY);
    if (stored === "tc" || stored === "sts") return stored;
  } catch {
    /* localStorage unavailable */
  }
  return "sts";
}

function App() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [brand, setBrand] = useState<Brand>(readStoredBrand);

  useEffect(() => {
    try {
      localStorage.setItem(BRAND_KEY, brand);
    } catch {
      /* localStorage unavailable */
    }
  }, [brand]);

  const activeTool = TOOLS[activeIndex];
  const brandConfig = BRANDS[brand];
  const activeFile = resolveFile(activeTool, brand);

  const selectTool = (index: number) => {
    setActiveIndex(index);
    setMenuOpen(false);
  };

  const selectBrand = (next: Brand) => {
    setBrand(next);
    setMenuOpen(false);
  };

  return (
    <div className="pt-app" data-brand={brand}>
      <nav className="pt-nav">
        <div className="pt-nav-inner">
          <button
            type="button"
            className="pt-brand"
            onClick={() => selectTool(0)}
          >
            <div className="pt-brand-icon">{brandConfig.mark}</div>
            <div className="pt-brand-copy">
              <div className="pt-brand-text">{brandConfig.name}</div>
              {brandConfig.tagline && (
                <div className="pt-brand-tagline">{brandConfig.tagline}</div>
              )}
            </div>
          </button>

          <div className="pt-switch" role="group" aria-label="Switch system">
            <span className="pt-switch-seg active" aria-current="true">
              OLD
            </span>
            <a className="pt-switch-seg" href="/mission-control/">
              NEW
            </a>
          </div>

          <div className="pt-brand-switch" role="group" aria-label="Brand">
            {(Object.keys(BRANDS) as Brand[]).map((key) => (
              <button
                type="button"
                key={key}
                className={`pt-brand-pill${brand === key ? " active" : ""}`}
                onClick={() => selectBrand(key)}
                aria-pressed={brand === key}
              >
                {BRANDS[key].label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="pt-toggle"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            aria-controls="pt-menu"
          >
            <i className="fas fa-bars" />
          </button>

          <div id="pt-menu" className={`pt-menu${menuOpen ? " open" : ""}`}>
            <div className="pt-tools">
              {TOOLS.map((tool, index) => (
                <button
                  type="button"
                  key={tool.file}
                  className={`pt-item${index === activeIndex ? " active" : ""}`}
                  onClick={() => selectTool(index)}
                  aria-current={index === activeIndex ? "page" : undefined}
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
          key={`${brand}-${activeFile}`}
          src={`${BASE}tools/${activeFile}${import.meta.env.DEV ? `?v=${CACHE_BUST}` : ""}`}
          title={`M.A.R.K. — ${activeTool.label}`}
          allow="clipboard-write; clipboard-read"
        />
      </div>
    </div>
  );
}

export default App;
