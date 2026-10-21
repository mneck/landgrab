/**
 * Map verbs: the four faction Personnel (spec 3) and the Guide's fog actions (spec 4.1).
 */
import { BALANCE } from '../balance';
import {
  addGrievance,
  adjacentToPublicWork,
  buildBlocker,
  chieftainIndex,
  factionOf,
  fogAdjacent,
  hasClaim,
  hotelValue,
  indexOfFaction,
  isDeveloped,
  isLand,
  isOpenLand,
  isScar,
  log,
  nearPresence,
  ownsBuildingAdjacent,
  placeBuilding,
  revealSite,
  scarCell,
  scoutCells,
  siteOf,
  surveyReveal,
  surveyTargets,
  villageCount,
} from '../board';
import type { OptionDef } from '../cardTypes';
import { canAfford, gain, pay } from '../economy';
import { requestPayment } from '../reactions';
import type { Action, CellId, LandgrabState, PlayerType, Resources } from '../types';
import { ALL_FACTIONS, BUILDABLE } from '../types';

const allCells = (G: LandgrabState): Partial<Action>[] => G.cells.map((c) => ({ cell: c.id }));
const landCells = (G: LandgrabState): Partial<Action>[] =>
  G.cells.filter(isLand).map((c) => ({ cell: c.id }));

function cellOf(G: LandgrabState, a: Action) {
  if (a.cell === undefined || a.cell < 0 || a.cell >= G.cells.length) return null;
  return G.cells[a.cell];
}

// ---------------------------------------------------------------------------
// Survey / Scout (Guide, Surveyor, Survey Grant)
// ---------------------------------------------------------------------------

export function doSurvey(G: LandgrabState, p: number, cell: CellId): number {
  const n = surveyReveal(G, cell);
  G.stats.surveys += 1;
  G.stats.surveyRevealed.push(n);
  if (factionOf(G, p) === 'Chieftain' && n > 0) {
    const coins = n * G.options.chieftainSurveyIncome;
    G.players[p].resources.coins += coins;
    log(G, p, `Survey revealed ${n} cells (+${coins} coins)`);
  } else {
    log(G, p, `Survey revealed ${n} cells`);
  }
  return n;
}

export const surveyOption: OptionDef = {
  id: 'Survey',
  label: 'Survey',
  text: 'Reveal a Fog cell next to revealed land, and all its neighbours, for everyone.',
  target: 'cell',
  candidates: (G) => surveyTargets(G).map((cell) => ({ cell })),
  legal: (G, _p, a) => {
    const c = cellOf(G, a);
    if (!c || !c.fog) return 'not fog';
    if (!c.neighbors.some((n) => !G.cells[n].fog)) return 'not next to revealed land';
    return null;
  },
  resolve: (G, p, a) => {
    doSurvey(G, p, a.cell!);
  },
};

export const scoutOption: OptionDef = {
  id: 'Scout',
  label: 'Scout',
  text: 'Look under a Fog cell and its neighbours privately. The Fog stays for everyone else.',
  target: 'cell',
  candidates: (G) => surveyTargets(G).map((cell) => ({ cell })),
  legal: (G, p, a) => {
    const me = factionOf(G, p);
    if (me === 'Chieftain') return 'the Chieftain already knows the island';
    const c = cellOf(G, a);
    if (!c || !c.fog) return 'not fog';
    if (!c.neighbors.some((n) => !G.cells[n].fog)) return 'not next to revealed land';
    const known = G.scouted[me] ?? [];
    if ([c.id, ...c.neighbors].every((id) => !G.cells[id].fog || known.includes(id))) return 'nothing new to see';
    return null;
  },
  resolve: (G, p, a) => {
    scoutCells(G, factionOf(G, p), a.cell!);
    log(G, p, 'Scouted under the fog');
  },
};

// ---------------------------------------------------------------------------
// Chieftain — Elder (spec 3.1)
// ---------------------------------------------------------------------------

function villageSpot(G: LandgrabState, id: CellId, ignoring?: CellId): boolean {
  const c = G.cells[id];
  if (!isOpenLand(c) || c.village || c.siteId !== undefined) return false;
  if (c.holding) return false;
  const claimed = (n: number) => n !== ignoring && hasClaim(G.cells[n]);
  return !!c.presence || c.neighbors.some(claimed);
}

