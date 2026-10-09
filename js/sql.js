// A small, dependency-free, read-only SQL engine for the portfolio terminal.
// Pipeline: tokenizer -> recursive-descent parser (AST) -> evaluator -> psql-style formatter.
import { projects, skills } from './data.js';

export const TABLE_NAMES = ['projects', 'skills'];
const OWNER = 'ibrahim';
const MAX_CELL = 48;

class SqlError extends Error {
  constructor(message, hint) { super(message); this.hint = hint; }
}

// ---------------------------------------------------------------- database

export function createDatabase() {
  const col = (name, type) => ({ name, type });
  return {
    tables: {
      projects: {
        name: 'projects',
        cols: [col('id', 'integer'), col('name', 'text'), col('lang', 'text'), col('year', 'integer'),
          col('stack', 'text'), col('summary', 'text'), col('repo', 'text'), col('demo', 'text')],
        rows: projects.map((p) => [p.id, p.name, p.lang, p.year, p.stack, p.summary, p.repo, p.demo === '' ? null : p.demo]),
      },
      skills: {
        name: 'skills',
        cols: [col('name', 'text'), col('category', 'text')],
        rows: skills.map((s) => [s.name, s.category]),
      },
    },
  };
}

// --------------------------------------------------------------- tokenizer

// Reserved words may not be used as bare column names or aliases.
const RESERVED = new Set(['select', 'from', 'where', 'group', 'by', 'having', 'order', 'limit', 'offset', 'and', 'or',
  'not', 'like', 'ilike', 'in', 'between', 'is', 'null', 'true', 'false', 'distinct', 'as', 'asc', 'desc']);
const FUNCS = { count: 1, min: 1, max: 1, upper: 1, lower: 1, length: 1 };
const AGGS = new Set(['count', 'min', 'max']);

// Token: { t: 'num'|'str'|'id'|'sym'|'eof', v, raw, quoted? }
function tokenize(src) {
  const toks = [];
  let i = 0;
  const re = (rx, at) => { rx.lastIndex = at; return rx.exec(src); };
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '-' && src[i + 1] === '-') { while (i < src.length && src[i] !== '\n') i++; continue; }
    const start = i;
    if (c === "'" || c === '"') {
      let s = '';
      i++;
      for (;;) {
        if (i >= src.length) {
          throw new SqlError(`unterminated quoted ${c === "'" ? 'string' : 'identifier'} at or near "${src.slice(start)}"`);
        }
        if (src[i] === c) {
          if (src[i + 1] === c) { s += c; i += 2; continue; }
          i++;
          break;
        }
        s += src[i++];
      }
      if (c === '"' && s === '') throw new SqlError('zero-length delimited identifier at or near """"');
      const raw = src.slice(start, i);
      toks.push(c === "'" ? { t: 'str', v: s, raw } : { t: 'id', v: s.toLowerCase(), raw, quoted: true });
      continue;
    }
    let m;
    if ((m = re(/\d+(\.\d*)?|\.\d+/y, i))) {
      i += m[0].length;
      toks.push({ t: 'num', v: Number(m[0]), raw: m[0] });
    } else if ((m = re(/[\p{L}_][\p{L}\p{N}_$]*/uy, i))) {
      i += m[0].length;
      toks.push({ t: 'id', v: m[0].toLowerCase(), raw: m[0] });
    } else {
      const two = src.slice(i, i + 2);
      const sym = ['<>', '<=', '>=', '!='].includes(two) ? two : ('=<>(),*;-'.includes(c) ? c : null);
      if (!sym) throw new SqlError(`syntax error at or near "${c}"`);
      i += sym.length;
      toks.push({ t: 'sym', v: sym, raw: sym });
    }
  }
  toks.push({ t: 'eof', v: null, raw: '' });
  return toks;
}

// ------------------------------------------------------------------ parser
// AST nodes: lit, col, fn, star, cmp, and, or, not, like, in, between, isnull.

const READ_ONLY_VERBS = new Set(['insert', 'update', 'delete', 'drop', 'create', 'alter', 'truncate', 'grant', 'revoke',
  'replace', 'merge', 'copy', 'vacuum', 'analyze', 'begin', 'commit', 'rollback', 'set', 'call', 'do', 'lock']);

