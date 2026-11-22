// A frozen copy of the original seven projects. The SQL engine tests assert exact rows,
// ids and counts, so they run against this fixture rather than the live js/data.js,
// which changes whenever a project is added.
export const projects = [
  {
    "id": 1,
    "slug": "oakdb",
    "name": "OakDB",
    "lang": "Go",
    "year": 2026,
    "stack": "Go, B+trees, WAL, PostgreSQL protocol",
    "summary": "A SQL database built from scratch: B+tree storage, write-ahead log with crash recovery, snapshot isolation, a query planner with index and hash joins, and the PostgreSQL wire protocol.",
    "proof": "Tested against SQLite with 30,000 random queries and repeated SIGKILL crash tests. The live demo is the real engine compiled to WebAssembly.",
    "repo": "https://github.com/ibiraza1077-pixel/oakdb",
    "demo": "https://ibiraza1077-pixel.github.io/oakdb/demo/"
  },
  {
    "id": 2,
    "slug": "viral-clipper",
    "name": "Viral Clipper",
    "lang": "Python",
    "year": 2026,
    "stack": "Python, FastAPI, MLX Whisper, Claude API, OpenCV, ffmpeg",
    "summary": "A local ML pipeline that turns long videos into vertical clips: Whisper transcription, LLM clip selection, face-tracked reframing and animated captions.",
    "proof": "Also writes, draws, voices and edits narrated story videos on Apple Silicon. The live studio walks through a real run.",
    "repo": "https://github.com/ibiraza1077-pixel/viral-clipper",
    "demo": "https://ibiraza1077-pixel.github.io/viral-clipper/"
  },
  {
    "id": 3,
    "slug": "codepair",
    "name": "CodePair",
    "lang": "TypeScript",
    "year": 2026,
    "stack": "TypeScript, React, Express, Socket.IO, Monaco",
    "summary": "Real-time collaborative coding rooms with a shared Monaco editor, chat, interview problems and in-browser JS/TS execution.",
    "proof": "Live demo; the free API host can take a minute to wake up.",
    "repo": "https://github.com/ibiraza1077-pixel/codepair",
    "demo": "https://codepair-nine.vercel.app/"
  },
  {
    "id": 4,
    "slug": "interview-coach",
    "name": "AI Interview Coach",
    "lang": "TypeScript",
    "year": 2026,
    "stack": "React, TypeScript, Cloudflare Workers AI, KV",
    "summary": "Mock technical interviews driven by an LLM, with conversation history stored at the edge.",
    "proof": "Runs entirely on Cloudflare Workers.",
    "repo": "https://github.com/ibiraza1077-pixel/cf_ai_interview_coach",
    "demo": "https://cf-ai-interview-coach.ai-interview-coach.workers.dev/"
  },
  {
    "id": 5,
    "slug": "job-tracker",
    "name": "Job Tracker",
    "lang": "JavaScript",
    "year": 2026,
    "stack": "React, Express, PostgreSQL, JWT",
    "summary": "A full-stack app with sign-up, JWT auth and per-user application records in Postgres.",
    "proof": "Live demo; the free API host can take a minute to wake up.",
    "repo": "https://github.com/ibiraza1077-pixel/job-tracker",
    "demo": "https://job-tracker-liart-theta.vercel.app/"
  },
  {
    "id": 6,
    "slug": "unilondon",
    "name": "UniLondon",
    "lang": "JavaScript",
    "year": 2026,
    "stack": "JavaScript, Python, service workers, GitHub Actions",
    "summary": "An installable student resource app with offline support, saved listings, a map view and scheduled Python data checks.",
    "proof": "A PWA that keeps working with no connection.",
    "repo": "https://github.com/ibiraza1077-pixel/ibiraza1077-pixel.github.io",
    "demo": "https://ibiraza1077-pixel.github.io/"
  },
  {
    "id": 7,
    "slug": "ai-security",
    "name": "AI Security Assessment",
    "lang": "Python",
    "year": 2026,
    "stack": "Python, FastAPI, SQLAlchemy, Docker",
    "summary": "A research prototype for AI-assisted security workflows, with a working HTTP-evidence review API.",
    "proof": "Work in progress: scanner adapters are simulated and authentication is unfinished.",
    "repo": "https://github.com/ibiraza1077-pixel/ai-pentest-system",
    "demo": "https://ai-pentest-system.vercel.app"
  }
];
