import type { Action, CellId, LandgrabState, PlayerType } from './types';

export type TargetKind = 'none' | 'cell' | 'player' | 'slot' | 'choice' | 'trade' | 'card' | 'move';

export interface OptionDef {
  id: string;
  label: string;
  text: string;
  target: TargetKind;
  /** Parameter sets to try; filtered through `legal`. Defaults by target kind. */
  candidates?: (G: LandgrabState, p: number) => Partial<Action>[];
  /** Why this fully specified action is illegal, or null when legal. */
  legal: (G: LandgrabState, p: number, a: Action) => string | null;
  resolve: (G: LandgrabState, p: number, a: Action) => void;
  /** Declared placement on this cell: the Chieftain may interrupt (spec 3.1). */
  placement?: (G: LandgrabState, a: Action) => CellId | undefined;
  /** Acquires a Personnel or Politics card: the Bureaucrat may object (spec 3.4). */
  acquisition?: boolean;
  /** Must be the first action of the turn and ends it (Mandate). */
  firstActionOnly?: (G: LandgrabState, a: Action) => boolean;
}

export interface CardDef {
  id: string;
  name: string;
  category: 'Personnel' | 'Event';
  /** Faction Personnel: permanent, never removed by Restructuring. */
  faction?: PlayerType;
  /** Base cards every player starts with (Guide, Liaison): never removed. */
  base?: boolean;
  deck?: 'personnel' | 'politics';
  copies?: number;
  icon: string;
  text: string;
  flavor?: string;
  /** Passive cards are never activated (Endorsement). */
  passive?: boolean;
  options: OptionDef[];
}
