# ADR-0024: Moreškant roster app — domain model

**Status:** Accepted
**Date:** 2026-09-07

## Context

The society needs a roster and notification tool for its dancers: who is coming to which performance, an alarm when an army is short, the final lineup per performance, and season statistics. It must integrate with the existing app (same login, same tickets), be trivial to "install" on a phone, and let voditelji record lineups from a photo of the paper list via the Claude app. Glossary terms are in `CONTEXT.md` under *Moreškant*.

Three existing decisions collide with it: `Members` is a login-less attribution table (ADR-0019); ADR-0022 rejected per-person logins for a read-only counter, explicitly deferring them until identity earned its cost; and the `shows` table deliberately holds only the 22 public Redovna performances while DMC, Gulliver and concert dates stay in docs.

## Decision

**A moreškant is a Member.** `Members` gains `isMoreskant`, nickname, mobile, email, dance roles and primary role; `Users` gains a `member` link. One person, one row: comp attribution, promo codes and roster share an identity. Per-person logins are now justified (attendance and comps are per person), so ADR-0022's deferral resolves in favour of logins for moreškanti, provisioned by invitation email. A member in a lineup needs no login. Existing Member rows are flagged by hand; no automatic migration, with a "similar member exists" hint at creation.

**All performances live in `Shows`.** A `kind` and a `public` flag replace the "only Redovna in the DB" convention. Non-public performances have a free-text `location`, no venue, no capacity, no sales. Every consumer of shows that faces buyers (`getUpcomingShows`, capacity, stats, the season dashboard) filters on `public`, guarded by a test. A second `Performances` table was rejected: a Redovna would exist twice and drift on reschedule (#94 already audits date moves).

**Attendance and lineup are separate records.** Attendance is the dancer's answer (no answer / coming / not coming); lineup is the voditelj's record of who danced what, with a `confirmed` flag. Statistics read confirmed lineups only, so a mis-read photo or a draft never inflates a count.

**Web push is the only channel.** No email, SMS or WhatsApp for roster notifications. A PWA with "Add to Home Screen" is the installation story. Automatic alarms fire once per performance at T-6h (18:00 the day before for morning performances), only while below threshold; voditelji can send manually without limit.

**The MCP server copies the Sufler pattern.** `mcp-handler` on `/api/mcp/[transport]`, hand-written OAuth 2.1 with PKCE and a fixed client, an `/authorize` page backed by Payload login and restricted to the `moreska` permission. **The access token lives one year and there is no refresh token** (amended #438): a connection has to survive a season, and a refresh flow is a second set of rules to get wrong; revocation is deleting the token row, or removing the permission. Tools take structured text, never images: Claude reads the photo in chat and calls `set_lineup` with nicknames; the tool **matches exactly, ignoring case and diacritics, and reports every name it could not match** rather than guessing at the nearest one, and writes an unconfirmed lineup. Bulk performance creation is also a tool.

**The calendar feed is ONE shared tokenised ICS link, not one per user** (amended #433): the season's dates are noticeboard information rather than personal data, one link can be pasted in the WhatsApp group, and a per-user feed would buy a token table and a revocation story for nothing.

**Moreškant comps reuse the comp channel** (ADR-0019) with `member` forced to the caller and a cap of 4 self-issued tickets per performance.

## Alternatives considered

- Separate `Moreskanti` table linked to Members: duplicate identity for no gain.
- Native app (Expo): store review, a second repo, and no benefit over a PWA for this audience.
- Email fallback for notifications: rejected by the requester; push only.
- Google Calendar API with OAuth: an ICS feed does the job without Google verification.

## Consequences

- `docs/performances.md` stops being the source of truth for non-public dates once they are imported.
- Push subscriptions are a new raw table; alarms need a scheduled job (the review-email cron pattern on Coolify).
- Roster data is PII-light but internal: mobiles are visible to all moreškanti, emails to voditelji only.
