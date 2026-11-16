import postgres from 'postgres';
import { readFile } from 'node:fs/promises';

if (!process.env.DATABASE_URL?.trim()) throw new Error('Set DATABASE_URL in .env.local first.');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, ssl: 'require', connect_timeout: 8 });
try {
  await sql.unsafe(await readFile(new URL('../db/entropy.sql', import.meta.url), 'utf8'));
  console.log('Entropy analytics schema is ready.');
} catch {
  console.error('Entropy schema could not be created. Check the database connection and schema permissions.');
  process.exitCode = 1;
} finally { await sql.end({ timeout: 5 }); }
