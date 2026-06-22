import { db, promptsTable, BRANDS, type Brand } from "@workspace/db";
import { eq, and } from "drizzle-orm";

type SeedDef = {
  slug: string;
  name: string;
};

const PROMPTS: SeedDef[] = [
  { slug: "seo-audit", name: "SEO Audit" },
  { slug: "page-builder", name: "Page Builder" },
  { slug: "schema-generator", name: "Schema Generator" },
  { slug: "blog-strategy", name: "Blog Strategy" },
  { slug: "hub-spoke", name: "Hub + Spoke Planner" },
  { slug: "blog-seo-audit", name: "Blog SEO Audit" },
  { slug: "job-title-seo", name: "Job Title SEO" },
  { slug: "k12-job-titles-seo", name: "K-12 Job Titles SEO" },
];

const BRAND_LABEL: Record<Brand, string> = {
  sts: "STS Electronic Recycling",
  dcd: "DCD",
  technocycle: "Technocycle",
};

function starterContent(brand: Brand, def: SeedDef): string {
  return [
    `# ${def.name} — ${BRAND_LABEL[brand]}`,
    "",
    "This is the starting copy of the master prompt. Replace it with the latest",
    "approved version, then click Publish to push it to Google Drive.",
    "",
    `Brand: ${BRAND_LABEL[brand]}`,
    `Prompt: ${def.name}`,
    "",
    "<!-- Paste the full master prompt here -->",
  ].join("\n");
}

async function main(): Promise<void> {
  let inserted = 0;
  let skipped = 0;

  for (const brand of BRANDS) {
    for (const def of PROMPTS) {
      const [existing] = await db
        .select({ id: promptsTable.id })
        .from(promptsTable)
        .where(
          and(eq(promptsTable.brand, brand), eq(promptsTable.slug, def.slug)),
        );

      if (existing) {
        skipped++;
        continue;
      }

      await db.insert(promptsTable).values({
        brand,
        slug: def.slug,
        name: def.name,
        content: starterContent(brand, def),
        version: 0,
        driveFileId: null,
      });
      inserted++;
    }
  }

  console.log(`Seed complete. Inserted ${inserted}, skipped ${skipped}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
