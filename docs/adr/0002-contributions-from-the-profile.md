# 2. Read the contribution calendar from the profile, not the GraphQL API

- Status: accepted
- Date: 2026-11-08

## Context

The Commits and Contributions widgets show the year's contribution calendar. It came from
GraphQL (`user.contributionsCollection.contributionCalendar`) with a fine-grained token that
can only read public data.

Most of Josh's contributions are private (Kodo's repositories). With "Include private
contributions on my profile" on, the public profile counts them as plain numbers. The API does
not: it counts only the private contributions the token itself can read. Measured on
2026-11-08:

| Reader                                         | Last year |
| ---------------------------------------------- | --------: |
| Public profile, signed out                     |     3,831 |
| GraphQL, Josh's own login (full `repo` access) |     3,662 |
| GraphQL, the site's public-data token          |     1,363 |

Matching the profile through the API would need a token that can read every private and Kodo
repository, stored in a public-facing Worker. That is far more access than a website should
hold, and it still undercounts.

## Decision

Read the calendar from `github.com/users/<login>/contributions`, the fragment the profile page
loads its graph from (`adapters/github/contributions-profile.ts`). It needs no token, the token
is never sent to it, and its numbers are exactly the profile's.

The GraphQL adapter is removed. `GITHUB_TOKEN` now only raises the REST rate limit for the
Projects card.

## Consequences

- The fragment is undocumented HTML. The adapter parses only what it needs (each day cell's
  `data-date` and `data-level`, and the tooltip naming its count) and treats anything else as
  `GitHubResponseInvalid`. If GitHub changes the markup the cards keep the build snapshot, as
  for any GitHub failure (ADR 0001), and the adapter needs updating.
- No token to create, rotate or leak for the calendar.
- Requests are unauthenticated page loads, about one a day per edge cache (ADR 0001).
