/**
 * One-off, idempotent apply: insert the three Tier 0 operations staff with
 * is_admin = true into public.coaches, only when their initials are absent.
 * Safe to re-run. Reads SUPABASE_DB_URL from the environment (never logged).
 *
 * Run with:  node --env-file=.env.local scripts/apply-admin-staff.mjs
 */
import { Client } from "pg";

const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error(
    "Missing SUPABASE_DB_URL. Add it to .env.local, e.g.\n" +
      "SUPABASE_DB_URL=postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres",
  );
  process.exit(1);
}

const STAFF = [
  ["Juan Herrera", "JH", "Director of Tennis"],
  ["Amar Vora", "AMV", "Assistant Director of Tennis Operations"],
  ["Phillip McMurray", "PM", "Tennis Operations Coordinator"],
];

const insertSql = `
  insert into public.coaches (full_name, initials, title, season, is_admin, is_active)
  select v.full_name, v.initials, v.title, 'year_round', true, true
  from (values ($1,$2,$3),($4,$5,$6),($7,$8,$9))
    as v(full_name, initials, title)
  where not exists (
    select 1 from public.coaches c where c.initials = v.initials
  )
  returning initials, full_name, title, is_admin;
`;

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  const inserted = await client.query(insertSql, STAFF.flat());
  console.log(`Inserted ${inserted.rowCount} new staff row(s):`);
  console.table(inserted.rows);

  const check = await client.query(
    `select initials, full_name, title, is_admin, is_active
       from public.coaches
      where initials = any($1::text[])
      order by initials;`,
    [["JH", "AMV", "PM"]],
  );
  console.log("Current state for JH / AMV / PM:");
  console.table(check.rows);
} catch (err) {
  console.error("Apply failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
