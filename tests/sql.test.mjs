// Run: ~/.local/node/bin/node tests/sql.test.mjs
import assert from 'node:assert/strict';
import { createDatabase, runSQL, looksLikeSQL, TABLE_NAMES } from '../js/sql.js';

const db = createDatabase();
const run = (sql) => runSQL(db, sql);
// Data rows of a successful SELECT as arrays of trimmed cell strings (skips header, rule and footer).
const cells = (sql) => {
  const r = run(sql);
  assert.equal(r.ok, true, `${sql}\n${r.lines.join('\n')}`);
  return r.lines.slice(2, -1).map((l) => l.split('|').map((c) => c.trim()));
};
const col = (sql, i = 0) => cells(sql).map((r) => r[i]);
const footer = (sql) => run(sql).lines.at(-1);
const err = (sql, ...lines) => {
  const r = run(sql);
  assert.equal(r.ok, false, `expected error for: ${sql}`);
  assert.deepEqual(r.lines, lines);
};

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push([name, e]); }
}

test('exports', () => {
  assert.deepEqual(TABLE_NAMES, ['projects', 'skills']);
  assert.deepEqual(Object.keys(db.tables), TABLE_NAMES);
});

test('SELECT * and column order', () => {
  const r = run('SELECT * FROM projects');
  assert.match(r.lines[0], /^ id \|\s+name\s+\|\s+lang\s+\|\s+year\s+\|\s+stack\s+\|\s+summary\s+\|\s+repo\s+\|\s+demo$/);
  assert.equal(r.lines.at(-1), '(7 rows)');
  assert.equal(footer('SELECT * FROM skills'), '(18 rows)');
});

test('column list', () => {
  assert.deepEqual(col('SELECT name FROM projects'), ['OakDB', 'Viral Clipper', 'CodePair', 'AI Interview Coach', 'Job Tracker', 'UniLondon', 'AI Security Assessment']);
});

test('truncation to 48 chars with ellipsis', () => {
  const [row] = cells('SELECT summary FROM projects LIMIT 1');
  assert.equal([...row[0]].length, 48);
  assert.ok(row[0].endsWith('…'));
});

test('comparison operators', () => {
  assert.deepEqual(col('SELECT id FROM projects WHERE id = 3'), ['3']);
  assert.deepEqual(col('SELECT id FROM projects WHERE id != 3').length, 6);
  assert.deepEqual(col('SELECT id FROM projects WHERE id <> 3').length, 6);
  assert.deepEqual(col('SELECT id FROM projects WHERE id < 3'), ['1', '2']);
  assert.deepEqual(col('SELECT id FROM projects WHERE id > 5'), ['6', '7']);
  assert.deepEqual(col('SELECT id FROM projects WHERE id <= 2'), ['1', '2']);
  assert.deepEqual(col('SELECT id FROM projects WHERE id >= 6'), ['6', '7']);
  assert.deepEqual(col("SELECT name FROM projects WHERE lang = 'Go'"), ['OakDB']);
  assert.deepEqual(col('SELECT id FROM projects WHERE 2.5 < id AND id < 4.5'), ['3', '4']);
});

test('LIKE and ILIKE', () => {
  assert.deepEqual(col("SELECT name FROM projects WHERE name LIKE 'O%'"), ['OakDB']);
  assert.deepEqual(col("SELECT name FROM projects WHERE name LIKE 'o%'"), []);
  assert.deepEqual(col("SELECT name FROM projects WHERE name ILIKE 'o%'"), ['OakDB']);
  assert.deepEqual(col("SELECT name FROM projects WHERE name LIKE 'Oak__'"), ['OakDB']);
  assert.deepEqual(col("SELECT name FROM projects WHERE name LIKE 'Oak_'"), []);
  assert.deepEqual(col("SELECT name FROM projects WHERE name LIKE '%Coach'"), ['AI Interview Coach']);
  assert.equal(footer("SELECT name FROM projects WHERE name NOT LIKE 'A%'"), '(5 rows)');
  assert.deepEqual(col("SELECT name FROM projects WHERE name LIKE 'a.%'"), []); // '.' is literal
});

