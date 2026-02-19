# Linear Tickets

All Linear-related tickets, scripts, and config for the Landgrab project.

## Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp tickets/.env.example tickets/.env
   ```

2. Add your Linear API key to `tickets/.env`:
   ```
   LINEAR_API_KEY=lin_api_xxxxxxxxxxxx
   ```
   Get your key: https://linear.app/settings/api

## Pull (Linear → local)

Fetch issues from Linear and write to `tickets/tickets.md`:

```bash
node tickets/sync.mjs
```

## Push (local → Linear)

Create tickets in `tickets/local.md`, then push them to Linear:

```bash
node tickets/sync.mjs --push
```

**Local ticket format** in `tickets/local.md`:
- Lines starting with `- ` or `- [ ] ` are new tickets
- Indent the next line(s) with 2+ spaces for an optional description
- After a successful push, created tickets are removed from `local.md`

## Using in Cursor

Reference tickets when coding by typing **@tickets** or **@tickets/tickets.md** to pull in the synced issue list.
