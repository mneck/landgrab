/**
 * Card registry (spec 4.5). Effects are data: each card lists options, and
 * each option carries its own legality and resolution. There is no central
 * switch statement.
 *
 * cards_v3.md was not available when this was built, so this list is a
 * reconstruction from the cards IMPLEMENTATION_SPEC.md names (Restructuring,
 * Consultant, Forester, Replanting, Remediation Grant, Clearance, Agitator,
 * Eminent Domain, Press Coverage, Stimulus) plus v2 cards adapted to v3.
 * Copies: 14 Personnel + 35 Politics = 49 drafted cards, plus Stimulus.
 */
import { BALANCE } from './balance';
import type { CardDef } from './cardTypes';
import * as C from './moves/cards';
import * as M from './moves/map';
import * as K from './moves/market';

export const CARDS: Record<string, CardDef> = {};

function def(card: CardDef): void {
  CARDS[card.id] = card;
}

// --- Faction Personnel (spec 3) -------------------------------------------
def({
  id: 'Elder', name: 'Elder', category: 'Personnel', faction: 'Chieftain', icon: '🧓',
  text: 'Settle a Village, Remediate land, or take Counsel (1 Grievance → 2 votes).',
  flavor: 'We were here first.',
  options: [M.settleOption, M.remediateOption, M.counselOption],
});
def({
  id: 'Foreman', name: 'Foreman', category: 'Personnel', faction: 'Industrialist', icon: '👷',
  text: 'Establish an Industrial Zone, Extract from a neighbouring cell, or Excavate a Site.',
  flavor: 'You see a forest? I see furniture.',
  options: [M.establishOption, M.extractOption, M.excavateOption],
});
def({
  id: 'Agent', name: 'Agent', category: 'Personnel', faction: 'Hotelier', icon: '🕴️',
  text: 'Acquire a Holding, Develop a Hotel on one, or Realise (sell) a Hotel.',
  flavor: 'From paradise to parking lots.',
  options: [M.acquireOption, M.developOption, M.realiseOption],
});
def({
  id: 'Registrar', name: 'Registrar', category: 'Personnel', faction: 'Bureaucrat', icon: '🗂️',
  text: 'Build Public Works, Designate a cell, or make a Compulsory Purchase.',
  flavor: "You'll need a permit for that.",
  options: [M.publicWorksOption, M.designateOption, M.compulsoryPurchaseOption],
});

// --- Base Personnel (everyone) --------------------------------------------
def({
  id: 'Guide', name: 'Guide', category: 'Personnel', base: true, icon: '🧭',
  text: 'Survey (reveal for all), Scout (look privately), or Hire from the Personnel Row.',
  options: [M.surveyOption, M.scoutOption, K.hireOption],
});
def({
  id: 'Liaison', name: 'Liaison', category: 'Personnel', base: true, icon: '🤝',
  text: 'Take a Policy from the Politics Track, trade at the Market, or Subsist.',
  options: [K.policyOption, K.marketOption, K.subsistOption],
});

// --- Personnel Row deck ----------------------------------------------------
def({ id: 'Consultant', name: 'Consultant', category: 'Personnel', deck: 'personnel', copies: 2, icon: '🏌️',
  text: 'Add a Restructuring to your tableau.', options: [C.adviseOption] });
def({ id: 'Forester', name: 'Forester', category: 'Personnel', deck: 'personnel', copies: 2, icon: '🌲',
  text: 'Remediate any revealed open cell one step.', options: [C.foresterOption] });
def({ id: 'Broker', name: 'Broker', category: 'Personnel', deck: 'personnel', copies: 2, icon: '📈',
  text: 'Import (1 coin → 1 wood/ore) or Export (up to 3 wood/ore → 1 coin each).', options: [C.importOption, C.exportOption] });
def({ id: 'Surveyor', name: 'Surveyor', category: 'Personnel', deck: 'personnel', copies: 2, icon: '🔭',
  text: 'Survey, as the Guide does.', options: [C.surveyorOption] });
def({ id: 'Contractor', name: 'Contractor', category: 'Personnel', deck: 'personnel', copies: 2, icon: '🏗️',
  text: 'Pay 1 wood + 1 ore: build Housing next to a Hotel, Housing or Public Work.', options: [C.contractorOption] });
def({ id: 'Advocate', name: 'Advocate', category: 'Personnel', deck: 'personnel', copies: 1, icon: '⚖️',
  text: 'Gain 1 vote per Village on the island (max 3).', options: [C.advocateOption] });
def({ id: 'Agitator', name: 'Agitator', category: 'Personnel', deck: 'personnel', copies: 1, icon: '📣',
  text: 'Give the Chieftain 1 Grievance; gain 1 vote.', options: [C.agitatorOption] });
def({ id: 'Fixer', name: 'Fixer', category: 'Personnel', deck: 'personnel', copies: 1, icon: '🤫',
  text: 'Pay 2 coins for 1 vote.', options: [C.fixerOption] });
