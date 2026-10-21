#!/usr/bin/env node
// Apply the test bootstrap, every migration, the provided seed, then the assertions.
//
// Requires `psql` on PATH and a disposable database. Defaults to the local Supabase
// Postgres port; override with DATABASE_URL.
//
//   DATABASE_URL=postgres://postgres:postgres@localhost:54322/postgres npm run test:db

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:54322/postgres";
const psql = process.env.PSQL ?? "psql";
const root = process.cwd();

function run(file) {
  console.log(`\n→ ${file.replace(`${root}\\`, "").replace(`${root}/`, "")}`);
  execFileSync(
    psql,
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-q", "-f", file],
    { stdio: "inherit" },
  );
}

run(join(root, "supabase", "tests", "00_bootstrap.sql"));

const migrations = readdirSync(join(root, "supabase", "migrations"))
  .filter((file) => file.endsWith(".sql"))
  .sort();

for (const migration of migrations) {
  run(join(root, "supabase", "migrations", migration));
}

run(join(root, "supabase", "seed.sql"));
run(join(root, "supabase", "tests", "stall_detector_test.sql"));

console.log("\nDatabase tests passed.");