test('IN, NOT IN', () => {
  assert.deepEqual(col("SELECT name FROM projects WHERE lang IN ('Go', 'Python') ORDER BY id"), ['OakDB', 'Viral Clipper', 'AI Security Assessment']);
  assert.equal(footer("SELECT name FROM projects WHERE lang NOT IN ('Go', 'Python')"), '(4 rows)');
  assert.deepEqual(col('SELECT id FROM projects WHERE id IN (1, 2, 99)'), ['1', '2']);
  // NOT IN with a NULL in the list is never true
  assert.equal(footer('SELECT id FROM projects WHERE id NOT IN (1, NULL)'), '(0 rows)');
});

test('BETWEEN', () => {
  assert.deepEqual(col('SELECT id FROM projects WHERE id BETWEEN 2 AND 4'), ['2', '3', '4']);
  assert.deepEqual(col('SELECT id FROM projects WHERE id NOT BETWEEN 2 AND 6'), ['1', '7']);
  assert.deepEqual(col('SELECT id FROM projects WHERE id BETWEEN 2 AND 3 OR id = 7'), ['2', '3', '7']);
});

test('IS NULL / IS NOT NULL (demo) and NULL semantics', () => {
  assert.deepEqual(col('SELECT name FROM projects WHERE demo IS NULL'), ['OakDB', 'Viral Clipper']);
  assert.equal(footer('SELECT name FROM projects WHERE demo IS NOT NULL'), '(5 rows)');
  assert.equal(footer("SELECT name FROM projects WHERE demo = ''"), '(0 rows)');
  assert.equal(footer('SELECT name FROM projects WHERE demo = NULL'), '(0 rows)');
  assert.equal(footer("SELECT name FROM projects WHERE demo != 'x'"), '(5 rows)'); // NULL rows excluded
  assert.equal(footer("SELECT name FROM projects WHERE NOT demo LIKE 'x%'"), '(5 rows)');
  const lines = run('SELECT name, demo FROM projects WHERE id = 1').lines;
  assert.equal(lines[2], ' OakDB | '.trimEnd());
});

test('AND / OR / NOT precedence', () => {
  // AND binds tighter than OR: id = 1 OR (id = 2 AND lang = 'Go') -> only 1
  assert.deepEqual(col("SELECT id FROM projects WHERE id = 1 OR id = 2 AND lang = 'Go'"), ['1']);
  assert.deepEqual(col("SELECT id FROM projects WHERE (id = 1 OR id = 2) AND lang = 'Go'"), ['1']);
  // NOT binds tighter than AND
  assert.deepEqual(col('SELECT id FROM projects WHERE NOT id < 6 AND id < 7'), ['6']);
  assert.deepEqual(col('SELECT id FROM projects WHERE NOT (id < 6 OR id > 6)'), ['6']);
  assert.deepEqual(col('SELECT id FROM projects WHERE NOT NOT id = 1'), ['1']);
});

test('ORDER BY asc / desc / multi-key / position / alias', () => {
  assert.deepEqual(col('SELECT id FROM projects ORDER BY id DESC'), ['7', '6', '5', '4', '3', '2', '1']);
  assert.deepEqual(col('SELECT id FROM projects ORDER BY id ASC LIMIT 2'), ['1', '2']);
  const rows = cells('SELECT lang, id FROM projects ORDER BY lang ASC, id DESC');
  assert.deepEqual(rows.map((r) => r.join(':')), ['Go:1', 'JavaScript:6', 'JavaScript:5', 'Python:7', 'Python:2', 'TypeScript:4', 'TypeScript:3']);
  assert.deepEqual(col('SELECT name, year, id FROM projects ORDER BY 3 DESC LIMIT 1'), ['AI Security Assessment']);
  assert.deepEqual(col('SELECT name AS n FROM projects ORDER BY n LIMIT 1'), ['AI Interview Coach']);
  assert.deepEqual(col('SELECT id FROM projects ORDER BY name DESC LIMIT 1'), ['2']); // Viral Clipper
  // NULLs sort last ascending, first descending
  assert.deepEqual(col('SELECT demo FROM projects ORDER BY demo LIMIT 6').at(-1), '');
  assert.deepEqual(col('SELECT demo FROM projects ORDER BY demo DESC LIMIT 1'), ['']);
  err('SELECT id FROM projects ORDER BY 2', 'ERROR:  ORDER BY position 2 is not in select list');
});

