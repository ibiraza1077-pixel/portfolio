"""Bundle the portfolio into one HTML page (for hosting as a single file).

Local modules are concatenated in dependency order with their local imports and
`export` keywords removed. Imports from 'three' and 'three/addons/...' stay, merged
and de-duplicated, and resolve through the page's import map. Fails loudly if two
modules declare the same top-level name.

Usage: python3 build.py <out.html> [--artifact]
"""
import re
import sys
from pathlib import Path

ORDER = ['data', 'sql', 'terminal', 'commands', 'computer', 'inside', 'world', 'sound', 'main']
root = Path(__file__).parent
out_path = Path(sys.argv[1])

ext_imports = {}  # module specifier -> set of import clauses
bodies = []
declared = {}
decl_re = re.compile(r'^(?:export\s+)?(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)', re.M)

for name in ORDER:
    src = (root / 'js' / f'{name}.js').read_text()

    def take_import(m):
        clause, spec = m.group(1).strip(), m.group(2)
        if spec.startswith('./'):
            return ''
        ext_imports.setdefault(spec, set()).add(clause)
        return ''

    src = re.sub(r"^import\s+(.+?)\s+from\s+'([^']+)';\s*$", take_import, src, flags=re.M)
    for decl in decl_re.findall(src):
        if decl in declared:
            sys.exit(f'name clash: {decl} in {name}.js and {declared[decl]}.js')
        declared[decl] = name
    src = re.sub(r'^export\s+(?=(?:async\s+)?(?:const|let|var|function|class)\b)', '', src, flags=re.M)
    bodies.append(f'// ---- {name}.js ----\n{src}')

lines = []
for spec, clauses in ext_imports.items():
    named, other = set(), []
    for c in clauses:
        if c.startswith('{'):
            named.update(x.strip() for x in c.strip('{} ').split(',') if x.strip())
        elif c not in other:
            other.append(c)
    for c in other:
        lines.append(f"import {c} from '{spec}';")
    if named:
        lines.append(f"import {{ {', '.join(sorted(named))} }} from '{spec}';")
js = '\n'.join(lines) + '\n\n' + '\n'.join(bodies)

html = (root / 'index.html').read_text()
css = (root / 'style.css').read_text()
html = html.replace('<link rel="stylesheet" href="style.css" />', f'<style>\n{css}\n</style>')
html = html.replace('<script type="module" src="js/main.js"></script>', f'<script type="module">\n{js}\n</script>')
if '--artifact' in sys.argv:
    head = html.split('<head>')[1].split('</head>')[0]
    head = re.sub(r'\s*<meta charset[^>]*>\s*<meta name="viewport"[^>]*>', '', head)
    title = re.search(r'<title>.*?</title>', head).group(0)
    head = head.replace(title, '')
    body = html.split('<body class="is-booting">')[1].split('</body>')[0]
    html = title + '\n' + head.strip() + '\n' + body.strip() + '\n'
out_path.write_text(html)
print(f'{out_path} written, {len(html):,} bytes, {len(declared)} top-level names, no clashes')
