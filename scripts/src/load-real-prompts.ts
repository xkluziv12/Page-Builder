import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { db, promptsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

/**
 * One-off loader: imports real master-prompt content that was exported from the
 * operator's Google Drive (the "(4.7)" docs) into the matching prompt rows, and
 * normalizes every row's gitPath to the dedicated `page-terminal/<brand>/<slug>`
 * folder so Page Terminal's published prompts never collide with other content
 * in the shared private repo.
 *
 * Content files live in a local dir (default /tmp/p2), named `<brand>__<slug>.md`.
 * It only sets the editable draft `content`; publishing is done separately so the
 * published snapshot + GitHub/Drive sync run through the app's normal path.
 */
const DIR = process.env.PROMPT_CONTENT_DIR?.trim() || "/tmp/p2";

async function main(): Promise<void> {
  const rows = await db.select().from(promptsTable);
  for (const r of rows) {
    const want = `page-terminal/${r.brand}/${r.slug}.md`;
    if (r.gitPath !== want) {
      await db
        .update(promptsTable)
        .set({ gitPath: want })
        .where(eq(promptsTable.id, r.id));
    }
  }
  console.log(`Normalized gitPath for ${rows.length} rows.`);

  const files = readdirSync(DIR).filter((f) => f.endsWith(".md"));
  const ids: number[] = [];
  for (const file of files) {
    const [brand, ...rest] = file.replace(/\.md$/, "").split("__");
    const slug = rest.join("__");
    const content = readFileSync(join(DIR, file), "utf8");
    const [row] = await db
      .update(promptsTable)
      .set({ content, updatedAt: new Date() })
      .where(and(eq(promptsTable.brand, brand), eq(promptsTable.slug, slug)))
      .returning();
    if (!row) {
      console.log(`!! no row for ${brand}/${slug} (${file})`);
      continue;
    }
    ids.push(row.id);
    console.log(`Loaded ${brand}/${slug} <- ${file} (${content.length} chars) id=${row.id} git=${row.gitPath}`);
  }
  console.log(`PUBLISH_IDS=${ids.join(",")}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
