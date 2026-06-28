# Smart Lists

Smart Lists is a collaborative PWA for everyday lists, currently focused on Slice 1: closed Google login with an email allowlist. The project-level implementation guidance lives in [`CLAUDE.md`](./CLAUDE.md); detailed product and architecture notes live under [`docs/`](./docs/).

## Commands

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
```

The development server runs at [http://localhost:3000](http://localhost:3000).

## Environment

Use [`.env.example`](./.env.example) as the template for local configuration. Tests use [`.env.test`](./.env.test) so they can run with isolated, non-secret values.

Do not commit real secrets.