export const settleOption: OptionDef = {
  id: 'Settle',
  label: 'Settle',
  text: `Place a Village (max ${BALANCE.maxVillages}) on or next to your Presence, or move one there.`,
  target: 'move',
  candidates: (G) => {
    const out: Partial<Action>[] = [];
    const villages = G.cells.filter((c) => c.village).map((c) => c.id);
    for (const c of G.cells) {
      if (!villageSpot(G, c.id)) continue;
      if (villages.length < BALANCE.maxVillages) out.push({ cell: c.id });
      else for (const v of villages) out.push({ cell: c.id, cells: [v] });
    }
    return out;
  },
  legal: (G, _p, a) => {
    const c = cellOf(G, a);
    if (!c) return 'no cell';
    const from = a.cells?.[0];
    if (from !== undefined) {
      if (!G.cells[from]?.village) return 'no village to move';
      if (!villageSpot(G, c.id, from)) return 'not a village spot';
      return null;
    }
    if (villageCount(G) >= BALANCE.maxVillages) return 'all villages placed';
    if (!villageSpot(G, c.id)) return 'not a village spot';
    return null;
  },
  resolve: (G, p, a) => {
    const from = a.cells?.[0];
    if (from !== undefined) delete G.cells[from].village;
    const c = G.cells[a.cell!];
    c.village = true;
    if (c.presence) {
      delete c.presence;
      G.presenceRemaining += 1;
    }
    log(G, p, from !== undefined ? 'Moved a Village' : 'Settled a Village');
  },
};

export function remediateTarget(G: LandgrabState, id: CellId): boolean {
  const c = G.cells[id];
  if (c.fog || isDeveloped(c)) return false;
  return c.terrain === 'Scar' || c.terrain === 'Plains';
}

export function remediate(G: LandgrabState, p: number, id: CellId): void {
  const c = G.cells[id];
  c.terrain = c.terrain === 'Scar' ? 'Plains' : 'Rainforest';
  log(G, p, `Remediated a cell to ${c.terrain}`);
}

export const remediateOption: OptionDef = {
  id: 'Remediate',
  label: 'Remediate',
  text: 'Scar → Plains, or Plains → Rainforest, on or next to your Presence or a Village.',
  target: 'cell',
  candidates: landCells,
  legal: (G, _p, a) => {
    const c = cellOf(G, a);
    if (!c || !remediateTarget(G, c.id)) return 'not remediable';
    if (!nearPresence(G, c.id)) return 'not near your Presence';
    return null;
  },
  resolve: (G, p, a) => remediate(G, p, a.cell!),
};

export const counselOption: OptionDef = {
  id: 'Counsel',
  label: 'Counsel',
  text: `Spend ${BALANCE.counselCost} Grievance for ${BALANCE.counselVotes} votes.`,
  target: 'none',
  legal: (G) => (G.grievance >= BALANCE.counselCost ? null : 'no Grievance'),
  resolve: (G, p) => {
    G.grievance -= BALANCE.counselCost;
    G.players[p].resources.votes += BALANCE.counselVotes;
    log(G, p, `Counsel: ${BALANCE.counselVotes} votes`);
  },
};

/** Free Presence spread at the start of the Chieftain's turn. */
export function spreadTargets(G: LandgrabState): CellId[] {
  if (G.presenceRemaining <= 0) return [];
  const out: CellId[] = [];
  for (const c of G.cells) {
    if (!isOpenLand(c) || c.presence || c.village || c.holding) continue;
    if (c.siteId !== undefined && G.sites[c.siteId].status !== 'Untouched' && G.sites[c.siteId].status !== 'Reclaimed') continue;
    if (c.neighbors.some((n) => hasClaim(G.cells[n]))) out.push(c.id);
  }
  return out;
}

/** Reclamation (3 Grievance, free once per turn): reverses one development next to the Chieftain's claim. */
export function reclaimTargets(G: LandgrabState): CellId[] {
  if (G.grievance < BALANCE.reclamationCost) return [];
  const out: CellId[] = [];
  for (const c of G.cells) {
    const near = c.neighbors.some((n) => hasClaim(G.cells[n]));
    if (!near) continue;
    if (c.building && c.building !== 'PublicWork' && c.building !== 'Museum') out.push(c.id);
    else if (c.siteId !== undefined && G.sites[c.siteId].status === 'Untouched' && !c.building) out.push(c.id);
  }
  return out;
}