test('LIMIT / OFFSET', () => {
  assert.deepEqual(col('SELECT id FROM projects ORDER BY id LIMIT 3'), ['1', '2', '3']);
  assert.deepEqual(col('SELECT id FROM projects ORDER BY id LIMIT 2 OFFSET 2'), ['3', '4']);
  assert.deepEqual(col('SELECT id FROM projects ORDER BY id OFFSET 5'), ['6', '7']);
  assert.deepEqual(col('SELECT id FROM projects ORDER BY id OFFSET 5 LIMIT 1'), ['6']);
  assert.equal(footer('SELECT id FROM projects LIMIT 0'), '(0 rows)');
  assert.equal(footer('SELECT id FROM projects LIMIT 1'), '(1 row)');
  assert.equal(footer('SELECT id FROM projects OFFSET 100'), '(0 rows)');
});

test('DISTINCT', () => {
  assert.deepEqual(col('SELECT DISTINCT lang FROM projects ORDER BY lang'), ['Go', 'JavaScript', 'Python', 'TypeScript']);
  assert.equal(footer('SELECT DISTINCT year FROM projects'), '(1 row)');
  assert.equal(footer('SELECT DISTINCT category FROM skills'), '(6 rows)');
});

test('aggregates: COUNT, MIN, MAX', () => {
  assert.deepEqual(cells('SELECT COUNT(*) FROM projects'), [['7']]);
  assert.deepEqual(cells('SELECT COUNT(demo) FROM projects'), [['5']]);
  assert.deepEqual(cells("SELECT COUNT(*) FROM projects WHERE lang = 'Rust'"), [['0']]);
  assert.deepEqual(cells('SELECT MIN(id), MAX(id) FROM projects'), [['1', '7']]);
  assert.deepEqual(cells('SELECT MAX(name) FROM projects'), [['Viral Clipper']]);
  assert.deepEqual(cells("SELECT MIN(id) FROM projects WHERE id > 100"), [['']]);
  assert.deepEqual(cells('SELECT COUNT(DISTINCT lang) FROM projects'), [['4']]);
  assert.equal(run('SELECT COUNT(*) FROM projects').lines[0].trim(), 'count');
  err('SELECT COUNT(*) FROM projects WHERE COUNT(*) > 1', 'ERROR:  aggregate functions are not allowed in WHERE');
  err('SELECT name, COUNT(*) FROM projects', 'ERROR:  column "name" must appear in the GROUP BY clause or be used in an aggregate function');
});

test('scalar functions UPPER / LOWER / LENGTH', () => {
  assert.deepEqual(col('SELECT UPPER(name) FROM projects LIMIT 1'), ['OAKDB']);
  assert.deepEqual(col('SELECT lower(name) FROM projects LIMIT 1'), ['oakdb']);
  assert.deepEqual(col('SELECT LENGTH(name) FROM projects LIMIT 1'), ['5']);
  assert.deepEqual(col("SELECT name FROM projects WHERE LOWER(lang) = 'go'"), ['OakDB']);
  assert.deepEqual(col('SELECT name FROM projects WHERE LENGTH(name) > 15'), ['AI Interview Coach', 'AI Security Assessment']);
});

test('GROUP BY with COUNT ordered', () => {
  assert.deepEqual(cells('SELECT lang, COUNT(*) FROM projects GROUP BY lang ORDER BY 2 DESC, 1').map((r) => r.join(':')),
    ['JavaScript:2', 'Python:2', 'TypeScript:2', 'Go:1']);
  assert.deepEqual(cells('SELECT lang, COUNT(*) AS n FROM projects GROUP BY lang ORDER BY n, lang').map((r) => r.join(':')),
    ['Go:1', 'JavaScript:2', 'Python:2', 'TypeScript:2']);
  assert.deepEqual(cells('SELECT category, COUNT(*) FROM skills GROUP BY category ORDER BY COUNT(*) DESC, category LIMIT 1'), [['language', '5']]);
  assert.deepEqual(cells('SELECT lang, year, COUNT(*) FROM projects GROUP BY lang, year ORDER BY lang LIMIT 1'), [['Go', '2026', '1']]);
  assert.deepEqual(col('SELECT lang FROM projects GROUP BY lang HAVING COUNT(*) > 1 ORDER BY lang'), ['JavaScript', 'Python', 'TypeScript']);
  assert.equal(footer("SELECT lang, COUNT(*) FROM projects WHERE lang = 'Rust' GROUP BY lang"), '(0 rows)');
});

