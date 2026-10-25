<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Naming: international standard (English)

URLs, query parameters, API routes (internal and `/api/v1`), webhooks, CSV columns, new database tables/columns and new code (files, functions, types) use English names: `deals`, `contacts`, `pipelines`, `stages`, `tasks`. Never `negocios`, `funil`, `etapa`. Only the text the user reads in the app, code comments and commit messages stay in PT-BR. Existing Portuguese names migrate gradually, in the order described in `docs/NAMING.md`.
