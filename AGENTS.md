# gitgud Agent Guide

gitgud is a web application built with SvelteKit 2, Svelte 5 (runes), TypeScript, and Tailwind CSS 4, managed with pnpm.

## Working Mode

Start every session in Plan mode and switch to Build mode only after the approach is agreed upon. In OpenCode, the Plan agent is the default (see [`opencode.json`](opencode.json)). In Codex, plan before making any edits.

## Commands

Use the package scripts defined in [`package.json`](package.json) (`pnpm lint`, `pnpm lint:es`, `pnpm lint:sv`, `pnpm fmt:fix`, `pnpm es:fix`, `pnpm fix`, `pnpm build`). Never invoke tools directly via `npx`, `npm`, or other package managers; the scripts are pre-configured with the correct options and ensure consistent behavior.

Do not run long-lived servers (`pnpm dev`, `pnpm preview`); leave server lifecycle to the human.

## Testing

Tests live in two places:

- `src/**/*.test.{js,ts}` — colocated node-environment unit/integration tests, run via `pnpm test:unit` (configured in [`vite.config.js`](vite.config.js)).
- `tests/` — end-to-end tests, run via `pnpm test:e2e` (configured in [`playwright.config.js`](playwright.config.js)); requires `pnpm build` first.

One-time setup: `pnpm test:e2e:setup` installs the Playwright chromium browser. After building features, write and run the new tests (`pnpm test:unit`, then `pnpm test:e2e`) as the final verification step.

Rules:

- Tests must never hit the real GitHub API. The GitHub client reads its base URL from `GITHUB_API_BASE` (defaults to the real API); tests point it at the fake GitHub server under `tests/fake-github/`.
- [`testing-guidelines`](.agents/skills/testing-guidelines/SKILL.md) is authoritative on test admission; framework documentation and tooling skills are consulted for tool mechanics only.
- Vitest and Playwright questions go through Context7 (`/vitest-dev/vitest`, `/microsoft/playwright`), consistent with the MCP instructions.

See [`TESTING.md`](TESTING.md) for details, and [`REVIEW.md`](REVIEW.md) for review expectations.

## Conventions

- Assume the current working directory is already the project root. Do not use directory-changing flags like `git -C` or `pnpm --filter`.
- Never run `git commit` or `git push`. Humans own git history; leave staged changes for review instead.
- If the user corrects you on conventions or workflows, update your memory files accordingly so you will not make the same mistake again.

## Code Review

Review expectations live in [`REVIEW.md`](REVIEW.md).

## Skills

The agent skills in [`.agents/skills/`](.agents/skills) are vendored from [BastiDood/skills](https://github.com/BastiDood/skills) (MPL-2.0) via `npx skills add`. Keep this attribution when updating them.
