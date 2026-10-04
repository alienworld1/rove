import assert from "node:assert/strict";
import { test } from "node:test";
import postgres from "postgres";
const url = process.env.HOSTED_TEST_DATABASE_URL;
test(
  "public database access cannot read private sessions or mutate published records",
  {
    skip:
      !url && "Set HOSTED_TEST_DATABASE_URL to an isolated migrated database",
  },
  async () => {
    const sql = postgres(url!);
    try {
      await sql.unsafe(
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rove_hosted_public_test') THEN CREATE ROLE rove_hosted_public_test; END IF; END $$",
      );
      await sql.unsafe(
        "GRANT USAGE ON SCHEMA public TO rove_hosted_public_test; GRANT SELECT ON hosted_sessions, published_runs TO rove_hosted_public_test; GRANT INSERT ON published_runs TO rove_hosted_public_test",
      );
      const tables =
        await sql`select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`;
      assert.ok(tables.length >= 25);
      assert.ok(tables.every((row) => row.relrowsecurity));
      await sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE rove_hosted_public_test");
        assert.equal((await tx`select * from hosted_sessions`).length, 0);
        await tx`select * from published_runs`;
      });
      await assert.rejects(
        sql.begin(async (tx) => {
          await tx.unsafe("SET LOCAL ROLE rove_hosted_public_test");
          await tx`insert into published_runs (run_id, title, description, payment, snapshot, published_at) values ('forbidden', 'Forbidden', 'Forbidden', 'Tempo', '{}', now())`;
        }),
        /row-level security/,
      );
    } finally {
      await sql.end();
    }
  },
);
