# Overview

Landgrab is a game where players build on a hex map to acquire resources and cards, competing to satisfy winning conditions according to one of four player types: The Hotelier, The Industrialist, The Chieftain, and the Bureaucrat.

# Getting Started

Run the following commands to run the game locally:
```
cd boardgame
npm install
npm run dev
```

## Online Multiplayer

To play online with friends, you need to run the game server alongside the Vite dev server:

```bash
cd boardgame

# Terminal 1: Start the game server (port 8000)
npm run dev:server

# Terminal 2: Start the frontend dev server (port 3000)
npm run dev
```

Or run both at once:
```bash
npm run dev:all
```

Then open `http://localhost:3000` and choose **Online Multiplayer** from the menu. One player creates a match and shares the match ID; others join from the lobby.

### Production

To build and serve the full app (server + static frontend) from a single port:
```bash
npm run build
npm run serve
```

Rules are explained in `boardgame/rules/rules_bg.md`.

Run `npm test` for testing.

Have fun!