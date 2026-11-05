import pg from "pg";
import { readFile } from "node:fs/promises";
const url = new URL(process.env.ROGNET_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
const ca = process.env.DATABASE_CA_CERT;
if (ca) { url.searchParams.delete('sslmode'); url.searchParams.delete('sslrootcert'); }
const sql = new pg.Client({connectionString:url.toString(),...(ca ? {ssl:{ca,rejectUnauthorized:true}} : {})});
const schema = process.env.DATABASE_SCHEMA;
if (schema && !/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid DATABASE_SCHEMA');
await sql.connect();
try {
  await sql.query('BEGIN');
  if (schema) {
    const existing = await sql.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema]);
    if (!existing.rowCount) await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET LOCAL search_path TO "${schema}"`);
  }
  for (const file of ['schema.sql','auth.sql','observatory.sql','oauth.sql','charts.sql','comparison-tables.sql','campaign-briefs.sql','comparison-versions.sql','series-charts.sql']) {
    const statements=(await readFile(new URL('../db/'+file,import.meta.url),'utf8')).split('-- statement');
    for (const statement of statements) if(statement.trim()) await sql.query(statement);
  }
  await sql.query('COMMIT');
  console.log('Database schema ready (registry, authentication, observatory).');
} catch(error) {await sql.query('ROLLBACK');throw error;}finally{await sql.end();}
