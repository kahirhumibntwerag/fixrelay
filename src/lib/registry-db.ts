import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { getAuthPool } from "./auth";
import { databaseUrl } from "./database-config";

type Row = Record<string, any>;
// The Neon HTTP driver only works with Neon hosts. Other PostgreSQL providers
// use the same pooled driver as authentication, including transactions.
class LocalQuery implements PromiseLike<Row[]> {
  constructor(
    readonly text: string,
    readonly values: unknown[],
  ) {}
  private execute() {
    return getAuthPool()
      .query(this.text, this.values)
      .then((result) => result.rows);
  }
  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}
function localTag(strings: TemplateStringsArray, ...values: unknown[]) {
  return new LocalQuery(
    strings.reduce(
      (query, part, index) => query + (index ? "$" + index : "") + part,
      "",
    ),
    values,
  );
}
localTag.transaction = async (queries: LocalQuery[]) => {
  const client = await getAuthPool().connect();
  try {
    await client.query("BEGIN");
    const results: Row[][] = [];
    for (const query of queries)
      results.push((await client.query(query.text, query.values)).rows);
    await client.query("COMMIT");
    return results;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
export function registryDb() {
  const connectionString = databaseUrl();
  if (!connectionString) throw new Error("Database is not configured");
  const host = new URL(connectionString).hostname;
  return host.endsWith(".neon.tech") && !process.env.DATABASE_SCHEMA
    ? neon(connectionString)
    : (localTag as unknown as NeonQueryFunction<false, false>);
}
