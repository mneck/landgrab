import { Server, Origins } from 'boardgame.io/server';
import path from 'path';
import serve from 'koa-static';
import { LandgrabGame } from './src/game/Game';

const isProd = process.env.NODE_ENV === 'production';

const server = Server({
  games: [LandgrabGame],
  origins: isProd
    ? [/https?:\/\/.*$/]
    : [Origins.LOCALHOST],
});

if (isProd) {
  const distPath = path.resolve(import.meta.dirname, 'dist');
  server.app.use(serve(distPath));
}

const PORT = Number(process.env.PORT) || 8000;
server.run(PORT, () => {
  console.log(`Landgrab server running on port ${PORT}`);
});