class Parser {
  constructor(toks) { this.toks = toks; this.pos = 0; this.depth = 0; }
  peek(n = 0) { return this.toks[Math.min(this.pos + n, this.toks.length - 1)]; }
  next() { return this.toks[Math.min(this.pos++, this.toks.length - 1)]; }
  fail(tok = this.peek()) {
    throw new SqlError(tok.t === 'eof' ? 'syntax error at end of input' : `syntax error at or near "${tok.raw}"`);
  }
  isKw(w, n = 0) { const t = this.peek(n); return t.t === 'id' && !t.quoted && t.v === w; }
  isSym(s) { const t = this.peek(); return t.t === 'sym' && t.v === s; }
  eatKw(w) { if (this.isKw(w)) { this.pos++; return true; } return false; }
  eatSym(s) { if (this.isSym(s)) { this.pos++; return true; } return false; }
  expectKw(w) { if (!this.eatKw(w)) this.fail(); }
  expectSym(s) { if (!this.eatSym(s)) this.fail(); }
  ident() {
    const t = this.peek();
    if (t.t !== 'id' || (!t.quoted && RESERVED.has(t.v))) this.fail();
    this.pos++;
    return t.v;
  }
  int() { const t = this.peek(); if (t.t !== 'num' || !Number.isInteger(t.v)) this.fail(); this.pos++; return t.v; }

  statement() {
    const first = this.peek();
    let st;
    if (first.t === 'eof') return null;
    if (this.isKw('select')) st = this.select();
    else if (this.isKw('show')) {
      this.next();
      if (!this.isKw('tables')) this.fail();
      this.next();
      st = { k: 'show' };
    } else if (this.isKw('describe')) { this.next(); st = { k: 'describe', table: this.ident() }; }
    else if (this.isKw('explain')) { this.next(); if (!this.isKw('select')) this.fail(); st = { k: 'explain', q: this.select() }; }
    else if (first.t === 'id' && !first.quoted && READ_ONLY_VERBS.has(first.v)) {
      return { k: 'readonly', verb: first.v.toUpperCase() };
    } else this.fail();
    this.eatSym(';');
    if (this.peek().t !== 'eof') this.fail();
    return st;
  }

  select() {
    this.expectKw('select');
    const q = { distinct: this.eatKw('distinct'), items: [], groupBy: [], orderBy: [], limit: null, offset: null, where: null, having: null };
    do {
      if (this.eatSym('*')) { q.items.push({ star: true }); continue; }
      const expr = this.or();
      let alias = null;
      if (this.eatKw('as')) alias = this.ident();
      else if (this.peek().t === 'id' && (this.peek().quoted || !RESERVED.has(this.peek().v))) alias = this.ident();
      q.items.push({ expr, alias });
    } while (this.eatSym(','));
    this.expectKw('from');
    q.from = this.ident();
    if (this.eatKw('where')) q.where = this.or();
    if (this.eatKw('group')) {
      this.expectKw('by');
      do q.groupBy.push(this.ident()); while (this.eatSym(','));
    }
    if (this.eatKw('having')) q.having = this.or();
    if (this.eatKw('order')) {
      this.expectKw('by');
      do {
        const expr = this.or();
        const desc = this.eatKw('desc');
        if (!desc) this.eatKw('asc');
        q.orderBy.push({ expr, desc });
      } while (this.eatSym(','));
    }
    for (let seen = 0; seen < 2; seen++) { // LIMIT and OFFSET in either order
      if (q.limit === null && this.eatKw('limit')) q.limit = this.int();
      else if (q.offset === null && this.eatKw('offset')) q.offset = this.int();
    }
    return q;
  }

  // Expression precedence: OR < AND < NOT < predicate < primary.
  or() {
    if (++this.depth > 100) throw new SqlError('stack depth limit exceeded');
    let l = this.and();
    while (this.eatKw('or')) l = { k: 'or', l, r: this.and() };
    this.depth--;
    return l;
  }
  and() {
    let l = this.not();
    while (this.eatKw('and')) l = { k: 'and', l, r: this.not() };
    return l;
  }
  not() { return this.eatKw('not') ? { k: 'not', e: this.not() } : this.predicate(); }

