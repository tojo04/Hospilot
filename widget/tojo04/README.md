# Hospilot Widget — tojo04

This folder contains the Part 1 submission: a mock hospital dashboard with an embedded
Hospilot goal widget, plus a small same-origin backend for authentication, session
creation, and plan polling.

## Architecture

1. The browser sends the user's goal to `POST /api/create-session`.
2. The backend logs in to Hospilot with server-only environment variables.
3. The backend prefixes the goal with `[CANDIDATE-tojo04]`, explicitly creates a
   non-autonomous session, and returns the session ID and short-lived token.
4. The browser polls `POST /api/session-status`; that endpoint performs the authenticated
   Hospilot status request and reports whether `pipeline` is populated.
5. Once ready, the UI enables **View Plan**. The iframe is loaded first, then receives the
   exact `widget_init` message containing the token and session ID.

The browser never calls the Hospilot REST API directly. The token is held only in page
memory because it is required for the iframe handoff; it is not persisted or logged.

## Run locally

Requirements: Node.js 20 or newer.

```powershell
Copy-Item .env.example .env.local
```

Edit `.env.local` and replace the placeholder username and password with the sandbox
credentials supplied with the assessment. If `tojo04` is not the desired submission
name, also update `CANDIDATE_NAME`.

```powershell
npm run dev
```

Open <http://localhost:3000>. Automated tests can be run with:

```powershell
npm test
```

The `.env.local` file is ignored by the repository's existing `.gitignore` rules.

## Deploy to Vercel

1. Import the forked repository into Vercel.
2. Set the project's **Root Directory** to `widget/tojo04`.
3. Select **Other** as the framework preset if Vercel does not detect it automatically.
4. Add these production environment variables:
   - `HOSPILOT_USERNAME`
   - `HOSPILOT_PASSWORD`
   - `CANDIDATE_NAME=tojo04`
5. Deploy and open the generated public URL.
6. Submit one test goal and confirm that **View Plan** opens the matching pipeline.

Do not add `PORT` on Vercel; it is only used by the local development server.

## Manual live verification checklist

- The goal shown in the request is prefixed with `[CANDIDATE-tojo04]`.
- Planning normally takes 10–30 seconds and the UI updates while polling.
- **View Plan** appears only after a non-empty pipeline is returned.
- Clicking it opens the real Hospilot app and selects the newly created session.
- No username, password, or token appears in browser logs or committed files.

Keep live verification to a small number of attempts because each created session uses
real AI compute. The assessment asks candidates to stay below approximately five.
