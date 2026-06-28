/**
 * Reusable Google-Maps "paste" parser for the bake-off (and, later, Mission
 * Control's run-creation UI — this module is deliberately free of any bake-off
 * or MC wiring so it can be lifted as-is).
 *
 * A VA sources a GMB page the way they actually work: they open the Google Maps
 * listing, copy the place URL, and copy the raw info panel (name / address /
 * phone / hours / plus code). This parser turns that paste into a structured,
 * publish-ready place record:
 *   - the decimal CID (converted from the `:0x…` hex segment in the place URL)
 *     plus the canonical `?cid=` maps URL,
 *   - the geo pin (`!3d<lat>!4d<lng>`),
 *   - street / city / state / zip,
 *   - phone,
 *   - 7-day opening hours (including "Open 24 hours" days),
 *   - the Open Location ("plus") code.
 *
 * It FAILS LOUD on any missing or unparseable required field rather than
 * inventing location data — a GMB page must be sourced, never fabricated.
 */

export type Weekday =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export const WEEKDAYS: Weekday[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** One day's opening hours, normalized to 24-hour `HH:MM` strings. */
export interface DayHours {
  day: Weekday;
  /** True for an "Open 24 hours" day (opens "00:00", closes "23:59"). */
  open24: boolean;
  /** True when the listing shows the day as Closed. */
  closed: boolean;
  /** Opening time as `HH:MM` (null when closed). */
  opens: string | null;
  /** Closing time as `HH:MM` (null when closed). */
  closes: string | null;
}

/** The structured place record extracted from a Google-Maps paste. */
export interface ParsedMapsPlace {
  businessName: string;
  /** Decimal CID derived from the place URL's `:0x…` hex segment. */
  cidDecimal: string;
  /** CID in schema.org `cid:<decimal>` form. */
  cid: string;
  /** Canonical Google Maps `?cid=<decimal>` URL. */
  cidUrl: string;
  lat: number;
  lng: number;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  plusCode: string;
  /** Mon→Sun, all seven days. */
  hours: DayHours[];
}

export interface MapsPasteInput {
  /** The Google Maps place URL (the long `/place/…!3d…!4d…!1s0x…:0x…` form). */
  placeUrl: string;
  /** The raw text copied from the Maps info panel (name/address/phone/hours/plus code). */
  rawDump: string;
}

/** A required field could not be parsed from the paste. We never invent it. */
export class MapsPasteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapsPasteError";
  }
}

/**
 * Extract the decimal CID from a Google Maps place URL. The URL embeds the place
 * as `!1s0x<featureHex>:0x<cidHex>` — the segment AFTER the `:0x` is the listing
 * CID in hex, which Maps' `?cid=` links carry as a decimal. We convert it with
 * BigInt so the full 64-bit value survives.
 */
export function extractCidFromUrl(placeUrl: string): string {
  const m = placeUrl.match(/!1s0x[0-9a-f]+:0x([0-9a-f]+)/i);
  if (!m) {
    throw new MapsPasteError(
      "Could not find a CID in the place URL — expected a `!1s0x<feature>:0x<cid>` segment. " +
        "Copy the full Google Maps place URL (the one with the `/data=…!1s…` payload).",
    );
  }
  return BigInt(`0x${m[1]}`).toString();
}

/**
 * Extract the geo pin from a Google Maps place URL. Prefers the explicit place
 * pin `!3d<lat>!4d<lng>`; falls back to the viewport center `@<lat>,<lng>`.
 */
export function extractGeoFromUrl(placeUrl: string): { lat: number; lng: number } {
  const pin = placeUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pin) return { lat: Number(pin[1]), lng: Number(pin[2]) };
  const at = placeUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) };
  throw new MapsPasteError(
    "Could not find geo coordinates in the place URL — expected `!3d<lat>!4d<lng>` (the map pin) or `@<lat>,<lng>`.",
  );
}

/** Normalize a `8:30 AM` / `5 PM` / `12 PM` clock string to 24-hour `HH:MM`. */
function to24Hour(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]\.?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const isPm = m[3].toLowerCase() === "p";
  if (hour === 12) hour = isPm ? 12 : 0;
  else if (isPm) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Parse one day's value text (e.g. `8:30 AM–5 PM`, `Open 24 hours`, `Closed`). */
function parseDayValue(day: Weekday, value: string): DayHours {
  const v = value.trim();
  if (/^closed$/i.test(v)) {
    return { day, open24: false, closed: true, opens: null, closes: null };
  }
  if (/(open\s*)?24\s*hours/i.test(v)) {
    return { day, open24: true, closed: false, opens: "00:00", closes: "23:59" };
  }
  // Range separated by an en-dash, hyphen, or the word "to".
  const range = v.split(/\s*(?:–|—|-|to)\s*/i);
  if (range.length === 2) {
    const opens = to24Hour(range[0]);
    const closes = to24Hour(range[1]);
    if (opens && closes) {
      return { day, open24: false, closed: false, opens, closes };
    }
  }
  throw new MapsPasteError(
    `Could not parse the hours for ${day}: "${value}". Expected "8:30 AM–5 PM", "Open 24 hours", or "Closed".`,
  );
}

