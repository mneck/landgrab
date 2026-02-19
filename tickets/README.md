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

## Sync

From the project root:

```bash
node tickets/sync.mjs
```

This fetches active issues from team **LAN** and writes them to `tickets/tickets.md`.

## Using in Cursor

Reference tickets when coding by typing **@tickets** or **@tickets/tickets.md** to pull in the synced issue list.
