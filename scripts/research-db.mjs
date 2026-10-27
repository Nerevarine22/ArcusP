import postgres from 'postgres';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { researchCsv } from '../lib/research-export.ts';

const command = process.argv[2];
if (!['init', 'export', 'delete'].includes(command)) throw new Error('Use research:init, research:export, or research:delete -- <project> <address>.');
if (!process.env.DATABASE_URL?.trim()) throw new Error('Set DATABASE_URL in .env.local first.');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, ssl: 'require', connect_timeout: 8 });
try {
  if (command === 'init') {
    await sql.unsafe(await readFile(new URL('../db/research.sql', import.meta.url), 'utf8'));
    console.log('Research schema is ready.');
  } else if (command === 'export') {
    const rows = await sql`SELECT document FROM analytics_research.wallets ORDER BY project, address`;
    const wallets = rows.map(row => row.document);
    const directory = path.resolve('artifacts', 'research', new Date().toISOString().replace(/[:.]/g, '-'));
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'wallets.json'), JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), wallets }, null, 2));
    await writeFile(path.join(directory, 'periods.csv'), researchCsv(wallets));
    console.log(`Exported ${wallets.length} wallet records to ${directory}`);
  } else {
    const project = process.argv[3], address = process.argv[4]?.trim().toLowerCase();
    if (!['arcus', 'txflow'].includes(project) || !/^0x[0-9a-f]{40}$/.test(address ?? '')) throw new Error('Supply project (arcus or txflow) and a valid wallet address.');
    const deleted = await sql`DELETE FROM analytics_research.wallets WHERE project = ${project} AND address = ${address} RETURNING address`;
    console.log(`Deleted ${deleted.length} research record.`);
  }
} catch {
  console.error('Research database command failed. Check DATABASE_URL and whether research:init has completed.');
  process.exitCode = 1;
} finally { await sql.end({ timeout: 5 }); }
