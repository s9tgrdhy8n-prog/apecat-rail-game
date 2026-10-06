import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("no-db");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
const client = await pool.connect();
try {
  await client.query("begin");
  const found = await client.query(
    "select user_id, name from rail_players where name_key = $1",
    ["railcheck"],
  );
  if (!found.rows.length) {
    await client.query("rollback");
    console.log("missing");
  } else {
    const id = found.rows[0].user_id;
    await client.query("delete from rail_runs where user_id = $1", [id]);
    await client.query("delete from rail_devices where user_id = $1", [id]);
    const gone = await client.query("delete from rail_players where user_id = $1", [id]);
    await client.query("commit");
    console.log("deleted", gone.rowCount, found.rows[0].name);
  }
} catch (err) {
  try {
    await client.query("rollback");
  } catch {
    /* keep the original error */
  }
  console.log("failed", err && err.code ? err.code : "error");
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