export function doReclaim(G: LandgrabState, p: number, id: CellId): void {
  const c = G.cells[id];
  G.grievance -= BALANCE.reclamationCost;
  G.stats.reclamations += 1;
  const site = siteOf(G, id);
  if (c.building) {
    const what = c.building;
    if ((c.building === 'Hotel') && c.holding) G.holdingsRemaining += 1;
    delete c.holding;
    delete c.building;
    delete c.buildingOwner;
    delete c.sold;
    log(G, p, `Reclamation: a ${what} is removed`);
  } else if (site) {
    const sig = revealSite(G, site);
    site.status = 'Reclaimed';
    G.players[p].resources.votes += sig;
    log(G, p, `Reclamation: Site ${site.id} reclaimed (+${sig} votes)`);
  }
  if (!c.presence && !c.village && G.presenceRemaining > 0 && c.terrain !== 'Scar') {
    c.presence = true;
    G.presenceRemaining -= 1;
  }
}

// ---------------------------------------------------------------------------
// Industrialist — Foreman (spec 3.2)
// ---------------------------------------------------------------------------

export function zoneLegal(G: LandgrabState, p: number, id: CellId): string | null {
  const block = buildBlocker(G, p, id, 'IndustrialZone');
  if (block) return block;
  const me = factionOf(G, p);
  if (!ownsBuildingAdjacent(G, me, id, ['IndustrialZone']) && !adjacentToPublicWork(G, id)) {
    return 'must touch your Industrial Zone or a Public Work';
  }
  return null;
}

export const establishOption: OptionDef = {
  id: 'Establish',
  label: 'Establish',
  text: 'Pay 1 coin, 1 wood, 1 ore: build an Industrial Zone next to one of yours or a Public Work.',
  target: 'cell',
  candidates: landCells,
  legal: (G, p, a) => {
    if (!canAfford(G.players[p].resources, BALANCE.zoneCost)) return 'cannot afford';
    const c = cellOf(G, a);
    return c ? zoneLegal(G, p, c.id) : 'no cell';
  },
  placement: (_G, a) => a.cell,
  resolve: (G, p, a) => {
    pay(G.players[p].resources, BALANCE.zoneCost);
    placeBuilding(G, p, a.cell!, 'IndustrialZone');
    log(G, p, 'Established an Industrial Zone');
  },
};

export function extractable(G: LandgrabState, id: CellId, owner: PlayerType, needZone = true): boolean {
  const c = G.cells[id];
  if (c.fog || isDeveloped(c)) return false;
  if (c.terrain !== 'Rainforest' && c.terrain !== 'Hills' && c.terrain !== 'Mountain') return false;
  if (c.holding && c.holding !== owner) return false;
  if (c.designation === 'Protected' || c.designation === 'Listed') return false;
  if (c.siteId !== undefined) return false;
  if (needZone && !ownsBuildingAdjacent(G, owner, id, ['IndustrialZone'])) return false;
  return true;
}

/** Extraction converts the cell: Rainforest/Hills → Plains, Mountain → Scar. */
export function extract(G: LandgrabState, p: number, id: CellId, amount: number): void {
  const c = G.cells[id];
  const res: 'wood' | 'ore' = c.terrain === 'Rainforest' ? 'wood' : 'ore';
  const grieves = nearPresence(G, id) && factionOf(G, p) !== 'Chieftain';
  G.players[p].resources[res] += amount;
  const was = c.terrain;
  if (was === 'Mountain') scarCell(G, id, 'extraction');
  else c.terrain = 'Plains';
  if (grieves) addGrievance(G, BALANCE.grievance.extractionNearPresence, 'extraction near Presence');
  log(G, p, `Extracted ${amount} ${res} (${was} → ${G.cells[id].terrain})`);
}