  predicate() {
    const left = this.primary();
    const t = this.peek();
    if (t.t === 'sym' && ['=', '!=', '<>', '<', '>', '<=', '>='].includes(t.v)) {
      this.next();
      return { k: 'cmp', op: t.v === '<>' ? '!=' : t.v, l: left, r: this.primary() };
    }
    if (this.eatKw('is')) {
      const neg = this.eatKw('not');
      this.expectKw('null');
      return { k: 'isnull', neg, e: left };
    }
    let neg = false;
    if (this.isKw('not') && ['like', 'ilike', 'in', 'between'].some((w) => this.isKw(w, 1))) { this.next(); neg = true; }
    if (this.isKw('like') || this.isKw('ilike')) {
      const ci = this.next().v === 'ilike';
      return { k: 'like', neg, ci, l: left, r: this.primary() };
    }
    if (this.eatKw('in')) {
      this.expectSym('(');
      const list = [];
      do list.push(this.primary()); while (this.eatSym(','));
      this.expectSym(')');
      return { k: 'in', neg, l: left, list };
    }
    if (this.eatKw('between')) {
      const lo = this.primary();
      this.expectKw('and');
      return { k: 'between', neg, e: left, lo, hi: this.primary() };
    }
    return left;
  }

  primary() {
    const t = this.next();
    if (t.t === 'num' || t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'sym' && t.v === '-' && this.peek().t === 'num') return { k: 'lit', v: -this.next().v };
    if (t.t === 'sym' && t.v === '(') {
      const e = this.or();
      this.expectSym(')');
      return e;
    }
    if (t.t === 'id') {
      if (!t.quoted) {
        if (t.v === 'null') return { k: 'lit', v: null };
        if (t.v === 'true') return { k: 'lit', v: true };
        if (t.v === 'false') return { k: 'lit', v: false };
        if (RESERVED.has(t.v)) this.fail(t);
        if (this.isSym('(')) return this.call(t.v);
      }
      return { k: 'col', name: t.v };
    }
    return this.fail(t);
  }

  call(name) {
    if (!(name in FUNCS)) throw new SqlError(`function ${name}() does not exist`);
    this.expectSym('(');
    const node = { k: 'fn', name, distinct: false, args: [] };
    if (this.isSym('*')) {
      if (name !== 'count') this.fail();
      this.next();
      node.args.push({ k: 'star' });
    } else {
      node.distinct = name === 'count' && this.eatKw('distinct');
      node.args.push(this.or());
    }
    this.expectSym(')');
    return node;
  }
}

// --------------------------------------------------------------- evaluator

const typeName = (v) => (typeof v === 'number' ? 'integer' : typeof v === 'boolean' ? 'boolean' : 'text');
const collator = new Intl.Collator('en');

// Comparison for non-NULL values. A numeric string is coerced to a number (as a PostgreSQL
// unknown-typed literal would be); anything else mismatched is an error.
function compare(a, b) {
  if (typeof a !== typeof b) {
    const [s, other] = typeof a === 'string' ? [a, b] : [b, a];
    if (typeof other !== 'number') throw new SqlError(`operator does not exist: ${typeName(a)} = ${typeName(b)}`);
    if (s.trim() === '' || Number.isNaN(Number(s))) throw new SqlError(`invalid input syntax for type integer: "${s}"`);
    a = Number(a); b = Number(b);
  }
  if (typeof a === 'string') return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
  return a < b ? -1 : a > b ? 1 : 0;
}
// ORDER BY comparison: NULL sorts as the largest value (last ASC, first DESC), like PostgreSQL.
const compareNullsLast = (a, b) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : compare(a, b));

