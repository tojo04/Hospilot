import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const databasePath = resolve(root, 'data', 'hospilot.db');

const BLOCKED_SQL = /\b(?:insert|update|delete|drop|alter|create|replace|truncate|attach|detach|vacuum|reindex|analyze|pragma|load_extension)\b/i;
const COMMENT_PATTERN = /--|\/\*/;

export class UnsafeQueryError extends Error {}

export function normalizeAndValidateSql(candidate) {
  if (typeof candidate !== 'string') throw new UnsafeQueryError('The generated SQL was not text.');
  const sql = candidate.trim().replace(/;+\s*$/, '');
  if (!sql) throw new UnsafeQueryError('The generated SQL was empty.');
  if (sql.length > 5000) throw new UnsafeQueryError('The generated SQL was unexpectedly long.');
  if (!/^(?:select|with)\b/i.test(sql)) throw new UnsafeQueryError('Only SELECT queries are allowed.');
  if (BLOCKED_SQL.test(sql)) throw new UnsafeQueryError('The query contained a prohibited SQL operation.');
  if (COMMENT_PATTERN.test(sql)) throw new UnsafeQueryError('SQL comments are not allowed.');
  if (sql.includes(';')) throw new UnsafeQueryError('Multiple SQL statements are not allowed.');
  if (/\bsqlite_/i.test(sql)) throw new UnsafeQueryError('SQLite internal tables are not queryable.');
  return sql;
}

function openReadOnlyDatabase() {
  if (!existsSync(databasePath)) {
    throw new Error('Database not initialized. Run npm run db:seed first.');
  }
  const db = new DatabaseSync(databasePath, { readOnly: true });
  db.exec('PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;');
  return db;
}

export function executeReadOnlyQuery(candidate, maxRows = 100) {
  const sql = normalizeAndValidateSql(candidate);
  const db = openReadOnlyDatabase();
  try {
    db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all();
    const rows = db.prepare(`SELECT * FROM (${sql}) AS grounded_result LIMIT ${Number(maxRows)}`).all();
    return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value])));
  } catch (error) {
    if (error instanceof UnsafeQueryError) throw error;
    throw new Error(`SQL execution failed: ${error.message}`);
  } finally {
    db.close();
  }
}

export function getSchemaCatalog() {
  const db = openReadOnlyDatabase();
  try {
    const tables = db.prepare(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
    return tables.map(({ name }) => {
      const columns = db.prepare(`PRAGMA table_info("${name}")`).all();
      return `${name}(${columns.map((column) => `${column.name} ${column.type}`).join(', ')})`;
    }).join('\n');
  } finally {
    db.close();
  }
}

export function getDatasetSummary() {
  const db = openReadOnlyDatabase();
  try {
    return db.prepare(`SELECT
      (SELECT COUNT(*) FROM beds WHERE is_active = 1) AS active_beds,
      (SELECT COUNT(*) FROM ipd_admissions WHERE lower(status) = 'admitted') AS active_admissions,
      (SELECT COUNT(*) FROM staff_roster) AS roster_rows,
      (SELECT COUNT(*) FROM visits) AS visits,
      (SELECT COUNT(*) FROM claims) AS claims,
      (SELECT COUNT(*) FROM supplies) AS supplies
    `).get();
  } finally {
    db.close();
  }
}
