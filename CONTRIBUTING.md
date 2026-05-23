# Contributing to MegaBrain

Thanks for your interest in improving MegaBrain. This is a small, self-hosted project — contributions, bug reports, and ideas are all welcome.

## Ways to contribute

- **Report a bug** — open an issue with steps to reproduce, what you expected, and what happened.
- **Suggest a feature** — open an issue describing the use case before writing code, so we can agree on the approach.
- **Send a pull request** — fix a bug, improve the docs, or add a feature (ideally one discussed in an issue first).

## Development setup

**Prerequisites:** Node.js 20+ and git.

```bash
git clone https://github.com/ControlledMayhem/megabrain.git
cd megabrain
npm install
cp .env.example .env   # fill in your own values
```

You'll need your own Neon database, OpenAI API key, and a GitHub vault repo to run the full stack — see the [README](./README.md) for the guided `scripts/setup.sh` flow.

```bash
npm run dev      # run locally with hot reload
npm run build    # compile TypeScript (must pass before a PR)
npm start        # run the compiled build
npm run sync     # full re-index of all notes
```

There is no automated test suite yet. At minimum, make sure `npm run build` passes (the project uses TypeScript `strict` mode) and that you've manually exercised the change.

## Pull request workflow

1. Fork the repo and create a branch off `main` (e.g. `fix/webhook-signature`, `feat/tag-filtering`).
2. Keep changes focused — one logical change per PR.
3. Make sure `npm run build` passes with no type errors.
4. Open a PR against `main` with a clear description of what changed and why. Link any related issue.

Only maintainers can merge. A PR being open doesn't mean it will be merged as-is — expect review and discussion.

## Commit messages

Follow the [Conventional Commits](https://www.conventionalcommits.org) style already used in this repo:

```
feat: add tag-based filtering to search
fix: verify webhook signature before processing
docs: document the REST API endpoints
chore: bump dependencies
```

## Code style

- TypeScript, ES modules, `strict` mode.
- Match the existing style — no new tooling, frameworks, or abstractions unless the change genuinely needs them.
- Keep it dependency-light. New runtime dependencies should be justified in the PR.
- Don't commit secrets. `.env` is gitignored; never put real keys in tracked files.

## Reporting security issues

Please **don't** open a public issue for security vulnerabilities. Instead, report them privately through GitHub's [security advisory](https://github.com/ControlledMayhem/megabrain/security/advisories/new) flow.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
