import { MapPin, ShieldCheck, Code2, FileWarning } from "lucide-react";
import reviewData from "@/data/portland-review.json";

interface DayHours {
  day: string;
  open24: boolean;
  closed: boolean;
  opens?: string;
  closes?: string;
}

interface GmbProfile {
  pageUrl: string;
  gmbUrl: string;
  cid: string;
  businessName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  phone: string;
  neighborhoods: string[];
  landmark: string;
  lat: number;
  lng: number;
  hours: string;
  openingHours?: DayHours[];
  plusCode?: string;
  website: string;
}

interface PortlandReview {
  generatedAt: string;
  profile: GmbProfile;
  gmbContextSuffix: string;
  gmbSchema: string;
  noGmbSchema: string;
}

const review = reviewData as PortlandReview;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </span>
      <span className="text-sm text-foreground font-mono break-words">{value}</span>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-secondary/5 border border-border rounded-lg p-4 text-xs font-mono text-foreground/90 overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

export default function PortlandReview() {
  const p = review.profile;
  return (
    <div className="max-w-4xl mx-auto px-8 py-10 flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Portland GMB — Schema Review</h1>
        </div>
        <p className="text-muted-foreground max-w-2xl">
          The verified Google Business Profile source-of-truth for the Portland, OR
          stand-in page, plus the two deterministic JSON-LD schemas the harness emits.
          This is generated without an LLM sweep — it costs nothing and calls no model.
        </p>
        <p className="text-xs text-muted-foreground font-mono">
          Generated {new Date(review.generatedAt).toLocaleString()}
        </p>
      </header>

      {/* Verified GMB profile */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Verified GMB Profile</h2>
        </div>
        <div className="bg-card border border-border rounded-lg p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Business Name" value={p.businessName} />
          <Field label="Page URL" value={p.pageUrl} />
          <Field label="Street" value={p.street} />
          <Field label="City / State / ZIP" value={`${p.city}, ${p.state} ${p.zip}`} />
          <Field label="County" value={p.county} />
          <Field label="Phone" value={p.phone} />
          <Field label="CID" value={p.cid} />
          <Field label="Map URL" value={p.gmbUrl} />
          <Field label="Coordinates" value={`${p.lat}, ${p.lng}`} />
          <Field label="Hours" value={p.hours} />
          <Field label="Landmark" value={p.landmark} />
          <Field label="Neighborhoods" value={p.neighborhoods.join(", ")} />
          {p.plusCode && <Field label="Plus Code" value={p.plusCode} />}
          <Field label="Website" value={p.website} />
        </div>
        {p.openingHours && p.openingHours.length > 0 && (
          <div className="bg-card border border-border rounded-lg p-6">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Structured Hours
            </span>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {p.openingHours.map((h) => (
                <div key={h.day} className="flex justify-between text-sm font-mono">
                  <span className="text-foreground/70">{h.day}</span>
                  <span className="text-foreground">
                    {h.closed
                      ? "Closed"
                      : h.open24
                        ? "Open 24 hours"
                        : `${h.opens ?? "00:00"}–${h.closes ?? "23:59"}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* GMB schema */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Code2 className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">GMB JSON-LD Schema</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Deterministic <code className="font-mono text-foreground/80">generateGmbSchema</code>{" "}
          output: <code className="font-mono text-foreground/80">@type ["RecyclingCenter","LocalBusiness"]</code>{" "}
          with the verified CID, full PostalAddress, geo, <code className="font-mono text-foreground/80">hasMap</code>,
          and <code className="font-mono text-foreground/80">openingHoursSpecification</code>.
        </p>
        <CodeBlock>{review.gmbSchema}</CodeBlock>
      </section>

      {/* No-GMB schema contrast */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <FileWarning className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">No-GMB Schema (contrast)</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          What a city with no own listing emits instead: HQ phone only — NO CID, NO
          street address, NO <code className="font-mono text-foreground/80">hasMap</code>. Correct
          absence of a signal that doesn't exist, never a fabricated local CID.
        </p>
        <CodeBlock>{review.noGmbSchema}</CodeBlock>
      </section>

      {/* Verbatim model context */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Verified Block Handed to Every Model</h2>
        <p className="text-sm text-muted-foreground">
          The identical GMB context suffix every model receives in the GMB scenario.
        </p>
        <CodeBlock>{review.gmbContextSuffix.trim()}</CodeBlock>
      </section>
    </div>
  );
}