def({ id: 'Prospector', name: 'Prospector', category: 'Personnel', deck: 'personnel', copies: 1, icon: '⛏️',
  text: 'Take 1 wood/ore from land next to your pieces, converting it.', options: [C.prospectorOption] });

// --- Politics Track deck (Events, single use) ------------------------------
const ev = (id: string, name: string, copies: number, icon: string, text: string, options: CardDef['options']) =>
  def({ id, name, category: 'Event', deck: 'politics', copies, icon, text, options });

ev('Clearance', 'Clearance', 2, '🪓', 'Clear a Rainforest next to your pieces to Plains and take the wood (1 by default; open question: 1 or 2).', [C.clearanceOption]);
ev('Replanting', 'Replanting', 2, '🌱', 'Plains → Rainforest.', [C.replantingOption]);
ev('RemediationGrant', 'Remediation Grant', 2, '🩹', 'Remediate a cell up to two steps; gain 1 vote.', [C.remediationGrantOption]);
ev('Restructuring', 'Restructuring', 2, '✂️', 'Remove an acquired card from your tableau; discard this too.', [C.restructuringOption(CARDS)]);
ev('EminentDomain', 'Eminent Domain', 1, '🏛️', "Take another player's bare Holding, paying them 2 coins; the cell is Zoned for you.", [C.eminentDomainOption]);
ev('PressCoverage', 'Press Coverage', 1, '📰', 'A player loses 1 vote per Favour they owe you. (Behind a flag; open question.)', [C.pressCoverageOption]);
def({ id: 'Endorsement', name: 'Endorsement', category: 'Event', deck: 'politics', copies: 3, icon: '✍️', passive: true,
  text: `Passive. When you buy a Mandate, each Endorsement lets you cover up to ${BALANCE.endorsementCover} of its cost with other resources. Stacks.`, options: [] });
ev('Bribe', 'Bribe', 1, '💵', 'Pay 1 coin: gain 1 vote and discard a non-Mandate card from the Politics Track.', [C.bribeOption]);
ev('Levy', 'Levy', 1, '🧾', 'A player pays up to 2 coins to the bank.', [C.levyOption]);
ev('Dividends', 'Dividends', 2, '💹', 'Gain 1 coin per building you own (max 5).', [C.dividendsOption]);
ev('Import', 'Import', 2, '🚢', 'Pay 1 coin for 1 wood or ore from the bank.', [C.importOption]);
ev('Export', 'Export', 2, '📦', 'Sell up to 3 wood/ore to the bank for 1 coin each.', [C.exportOption]);
ev('LandClaims', 'Land Claims', 1, '🚧', 'Until your next turn nobody else may build next to your pieces.', [C.landClaimsOption]);
ev('LocalElections', 'Local Elections', 1, '🗳️', 'Gain 1 vote per Village (max 3).', [C.localElectionsOption]);
ev('Taxation', 'Taxation', 1, '🏦', "Gain 1 coin per other faction's building next to your pieces (max 4).", [C.taxationOption]);
ev('Protests', 'Protests', 1, '✊', 'A player loses 1 vote per Village (max 3).', [C.protestsOption]);
ev('HousingScheme', 'Housing Scheme', 2, '🏘️', 'Pay 1 coin: build Housing next to a Hotel, Housing or Public Work.', [C.housingSchemeOption]);
ev('SurveyGrant', 'Survey Grant', 2, '🗺️', 'Survey, then reveal every Fog cell touching what it revealed.', [C.surveyGrantOption]);
ev('ZoningPermit', 'Zoning Permit', 2, '📋', 'Zone a revealed open cell for yourself.', [C.zoningPermitOption]);
ev('Conservation', 'Conservation', 1, '🦜', 'Protect a revealed Rainforest or Mountain.', [C.conservationOption]);
ev('Lobbying', 'Lobbying', 2, '🎩', 'Gain 2 votes.', [C.lobbyingOption]);
ev('Windfall', 'Windfall', 1, '🪙', 'Gain 2 coins.', [C.windfallOption]);

// --- Granted only ------------------------------------------------------------
def({ id: 'Stimulus', name: 'Stimulus', category: 'Event', icon: '💸',
  text: 'Gained with each Mandate. Gain 4 resources: 4 of one kind or 2 + 2.', options: [C.stimulusOption] });

export const FACTION_PERSONNEL: Record<string, string> = {
  Hotelier: 'Agent',
  Industrialist: 'Foreman',
  Bureaucrat: 'Registrar',
  Chieftain: 'Elder',
};

export function deckList(deck: 'personnel' | 'politics', opts?: { pressCoverage?: boolean }): string[] {
  const out: string[] = [];
  for (const card of Object.values(CARDS)) {
    if (card.deck !== deck) continue;
    if (card.id === 'PressCoverage' && !opts?.pressCoverage) continue;
    for (let i = 0; i < (card.copies ?? 1); i++) out.push(card.id);
  }
  return out;
}

export function cardName(cardType: string): string {
  if (cardType === 'Mandate') return 'Mandate';
  return CARDS[cardType]?.name ?? cardType;
}
