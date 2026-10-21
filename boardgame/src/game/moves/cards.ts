/**
 * Options for the drafted Personnel and the Event cards (spec 4.4, 4.5).
 */
import { BALANCE } from '../balance';
import {
  addGrievance,
  buildBlocker,
  chieftainIndex,
  factionOf,
  indexOfFaction,
  isDeveloped,
  isLand,
  log,
  ownsPiece,
  checkMandateTrigger,
  placeBuilding,
  villageCount,
} from '../board';
import type { OptionDef } from '../cardTypes';
import { canAfford, gain, pay } from '../economy';
import { MANDATE, discardPolitics } from '../markets';
import { requestPayment } from '../reactions';
import type { Action, CellId, LandgrabState, Resources } from '../types';
import { designate, designateBlocker, doSurvey, extract, extractable, remediate, remediateTarget } from './map';
import { addCard, tableauFull } from './market';

const landCells = (G: LandgrabState): Partial<Action>[] =>
  G.cells.filter(isLand).map((c) => ({ cell: c.id }));
const otherPlayers = (G: LandgrabState, p: number): Partial<Action>[] =>
  G.players.map((_, i) => ({ player: i })).filter((x) => x.player !== p);
const none = () => null;

function cellOk(G: LandgrabState, a: Action) {
  return a.cell !== undefined && a.cell >= 0 && a.cell < G.cells.length ? G.cells[a.cell] : null;
}

function nextToMyPieces(G: LandgrabState, p: number, id: CellId): boolean {
  const me = factionOf(G, p);
  return G.cells[id].neighbors.some((n) => ownsPiece(G, me, n)) || ownsPiece(G, me, id);
}