const tvNot = (v) => (v === null ? null : !v);
function asBool(v, what) {
  if (v !== null && typeof v !== 'boolean') throw new SqlError(`argument of ${what} must be type boolean, not type ${typeName(v)}`);
  return v;
}
function likeRegex(pattern, ci) {
  let rx = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) rx += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (c === '%') rx += '.*';
    else if (c === '_') rx += '.';
    else rx += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${rx}$`, ci ? 'si' : 's');
}

// env: { t: table, row, rows: group rows (aggregate context) or null, groupCols: Set or null }
function evaluate(e, env) {
  switch (e.k) {
    case 'lit': return e.v;
    case 'col': {
      if (env.groupCols && !env.groupCols.has(e.name)) {
        throw new SqlError(`column "${e.name}" must appear in the GROUP BY clause or be used in an aggregate function`);
      }
      return env.row[env.t.cols.findIndex((c) => c.name === e.name)];
    }
    case 'fn': return evalFn(e, env);
    case 'and': {
      const l = asBool(evaluate(e.l, env), 'AND'), r = asBool(evaluate(e.r, env), 'AND');
      return l === false || r === false ? false : l === null || r === null ? null : true;
    }
    case 'or': {
      const l = asBool(evaluate(e.l, env), 'OR'), r = asBool(evaluate(e.r, env), 'OR');
      return l === true || r === true ? true : l === null || r === null ? null : false;
    }
    case 'not': return tvNot(asBool(evaluate(e.e, env), 'NOT'));
    case 'cmp': {
      const l = evaluate(e.l, env), r = evaluate(e.r, env);
      if (l === null || r === null) return null;
      const c = compare(l, r);
      return { '=': c === 0, '!=': c !== 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0 }[e.op];
    }
    case 'isnull': return (evaluate(e.e, env) === null) !== e.neg;
    case 'like': {
      const l = evaluate(e.l, env), r = evaluate(e.r, env);
      if (l === null || r === null) return null;
      if (typeof l !== 'string' || typeof r !== 'string') throw new SqlError(`operator does not exist: ${typeName(l)} ~~ ${typeName(r)}`);
      return likeRegex(r, e.ci).test(l) !== e.neg;
    }
    case 'in': {
      const l = evaluate(e.l, env);
      let found = false, sawNull = l === null;
      for (const item of e.list) {
        const v = evaluate(item, env);
        if (v === null) sawNull = true;
        else if (l !== null && compare(l, v) === 0) { found = true; break; }
      }
      const r = found ? true : sawNull ? null : false;
      return e.neg ? tvNot(r) : r;
    }
    case 'between': {
      const v = evaluate(e.e, env), lo = evaluate(e.lo, env), hi = evaluate(e.hi, env);
      const a = v === null || lo === null ? null : compare(v, lo) >= 0;
      const b = v === null || hi === null ? null : compare(v, hi) <= 0;
      const r = a === false || b === false ? false : a === null || b === null ? null : true;
      return e.neg ? tvNot(r) : r;
    }
    default: throw new SqlError('unsupported expression');
  }
}

function evalFn(e, env) {
  const arg = e.args[0];
  if (AGGS.has(e.name)) {
    if (!env.rows) throw new SqlError('aggregate functions are not allowed in WHERE');
    if (arg.k === 'star') return env.rows.length;
    let vals = env.rows.map((row) => evaluate(arg, { t: env.t, row, rows: null, groupCols: null })).filter((v) => v !== null);
    if (e.distinct) vals = [...new Set(vals)];
    if (e.name === 'count') return vals.length;
    if (vals.length === 0) return null;
    return vals.reduce((best, v) => ((e.name === 'min' ? compare(v, best) < 0 : compare(v, best) > 0) ? v : best));
  }
  const v = evaluate(arg, env);
  if (v === null) return null;
  const s = String(v);
  return e.name === 'upper' ? s.toUpperCase() : e.name === 'lower' ? s.toLowerCase() : [...s].length;
}

const walk = (e, fn) => {
  fn(e);
  const kids = { and: ['l', 'r'], or: ['l', 'r'], cmp: ['l', 'r'], like: ['l', 'r'], not: ['e'], isnull: ['e'],
    in: ['l'], between: ['e', 'lo', 'hi'], fn: [] }[e.k] || [];
  kids.forEach((p) => walk(e[p], fn));
  if (e.k === 'in') e.list.forEach((x) => walk(x, fn));
  if (e.k === 'fn') e.args.forEach((x) => walk(x, fn));
};
const hasAgg = (e) => { let r = false; walk(e, (n) => { if (n.k === 'fn' && AGGS.has(n.name)) r = true; }); return r; };

function getTable(db, name) {
  const t = db.tables[name];
  if (!t) throw new SqlError(`relation "${name}" does not exist`, 'Try \\dt to list tables.');
  return t;
}
function checkColumns(e, t) {
  walk(e, (n) => {
    if (n.k === 'col' && !t.cols.some((c) => c.name === n.name)) throw new SqlError(`column "${n.name}" does not exist`);
  });
}

// Static type of an expression, used for column alignment.
function typeOf(e, t) {
  if (e.k === 'col') return t.cols.find((c) => c.name === e.name).type;
  if (e.k === 'lit') return e.v === null ? 'text' : typeName(e.v);
  if (e.k === 'fn') return e.name === 'count' || e.name === 'length' ? 'integer' : e.name === 'min' || e.name === 'max' ? typeOf(e.args[0], t) : 'text';
  return 'boolean';
}
function exprName(e) {
  return e.k === 'col' ? e.name : e.k === 'fn' ? e.name : '?column?';
}

// Render an expression back to SQL (for EXPLAIN).
function toSQL(e) {
  switch (e.k) {
    case 'lit': return e.v === null ? 'NULL' : typeof e.v === 'string' ? `'${e.v.replace(/'/g, "''")}'` : String(e.v).toUpperCase();
    case 'col': return e.name;
    case 'star': return '*';
    case 'fn': return `${e.name.toUpperCase()}(${e.distinct ? 'DISTINCT ' : ''}${toSQL(e.args[0])})`;
    case 'cmp': return `(${toSQL(e.l)} ${e.op} ${toSQL(e.r)})`;
    case 'and': return `(${toSQL(e.l)} AND ${toSQL(e.r)})`;
    case 'or': return `(${toSQL(e.l)} OR ${toSQL(e.r)})`;
    case 'not': return `(NOT ${toSQL(e.e)})`;
    case 'isnull': return `(${toSQL(e.e)} IS ${e.neg ? 'NOT ' : ''}NULL)`;
    case 'like': return `(${toSQL(e.l)} ${e.neg ? 'NOT ' : ''}${e.ci ? 'ILIKE' : 'LIKE'} ${toSQL(e.r)})`;
    case 'in': return `(${toSQL(e.l)} ${e.neg ? 'NOT ' : ''}IN (${e.list.map(toSQL).join(', ')}))`;
    case 'between': return `(${toSQL(e.e)} ${e.neg ? 'NOT ' : ''}BETWEEN ${toSQL(e.lo)} AND ${toSQL(e.hi)})`;
    default: return '?';
  }
}

