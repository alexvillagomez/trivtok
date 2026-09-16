import "./loadEnv";
import { readFile } from "node:fs/promises";
import { sql } from "../lib/db/client";

// For each file arg, count how many of its question texts already exist in the
// DB — tells us whether a killed agent's insert actually landed.
async function main() {
  for (const file of process.argv.slice(2)) {
    let texts: string[];
    try {
      texts = (JSON.parse(await readFile(file, "utf8")) as { text: string }[]).map((q) => q.text);
    } catch {
      console.log(`${file}: UNREADABLE`);
      continue;
    }
    const rows = await sql<{ n: number }[]>`select count(*)::int as n from questions where text = any(${texts})`;
    console.log(`${file}: ${rows[0].n}/${texts.length} present in DB`);
  }
  await sql.end();
}
main();