export const extractOption: OptionDef = {
  id: 'Extract',
  label: 'Extract',
  text: `Take ${BALANCE.extractYield} from a Rainforest (wood), Hills or Mountain (ore) next to your Zone. Rainforest and Hills become Plains; Mountain becomes Scar.`,
  target: 'cell',
  candidates: landCells,
  legal: (G, p, a) => {
    const c = cellOf(G, a);
    if (!c) return 'no cell';
    return extractable(G, c.id, factionOf(G, p)) ? null : 'not extractable';
  },
  resolve: (G, p, a) => extract(G, p, a.cell!, BALANCE.extractYield),
};

const EXCAVATE_MIXES: Record<string, Partial<Resources>> = {
  wood3: { wood: 3 }, wood2ore1: { wood: 2, ore: 1 }, wood1ore2: { wood: 1, ore: 2 }, ore3: { ore: 3 },
};

export const excavateOption: OptionDef = {
  id: 'Excavate',
  label: 'Excavate',
  text: `Dig a Site cell next to your Zone: gain ${BALANCE.excavateYield} wood/ore in any mix. The cell becomes a Scar for good.`,
  target: 'cell',
  candidates: (G) => {
    const out: Partial<Action>[] = [];
    for (const c of G.cells) {
      if (c.siteId === undefined) continue;
      for (const choice of Object.keys(EXCAVATE_MIXES)) out.push({ cell: c.id, choice });
    }
    return out;
  },
  legal: (G, p, a) => {
    const c = cellOf(G, a);
    if (!c || c.siteId === undefined) return 'not a site';
    if (!a.choice || !EXCAVATE_MIXES[a.choice]) return 'choose a mix';
    const site = G.sites[c.siteId];
    if (site.status !== 'Untouched' && site.status !== 'Excavated') return `site is ${site.status}`;
    if (c.fog || c.terrain === 'Scar' || isDeveloped(c)) return 'cannot dig here';
    if (c.holding && c.holding !== factionOf(G, p)) return 'holding';
    if (!ownsBuildingAdjacent(G, factionOf(G, p), c.id, ['IndustrialZone'])) return 'not next to your Zone';
    return null;
  },
  resolve: (G, p, a) => {
    const c = G.cells[a.cell!];
    const site = G.sites[c.siteId!];
    const first = site.status === 'Untouched';
    revealSite(G, site);
    site.status = 'Excavated';
    gain(G.players[p].resources, EXCAVATE_MIXES[a.choice!]);
    scarCell(G, c.id, 'excavation');
    if (first) addGrievance(G, BALANCE.grievance.siteExcavated, 'Site excavated');
    log(G, p, `Excavated Site ${site.id}`);
  },
};

// ---------------------------------------------------------------------------
// Hotelier — Agent (spec 3.3)
// ---------------------------------------------------------------------------

export function holdingCost(G: LandgrabState, id: CellId): number {
  const c = G.cells[id];
  if (c.fog) return 1;
  return 1 + c.neighbors.filter((n) => isDeveloped(G.cells[n])).length;
}

export function holdingBlocker(G: LandgrabState, p: number, id: CellId): string | null {
  const c = G.cells[id];
  const me = factionOf(G, p);
  if (!isLand(c) || isScar(c)) return 'not open land';
  if (isDeveloped(c) || c.village || c.holding) return 'occupied';
  if (c.designation === 'Protected' || c.designation === 'Listed') return 'designated';
  if (c.designation === 'Zoned' && c.zonedFor !== me) return 'zoned for another faction';
  if (c.siteId !== undefined && G.sites[c.siteId].status !== 'Untouched') return 'site is taken';
  return null;
}

export const acquireOption: OptionDef = {
  id: 'Acquire',
  label: 'Acquire',
  text: 'Place a Holding (6 in supply). Cost: 1 coin + 1 per developed neighbour; a fogged cell costs 1.',
  target: 'cell',
  candidates: landCells,
  legal: (G, p, a) => {
    if (G.holdingsRemaining <= 0) return 'no Holdings left';
    const c = cellOf(G, a);
    if (!c) return 'no cell';
    const block = holdingBlocker(G, p, c.id);
    if (block) return block;
    if (G.players[p].resources.coins < holdingCost(G, c.id)) return 'cannot afford';
    return null;
  },
  resolve: (G, p, a) => {
    const cost = holdingCost(G, a.cell!);
    G.players[p].resources.coins -= cost;
    G.cells[a.cell!].holding = factionOf(G, p);
    G.holdingsRemaining -= 1;
    log(G, p, `Acquired a Holding for ${cost} coins`);
  },
};

