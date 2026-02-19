/**
 * Asset paths - all assets are served from project root /assets.
 * public/assets is a symlink to ../../assets (single source of truth).
 */
export const ASSETS = "/assets" as const;

export const assets = {
  cards: (filename: string) => `${ASSETS}/cards/${filename}`,
  hexes: {
    nature: (filename: string) => `${ASSETS}/hexes/nature_tiles/${filename}`,
    resort: (filename: string) => `${ASSETS}/hexes/resort_tiles/${filename}`,
    industry: (filename: string) => `${ASSETS}/hexes/industry_tiles/${filename}`,
    indigenous: (filename: string) =>
      `${ASSETS}/hexes/indigenous_tiles/${filename}`,
    government: (filename: string) =>
      `${ASSETS}/hexes/government_tiles/${filename}`,
  },
} as const;
