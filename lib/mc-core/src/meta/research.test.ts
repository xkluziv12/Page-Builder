import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { researchMeta } from "./research";

describe("researchMeta SSRF guard", () => {
  it("refuses a redirect hostname that resolves to a private address", async () => {
    const fetched: string[] = [];
    const fetchImpl = (async (input: string) => {
      fetched.push(input);
      return new Response(null, {
        status: 302,
        headers: { location: "https://private-redirect.example.com/secret" },
      });
    }) as unknown as typeof fetch;
    const resolveHostname = async (hostname: string) =>
      hostname === "private-redirect.example.com" ? ["169.254.169.254"] : ["93.184.216.34"];

    await expect(
      researchMeta(
        { url: "https://public.example.com/electronics-recycling-austin-tx" },
        {
          anthropic: {} as Anthropic,
          creds: { serpApiKey: "test" },
          fetchImpl,
          resolveHostname,
        },
      ),
    ).rejects.toThrow("Refusing to fetch a private, internal, or unresolved address");

    expect(fetched).toEqual(["https://public.example.com/electronics-recycling-austin-tx"]);
  });
});