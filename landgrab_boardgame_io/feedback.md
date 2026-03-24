# Rules Feedback — rules_v2.md

## Summary

The three-card market split (Builder → Resource Market, Liaison → Politics, Guide → Talent) distributes action load cleanly and gives each starting Personnel card a clear identity. Guide's dual Explore/Survey mechanic is a strong design: it stays useful as the map fills in rather than becoming dead weight late game. The notes below focus on remaining gaps and questions the current design raises.

---

## Bugs / Rules Gaps

### 1. Turn structure is never summarized as a sequence

The turn mechanic is described across multiple sections. A short "Taking Your Turn" section would help orient new players:

1. Remove all Action Tokens from your Tableau.
2. Place 2 Action Tokens on 2 different cards in your Tableau, resolving each effect when placed.
3. At end of turn, check the Resource Market for empty rows and add 1 token to the 4-Coin slot of any empty row.

### 2. Missing: who goes first / turn order

The Setup section doesn't describe how to determine who takes the first turn or how turn order is established.

### 3. Missing: end condition timing

When a player acquires their 3rd Seat, does the game end immediately or at the end of the round (giving other players a final turn)? This is not stated.

### 4. Promotion and Seat activate in sequence — order matters

The rules now say Promotion and Seat "activate immediately in that order," which is correct. Worth spelling out the consequence explicitly: Promotion fires first (clears Event cards, adds Dividends), then Seat fires (gain 1 Seat), then the turn ends. If a player is at 2 Seats, they win after the Seat activates, not before Promotion clears their Tableau.

### 5. Talent bid: can the initiating player respond to counter-bids?

The rules say "each *other* player gets exactly 1 chance" to pass or counter-bid. It's unclear whether the initiating player can respond if someone counter-bids above their opening offer. This should be stated explicitly.

### 6. Fixer and Advocate are listed but never described

The starting Talent track includes Fixer and Advocate, but neither has a card description anywhere in the rules. Broker and Forester are described. These two need entries.

### 7. Builder's Resource Market access: does Elder follow the same rule for Chieftain?

The rules state Elder also provides Resource Market access (as a substitute for Builder). Worth confirming explicitly that the Chieftain uses Elder identically to how other players use Builder for market access — no special restrictions or differences.

### 9. Survey mechanic is a placeholder — flag it clearly in the rules

The Guide card currently reads "Survey discovery effects are forthcoming." This is fine for a working draft, but the rules should note this is intentionally incomplete so playtesters know it's not a gap.

---

## Clarity / Wording Issues

### 10. Liaison now has two options, not three — update any remaining references

Liaison previously had three options (Generate Resources, Politics Market, Resource Market). The Resource Market moved to Builder. Double-check for any remaining references to Liaison accessing the Resource Market.

### 11. Charter description: Chieftain Village placement scope

~~The Charter card says Chieftain may "place a Village on any Fog, Field, Sand, Forest, or Mountain hex." Confirm whether this is intentionally broader than Elder's first action (which converts a Fog hex *and* places a Village on it). Charter seems to allow Village placement on already-revealed non-Fog hexes, which Elder does not. If that's intentional, it's a meaningful distinction worth stating explicitly.~~

**Resolved.** The distinction is intentional and thematic:
- **Elder** places a Village only on a Fog hex — the village was already there, hidden in the fog, and is now revealed to outsiders. Elder *reveals* a pre-existing settlement.
- **Charter** places a Village on any hex (Fog, Field, Sand, Forest, or Mountain), giving the Chieftain the strategic advantage of seeding reserves in already-revealed locations early in the game.

Rules updated to make this explicit.

### 12. Builder adjacency rule is slightly inconsistent with Winning Conditions

The Builder card says buildings must be "adjacent to an existing building owned by that player or adjacent to an Infrastructure hex." The Winning Conditions sections phrase this differently per player type. These should use identical language to avoid confusion.

### 13. Procurement resource-blocking by Reserves: wording inconsistency

The Liaison card says "resources cannot be generated from hexes occupied by a Reserve." The Winning Conditions sections for Industrialist and Bureaucrat say buildings "cannot generate coins from any hex occupied by a Reserve" — but Industrialists generate Wood/Ore and Bureaucrats generate Votes, not Coins. Use "resources" uniformly.

---

## Design Questions / Suggestions

### 14. Guide's Survey mechanic shifts value across game phases — this is a strength

Early game: Guide is primarily an Explore card (lots of Fog, lots of targets). Late game: Guide becomes a Survey card (Fog is gone, hexes are settled). This natural phase shift keeps Guide relevant throughout and avoids the late-game dead-card problem common in exploration games. Worth leaning into this in the flavor text.

### 15. Builder accessing the Resource Market is thematically tight but strategically interesting

Sending Builder to the market means not building that turn — a visible, readable tradeoff. Opponents can see when you're in an acquisition phase vs. a construction phase. This is good design for a transparent tableau game.

### 16. Liaison now has only two options — consider whether that's enough

With Resource Market moved to Builder, Liaison covers Generate Resources and Politics Market. These are both important but quite different in rhythm (Procurement is a recurring engine; Politics is opportunistic). Liaison feels more focused now, which is good. Watch in playtesting whether Liaison feels overspecialized or whether the two options remain meaningfully distinct turn-to-turn.

### 17. Consider a quick-reference structure for the three Personnel card roles

With three clear market assignments, a simple reference box would help at the table:

| Card    | Primary Action      | Market Access    |
|---------|---------------------|------------------|
| Builder | Build               | Resource Market  |
| Liaison | Procurement         | Politics Market  |
| Guide   | Explore / Survey    | Talent track     |

### 19. Consider two play modes: Standard (2 actions) and Tactical (1 action)

The current 2-action-per-turn structure works well for most groups. However, alternating single actions — each player placing 1 token, back and forth — creates tighter reactive play where each action is a public statement the opponent reads and responds to immediately. The tradeoff is significant cognitive overhead, especially in 3-4 player games where players are already tracking the hex map, 3 markets, and each opponent's Tableau and resources.

**Recommended approach:** offer both as named modes rather than beginner/advanced (which feels condescending):
- **Standard Mode:** each player places 2 Action Tokens per turn. Good for new players and larger groups.
- **Tactical Mode:** players alternate placing 1 Action Token at a time. Best suited to 2-player games where reading a single opponent's action is tense rather than overwhelming.

A small "Play Modes" section listing only what differs between the two keeps the rulebook clean without duplicating the full rules.

**Two rules that need specific clarification for Tactical Mode:**
- **Talent bidding:** a bid should pause the alternation until the auction resolves, then play continues with the next player's action.
- **Mandate purchase:** currently must be the "first action of a turn" — in Tactical Mode, clarify this means before a player's first action token of the round.

### 18. Survey discoveries could interact with existing resource systems

When Guide surveys a fully-revealed hex and finds, say, fertile soil or gems, consider whether that discovery modifies the hex's existing adjacency effects (bonus Coins, Wood, Ore) or adds a new independent resource type. The former integrates cleanly with existing rules; the latter could introduce complexity. Worth deciding the design direction before writing Survey effects.
