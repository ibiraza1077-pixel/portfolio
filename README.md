# Ibrahim Raza · Portfolio

**Live site: https://ibiraza1077-pixel.github.io/portfolio/**

A 3D portfolio that boots like an old computer. You can type into the terminal on its screen, including real SQL queries over my projects. Scroll down and the camera dives through the glass into a particle world: my name, a B+tree from [OakDB](https://github.com/ibiraza1077-pixel/oakdb), and one particle planet per project.

## What's in it

- **A procedural 3D scene** (Three.js): a retro desktop computer, keyboard, mug and desk, built from geometry in code, lit by the screen itself (a rect area light) plus bloom.
- **A CRT shader** with barrel distortion, scanlines, phosphor glow and a power-on collapse. The screen texture is a live canvas terminal.
- **A working terminal** with history, tab completion and commands (`help`, `projects`, `open`, `neofetch`, `hire`, `psql`, `matrix`).
- **A toy SQL engine** written from scratch: tokenizer, recursive-descent parser, evaluator and psql-style formatter. It supports `SELECT` with `WHERE`, `LIKE`/`ILIKE`, `IN`, `BETWEEN`, `GROUP BY`, aggregates, `ORDER BY`, `LIMIT`, `EXPLAIN`, `\dt` and `\d`. It's read-only and tested (`tests/sql.test.mjs`).
- **A portal transition**: during the dive, the inside world renders into a texture shown on the CRT. When the screen fills the view, the renderer switches scenes.
- **One GPU particle system** of about 22,000 points (9,000 on phones) that morphs through five shapes in a vertex shader.
- **Synthesised sound** with the Web Audio API (CRT hum, key clicks, the dive whoosh). No audio files.
- **A plain fallback page** when WebGL or the CDN isn't available. Add `#static` to the URL to see it.

## Run it locally

No build step. Serve the folder with any static server:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

Run the SQL engine tests with Node 18 or newer:

```bash
node tests/sql.test.mjs
```

`build.py` bundles everything into one HTML file (`python3 build.py dist.html`) for hosts that need a single page.

## Editing the content

Everything the site says lives in [`js/data.js`](js/data.js): profile, projects, skills and the OakDB facts. The terminal, the SQL tables and the project section all read from it.

## Stack

Three.js r170, GLSL, GSAP 3.13 (ScrollTrigger, SplitText), Lenis, Web Audio API and plain ES modules.
