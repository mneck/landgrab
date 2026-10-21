import { createRequire } from 'module';
import type * as BgioServer from 'boardgame.io/server';

// Node 26 no longer resolves boardgame.io's legacy `server/package.json` subpath, so load the built file.
const require = createRequire(import.meta.url);
const { Server, Origins } = require('boardgame.io/dist/cjs/server.js') as typeof BgioServer;
import path from 'path';
import serve from 'koa-static';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { LandgrabGame } from './src/game/Game';
import { registerMap } from './src/game/maps';
import type { MapFile } from './src/game/maps';

const isProd = process.env.NODE_ENV === 'production';

// Game setup reads maps from the registry; load the shipped set once at startup.
// Run from the boardgame/ folder (npm scripts do).
const ROOT = process.cwd();
const mapDir = [path.resolve(ROOT, 'public', 'maps'), path.resolve(ROOT, 'dist', 'maps')].find(existsSync);
if (!mapDir) throw new Error('No map directory found (public/maps or dist/maps)');
for (const f of readdirSync(mapDir)) {
  if (!/^map_\d+\.json$/.test(f)) continue;
  const map = JSON.parse(readFileSync(path.join(mapDir, f), 'utf8')) as MapFile;
  map.id = map.id ?? f.replace(/\.json$/, '');
  registerMap(map);
}
console.log(`Loaded maps from ${mapDir}`);

const server = Server({
  games: [LandgrabGame],
  origins: isProd
    ? [/https?:\/\/.*$/]
    : [Origins.LOCALHOST],
});

if (isProd) {
  const distPath = path.resolve(ROOT, 'dist');
  server.app.use(serve(distPath));
}

const PORT = Number(process.env.PORT) || 8000;
server.run(PORT, () => {
  console.log(`Landgrab server running on port ${PORT}`);
});
