# gitgud Agent Guide

gitgud is a web application built with SvelteKit 2, Svelte 5 (runes), TypeScript, and Tailwind CSS 4, managed with pnpm.

## Working Mode

Start every session in Plan mode and switch to Build mode only after the approach is agreed upon. In OpenCode, the Plan agent is the default (see [`opencode.json`](opencode.json)). In Codex, plan before making any edits.

## Commands

Use the package scripts defined in [`package.json`](package.json) (`pnpm lint`, `pnpm lint:es`, `pnpm lint:sv`, `pnpm fmt:fix`, `pnpm es:fix`, `pnpm fix`, `pnpm build`). Never invoke tools directly via `npx`, `npm`, or other package managers; the scripts are pre-configured with the correct options and ensure consistent behavior.

Do not run long-lived servers (`pnpm dev`, `pnpm preview`); leave server lifecycle to the human.

## Conventions

- Assume the current working directory is already the project root. Do not use directory-changing flags like `git -C` or `pnpm --filter`.
- Never run `git commit` or `git push`. Humans own git history; leave staged changes for review instead.
- If the user corrects you on conventions or workflows, update your memory files accordingly so you will not make the same mistake again.

## Code Review

Review expectations live in [`REVIEW.md`](REVIEW.md).

## Skills

The agent skills in [`.agents/skills/`](.agents/skills) are vendored from [BastiDood/skills](https://github.com/BastiDood/skills) (MPL-2.0) via `npx skills add`. Keep this attribution when updating them.
