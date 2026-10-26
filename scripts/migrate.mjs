import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
const sql = neon(process.env.DATABASE_URL);
const statements = (
  await readFile(new URL("../db/schema.sql", import.meta.url), "utf8")
).split("-- statement");
for (const statement of statements)
  if (statement.trim()) await sql.query(statement);
console.log("Database schema ready.");
