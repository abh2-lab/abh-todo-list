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

## Branches

- `main` = staging. We do testing and improvements on `main`.
- `live` = production. The production app runs on `live`.

## Rules

- Work on `main` only, until I tell you to create a new branch.
- Never commit on `live` directly.
- Don't push commits yourself. I will push them.
- Make commits as the work gets done.
