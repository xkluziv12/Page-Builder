import { describe, expect, it } from "vitest";
import {
  MapsPasteError,
  extractCidFromUrl,
  extractGeoFromUrl,
  parseAddress,
  parseHours,
  parsePhone,
  parsePlusCode,
  parseBusinessName,
  parseGoogleMapsPaste,
  formatHoursLine,
} from "./maps-paste";

// A representative Google-Maps paste: place URL with a known CID hex + geo pin,
// plus the raw info-panel dump (name / address / phone / plus code / 7-day hours
// including a closed weekend). The CID hex `9f3e2d1c4b5a6e7f` is a known value
// whose decimal is asserted exactly so a future regex/BigInt change can't drift.
const PLACE_URL =
  "https://www.google.com/maps/place/Regus+-+Portland+-+Liberty+Centre/" +
  "@45.5301,-122.657,17z/data=!3m1!4b1!4m6!3m5" +
  "!1s0x5495a0a3d8f1c2b3:0x9f3e2d1c4b5a6e7f!8m2!3d45.5301!4d-122.657!16s%2Fg%2F11abcd1234";
const KNOWN_CID_DECIMAL = "11474658500133154431";

const RAW_DUMP = [
  "Regus - Portland - Liberty Centre",
  "4.0 (15)",
  "Office space rental agency",
  "Liberty Centre, 650 NE Holladay St #1600, Portland, OR 97232",
  "G8GW+2C Portland, Oregon",
  "Phone: (972) 764-8880",
  "Monday 8:30 AM–5:00 PM",
  "Tuesday 8:30 AM–5:00 PM",
  "Wednesday 8:30 AM–5:00 PM",
  "Thursday 8:30 AM–5:00 PM",
  "Friday 8:30 AM–5:00 PM",
  "Saturday Closed",
  "Sunday Closed",
].join("\n");

describe("extractCidFromUrl", () => {
  it("converts the `:0x<hex>` CID segment to decimal (known value)", () => {
    expect(extractCidFromUrl(PLACE_URL)).toBe(KNOWN_CID_DECIMAL);
  });

  it("throws when no CID segment is present", () => {
    expect(() => extractCidFromUrl("https://maps.google.com/place/foo")).toThrow(MapsPasteError);
  });
});

describe("extractGeoFromUrl", () => {
  it("prefers the `!3d!4d` place pin", () => {
    expect(extractGeoFromUrl(PLACE_URL)).toEqual({ lat: 45.5301, lng: -122.657 });
  });

  it("falls back to the `@lat,lng` viewport center", () => {
    expect(extractGeoFromUrl("https://www.google.com/maps/place/x/@40.1,-80.2,15z")).toEqual({
      lat: 40.1,
      lng: -80.2,
    });
  });

  it("throws when no coordinates are present", () => {
    expect(() => extractGeoFromUrl("https://www.google.com/maps")).toThrow(MapsPasteError);
  });
});

describe("parseAddress", () => {
  it("extracts the street (last pre-city segment), city, state, and zip", () => {
    expect(parseAddress(RAW_DUMP)).toEqual({
      street: "650 NE Holladay St #1600",
      city: "Portland",
      state: "OR",
      zip: "97232",
    });
  });

  it("throws when no `City, ST ZIP` line is present", () => {
    expect(() => parseAddress("Regus\nPhone: (972) 764-8880")).toThrow(MapsPasteError);
  });
});

describe("parsePhone", () => {
  it("normalizes to `(NNN) NNN-NNNN`", () => {
    expect(parsePhone("Phone: 972.764.8880")).toBe("(972) 764-8880");
    expect(parsePhone("call +1 (972) 764-8880 now")).toBe("(972) 764-8880");
  });

  it("throws when no phone is present", () => {
    expect(() => parsePhone("Regus - Portland")).toThrow(MapsPasteError);
  });
});

describe("parsePlusCode", () => {
  it("extracts and uppercases the Open Location Code", () => {
    expect(parsePlusCode("g8gw+2c Portland")).toBe("G8GW+2C");
  });

  it("throws when no plus code is present", () => {
    expect(() => parsePlusCode("no code here")).toThrow(MapsPasteError);
  });
});

describe("parseBusinessName", () => {
  it("returns the first non-empty line", () => {
    expect(parseBusinessName("\n  Regus - Portland - Liberty Centre\n4.0 (15)")).toBe(
      "Regus - Portland - Liberty Centre",
    );
  });
});

describe("parseHours", () => {
  it("parses all 7 days, normalizing to 24h and marking closed days", () => {
    const hours = parseHours(RAW_DUMP);
    expect(hours).toHaveLength(7);
    expect(hours[0]).toEqual({
      day: "Monday",
      open24: false,
      closed: false,
      opens: "08:30",
      closes: "17:00",
    });
    expect(hours[5]).toEqual({
      day: "Saturday",
      open24: false,
      closed: true,
      opens: null,
      closes: null,
    });
  });

  it("handles an `Open 24 hours` day as 00:00–23:59", () => {
    const dump = [
      "Monday Open 24 hours",
      "Tuesday Open 24 hours",
      "Wednesday Open 24 hours",
      "Thursday Open 24 hours",
      "Friday Open 24 hours",
      "Saturday Open 24 hours",
      "Sunday Open 24 hours",
    ].join("\n");
    const hours = parseHours(dump);
    expect(hours[0]).toEqual({
      day: "Monday",
      open24: true,
      closed: false,
      opens: "00:00",
      closes: "23:59",
    });
  });

  it("throws when a weekday is missing (never invents hours)", () => {
    const dump = ["Monday 8:30 AM–5:00 PM", "Tuesday 8:30 AM–5:00 PM"].join("\n");
    expect(() => parseHours(dump)).toThrow(MapsPasteError);
  });
});

describe("parseGoogleMapsPaste", () => {
  it("assembles the full structured place record", () => {
    const place = parseGoogleMapsPaste({ placeUrl: PLACE_URL, rawDump: RAW_DUMP });
    expect(place).toMatchObject({
      businessName: "Regus - Portland - Liberty Centre",
      cidDecimal: KNOWN_CID_DECIMAL,
      cid: `cid:${KNOWN_CID_DECIMAL}`,
      cidUrl: `https://www.google.com/maps?cid=${KNOWN_CID_DECIMAL}`,
      lat: 45.5301,
      lng: -122.657,
      street: "650 NE Holladay St #1600",
      city: "Portland",
      state: "OR",
      zip: "97232",
      phone: "(972) 764-8880",
      plusCode: "G8GW+2C",
    });
    expect(place.hours).toHaveLength(7);
  });

  it("throws when the place URL is empty", () => {
    expect(() => parseGoogleMapsPaste({ placeUrl: "", rawDump: RAW_DUMP })).toThrow(MapsPasteError);
  });

  it("throws when the raw dump is empty", () => {
    expect(() => parseGoogleMapsPaste({ placeUrl: PLACE_URL, rawDump: "" })).toThrow(MapsPasteError);
  });
});

describe("formatHoursLine", () => {
  it("collapses consecutive same-value days into ranges", () => {
    expect(formatHoursLine(parseHours(RAW_DUMP))).toBe("Mon-Fri 08:30-17:00; Sat-Sun Closed");
  });
});
