/**
 * Asset paths - all assets are served from project root /assets.
 * public/assets is a symlink to ../../assets (single source of truth).
 */
const ASSETS = '/assets' as const;

export const HEX_ASSETS: Record<string, string> = {
  Fog: `${ASSETS}/hexes/nature_tiles/fog_hex.png`,
  Field: `${ASSETS}/hexes/nature_tiles/field_hex.png`,
  Mountain: `${ASSETS}/hexes/nature_tiles/mountains_hex.png`,
  Forest: `${ASSETS}/hexes/nature_tiles/forest_hex.png`,
  Water: `${ASSETS}/hexes/nature_tiles/water_hex.png`,
  Sand: `${ASSETS}/hexes/nature_tiles/desert_hex.png`,
};

export const BUILDING_ASSETS: Record<string, string> = {
  Resort: `${ASSETS}/hexes/resort_tiles/resort_disc.png`,
  Housing: `${ASSETS}/hexes/resort_tiles/resort_homes_disc.png`,
  IndustrialZone: `${ASSETS}/hexes/industry_tiles/industry_disc.png`,
  Farm: `${ASSETS}/hexes/industry_tiles/industry_farm_disc.png`,
  Village: `${ASSETS}/hexes/indigenous_tiles/indigenous_disc.png`,
  Reserve: `${ASSETS}/hexes/indigenous_tiles/reserve.png`,
  Infrastructure: `${ASSETS}/hexes/government_tiles/infrastructure_disc.png`,
  CivicOffice: `${ASSETS}/hexes/government_tiles/civic_offices_disc.png`,
};