test('aliases', () => {
  const r = run('SELECT name AS project, year yr FROM projects LIMIT 1');
  assert.match(r.lines[0], /^\s+project\s+\|\s+yr$/);
  assert.match(run('SELECT COUNT(*) AS total FROM projects').lines[0], /total/);
  assert.deepEqual(cells('SELECT UPPER(lang) AS l FROM projects LIMIT 1'), [['GO']]);
});

test('SHOW TABLES and \\dt', () => {
  const expected = [
    '          List of relations',
    ' Schema |   Name   | Type  |  Owner',
    '--------+----------+-------+---------',
    ' public | projects | table | ibrahim',
    ' public | skills   | table | ibrahim',
    '(2 rows)',
  ];
  assert.deepEqual(run('SHOW TABLES;').lines, expected);
  assert.deepEqual(run('\\dt').lines, expected);
  assert.deepEqual(run('show tables').lines, expected);
});

test('DESCRIBE and \\d', () => {
  const r = run('DESCRIBE projects');
  assert.equal(r.ok, true);
  assert.equal(r.lines[0].trim(), 'Table "public.projects"');
  assert.match(r.lines[1], /^ Column\s+\|\s+Type\s+\| Collation \| Nullable \| Default$/);
  assert.deepEqual(r.lines.slice(3).map((l) => l.split('|').slice(0, 2).map((c) => c.trim()).join(':')),
    ['id:integer', 'name:text', 'lang:text', 'year:integer', 'stack:text', 'summary:text', 'repo:text', 'demo:text']);
  assert.deepEqual(run('\\d projects').lines, r.lines);
  assert.deepEqual(run('\\d Projects;').lines, r.lines);
  assert.deepEqual(run('describe skills').lines.slice(3).map((l) => l.split('|')[0].trim()), ['name', 'category']);
  err('\\d nope', 'ERROR:  relation "nope" does not exist', 'HINT:  Try \\dt to list tables.');
  err('DESCRIBE', 'ERROR:  syntax error at end of input');
});

test('EXPLAIN', () => {
  const r = run("EXPLAIN SELECT name FROM projects WHERE lang = 'Go' ORDER BY year DESC LIMIT 3");
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines, [
    '            QUERY PLAN',
    '-----------------------------------',
    ' Limit (limit: 3)',
    '   ->  Sort (key: year DESC)',
    '         ->  Seq Scan on projects',
    "             Filter: (lang = 'Go')",
    '(4 rows)',
  ]);
  const plain = run('explain select * from skills').lines.join('\n');
  assert.match(plain, /Seq Scan on skills/);
  assert.doesNotMatch(plain, /Index/i);
  assert.match(run('EXPLAIN SELECT lang, COUNT(*) FROM projects GROUP BY lang').lines.join('\n'), /HashAggregate \(group key: lang\)/);
  err('EXPLAIN SELECT * FROM nope', 'ERROR:  relation "nope" does not exist', 'HINT:  Try \\dt to list tables.');
  err('EXPLAIN DELETE FROM projects', 'ERROR:  syntax error at or near "DELETE"');
});

test('read-only errors', () => {
  for (const verb of ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE']) {
    err(`${verb.toLowerCase()} into x values (1)`, `ERROR:  cannot execute ${verb} in a read-only transaction`);
  }
  err("INSERT INTO projects VALUES (8, 'x')", 'ERROR:  cannot execute INSERT in a read-only transaction');
  err('drop table projects;', 'ERROR:  cannot execute DROP in a read-only transaction');
  assert.equal(footer('SELECT * FROM projects'), '(7 rows)'); // data untouched
});