// Run a SELECT. Returns { cols: [{name, type}], rows: values[][], plan }.
function execSelect(db, q) {
  const t = getTable(db, q.from);
  const items = [];
  for (const it of q.items) {
    if (it.star) t.cols.forEach((c) => items.push({ expr: { k: 'col', name: c.name }, name: c.name }));
    else items.push({ expr: it.expr, name: it.alias || exprName(it.expr) });
  }
  const outIndex = (name) => items.findIndex((it) => it.name === name);
  items.forEach((it) => checkColumns(it.expr, t));
  if (q.where) {
    checkColumns(q.where, t);
    if (hasAgg(q.where)) throw new SqlError('aggregate functions are not allowed in WHERE');
  }
  q.groupBy.forEach((name) => { if (!t.cols.some((c) => c.name === name)) throw new SqlError(`column "${name}" does not exist`); });
  if (q.having) checkColumns(q.having, t);

  // Resolve ORDER BY keys: 1-based position, output name/alias, or an expression over the input.
  const keys = q.orderBy.map(({ expr, desc }) => {
    if (expr.k === 'lit' && typeof expr.v === 'number') {
      if (!Number.isInteger(expr.v)) throw new SqlError('non-integer constant in ORDER BY');
      if (expr.v < 1 || expr.v > items.length) throw new SqlError(`ORDER BY position ${expr.v} is not in select list`);
      return { out: expr.v - 1, desc, label: items[expr.v - 1].name };
    }
    if (expr.k === 'col' && outIndex(expr.name) >= 0) return { out: outIndex(expr.name), desc, label: expr.name };
    checkColumns(expr, t);
    if (q.distinct) throw new SqlError('for SELECT DISTINCT, ORDER BY expressions must appear in select list');
    return { expr, desc, label: toSQL(expr) };
  });

  const rows = q.where ? t.rows.filter((row) => asBool(evaluate(q.where, { t, row, rows: null, groupCols: null }), 'WHERE') === true) : t.rows;

  const grouped = q.groupBy.length > 0 || items.some((it) => hasAgg(it.expr)) || !!q.having || keys.some((k) => k.expr && hasAgg(k.expr));
  let envs;
  if (!grouped) envs = rows.map((row) => ({ t, row, rows: null, groupCols: null }));
  else {
    const groupCols = new Set(q.groupBy);
    const idx = q.groupBy.map((n) => t.cols.findIndex((c) => c.name === n));
    const groups = new Map();
    for (const row of rows) {
      const key = JSON.stringify(idx.map((i) => row[i]));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    if (q.groupBy.length === 0 && groups.size === 0) groups.set('', []); // aggregate over empty input: one row
    envs = [...groups.values()].map((g) => ({ t, row: g[0], rows: g, groupCols }));
    if (q.having) envs = envs.filter((env) => asBool(evaluate(q.having, env), 'HAVING') === true);
  }

  let out = envs.map((env) => ({
    vals: items.map((it) => evaluate(it.expr, env)),
    sort: keys.map((k) => (k.expr ? evaluate(k.expr, env) : undefined)),
  }));
  if (q.distinct) {
    const seen = new Set();
    out = out.filter((r) => { const k = JSON.stringify(r.vals); return seen.has(k) ? false : (seen.add(k), true); });
  }
  if (keys.length) {
    out.sort((a, b) => {
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const c = k.expr ? compareNullsLast(a.sort[i], b.sort[i]) : compareNullsLast(a.vals[k.out], b.vals[k.out]);
        if (c !== 0) return k.desc ? -c : c;
      }
      return 0;
    });
  }
  const start = q.offset || 0;
  out = out.slice(start, q.limit === null ? undefined : start + q.limit);

  return {
    cols: items.map((it) => ({ name: it.name, type: typeOf(it.expr, t) })),
    rows: out.map((r) => r.vals),
    plan: {
      table: t.name, filter: q.where && toSQL(q.where), having: q.having && toSQL(q.having), distinct: q.distinct,
      aggregate: grouped, groupKeys: q.groupBy, limit: q.limit, offset: q.offset,
      sortKeys: keys.map((k) => k.label + (k.desc ? ' DESC' : '')),
    },
  };
}

