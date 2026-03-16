# Landgrab (React)

A strategy game prototype of settlement, industry, and politics. Build on a hex map, play cards, and compete for political seats.

## Prerequisites

- **Node.js** 18+ (or use a version manager like `nvm`)
- **npm** (included with Node)

## Running the Project

### Install dependencies

```bash
npm install
```

### Start the development server

```bash
npm run dev
```

The app will open at `http://localhost:5173` (or another port if 5173 is in use).

### Build for production

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

## Beginning a Game

1. **Start the app** — Run `npm run dev` and open the URL in your browser.

2. **Start Game** — On the title screen, click **Start Game**.

3. **Choose players** — Pick the number of players:
   - **2 players** — Hotelier vs Industrialist
   - **3 players** — Choose a third faction (Bureaucrat or Chieftain)
   - **4 players** — All factions

4. **Play** — You start with 2 actions per turn. Use the actions bar to:
   - **Play Charter** — Place your starter building on the hex map
   - **Play cards** — Click cards in your hand for options
   - **Draw** — Draw a card (costs 1 action)
   - **End Turn** — Pass to the next player

5. **Win** — Collect enough **Seat** cards to reach the victory threshold.

## Other Commands

| Command | Description |
|---------|-------------|
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |

## Saving

Use the **Save** button in the game header to persist your game to local storage. Refreshing the page or returning later will restore the saved game. Use **Quit** to clear the save and return to the title screen.