test('unknown table / column errors', () => {
  err('SELECT * FROM foo', 'ERROR:  relation "foo" does not exist', 'HINT:  Try \\dt to list tables.');
  err('select * from FOO;', 'ERROR:  relation "foo" does not exist', 'HINT:  Try \\dt to list tables.');
  err('SELECT foo FROM projects', 'ERROR:  column "foo" does not exist');
  err('SELECT name FROM projects WHERE nope = 1', 'ERROR:  column "nope" does not exist');
  err('SELECT name FROM projects ORDER BY nope', 'ERROR:  column "nope" does not exist');
  err('SELECT lang FROM projects GROUP BY nope', 'ERROR:  column "nope" does not exist');
  // checked even when short-circuit logic would never evaluate it
  err('SELECT name FROM projects WHERE 1 = 2 AND nope = 1', 'ERROR:  column "nope" does not exist');
});

test('syntax errors', () => {
  err('SELECT', 'ERROR:  syntax error at end of input');
  err('SELECT name FROM', 'ERROR:  syntax error at end of input');
  err('SELECT name FROM projects WHERE', 'ERROR:  syntax error at end of input');
  err('SELECT name FROM projects WHERE id =', 'ERROR:  syntax error at end of input');
  err('SELECT name FROM projects WHERE id IN (1, 2', 'ERROR:  syntax error at end of input');
  err('SELECT name FROM projects ORDER BY', 'ERROR:  syntax error at end of input');
  err('SELECT name projects', 'ERROR:  syntax error at end of input');
  err('SELECT name FROM projects WHERE id = = 1', 'ERROR:  syntax error at or near "="');
  err('SELECT name FROM projects LIMIT x', 'ERROR:  syntax error at or near "x"');
  err('SELECT name FROM projects banana', 'ERROR:  syntax error at or near "banana"');
  err('SELECT name FROM projects; SELECT 1', 'ERROR:  syntax error at or near "SELECT"');
  err('SELECT @ FROM projects', 'ERROR:  syntax error at or near "@"');
  err("SELECT name FROM projects WHERE name = 'abc", 'ERROR:  unterminated quoted string at or near "\'abc"');
  err('FLUMMOX', 'ERROR:  syntax error at or near "FLUMMOX"');
  err('SHOW stuff', 'ERROR:  syntax error at or near "stuff"');
  err('SELECT from FROM projects', 'ERROR:  syntax error at or near "from"');
  err('\\wat', 'ERROR:  invalid command \\wat', 'HINT:  Try \\dt to list tables or \\d <table> to describe one.');
});

test('trailing semicolon optional; whitespace and case', () => {
  assert.deepEqual(run('SELECT id FROM projects LIMIT 1;').lines, run('SELECT id FROM projects LIMIT 1').lines);
  assert.deepEqual(run('  select ID from PROJECTS limit 1 ;  ').lines, run('SELECT id FROM projects LIMIT 1').lines);
  assert.deepEqual(run('sElEcT Name FrOm projects wHeRe LaNg = \'Go\'').lines, run("SELECT name FROM projects WHERE lang = 'Go'").lines);
  assert.deepEqual(run('SELECT "ID" FROM "Projects" LIMIT 1').lines, run('SELECT id FROM projects LIMIT 1').lines);
  assert.deepEqual(run('SELECT id FROM projects -- comment\nLIMIT 1').lines, run('SELECT id FROM projects LIMIT 1').lines);
  assert.deepEqual(run('').lines, []);
  assert.equal(run('   ;').ok, false);
});

test('string literal with escaped quote', () => {
  assert.equal(footer("SELECT name FROM projects WHERE name = 'It''s'"), '(0 rows)');
  assert.deepEqual(cells("SELECT 'it''s' FROM skills LIMIT 1"), [["it's"]]);
  assert.deepEqual(cells("SELECT LENGTH('it''s') FROM skills LIMIT 1"), [['4']]);
  assert.equal(footer("SELECT name FROM skills WHERE name LIKE '%''%'"), '(0 rows)');
});

