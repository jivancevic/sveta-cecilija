# moreska.eu — HGD Sveta Cecilija

Website and ticketing system for [HGD Sveta Cecilija](https://moreska.eu), a 143-year-old cultural organisation from Korčula, Croatia, home of the Moreška sword dance.

Built with Next.js 16 (App Router) + Payload CMS v3 + PostgreSQL, with Stripe checkout and Brevo email. See [`CLAUDE.md`](./CLAUDE.md) for the full architecture, stack, and conventions.

## Getting Started

Copy the env template and fill in values:

```bash
cp .env.example .env.local
```

Then run the dev server (this also runs `scripts/bootstrap-db.mjs` to apply the schema):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the public site, or `/admin` for the Payload CMS admin.

> If bootstrap prints `DATABASE_URL is not set — skipping`, source env first:
> `set -a && . .env.local && set +a && npm run dev`

## Deployment

Production runs on **Coolify** (Hetzner Cloud, Nixpacks-built container) — not Vercel; Payload's long-lived Postgres pool and bootstrap-on-start don't fit a serverless model. `dev.moreska.eu` is a second Coolify app tracking `main` for staging. See the "Deployment" section of [`CLAUDE.md`](./CLAUDE.md) and [`docs/agents/deployment.md`](./docs/agents/deployment.md) for the build gotchas and debugging playbook.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Payload CMS Documentation](https://payloadcms.com/docs)
