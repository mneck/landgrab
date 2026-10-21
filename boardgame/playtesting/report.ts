/**
 * Plain-text and Markdown renderings of batch summaries.
 */
import type { BatchSummary } from './batch';
import { wilson } from './batch';

const pct = (x: number) => `${Math.round(100 * x)}%`;

export function factionRows(s: BatchSummary): { faction: string; games: number; winRate: number; lo: number; hi: number; seatSpread: number; seatRates: number[]; meanSeats: number; meanCurrency: number }[] {
  return Object.entries(s.factions).map(([faction, f]) => {
    const [lo, hi] = wilson(f!.wins, f!.games);
    const seatRates = f!.gamesBySeat.map((g, i) => (g ? (f!.winsBySeat[i] ?? 0) / g : NaN)).filter((x) => !Number.isNaN(x));
    const seatSpread = seatRates.length > 1 ? Math.max(...seatRates) - Math.min(...seatRates) : 0;
    return { faction, games: f!.games, winRate: f!.wins / Math.max(1, f!.games), lo, hi, seatSpread, seatRates, meanSeats: f!.meanSeats, meanCurrency: f!.meanCurrency };
  });
}

export function formatSummary(s: BatchSummary): string {
  const lines = [`=== ${s.label} ===`];
  lines.push(`games ${s.games}  finished ${s.finished}  errors ${s.errors}  aborted ${s.aborted}  invalid decisions ${s.invalidDecisions}  (${s.elapsedSeconds.toFixed(0)}s)`);
  if (s.errorMessages.length) lines.push(`errors: ${s.errorMessages.join(' | ')}`);
  lines.push(`rounds median ${s.rounds.median} (p25 ${s.rounds.p25}, p75 ${s.rounds.p75}, range ${s.rounds.min}-${s.rounds.max})`);
  lines.push(`end reasons ${JSON.stringify(s.endReasons)}`);
  lines.push(`last season fired ${s.lastSeason.fired}/${s.finished}, median round ${s.lastSeason.medianRound ?? '-'}`);
  lines.push(`mandates/game ${s.mandatesPerGame.toFixed(2)}  first mandate median round ${s.firstMandateRound ?? '-'}  fog revealed ${pct(s.fogRevealedPct)}`);
  lines.push(`survey: ${s.survey.count} (${s.survey.perGame.toFixed(1)}/game) reveals mean ${s.survey.meanRevealed.toFixed(2)} range ${s.survey.min}-${s.survey.max}`);
  lines.push(`per game: reclamations ${s.reclamationsPerGame.toFixed(2)} interrupts ${s.interruptsPerGame.toFixed(2)} objections ${s.objectionsPerGame.toFixed(2)} erosion scars ${s.erosionScarsPerGame.toFixed(2)}  fog-adjacent builds ${s.fogAdjacentBuilds}`);
  lines.push(`scars by round: ${s.scarsByRound.slice(0, 25).map((x) => x.toFixed(1)).join(' ')}`);
  lines.push('faction        win%  95% CI     by seat               seat spread  seats  currency');
  for (const r of factionRows(s)) {
    lines.push(
      `${r.faction.padEnd(14)} ${pct(r.winRate).padStart(4)}  ${pct(r.lo).padStart(3)}-${pct(r.hi).padEnd(4)}  ${r.seatRates.map(pct).join(' ').padEnd(20)}  ${pct(r.seatSpread).padStart(4)}        ${r.meanSeats.toFixed(2)}   ${r.meanCurrency.toFixed(1)}`
    );
  }
  return lines.join('\n');
}