test('type coercion errors', () => {
  err("SELECT id FROM projects WHERE id = 'abc'", 'ERROR:  invalid input syntax for type integer: "abc"');
  assert.deepEqual(col("SELECT id FROM projects WHERE id = '3'"), ['3']);
  err('SELECT id FROM projects WHERE id', 'ERROR:  argument of WHERE must be type boolean, not type integer');
  assert.equal(footer('SELECT id FROM projects WHERE TRUE'), '(7 rows)');
  assert.equal(footer('SELECT id FROM projects WHERE FALSE'), '(0 rows)');
});

test('exact psql table layout', () => {
  assert.deepEqual(run('SELECT id, name, lang FROM projects WHERE id <= 3').lines, [
    ' id |     name      |    lang',
    '----+---------------+------------',
    '  1 | OakDB         | Go',
    '  2 | Viral Clipper | Python',
    '  3 | CodePair      | TypeScript',
    '(3 rows)',
  ]);
  assert.deepEqual(run('SELECT COUNT(*) FROM projects').lines, [
    ' count',
    '-------',
    '     7',
    '(1 row)',
  ]);
  assert.deepEqual(run('SELECT id FROM projects WHERE id > 100').lines, [' id', '----', '(0 rows)']);
  const r = run('SELECT id, demo FROM projects WHERE id = 3').lines;
  assert.equal(r[0], ' id |               demo');
  assert.equal(r[2], '  3 | https://codepair-nine.vercel.app/');
  // lines never exceed the limit that fits a ~100 col terminal for the widest text query
  for (const l of run('SELECT name, lang, stack, summary FROM projects').lines) assert.ok([...l].length <= 140, l);
});

test('looksLikeSQL', () => {
  for (const s of ['SELECT 1', 'select * from projects', '  Select x', 'SHOW TABLES', 'show tables;', 'describe projects',
    'EXPLAIN SELECT 1', '\\dt', ' \\dt; ', '\\d projects', '\\d skills;', 'select']) assert.equal(looksLikeSQL(s), true, s);
  for (const s of ['', '   ', 'help', 'ls', 'selection', 'showcase', 'selected * from', 'explained', 'describes', 'cat select',
    'INSERT INTO x', '\\d', '\\dtx', 'about', null, undefined]) assert.equal(looksLikeSQL(s), false, String(s));
});

test('runSQL never throws on garbage (fuzz)', () => {
  const tokens = ['SELECT', 'FROM', 'WHERE', 'projects', 'skills', 'name', 'id', 'lang', 'demo', '*', ',', '(', ')', ';', "'", "''", "'x", '"',
    '=', '!=', '<>', '<', '>=', 'LIKE', 'ILIKE', 'IN', 'BETWEEN', 'AND', 'OR', 'NOT', 'IS', 'NULL', 'TRUE', 'ORDER', 'BY', 'GROUP', 'HAVING',
    'LIMIT', 'OFFSET', 'DISTINCT', 'AS', 'DESC', 'ASC', 'COUNT', 'MIN', 'UPPER', 'LENGTH', '1', '2.5', '-', '.', '--', '\\', '\\dt', '\\d', '%',
    '_', 'EXPLAIN', 'SHOW', 'TABLES', 'DESCRIBE', 'DROP', 'x', '@', '日本', '\n', '9999999999999999999999'];
  let seed = 0x9e3779b9;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < 600; i++) {
    const n = 1 + Math.floor(rnd() * 14);
    const s = Array.from({ length: n }, () => tokens[Math.floor(rnd() * tokens.length)]).join(rnd() < 0.8 ? ' ' : '');
    let r;
    assert.doesNotThrow(() => { r = runSQL(db, s); }, s);
    assert.equal(typeof r.ok, 'boolean', s);
    assert.ok(Array.isArray(r.lines) && r.lines.every((l) => typeof l === 'string'), s);
    if (!r.ok) assert.ok(r.lines[0].startsWith('ERROR:  '), `${s} -> ${r.lines[0]}`);
  }
  for (const v of [null, undefined, 42, {}, '(('.repeat(5000), 'x'.repeat(100000)]) assert.doesNotThrow(() => runSQL(db, v));
  assert.equal(runSQL(db, '(('.repeat(5000)).ok, false);
});

if (failures.length) {
  for (const [name, e] of failures) console.log(`FAIL  ${name}\n${String(e.stack || e).split('\n').slice(0, 8).join('\n')}\n`);
}
console.log(`${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