export const developOption: OptionDef = {
  id: 'Develop',
  label: 'Develop',
  text: 'Pay 1 wood: build a Hotel on your Holding. On an untouched Site it becomes a Museum instead.',
  target: 'cell',
  candidates: (G, p) => G.cells.filter((c) => c.holding === factionOf(G, p) && !c.building).map((c) => ({ cell: c.id })),
  legal: (G, p, a) => {
    if (!canAfford(G.players[p].resources, BALANCE.hotelCost)) return 'cannot afford';
    const c = cellOf(G, a);
    if (!c) return 'no cell';
    const isSite = c.siteId !== undefined;
    if (isSite && G.sites[c.siteId!].status !== 'Untouched' && G.sites[c.siteId!].status !== 'Museum') return 'site is taken';
    return buildBlocker(G, p, c.id, isSite ? 'Museum' : 'Hotel', { allowOwnHolding: true, allowSite: true });
  },
  placement: (_G, a) => a.cell,
  resolve: (G, p, a) => {
    pay(G.players[p].resources, BALANCE.hotelCost);
    const c = G.cells[a.cell!];
    if (c.siteId !== undefined) {
      const site = G.sites[c.siteId];
      const first = site.status === 'Untouched';
      const sig = revealSite(G, site);
      site.status = 'Museum';
      placeBuilding(G, p, c.id, 'Museum');
      if (first) {
        const coins = sig * BALANCE.museumCoinsPerSignificance;
        G.players[p].resources.coins += coins;
        log(G, p, `Opened a Museum at Site ${site.id} (+${coins} coins)`);
      }
    } else {
      placeBuilding(G, p, c.id, 'Hotel');
      log(G, p, 'Developed a Hotel');
    }
  },
};

export const realiseOption: OptionDef = {
  id: 'Realise',
  label: 'Realise',
  text: 'Sell one of your Hotels for its current sale value in coins. Its Holding marker stays under it: six Holdings is all you get.',
  target: 'cell',
  candidates: (G, p) => G.cells.filter((c) => c.building === 'Hotel' && c.buildingOwner === factionOf(G, p) && !c.sold).map((c) => ({ cell: c.id })),
  legal: (G, p, a) => {
    const c = cellOf(G, a);
    if (!c || c.building !== 'Hotel' || c.buildingOwner !== factionOf(G, p)) return 'not your Hotel';
    if (c.sold) return 'already sold';
    return null;
  },
  resolve: (G, p, a) => {
    const c = G.cells[a.cell!];
    const value = hotelValue(G, c.id);
    G.players[p].resources.coins += value;
    c.sold = true;
    log(G, p, `Realised a Hotel for ${value} coins`);
  },
};

// ---------------------------------------------------------------------------
// Bureaucrat — Registrar (spec 3.4)
// ---------------------------------------------------------------------------

export function publicWorkLegal(G: LandgrabState, p: number, id: CellId): string | null {
  const block = buildBlocker(G, p, id, 'PublicWork');
  if (block) return block;
  const c = G.cells[id];
  if (!c.neighbors.some((n) => isDeveloped(G.cells[n]) || G.cells[n].village)) {
    return 'must touch a building or Village';
  }
  return null;
}

export const publicWorksOption: OptionDef = {
  id: 'PublicWorks',
  label: 'Public Works',
  text: 'Pay 2 votes: build an unowned Public Work next to any building or Village. Anyone may build next to it.',
  target: 'cell',
  candidates: landCells,
  legal: (G, p, a) => {
    if (!canAfford(G.players[p].resources, BALANCE.publicWorkCost)) return 'cannot afford';
    const c = cellOf(G, a);
    return c ? publicWorkLegal(G, p, c.id) : 'no cell';
  },
  placement: (_G, a) => a.cell,
  resolve: (G, p, a) => {
    pay(G.players[p].resources, BALANCE.publicWorkCost);
    placeBuilding(G, null, a.cell!, 'PublicWork');
    log(G, p, 'Built a Public Work');
  },
};

export const DESIGNATIONS = ['Protected', 'Listed', ...ALL_FACTIONS.map((f) => `Zoned:${f}`)];

