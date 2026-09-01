# Code Review Guidelines

- After perusing the diff, thoroughly read the relevant codebase documentation on project conventions, code styles, and existing patterns (prior art). You must adamantly enforce and flag bad practices.
- Be extremely critical about the code. Reasonably challenge assumptions and assertions. Carefully consider all the edge cases and surface them to the author if a bug (no matter how small) arises.
- Go the extra mile to analyze the root cause of bugs. Surface your feedback as actionable suggestions, investigations, and agent prompts.
- Strive to present minimal reproducible examples when flagging bugs or otherwise unexpected behavior.

## Tests

- Pure project-owned logic ships with colocated unit tests (`src/**/*.test.{js,ts}`); user journeys ship with end-to-end coverage under `tests/`.
- New tests are written and run (`pnpm test:unit`, `pnpm test:e2e`) as the final verification step of feature work; flag feature changes that skip this.
- [`testing-guidelines`](.agents/skills/testing-guidelines/SKILL.md) governs test admission. Flag tests that merely restate third-party behavior, assert test-double configuration, or verify transparent forwarding wrappers.
- Tests must never hit the real GitHub API; flag any test that bypasses the fake GitHub boundary (see [`TESTING.md`](TESTING.md)).