function gainOption(id: string, label: string, text: string, amount: (G: LandgrabState, p: number) => Partial<Resources>): OptionDef {
  return {
    id,
    label,
    text,
    target: 'none',
    legal: none,
    resolve: (G, p) => {
      const amt = amount(G, p);
      gain(G.players[p].resources, amt);
      const parts = Object.entries(amt).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => `${v} ${k}`);
      log(G, p, `${label}: ${parts.join(', ') || 'nothing'}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Import / Export (Broker, and as Events)
// ---------------------------------------------------------------------------

export const importOption: OptionDef = {
  id: 'Import',
  label: 'Import',
  text: 'Pay 1 coin to the bank for 1 wood or 1 ore (not from the market).',
  target: 'choice',
  candidates: () => [{ choice: 'wood' }, { choice: 'ore' }],
  legal: (G, p, a) => {
    if (a.choice !== 'wood' && a.choice !== 'ore') return 'choose wood or ore';
    return G.players[p].resources.coins >= 1 ? null : 'cannot afford';
  },
  resolve: (G, p, a) => {
    const r = G.players[p].resources;
    r.coins -= 1;
    r[a.choice as 'wood' | 'ore'] += 1;
    log(G, p, `Imported 1 ${a.choice}`);
  },
};

const EXPORTS = ['wood', 'ore'].flatMap((res) => [1, 2, 3].map((n) => `${res}${n}`));

export const exportOption: OptionDef = {
  id: 'Export',
  label: 'Export',
  text: 'Sell up to 3 wood or ore to the bank for 1 coin each (they leave the game).',
  target: 'choice',
  candidates: () => EXPORTS.map((choice) => ({ choice })),
  legal: (G, p, a) => {
    const m = /^(wood|ore)([123])$/.exec(a.choice ?? '');
    if (!m) return 'choose an amount';
    return G.players[p].resources[m[1] as 'wood' | 'ore'] >= Number(m[2]) ? null : 'not enough';
  },
  resolve: (G, p, a) => {
    const m = /^(wood|ore)([123])$/.exec(a.choice!)!;
    const n = Number(m[2]);
    const r = G.players[p].resources;
    r[m[1] as 'wood' | 'ore'] -= n;
    r.coins += n;
    log(G, p, `Exported ${n} ${m[1]}`);
  },
};

// ---------------------------------------------------------------------------
// Housing (Contractor, Housing Scheme)
// ---------------------------------------------------------------------------

function housingLegal(G: LandgrabState, p: number, id: CellId): string | null {
  const block = buildBlocker(G, p, id, 'Housing');
  if (block) return block;
  const ok = G.cells[id].neighbors.some((n) => {
    const b = G.cells[n].building;
    return b === 'Hotel' || b === 'Housing' || b === 'PublicWork';
  });
  return ok ? null : 'must touch a Hotel, Housing or Public Work';
}

function housingOption(id: string, cost: Partial<Resources>, costText: string): OptionDef {
  return {
    id,
    label: 'Build Housing',
    text: `Pay ${costText}: build Housing next to a Hotel, Housing or Public Work.`,
    target: 'cell',
    candidates: landCells,
    legal: (G, p, a) => {
      if (!canAfford(G.players[p].resources, cost)) return 'cannot afford';
      const c = cellOk(G, a);
      return c ? housingLegal(G, p, c.id) : 'no cell';
    },
    placement: (_G, a) => a.cell,
    resolve: (G, p, a) => {
      pay(G.players[p].resources, cost);
      placeBuilding(G, p, a.cell!, 'Housing');
      log(G, p, 'Built Housing');
    },
  };
}

// ---------------------------------------------------------------------------
// Personnel options
// ---------------------------------------------------------------------------

export const adviseOption: OptionDef = {
  id: 'Advise',
  label: 'Advise',
  text: 'Add a Restructuring to your tableau.',
  target: 'none',
  legal: (G, p) => (tableauFull(G, p) ? 'tableau full' : null),
  resolve: (G, p) => {
    addCard(G, p, 'Restructuring');
    log(G, p, 'Consultant adds a Restructuring');
  },
};

export const foresterOption: OptionDef = {
  id: 'Remediate',
  label: 'Remediate',
  text: 'Scar → Plains, or Plains → Rainforest, on any revealed undeveloped cell.',
  target: 'cell',
  candidates: landCells,
  legal: (G, _p, a) => {
    const c = cellOk(G, a);
    return c && remediateTarget(G, c.id) ? null : 'not remediable';
  },
  resolve: (G, p, a) => remediate(G, p, a.cell!),
};

export const surveyorOption: OptionDef = {
  id: 'Survey',
  label: 'Survey',
  text: 'Survey, as the Guide does.',
  target: 'cell',
  candidates: (G) => G.cells.filter((c) => c.fog && c.neighbors.some((n) => !G.cells[n].fog)).map((c) => ({ cell: c.id })),
  legal: (G, _p, a) => {
    const c = cellOk(G, a);
    if (!c || !c.fog || !c.neighbors.some((n) => !G.cells[n].fog)) return 'not a survey target';
    return null;
  },
  resolve: (G, p, a) => {
    doSurvey(G, p, a.cell!);
  },
};

export const advocateOption = gainOption('Mobilise', 'Mobilise', 'Gain 1 vote per Village on the island (max 3).', (G) => ({
  votes: Math.min(3, villageCount(G)),
}));

export const agitatorOption: OptionDef = {
  id: 'Agitate',
  label: 'Agitate',
  text: 'Give the Chieftain 1 Grievance and gain 1 vote. (Open question: a route to a two-player lockout?)',
  target: 'none',
  legal: (G) => (chieftainIndex(G) >= 0 ? null : 'no Chieftain in this game'),
  resolve: (G, p) => {
    addGrievance(G, 1, `agitation by the ${factionOf(G, p)}`);
    if (factionOf(G, p) !== 'Chieftain') G.players[p].resources.votes += 1;
  },
};

export const fixerOption: OptionDef = {
  id: 'Fix',
  label: 'Fix',
  text: 'Pay 2 coins to the bank for 1 vote.',
  target: 'none',
  legal: (G, p) => (G.players[p].resources.coins >= 2 ? null : 'cannot afford'),
  resolve: (G, p) => {
    G.players[p].resources.coins -= 2;
    G.players[p].resources.votes += 1;
    log(G, p, 'Fixed a vote');
  },
};

export const prospectorOption: OptionDef = {
  id: 'Prospect',
  label: 'Prospect',
  text: 'Take 1 from a Rainforest, Hills or Mountain next to any of your pieces, converting it as Extraction does.',
  target: 'cell',
  candidates: landCells,
  legal: (G, p, a) => {
    const c = cellOk(G, a);
    if (!c) return 'no cell';
    if (!extractable(G, c.id, factionOf(G, p), false)) return 'not extractable';
    return nextToMyPieces(G, p, c.id) ? null : 'not next to your pieces';
  },
  resolve: (G, p, a) => extract(G, p, a.cell!, 1),
};

export const contractorOption = housingOption('Housing', { wood: 1, ore: 1 }, '1 wood + 1 ore');

// ---------------------------------------------------------------------------
// Event options
// ---------------------------------------------------------------------------

export const clearanceOption: OptionDef = {
  id: 'Clearance',
  label: 'Clearance',
  text: 'Clear a Rainforest next to your pieces to Plains and take the wood.',
  target: 'cell',
  candidates: landCells,
  legal: (G, p, a) => {
    const c = cellOk(G, a);
    if (!c || c.terrain !== 'Rainforest') return 'not Rainforest';
    if (!extractable(G, c.id, factionOf(G, p), false)) return 'cannot clear';
    return nextToMyPieces(G, p, c.id) ? null : 'not next to your pieces';
  },
  resolve: (G, p, a) => extract(G, p, a.cell!, G.options.clearanceYield),
};

export const replantingOption: OptionDef = {
  id: 'Replanting',
  label: 'Replanting',
  text: 'Turn a revealed undeveloped Plains into Rainforest.',
  target: 'cell',
  candidates: landCells,
  legal: (G, _p, a) => {
    const c = cellOk(G, a);
    return c && !c.fog && !isDeveloped(c) && c.terrain === 'Plains' ? null : 'not open Plains';
  },
  resolve: (G, p, a) => remediate(G, p, a.cell!),
};

export const remediationGrantOption: OptionDef = {
  id: 'RemediationGrant',
  label: 'Remediation Grant',
  text: 'Remediate one cell up to two steps (Scar → Plains → Rainforest) and gain 1 vote.',
  target: 'cell',
  candidates: landCells,
  legal: (G, _p, a) => {
    const c = cellOk(G, a);
    return c && remediateTarget(G, c.id) ? null : 'not remediable';
  },
  resolve: (G, p, a) => {
    remediate(G, p, a.cell!);
    if (remediateTarget(G, a.cell!)) remediate(G, p, a.cell!);
    G.players[p].resources.votes += 1;
  },
};

/** Cards Restructuring may never remove. */
export function permanentCard(cardType: string, cardsByType: Record<string, { faction?: unknown; base?: boolean }>): boolean {
  const def = cardsByType[cardType];
  return !def || !!def.faction || !!def.base;
}

export function restructuringOption(cardsByType: Record<string, { faction?: unknown; base?: boolean }>): OptionDef {
  return {
    id: 'Restructuring',
    label: 'Restructure',
    text: 'Remove one acquired card from your tableau (never faction Personnel, Guide or Liaison). This card is discarded too.',
    target: 'card',
    candidates: (G, p) => G.players[p].tableau.map((c) => ({ target: c.instanceId })),
    legal: (G, p, a) => {
      const t = G.players[p].tableau.find((c) => c.instanceId === a.target);
      if (!t) return 'no such card';
      if (a.card === a.target) return 'cannot remove itself';
      if (permanentCard(t.cardType, cardsByType)) return 'that card is permanent';
      return null;
    },
    resolve: (G, p, a) => {
      const pl = G.players[p];
      const t = pl.tableau.find((c) => c.instanceId === a.target)!;
      pl.tableau = pl.tableau.filter((c) => c.instanceId !== a.target);
      log(G, p, `Restructuring removed ${t.cardType}`);
    },
  };
}

export const eminentDomainOption: OptionDef = {
  id: 'EminentDomain',
  label: 'Eminent Domain',
  text: `Take another player's bare Holding off the board, paying them ${BALANCE.compulsoryPurchasePayment} coins; the cell is Zoned for you.`,
  target: 'cell',
  candidates: (G) => G.cells.filter((c) => c.holding && !c.building).map((c) => ({ cell: c.id })),
  legal: (G, p, a) => {
    const c = cellOk(G, a);
    if (!c || !c.holding || c.building) return 'no bare Holding';
    if (c.holding === factionOf(G, p)) return 'your own Holding';
    if (G.players[p].resources.coins < BALANCE.compulsoryPurchasePayment) return 'cannot afford';
    return null;
  },
  resolve: (G, p, a) => {
    const c = G.cells[a.cell!];
    const owner = indexOfFaction(G, c.holding!);
    delete c.holding;
    G.holdingsRemaining += 1;
    if (!c.designation && c.siteId === undefined) {
      c.designation = 'Zoned';
      c.zonedFor = factionOf(G, p);
      c.designatedBy = factionOf(G, p);
    }
    log(G, p, 'Eminent Domain takes a Holding');
    requestPayment(G, p, owner, { coins: BALANCE.compulsoryPurchasePayment }, 'Eminent Domain');
  },
};

/** Open question 1: the only card that notices a broken promise. Behind a flag. */
export const pressCoverageOption: OptionDef = {
  id: 'PressCoverage',
  label: 'Press Coverage',
  text: 'Choose a player who owes you Favours: they lose 1 vote per Favour they owe you.',
  target: 'player',
  candidates: otherPlayers,
  legal: (G, p, a) => {
    if (!G.options.pressCoverage) return 'Press Coverage is disabled';
    if (a.player === undefined || a.player === p || !G.players[a.player]) return 'choose another player';
    const owed = G.favors.filter((f) => f.from === factionOf(G, a.player!) && f.to === factionOf(G, p)).length;
    return owed ? null : 'they owe you nothing';
  },
  resolve: (G, p, a) => {
    const owed = G.favors.filter((f) => f.from === factionOf(G, a.player!) && f.to === factionOf(G, p)).length;
    const r = G.players[a.player!].resources;
    r.votes = Math.max(0, r.votes - owed);
    log(G, p, `Press Coverage: the ${factionOf(G, a.player!)} loses ${owed} votes`);
  },
};

export const bribeOption: OptionDef = {
  id: 'Bribe',
  label: 'Bribe',
  text: 'Pay 1 coin: gain 1 vote and discard a card (not a Mandate) from the Politics Track.',
  target: 'slot',
  candidates: () => [0, 1, 2, 3].map((slot) => ({ slot })),
  legal: (G, p, a) => {
    if (G.players[p].resources.coins < 1) return 'cannot afford';
    if (a.slot === undefined || !G.politicsRow[a.slot] || G.politicsRow[a.slot] === MANDATE) return 'pick a non-Mandate card';
    return null;
  },
  resolve: (G, p, a) => {
    G.players[p].resources.coins -= 1;
    G.players[p].resources.votes += 1;
    const card = G.politicsRow[a.slot!];
    discardPolitics(G, a.slot!);
    log(G, p, `Bribe discards ${card}`);
  },
};

export const levyOption: OptionDef = {
  id: 'Levy',
  label: 'Levy',
  text: 'Choose a player: they pay up to 2 coins to the bank.',
  target: 'player',
  candidates: otherPlayers,
  legal: (G, p, a) => (a.player !== undefined && a.player !== p && G.players[a.player] ? null : 'choose another player'),
  resolve: (G, p, a) => {
    const r = G.players[a.player!].resources;
    const n = Math.min(2, r.coins);
    r.coins -= n;
    log(G, p, `Levy: the ${factionOf(G, a.player!)} pays ${n} coins`);
  },
};

export const dividendsOption = gainOption('Dividends', 'Dividends', 'Gain 1 coin per building you own (max 5).', (G, p) => ({
  coins: Math.min(5, G.cells.filter((c) => c.buildingOwner === factionOf(G, p)).length),
}));

export const landClaimsOption: OptionDef = {
  id: 'LandClaims',
  label: 'Land Claims',
  text: 'Until your next turn, nobody else may build next to your pieces.',
  target: 'none',
  legal: none,
  resolve: (G, p) => {
    G.landClaims = p;
    log(G, p, 'Land Claims filed');
  },
};

export const localElectionsOption = gainOption('LocalElections', 'Local Elections', 'Gain 1 vote per Village on the island (max 3).', (G) => ({
  votes: Math.min(3, villageCount(G)),
}));

export const taxationOption = gainOption('Taxation', 'Taxation', "Gain 1 coin per other faction's building next to your pieces (max 4).", (G, p) => {
  const me = factionOf(G, p);
  let n = 0;
  for (const c of G.cells) {
    if (!c.building || c.buildingOwner === me || c.building === 'PublicWork') continue;
    if (c.neighbors.some((nb) => ownsPiece(G, me, nb))) n++;
  }
  return { coins: Math.min(4, n) };
});

export const protestsOption: OptionDef = {
  id: 'Protests',
  label: 'Protests',
  text: 'Choose a player: they lose 1 vote per Village on the island (max 3).',
  target: 'player',
  candidates: otherPlayers,
  legal: (G, p, a) => (a.player !== undefined && a.player !== p && G.players[a.player] ? null : 'choose another player'),
  resolve: (G, p, a) => {
    const r = G.players[a.player!].resources;
    const n = Math.min(r.votes, Math.min(3, villageCount(G)));
    r.votes -= n;
    log(G, p, `Protests: the ${factionOf(G, a.player!)} loses ${n} votes`);
  },
};

export const housingSchemeOption = housingOption('HousingScheme', { coins: 1 }, '1 coin');

export const surveyGrantOption: OptionDef = {
  id: 'SurveyGrant',
  label: 'Survey Grant',
  text: 'Survey a cell, then reveal every Fog cell touching what it revealed.',
  target: 'cell',
  candidates: surveyorOption.candidates,
  legal: surveyorOption.legal,
  resolve: (G, p, a) => {
    const before = new Set(G.cells.filter((c) => !c.fog).map((c) => c.id));
    doSurvey(G, p, a.cell!);
    const ring = new Set<CellId>();
    for (const c of G.cells) {
      if (c.fog || before.has(c.id)) continue;
      for (const n of c.neighbors) if (G.cells[n].fog) ring.add(n);
    }
    let extra = 0;
    for (const id of ring) {
      if (!G.cells[id].fog) continue;
      G.cells[id].fog = false;
      G.fogRevealed += 1;
      extra++;
    }
    checkMandateTrigger(G);
    log(G, p, `Survey Grant revealed ${extra} more cells`);
  },
};

export const zoningPermitOption: OptionDef = {
  id: 'ZoningPermit',
  label: 'Zoning Permit',
  text: 'Zone a revealed open cell for yourself: only you may build there.',
  target: 'cell',
  candidates: landCells,
  legal: (G, p, a) => {
    const c = cellOk(G, a);
    return c ? designateBlocker(G, c.id, `Zoned:${factionOf(G, p)}`) : 'no cell';
  },
  resolve: (G, p, a) => designate(G, p, a.cell!, `Zoned:${factionOf(G, p)}`),
};

export const conservationOption: OptionDef = {
  id: 'Conservation',
  label: 'Conservation',
  text: 'Protect a revealed Rainforest or Mountain: nobody may build on or extract it.',
  target: 'cell',
  candidates: landCells,
  legal: (G, _p, a) => {
    const c = cellOk(G, a);
    if (!c || (c.terrain !== 'Rainforest' && c.terrain !== 'Mountain')) return 'not Rainforest or Mountain';
    return designateBlocker(G, c.id, 'Protected');
  },
  resolve: (G, p, a) => designate(G, p, a.cell!, 'Protected'),
};

export const lobbyingOption = gainOption('Lobbying', 'Lobbying', 'Gain 2 votes.', () => ({ votes: 2 }));
export const windfallOption = gainOption('Windfall', 'Windfall', 'Gain 2 coins.', () => ({ coins: 2 }));

const STIMULUS: Record<string, Partial<Resources>> = {};
for (const a of ['coins', 'wood', 'ore', 'votes'] as const) {
  STIMULUS[`${a}4`] = { [a]: BALANCE.stimulusAmount };
  for (const b of ['coins', 'wood', 'ore', 'votes'] as const) {
    if (a < b) STIMULUS[`${a}2${b}2`] = { [a]: 2, [b]: 2 };
  }
}

export const stimulusOption: OptionDef = {
  id: 'Stimulus',
  label: 'Stimulus',
  text: 'Gain 4 resources: 4 of one kind or 2 + 2.',
  target: 'choice',
  candidates: () => Object.keys(STIMULUS).map((choice) => ({ choice })),
  legal: (_G, _p, a) => (a.choice && STIMULUS[a.choice] ? null : 'choose a mix'),
  resolve: (G, p, a) => {
    gain(G.players[p].resources, STIMULUS[a.choice!]);
    log(G, p, `Stimulus: ${a.choice}`);
  },
};
