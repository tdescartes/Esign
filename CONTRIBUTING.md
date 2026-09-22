# Contributing

## Workflow

1. Work inside `frontend/`, `backend/`, `shared/`, and `docs/`.
2. Keep backend route behavior stable while frontend migration is in progress.
3. Prefer small PRs that leave the repo runnable.

## Local development

```bash
npm install
npm run dev:api
npm run dev:web
```

## Quality bar

- Run `npm test` before opening a PR.
- Run `npm run lint` before opening a PR.
- Preserve or improve the current signing flow when refactoring.
