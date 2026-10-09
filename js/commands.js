import { profile, projects, skills } from './data.js';
import { createDatabase, runSQL, looksLikeSQL } from './sql.js';
import { wait } from './terminal.js';

const SHELL_PROMPT = 'guest@ibrahim:~$ ';
const SQL_PROMPT = 'oakdb=> ';

const OAK = [
  '        ▄▄██████▄▄       ',
  '     ▄████████████▄     ',
  '    ████▀▀████▀▀████    ',
  '    ██████████████▀█    ',
  '     ▀████████████▀     ',
  '        ▀▀▐██▌▀▀        ',
  '           ▐██▌           ',
  '         ▄▄████▄▄         ',
];

// Wires the terminal to Ibrahim's data. `hooks` lets the page react (sound, scroll, links).
export function installCommands(term, hooks = {}) {
  const db = createDatabase();
  const bootTime = Date.now();
  let sqlMode = false;

  const uptime = () => {
    const s = Math.floor((Date.now() - bootTime) / 1000);
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  const openLink = (url) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
  };

  const findProject = (q) => {
    const k = q.toLowerCase();
    return projects.find((p) => p.slug === k || p.name.toLowerCase() === k || String(p.id) === k || p.slug.startsWith(k));
  };

  const commands = {
    help() {
      term.print('Commands', 'bright');
      [
        ['about', 'who I am, in one screen'],
        ['projects', 'what I have built'],
        ['open', 'open a project: demo if live, else source (open oakdb)'],
        ['skills', 'languages, frameworks, tools'],
        ['contact', 'how to reach me'],
        ['hire', 'the short version for recruiters'],
        ['neofetch', 'system information, sort of'],
        ['psql', 'enter OakDB-style SQL mode'],
        ['matrix', 'you know what this does'],
        ['clear', 'clear the screen (or Ctrl+L)'],
      ].forEach(([c, d]) => term.print(`  ${c.padEnd(11)}${d}`));
      term.print('');
      term.print('Or type SQL straight in:', 'dim');
      term.print("  SELECT name, lang FROM projects WHERE lang = 'Go';", 'normal');
      term.print('  \\dt    lists the tables', 'dim');
    },

    about() {
      term.print(`${profile.name}. ${profile.role}.`, 'bright');
      term.print(profile.status);
      term.print('');
      term.print('I like the parts of software most people treat as a black box.');
      term.print('So I built one: OakDB, a SQL database written from scratch in Go,');
      term.print('with a B+tree, a write-ahead log and the PostgreSQL wire protocol.');
      term.print('');
      term.print(`Looking for: ${profile.seeking}.`, 'dim');
    },

    whoami() { term.print('guest. But you can call me a future colleague.'); },

    projects() {
      projects.forEach((p) => {
        term.print(`${String(p.id).padStart(2, '0')}  ${p.name.padEnd(24)}${p.lang}`, p.id === 1 ? 'bright' : 'normal');
        term.print(`    ${p.summary.slice(0, term.cols - 6)}`, 'dim');
      });
      term.print('');
      term.print('open <name>  opens the live demo or the source · or scroll down to fly through them', 'dim');
    },

    open(arg) {
      const p = arg && findProject(arg);
      if (!p) { term.print(`open: no project "${arg || ''}". Try: open oakdb`, 'error'); return; }
      const url = p.demo || p.repo;
      term.print(`Opening ${p.name} → ${url}`, 'bright');
      openLink(url);
    },

    skills() {
      const groups = {};
      skills.forEach((s) => (groups[s.category] ||= []).push(s.name));
      Object.entries(groups).forEach(([cat, list]) => term.print(`${cat.padEnd(11)}${list.join(' · ')}`));
    },

    contact() {
      term.print(`email     ${profile.email}`, 'bright');
      term.print(`github    ${profile.github}`);
      if (profile.linkedin) term.print(`linkedin  ${profile.linkedin}`);
      term.print('');
      term.print('Type "hire" for the one-paragraph version.', 'dim');
    },

    hire() {
      const row = (t) => term.print(`│  ${t.padEnd(54)}│`, 'bright');
      term.print(`┌${'─'.repeat(56)}┐`, 'bright');
      row('Ibrahim Raza · Graduate software engineer · 2027');
      row('Go · TypeScript · Python · SQL · React · FastAPI');
      row('Built a SQL database from scratch. Ships with tests.');
      row(profile.email);
      term.print(`└${'─'.repeat(56)}┘`, 'bright');
      hooks.onHire?.();
    },

    sudo(arg) {
      if (/hire/.test(arg || '')) { term.print('[sudo] password for recruiter: ********', 'dim'); term.print('Permission granted. Excellent decision.', 'ok'); hooks.onHire?.(); return; }
      term.print('guest is not in the sudoers file. This incident will be reported.', 'error');
    },

    neofetch() {
      const info = [
        ['', `guest@ibrahim`],
        ['', '─'.repeat(30)],
        ['OS', 'IbrahimOS 2027.1 (final year)'],
        ['Host', 'BSc Computer Science'],
        ['Kernel', 'Go 1.23'],
        ['Shell', 'oakdb=> (PostgreSQL wire)'],
        ['Stack', 'Go, TypeScript, Python, SQL'],
        ['Uptime', uptime()],
        ['Status', 'open to graduate SWE roles'],
      ];
      OAK.forEach((art, i) => {
        const [k, v] = info[i] || ['', ''];
        term.print(art.padEnd(28) + (k ? `${k}: `.padEnd(9) + v : v), i < 6 ? 'normal' : 'dim');
      });
      if (info.length > OAK.length) info.slice(OAK.length).forEach(([k, v]) => term.print(' '.repeat(28) + `${k}: `.padEnd(9) + v, 'dim'));
    },

    psql() {
      sqlMode = true;
      term.setPrompt(SQL_PROMPT);
      term.print('psql-ish (OakDB toy edition). Read-only. Type \\? for help, \\q to quit.', 'dim');
    },

    matrix() { term.startMatrix(6); hooks.onMatrix?.(); },
    clear() { term.clear(); },
    ls() { term.print('README.md  projects/  skills.txt  oak.db  oak.db-wal'); },
    cat(arg) {
      if (/readme/i.test(arg || '')) return commands.about();
      if (/skills/i.test(arg || '')) return commands.skills();
      if (/oak\.db/.test(arg || '')) { term.print('cat: oak.db: binary file (try psql instead)', 'error'); return; }
      term.print(`cat: ${arg || ''}: No such file or directory`, 'error');
    },
    cd() { term.print('You are already exactly where you need to be.'); },
    date() { term.print(new Date().toString()); },
    echo(arg) { term.print(arg || ''); },
    history() { term.history.forEach((h, i) => term.print(`${String(i + 1).padStart(4)}  ${h}`)); },
    exit() { term.print('There is no exit. Only scrolling down.', 'dim'); hooks.onExit?.(); },
    coffee() { term.print('Brewing… ☕  (418 I\'m a teapot)', 'dim'); },
    rm() { term.print('rm: refusing. My portfolio has a write-ahead log.', 'error'); },
  };

  term.completions = [...Object.keys(commands), 'open oakdb', 'select * from projects;'];

  term.onCommand(async (line) => {
    if (!line) return;
    hooks.onCommand?.(line);

    if (sqlMode) {
      if (line === '\\q' || /^(exit|quit)$/i.test(line)) { sqlMode = false; term.setPrompt(SHELL_PROMPT); return; }
      if (line === '\\?' || /^help$/i.test(line)) {
        term.print('\\dt            list tables', 'dim');
        term.print('\\d <table>     describe a table', 'dim');
        term.print('SELECT …       e.g. SELECT lang, COUNT(*) FROM projects GROUP BY lang;', 'dim');
        term.print('\\q             back to the shell', 'dim');
        return;
      }
      const word = line.split(/\s+/)[0].toLowerCase();
      if (!looksLikeSQL(line) && commands[word] && word !== 'psql') return commands[word](line.split(/\s+/).slice(1).join(' '));
      return runQuery(line);
    }

    if (looksLikeSQL(line)) return runQuery(line);

    const [cmd, ...rest] = line.split(/\s+/);
    const fn = commands[cmd.toLowerCase()];
    if (fn) return fn(rest.join(' '));
    term.print(`${cmd}: command not found. Try "help".`, 'error');
  });

  async function runQuery(sql) {
    await wait(120 + Math.random() * 160);
    const t0 = performance.now();
    const res = runSQL(db, sql);
    const ms = (performance.now() - t0 + 0.05).toFixed(2);
    res.lines.forEach((l) => term.print(l, res.ok ? 'normal' : 'error'));
    if (res.ok) term.print(`Time: ${ms} ms`, 'dim');
    hooks.onQuery?.(res.ok);
  }

  return {
    greet() {
      term.print('IR-DOS 2027.1  ·  tty0', 'dim');
      term.print('');
    },
  };
}
