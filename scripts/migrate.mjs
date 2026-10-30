import pg from "pg";
import { readFile } from "node:fs/promises";
const sql = new pg.Client({connectionString:process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL});
await sql.connect();
try {
  await sql.query('BEGIN');
  for (const file of ['schema.sql','auth.sql','observatory.sql','oauth.sql','charts.sql']) {
    const statements=(await readFile(new URL('../db/'+file,import.meta.url),'utf8')).split('-- statement');
    for (const statement of statements) if(statement.trim()) await sql.query(statement);
  }
  await sql.query('COMMIT');
  console.log('Database schema ready (registry, authentication, observatory).');
} catch(error) {await sql.query('ROLLBACK');throw error;}finally{await sql.end();}
