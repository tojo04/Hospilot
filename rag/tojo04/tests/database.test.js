import test from 'node:test';
import assert from 'node:assert/strict';
import { executeReadOnlyQuery, normalizeAndValidateSql, UnsafeQueryError } from '../src/database.js';

test('seeded ICU availability has the expected grounded count', () => {
  const rows = executeReadOnlyQuery(`
    SELECT COUNT(*) AS available_icu_beds
    FROM beds
    WHERE ward = 'ICU' AND status = 'Available' AND is_active = 1
  `);
  assert.deepEqual(rows, [{ available_icu_beds: 6 }]);
});

test('ward occupancy query supports grouping, ranking, and computed percentages', () => {
  const rows = executeReadOnlyQuery(`
    SELECT ward,
      SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) AS occupied_beds,
      COUNT(*) AS total_beds,
      ROUND(100.0 * SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) / COUNT(*), 1) AS occupancy_percent
    FROM beds WHERE is_active = 1
    GROUP BY ward ORDER BY occupancy_percent DESC, ward
  `);
  assert.deepEqual(rows[0], { ward: 'ICU', occupied_beds: 17, total_beds: 30, occupancy_percent: 56.7 });
  assert.equal(rows.length, 8);
});

test('short-staffing is derived from load capacity rather than guessed', () => {
  const rows = executeReadOnlyQuery(`
    SELECT area_label, role, assigned_load - (headcount * load_per_staff) AS shortage_load
    FROM staff_roster
    WHERE shift = 'night' AND assigned_load > headcount * load_per_staff
    ORDER BY shortage_load DESC, area_label
  `);
  assert.deepEqual(rows, [
    { area_label: 'ICU', role: 'Nurse', shortage_load: 5 },
    { area_label: 'Emergency', role: 'Nurse', shortage_load: 1 },
    { area_label: 'Pediatrics', role: 'Nurse', shortage_load: 1 }
  ]);
});

test('only a single read-only SELECT or CTE is accepted', () => {
  assert.equal(normalizeAndValidateSql('SELECT 1;'), 'SELECT 1');
  assert.match(normalizeAndValidateSql('WITH values_cte AS (SELECT 1 AS n) SELECT n FROM values_cte'), /^WITH/);
  for (const sql of [
    'DELETE FROM beds',
    'SELECT * FROM beds; DROP TABLE beds',
    'PRAGMA table_info(beds)',
    'SELECT * FROM sqlite_master',
    'SELECT * FROM beds -- ignore limits'
  ]) assert.throws(() => normalizeAndValidateSql(sql), UnsafeQueryError);
});

test('the execution connection remains read-only', () => {
  assert.throws(() => executeReadOnlyQuery('UPDATE beds SET status = \'Available\''), /Only SELECT/);
  const count = executeReadOnlyQuery('SELECT COUNT(*) AS count FROM beds')[0].count;
  assert.equal(count, 101);
});
