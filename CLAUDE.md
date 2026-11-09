# How to talk to me

- Always use simple, easy English. No hard or fancy words.

## Rephrase triggers

When my message contains any of these phrases, do NOT write or edit code yet:
- "rephrase first"
- "explain first"
- "recap"
- "confirm understanding"

Instead:
1. Rephrase the intent in brief, using simple language.
2. Wait for me to reply with "go ahead", "yes", or corrections before touching any code.

Only proceed with changes after I confirm.
Do NOT skip the rephrase step even if the task seems small once you read it. The trigger word is the signal, not your own judgment about complexity.

# Git workflow

- Work on `main` only, until I tell you to create a new branch.
- Don't push commits yourself. I will push them.
- But do make commits as the work gets done.

**Branches** (same in this repo and the frontend repo `../creator-catalyst-admin-dashboard-latest`):
- `main` = staging. The staging Coolify apps build from `main`. All work happens here.
- `live` = live. The live Coolify apps build from `live`. Nobody commits on it directly; it only follows `main`.
- Keep `live` the same as `main`. When asked to bring changes to live, run `git fetch . main:live` from `main` (no branch switch; it refuses if `live` has commits that `main` lacks, so ask then). The user pushes both branches.
- Before `live` gets code that needs new tables or columns, the live database (`connect_ping2`) needs the same migration as staging (see `migrations/`).