// --------------------------------------------------------------- formatter

const cellText = (v) => {
  let s = v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 't' : 'f') : String(v);
  s = s.replace(/[\r\n\t]+/g, ' ');
  const chars = [...s];
  return chars.length > MAX_CELL ? `${chars.slice(0, MAX_CELL - 1).join('')}…` : s;
};
const len = (s) => [...s].length;

// psql "aligned" layout: centred headers, numbers right-aligned, no trailing padding on the last column.
function formatTable(head, data, rightAlign, { title = null, footer = true } = {}) {
  const rows = data.map((r) => r.map(cellText));
  const w = head.map((h, i) => Math.max(len(h), ...rows.map((r) => len(r[i]))));
  const last = head.length - 1;
  const line = (cells) => cells.map((c, i) => ` ${c}${i < last ? ' ' : ''}`).join('|').trimEnd();
  const out = [];
  if (title) {
    const total = w.reduce((a, n) => a + n + 2, 0) + last;
    out.push(' '.repeat(Math.max(0, Math.floor((total - len(title)) / 2))) + title);
  }
  out.push(line(head.map((h, i) => {
    const gap = w[i] - len(h), left = Math.floor(gap / 2);
    return ' '.repeat(left) + h + (i < last ? ' '.repeat(gap - left) : '');
  })));
  out.push(w.map((n) => '-'.repeat(n + 2)).join('+'));
  for (const r of rows) {
    out.push(line(r.map((c, i) => {
      const pad = ' '.repeat(w[i] - len(c));
      return rightAlign[i] ? pad + c : i < last ? c + pad : c;
    })));
  }
  if (footer) out.push(`(${rows.length} row${rows.length === 1 ? '' : 's'})`);
  return out;
}

