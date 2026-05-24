# Agent Instructions

## OpenSpec Workflow

Use OpenSpec for version-level changes before implementation. The project has
OpenSpec initialized under `openspec/`, with Codex skills under `.codex/skills/`.

Use OpenSpec for:

- New product features.
- Product interaction or UX changes.
- Data model, database schema, or migration changes.
- Data pipeline, cleaning, scoring, or import behavior changes.
- API, query, aggregation, or filtering behavior changes.
- Architecture, deployment, or operational workflow changes.
- Any change that affects acceptance criteria or release scope.

OpenSpec is usually not required for:

- Starting or stopping the local dev server.
- Checking logs, browser errors, database contents, or runtime status.
- Commit, push, branch, or repository maintenance only.
- Tiny one-line bug fixes with obvious scope.
- Temporary local data import, cleanup, or inspection tasks.
- Pure discussion or exploration where no implementation is requested.

Default workflow for version-level changes:

1. Clarify unclear requirements. Do not guess product intent.
2. Create a change under `openspec/changes/<change-id>/`.
3. Write OpenSpec artifacts before coding:
   - `proposal.md`
   - `design.md`
   - `tasks.md`
   - relevant `specs/.../spec.md` deltas
4. Ask the user to confirm the proposal/design when the product or technical
   direction is non-trivial.
5. Implement according to `tasks.md`.
6. Run appropriate verification, usually including:
   - `npm run typecheck`
   - `npm run build`
   - relevant Python tests
   - browser verification for frontend changes
7. Update `tasks.md` as tasks are completed.
8. Commit only when requested, unless the user has clearly asked for the whole
   change to be completed and saved.
9. Archive the OpenSpec change only after the user confirms the version is
   complete.

If the user explicitly says "按 OpenSpec 流程", always use OpenSpec. If the user
explicitly says "先别走 OpenSpec" or asks for a small direct fix, skip OpenSpec
for that task.

## Project Context

MapNews is a map-based news browser for mainland China users.

- Frontend: Next.js App Router, React, TypeScript.
- Database: PostgreSQL + PostGIS.
- Worker: Python batch jobs for GDELT import, cleaning, scoring, and cleanup.
- Data: GDELT Events/Mentions/GKG-derived tables, with raw preservation and
  cleaned display tables.
- Product direction: Chinese UI, map-first news browsing, region hotspots,
  channel filtering, trend context, source traceability.
- Architecture constraints: no Docker for MVP; no separate backend API service
  for MVP; Next.js server code queries PostgreSQL directly.

## Local Development

- Default app URL: `http://127.0.0.1:3000`
- Start dev server with:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

- Prefer `rg` for searching.
- Use `apply_patch` for manual file edits.
- Do not edit `.env` or other sensitive local configuration unless explicitly
  requested.
- Do not revert user changes unless explicitly requested.