export function designateBlocker(G: LandgrabState, id: CellId, choice: string): string | null {
  const c = G.cells[id];
  if (c.fog || !isLand(c)) return 'not revealed land';
  if (c.designation) return 'already designated';
  if (choice === 'Listed') {
    if (c.siteId === undefined) return 'only Sites can be Listed';
    if (G.sites[c.siteId].status !== 'Untouched') return 'site is taken';
    return null;
  }
  if (c.siteId !== undefined) return 'Sites can only be Listed';
  if (isDeveloped(c) || c.terrain === 'Scar') return 'developed';
  if (choice.startsWith('Zoned:')) {
    if (!BUILDABLE.has(c.terrain)) return 'not buildable';
    if (c.holding || c.village) return 'occupied';
    return null;
  }
  if (choice === 'Protected') return null;
  return 'unknown designation';
}

export function designate(G: LandgrabState, p: number, id: CellId, choice: string): void {
  const c = G.cells[id];
  const me = factionOf(G, p);
  if (choice === 'Listed') {
    const site = G.sites[c.siteId!];
    const sig = revealSite(G, site);
    site.status = 'Listed';
    for (const cid of site.cells) {
      G.cells[cid].designation = 'Listed';
      G.cells[cid].designatedBy = me;
    }
    G.players[p].resources.votes += sig;
    log(G, p, `Listed Site ${site.id} (+${sig} votes)`);
    return;
  }
  if (choice.startsWith('Zoned:')) {
    c.designation = 'Zoned';
    c.zonedFor = choice.slice(6) as PlayerType;
  } else {
    c.designation = 'Protected';
  }
  c.designatedBy = me;
  log(G, p, `Designated a cell ${choice.replace(':', ' for ')}`);
}

export const designateOption: OptionDef = {
  id: 'Designate',
  label: 'Designate',
  text: 'Pay 1 vote: Zone a cell for one faction (only they may build), Protect a cell (nobody builds or extracts), or List a Site.',
  target: 'cell',
  candidates: (G) => {
    const out: Partial<Action>[] = [];
    for (const c of G.cells) {
      if (c.fog || !isLand(c) || c.designation) continue;
      for (const choice of DESIGNATIONS) out.push({ cell: c.id, choice });
    }
    return out;
  },
  legal: (G, p, a) => {
    if (!canAfford(G.players[p].resources, BALANCE.designateCost)) return 'cannot afford';
    const c = cellOf(G, a);
    if (!c || !a.choice) return 'choose a cell and designation';
    return designateBlocker(G, c.id, a.choice);
  },
  resolve: (G, p, a) => {
    pay(G.players[p].resources, BALANCE.designateCost);
    designate(G, p, a.cell!, a.choice!);
  },
};

export const compulsoryPurchaseOption: OptionDef = {
  id: 'CompulsoryPurchase',
  label: 'Compulsory Purchase',
  text: `Pay a Holding's owner ${BALANCE.compulsoryPurchasePayment} coins to take a Holding next to a Public Work and build a Public Work on it.`,
  target: 'cell',
  candidates: (G) => G.cells.filter((c) => c.holding && !c.building).map((c) => ({ cell: c.id })),
  legal: (G, p, a) => {
    const c = cellOf(G, a);
    if (!c || !c.holding || c.building) return 'no bare Holding';
    if (c.holding === factionOf(G, p)) return 'your own Holding';
    if (!adjacentToPublicWork(G, c.id)) return 'not next to a Public Work';
    if (G.players[p].resources.coins < BALANCE.compulsoryPurchasePayment) return 'cannot afford';
    if (!BUILDABLE.has(c.terrain) || c.fog || fogAdjacent(G, c.id)) return 'cannot build here';
    return null;
  },
  placement: (_G, a) => a.cell,
  resolve: (G, p, a) => {
    const c = G.cells[a.cell!];
    const owner = indexOfFaction(G, c.holding!);
    delete c.holding;
    G.holdingsRemaining += 1;
    placeBuilding(G, null, c.id, 'PublicWork');
    log(G, p, 'Compulsory Purchase: a Holding becomes a Public Work');
    requestPayment(G, p, owner, { coins: BALANCE.compulsoryPurchasePayment }, 'Compulsory Purchase');
  },
};

export { chieftainIndex };
