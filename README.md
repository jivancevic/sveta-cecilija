# moreska.eu — HGD Sveta Cecilija

Website and online ticketing system for [HGD Sveta Cecilija](https://moreska.eu), the 143-year-old cultural society from Korčula, Croatia, and the home of the **Moreška** — the sword dance performed on the island for centuries.

The site sells tickets to public Moreška performances, takes enquiries for private shows and the "Moreška Experience", and runs the door: every ticket is a per-person QR code scanned on arrival.

> **Status:** This is the replacement for the legacy `korcula-moreska.com` site. Cutover to `moreska.eu` is targeted before the 2026 peak season; until then `dev.moreska.eu` runs staging and the live ticketing site stays on the old domain.

## What it does

- **Public site** — homepage, about, section pages (Moreška, wind orchestra, klapa, choir), service enquiry pages, and a blog, fully bilingual EN/HR (locale via cookie — there are no `/en` or `/hr` URL prefixes).
- **Ticketing** — public show schedule, Stripe checkout (cards + Google/Apple Pay), fixed pricing (€20 adult / €10 child), capacity derived per venue rather than stored.
- **Per-person QR tickets** — one QR per attendee, emailed as a branded PDF; door staff scan at `/scan/[token]` with an atomic mark-and-read so a code can't be reused.
- **Admin & stats** — Payload CMS admin with role-aware dashboards (`superadmin` / `admin` / `tehnika` / `partner`) and admin-initiated, idempotent refunds.
- **Reseller channel** — partner logins that see only their own orders and tickets, with per-partner commission.

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| CMS / DB | Payload CMS v3 + PostgreSQL |
| Payments | Stripe (Payment Element, EUR) |
| Email | Brevo (transactional + newsletter) |
| Styling | Tailwind CSS v4 + custom CSS |
| Hosting | Coolify on Hetzner Cloud (Docker, Next.js standalone) |

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture, conventions, and hard rules, and [`CONTEXT.md`](./CONTEXT.md) for the domain glossary.

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

Production runs on **Coolify** (Hetzner Cloud) from a multi-stage **Dockerfile** that produces a Next.js standalone image ([ADR-0012](./docs/adr/0012-container-build-dockerfile-standalone.md)) — not Vercel, since Payload's long-lived Postgres pool and bootstrap-on-start don't fit a serverless model. `dev.moreska.eu` is a second Coolify app that auto-deploys every push to `main`; prod has auto-deploy off and is promoted by a manual redeploy of the same commit. See [`docs/agents/deployment.md`](./docs/agents/deployment.md) for the build gotchas and debugging playbook.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Payload CMS Documentation](https://payloadcms.com/docs)