/**
 * Parse the 7-day opening hours out of the raw dump. Each weekday must appear on
 * its own line as `<Weekday> <value>`. All seven days are required (fail loud).
 */
export function parseHours(rawDump: string): DayHours[] {
  const lines = rawDump.split(/\r?\n/);
  const byDay = new Map<Weekday, DayHours>();
  for (const line of lines) {
    const m = line.match(
      /^\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b[\s:]*([^\n]+?)\s*$/i,
    );
    if (!m) continue;
    const day = (m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()) as Weekday;
    if (byDay.has(day)) continue;
    byDay.set(day, parseDayValue(day, m[2]));
  }
  const missing = WEEKDAYS.filter((d) => !byDay.has(d));
  if (missing.length > 0) {
    throw new MapsPasteError(
      `Opening hours are incomplete — missing ${missing.join(", ")}. ` +
        "A GMB page must list all 7 days (use Closed for closed days); never invent hours.",
    );
  }
  return WEEKDAYS.map((d) => byDay.get(d)!);
}

/** Extract the first `..., City, ST ZIP` address line from the dump. */
export function parseAddress(rawDump: string): {
  street: string;
  city: string;
  state: string;
  zip: string;
} {
  const lines = rawDump.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(
      /^(.*?),\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?\s*$/,
    );
    if (!m) continue;
    // The portion before the city may carry a building-name prefix
    // ("Liberty Centre, 650 NE Holladay St #1600"); the street is the LAST
    // comma-segment of that portion.
    const beforeCity = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    const street = beforeCity[beforeCity.length - 1] ?? "";
    if (!street) continue;
    return { street, city: m[2].trim(), state: m[3], zip: m[4] };
  }
  throw new MapsPasteError(
    "Could not find a street address in the paste — expected a line like " +
      '"650 NE Holladay St #1600, Portland, OR 97232".',
  );
}

/** Extract a US phone number from the dump, normalized to `(NNN) NNN-NNNN`. */
export function parsePhone(rawDump: string): string {
  const m = rawDump.match(/(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/);
  if (!m) {
    throw new MapsPasteError(
      "Could not find a phone number in the paste — expected a 10-digit US number.",
    );
  }
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}

/** Extract the Open Location ("plus") code from the dump. */
export function parsePlusCode(rawDump: string): string {
  const m = rawDump.match(/\b([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})\b/i);
  if (!m) {
    throw new MapsPasteError(
      'Could not find a plus code in the paste — expected an Open Location Code like "G8GW+2C".',
    );
  }
  return m[1].toUpperCase();
}

/** Extract the business name — the first non-empty line of the dump. */
export function parseBusinessName(rawDump: string): string {
  const first = rawDump.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
  if (!first) {
    throw new MapsPasteError("The paste is empty — no business name found on the first line.");
  }
  return first;
}

/**
 * Parse a Google-Maps paste (place URL + raw info dump) into a structured
 * {@link ParsedMapsPlace}. Fails loud on any missing/unparseable required field;
 * never invents location data.
 */
export function parseGoogleMapsPaste(input: MapsPasteInput): ParsedMapsPlace {
  const placeUrl = input.placeUrl?.trim() ?? "";
  const rawDump = input.rawDump ?? "";
  if (!placeUrl) {
    throw new MapsPasteError("A Google Maps place URL is required.");
  }
  if (!rawDump.trim()) {
    throw new MapsPasteError("The raw Maps info dump is required.");
  }

  const cidDecimal = extractCidFromUrl(placeUrl);
  const { lat, lng } = extractGeoFromUrl(placeUrl);
  const { street, city, state, zip } = parseAddress(rawDump);

  return {
    businessName: parseBusinessName(rawDump),
    cidDecimal,
    cid: `cid:${cidDecimal}`,
    cidUrl: `https://www.google.com/maps?cid=${cidDecimal}`,
    lat,
    lng,
    street,
    city,
    state,
    zip,
    phone: parsePhone(rawDump),
    plusCode: parsePlusCode(rawDump),
    hours: parseHours(rawDump),
  };
}

/**
 * Render structured {@link DayHours} into a compact human string for prompt
 * context (e.g. "Mon-Fri 08:30-17:00; Sat-Sun Closed"). Deterministic.
 */
export function formatHoursLine(hours: DayHours[]): string {
  const abbr: Record<Weekday, string> = {
    Monday: "Mon",
    Tuesday: "Tue",
    Wednesday: "Wed",
    Thursday: "Thu",
    Friday: "Fri",
    Saturday: "Sat",
    Sunday: "Sun",
  };
  const describe = (h: DayHours): string =>
    h.closed ? "Closed" : h.open24 ? "Open 24 hours" : `${h.opens}-${h.closes}`;
  // Collapse consecutive days that share the same description into ranges.
  const parts: string[] = [];
  let i = 0;
  while (i < hours.length) {
    const desc = describe(hours[i]);
    let j = i;
    while (j + 1 < hours.length && describe(hours[j + 1]) === desc) j++;
    const label =
      i === j ? abbr[hours[i].day] : `${abbr[hours[i].day]}-${abbr[hours[j].day]}`;
    parts.push(`${label} ${desc}`);
    i = j + 1;
  }
  return parts.join("; ");
}