function listTables(db) {
  const rows = Object.values(db.tables).map((t) => ['public', t.name, 'table', OWNER]);
  return formatTable(['Schema', 'Name', 'Type', 'Owner'], rows, [], { title: 'List of relations' });
}
function describeTable(db, name) {
  const t = getTable(db, name);
  const rows = t.cols.map((c) => [c.name, c.type, '', '', '']);
  return formatTable(['Column', 'Type', 'Collation', 'Nullable', 'Default'], rows, [], { title: `Table "public.${t.name}"`, footer: false });
}
function explainLines(plan) {
  const nodes = [];
  if (plan.limit !== null || plan.offset !== null) {
    nodes.push({ label: `Limit (${[plan.limit !== null && `limit: ${plan.limit}`, plan.offset !== null && `offset: ${plan.offset}`].filter(Boolean).join(', ')})`, props: [] });
  }
  if (plan.sortKeys.length) nodes.push({ label: `Sort (key: ${plan.sortKeys.join(', ')})`, props: [] });
  if (plan.distinct) nodes.push({ label: 'Unique', props: [] });
  if (plan.aggregate) {
    nodes.push({
      label: plan.groupKeys.length ? `HashAggregate (group key: ${plan.groupKeys.join(', ')})` : 'Aggregate',
      props: plan.having ? [`Filter: ${plan.having}`] : [],
    });
  }
  nodes.push({ label: `Seq Scan on ${plan.table}`, props: plan.filter ? [`Filter: ${plan.filter}`] : [] });
  const lines = [];
  nodes.forEach((n, d) => {
    lines.push(d === 0 ? n.label : `${' '.repeat(6 * (d - 1) + 2)}->  ${n.label}`);
    n.props.forEach((p) => lines.push(' '.repeat(d === 0 ? 2 : 6 * d) + p));
  });
  return formatTable(['QUERY PLAN'], lines.map((l) => [l]), [], { title: null });
}

// ------------------------------------------------------------------ public

export function looksLikeSQL(input) {
  const s = String(input ?? '').trim();
  return /^(select|show|describe|explain)(?![\p{L}\p{N}_])/iu.test(s) || /^\\dt\s*;?$/i.test(s) || /^\\d\s+\S/.test(s);
}

export function runSQL(db, input) {
  try {
    const src = String(input ?? '').trim();
    if (src.startsWith('\\')) return { ok: true, lines: runMeta(db, src) };
    const st = new Parser(tokenize(src)).statement();
    if (!st) return { ok: true, lines: [] };
    switch (st.k) {
      case 'readonly': throw new SqlError(`cannot execute ${st.verb} in a read-only transaction`);
      case 'show': return { ok: true, lines: listTables(db) };
      case 'describe': return { ok: true, lines: describeTable(db, st.table) };
      case 'explain': return { ok: true, lines: explainLines(execSelect(db, st.q).plan) };
      default: {
        const res = execSelect(db, st);
        return { ok: true, lines: formatTable(res.cols.map((c) => c.name), res.rows, res.cols.map((c) => c.type === 'integer')) };
      }
    }
  } catch (err) {
    const lines = [`ERROR:  ${err instanceof SqlError ? err.message : `internal error: ${err && err.message}`}`];
    if (err instanceof SqlError && err.hint) lines.push(`HINT:  ${err.hint}`);
    return { ok: false, lines };
  }
}

// psql backslash commands: \dt, \d, \d <table>.
function runMeta(db, src) {
  let m;
  if (/^\\dt\+?\s*;?$/i.test(src) || /^\\d\+?\s*;?$/.test(src)) return listTables(db);
  if ((m = /^\\d\+?\s+("?)([^\s;"]+)\1\s*;?$/.exec(src))) return describeTable(db, m[2].toLowerCase());
  throw new SqlError(`invalid command ${src.split(/\s/)[0]}`, 'Try \\dt to list tables or \\d <table> to describe one.');
}
