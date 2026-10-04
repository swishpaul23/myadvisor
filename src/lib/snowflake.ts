import "server-only";
import path from "node:path";
import snowflake from "snowflake-sdk";
import { z } from "zod";

// One shared Snowflake connection for the server, key-pair (JWT) auth. Settings come from
// SNOWFLAKE_* in .env.local; nothing here is sent to the client. Never log query binds:
// they can hold a student's question.

const envSchema = z.object({
  SNOWFLAKE_ACCOUNT: z.string().min(1),
  SNOWFLAKE_USER: z.string().min(1),
  SNOWFLAKE_ROLE: z.string().min(1),
  SNOWFLAKE_WAREHOUSE: z.string().min(1),
  SNOWFLAKE_DATABASE: z.string().min(1),
  SNOWFLAKE_SCHEMA: z.string().min(1),
  SNOWFLAKE_PRIVATE_KEY_PATH: z.string().min(1),
});

// Driver messages go to the server console (errors only, already secret-masked by the
// driver) instead of a snowflake.log file in the project root.
snowflake.configure({
  logLevel: "ERROR",
  customLogger: {
    error: (message) => console.error(`[snowflake] ${message}`),
    warn: () => {},
    info: () => {},
    debug: () => {},
    trace: () => {},
  },
});

let connection: Promise<snowflake.Connection> | null = null;

function connect(): Promise<snowflake.Connection> {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    return Promise.reject(new Error(`Snowflake settings missing: ${missing}`));
  }
  const env = parsed.data;
  const conn = snowflake.createConnection({
    account: env.SNOWFLAKE_ACCOUNT,
    username: env.SNOWFLAKE_USER,
    authenticator: "SNOWFLAKE_JWT",
    privateKeyPath: path.resolve(env.SNOWFLAKE_PRIVATE_KEY_PATH),
    role: env.SNOWFLAKE_ROLE,
    warehouse: env.SNOWFLAKE_WAREHOUSE,
    database: env.SNOWFLAKE_DATABASE,
    schema: env.SNOWFLAKE_SCHEMA,
  });
  return new Promise((resolve, reject) =>
    conn.connect((err) => (err ? reject(err) : resolve(conn))),
  );
}

/** The shared connection, opened on first use. A failed attempt is retried on the next call. */
export function getConnection(): Promise<snowflake.Connection> {
  connection ??= connect().catch((err: unknown) => {
    connection = null;
    throw err;
  });
  return connection;
}

/** Runs one statement and returns its rows (column names as Snowflake returns them, upper case). */
export async function query<T = Record<string, unknown>>(
  sqlText: string,
  binds: snowflake.Bind[] = [],
): Promise<T[]> {
  const conn = await getConnection();
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) =>
        err ? reject(err) : resolve((rows ?? []) as T[]),
    });
  });
}
