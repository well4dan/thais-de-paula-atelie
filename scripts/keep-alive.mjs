// Script CLI de Keep-Alive para manter o projeto Supabase PostgreSQL sempre ativo.
// Pode ser executado manualmente (npm run keep-alive) ou via GitHub Actions Cron.

import { ensureDatabaseReady, pingKeepAlive, pool } from "../server/pg-pool.mjs";

const source = process.argv[2] || "cli_keepalive";

try {
  await ensureDatabaseReady();
  const beat = await pingKeepAlive(source);
  process.stdout.write(
    `[Keep-Alive OK] Supabase PostgreSQL ativo! Total de batidas: ${beat.total_beats} | Última: ${beat.last_beat_at.toISOString()} (${beat.last_source})\n`
  );
} finally {
  await pool.end();
}
