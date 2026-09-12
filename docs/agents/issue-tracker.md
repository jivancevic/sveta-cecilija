# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues at https://github.com/jivancevic/sveta-cecilija. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

How the `wayfinder` skill's map, tickets, claims and blocking map onto GitHub (used by the Cecilija map #471):

- **Map** = one issue labelled `wayfinder:map`. **Tickets** = its native **sub-issues**, each labelled `wayfinder:research | prototype | grilling | task`. Attach with GraphQL: `addSubIssue(input:{issueId:<map node id>, subIssueId:<ticket node id>})`; list with `issue(number:N) { subIssues(first:40) { nodes { number state } } }`. Node ids come from `issue(number:N) { id }`.
- **Blocking** is GitHub's native dependency: `addBlockedBy(input:{issueId:<blocked>, blockingIssueId:<blocker>})`, read back with `issue(number:N) { blockedBy(first:20) { nodes { number state } } }`. It renders in the issue sidebar, so the frontier is visible without opening the map. Write "Blocked by X" in the body too, for readers of the plain issue.
- **Claim** = assign the ticket to `jivancevic` before any work; an open, unassigned sub-issue is unclaimed. **Frontier** = open sub-issues with no open `blockedBy` and no assignee.
- **Resolution** = a comment on the ticket, then `gh issue close --reason completed`, then one line under *Decisions so far* in the map body (`gh issue edit <map> --body-file`; fetch the body first, never retype it).
- The GraphQL endpoint drops connections often (`Post ... unexpected EOF`); wrap each mutation in a short retry loop and verify with the read query afterwards. `gh issue create` can fail the same way: check `gh issue list` before recreating.
