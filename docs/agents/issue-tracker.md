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

How the `wayfinder` skill's map, tickets, claims, blocking and frontier are expressed on this tracker (first map: #471, Cecilija).

- **Map**: one issue labelled `wayfinder:map`; its body is the index (Destination, Notes, Decisions so far, Not yet specified, Out of scope). Edit it with `gh issue edit <map> --body-file <file>` after re-fetching the body with `gh issue view <map> --json body -q .body`: several sessions edit the same map concurrently, so never write from a copy fetched earlier in the session.
- **Ticket**: a **native sub-issue** of the map, labelled `wayfinder:research | prototype | grilling | task`, body starting `Part of the <map name> #<map>.` then `## Question`. Attach it with the database id, not the number:
  ```sh
  gh api repos/jivancevic/sveta-cecilija/issues/<n> --jq .id          # database id
  gh api -X POST repos/jivancevic/sveta-cecilija/issues/<map>/sub_issues -F sub_issue_id=<id>
  gh api repos/jivancevic/sveta-cecilija/issues/<map>/sub_issues --jq 'map(.number)'   # list children
  ```
- **Claim**: the assignee. `gh issue edit <n> --add-assignee jivancevic` before any work; an open, unassigned ticket is unclaimed.
- **Blocking**: GitHub exposes no dependency relationship through `gh`, so it is a body convention: the first paragraph names what blocks the ticket (`Blocked by the navigation prototype.`). The **frontier** is every open, unassigned sub-issue whose named blockers are closed; read the bodies, there is no query for it.
- **Resolution**: a comment holding the answer, `gh issue close <n> --reason completed`, then one line under the map's Decisions so far, linking the ticket by its title.
- Long bodies and comments go through `--body-file` (a worktree session's guard refuses heredocs that mention git/gh).
