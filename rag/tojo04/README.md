# Ask Hospilot — Part 2 (tojo04)

A grounded natural-language analytics service for synthetic hospital operations data.
Users ask questions in everyday language; the service plans read-only SQLite, executes it
against deterministic data, and answers only from the returned rows. Both SQL and rows
are visible in the UI.

## Quick start

Requirements:

- Node.js 22.5 or newer (`node:sqlite` is used to avoid native database dependencies)
- An OpenAI API key with access to the configured model

From `rag/tojo04`:

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env`:

```env
OPENAI_API_KEY=your-real-key
OPENAI_MODEL=gpt-4.1-mini
PORT=3001
```

Then initialize the deterministic demo database and run the service:

```powershell
npm run db:seed
npm run dev
```

Open <http://localhost:3001>. The API key stays on the server and is never sent to the
browser. `.env` and generated `.db` files are ignored by Git.

Run all tests with:

```powershell
npm test
```

`npm test` reseeds the database first so assertions always run against known data.

## Architecture

```text
Browser question
      │
      ▼
POST /api/ask
      │
      ▼
OpenAI structured query plan ── unsupported? ──► honest refusal
      │ answerable
      ▼
Lexical SQL guard + SQLite EXPLAIN
      │
      ▼
Read-only SQLite connection + 100-row cap
      │
      ▼
OpenAI answer constrained to retrieved rows
      │
      ▼
Answer + interpretation + SQL + result table
```

The planner uses the actual live SQLite catalog, explicit business definitions, and strict
JSON-schema output. If its first SQL statement fails validation or execution, the service
provides the error for one repair attempt. It never silently substitutes invented data.

The final answer receives the question, executed SQL, and result rows, with instructions
to preserve exact values and add no outside facts. Unsupported questions stop before SQL
execution and before the answer-generation call.

## Grounding and safety

Defense is layered rather than relying on the prompt alone:

1. Only SQL beginning with `SELECT` or `WITH` is accepted.
2. DML, DDL, PRAGMA, attachment, comments, multiple statements, and SQLite internals are blocked.
3. SQLite prepares `EXPLAIN QUERY PLAN` before execution.
4. The database is reopened read-only with `query_only` enabled for every query.
5. Results are capped at 100 rows.
6. Generated SQL and retrieved rows are shown to the reviewer.

The service does not expose model chain-of-thought. Its visible "reasoning" is auditable
operational evidence: interpretation, SQL, and retrieved rows.

## Dataset and schema choices

`schema.sql` adapts the supplied Postgres schema to SQLite:

- UUIDs and timestamps are stored as ISO-formatted `TEXT`.
- Booleans use constrained `INTEGER` values (`0`/`1`).
- Postgres arrays use JSON text.
- Operational indexes were added for bed, admission, roster, visit, claim, and stock queries.
- Registry/configuration tables unrelated to hospital analytics were omitted.

The seed contains no real patient data. It covers 32 analytics tables and includes
meaningful records for beds, current admissions, staffing capacity, ER visits, vitals,
appointments, waitlists, labs, infections, surgeries, claims, billing, collections,
inventory, and purchasing. Dates are generated relative to seed time so "today" remains
meaningful.

Useful deterministic checks:

- Active available ICU beds: **6**
- All active available beds: **22**
- Highest occupied-bed percentage: **ICU, 56.7% (17/30)**
- Night roster shortages: **ICU nursing 5 load units; ER and Pediatrics nursing 1 each**
- Below-minimum supplies: **N95 Masks, Normal Saline, Oxygen Cannula**

## Example questions

- How many ICU beds are free right now?
- Rank wards by current occupancy.
- How are beds doing?
- Which teams are understaffed on the night shift?
- Which supplies have fallen below their reorder level?
- How many critical vitals were recorded?
- What is the outstanding invoice balance?
- Which claims are high-risk?
- What is our patient satisfaction score this month? *(must refuse: no such data)*

## HTTP endpoints

- `GET /api/health` — database/key/model readiness and non-sensitive dataset counts.
- `POST /api/ask` with `{ "question": "..." }` — grounded answer and evidence.

## Why these choices

- **SQLite:** zero external service setup, deterministic review, and a real SQL execution layer.
- **OpenAI Responses API:** server-side API usage and strict structured query plans, following
  the [official quickstart](https://developers.openai.com/api/docs/quickstart) and
  [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).
- **`gpt-4.1-mini`:** configurable, low-latency model with structured output support. Reviewers
  can change `OPENAI_MODEL` without changing code.
- **Two model stages:** separates query planning from answer writing and makes the database
  result the only bridge between them.
- **No vector store:** the task's source of truth is relational/quantitative data. Text-to-SQL
  is a better retrieval mechanism here than semantic document search.

## With more time

- Add a real SQL AST parser and column/table allowlisting instead of lexical checks.
- Add evaluation fixtures that run paraphrase suites against the live model in CI.
- Use a constrained service account against Postgres and enforce statement timeouts.
- Add query-cost limits and observability for model latency, tokens, refusals, and repairs.
- Add a semantic layer for organization-specific definitions and date/time zones.
- Redact or aggregate sensitive columns based on the requesting staff member's role.
