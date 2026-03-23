# Rules Feedback — rules_v2.md

## Summary

The tableau/action token system is a strong improvement over draw-and-play. It eliminates the randomness of card draws, makes every player's options visible, and removes the slow ramp-up of early turns. The core mechanic is clean. The notes below are mostly about gaps, ambiguities, and a few structural questions the new system raises.

---

## Bugs / Rules Gaps

### 1. The two-step action cost is never stated explicitly

Activating a Personnel card generates an Event card. Activating that Event card costs a second token. This means almost every meaningful action (Build, Procure, Explore) costs **both** of a player's tokens — the full turn. This is probably intentional, but it's never stated plainly. A new player reading the rules won't realize this until they try to take a second action.

**Suggestion:** Add a note in the Cards section or a worked example showing the full two-step flow. e.g. "Placing a token on Builder generates a Build card (1 action). Placing a token on the Build card to construct a building is the second action. Together, these use both of a player's tokens for the turn."

### 2. Event cards can accumulate across turns — this needs to be called out

Because Event cards stay in the Tableau until activated, a player could use both tokens to generate two Event cards (e.g. Builder → Build, Liaison → Procurement) without activating either. Those cards carry over to the next turn, where the player has 2 fresh tokens to activate them. This is a legitimate and interesting strategy, but it's currently invisible in the rules. Is this intentional? If so, name it explicitly as a feature. If not, add a rule that Event cards are removed from the Tableau if unactivated at the end of a turn.

### 3. Conference: what happens to the Action Token if the initiator loses the bid?

The initiator places a token on one of their Personnel cards to start a Conference bid. If another player wins the bid, the initiator's token is still on their card and unavailable for the rest of their turn. The rules don't state this consequence, but it's significant — losing a bid still costs you your full action slot. This should be stated explicitly.

### 4. Conference: can the initiator respond to counter-bids?

The bidding rules say "each *other* player gets exactly 1 chance" to pass or counter-bid. There's no mention of whether the initiating player gets to respond if someone counter-bids. In most auction games the initiator can respond. This should be clarified.

### 5. Promotion and Seat timing relative to turn end

The Mandate purchase "ends their turn," but also "immediately adds a Promotion card and a Seat card to that player's Tableau." Promotion and Seat both "activate immediately." The sequence is ambiguous: do they activate before the turn ends, or after? The answer matters because Dividends (added by Promotion) could theoretically be activated if the turn isn't fully over yet. Recommend stating a clear order: e.g. "The turn ends. Then Promotion and Seat activate."

### 6. Turn structure is buried and never summarized

There is no "Taking Your Turn" section. The turn mechanic is described in the Cards section but the full sequence — token refresh, actions, end-of-turn replenishment — is never presented as a numbered list. First-time players will have to piece it together from multiple sections.

**Suggestion:** Add a short "Turn Structure" section:
1. Remove all Action Tokens from your Tableau.
2. Place 2 Action Tokens on 2 different cards in your Tableau.
3. Resolve each card's effect when a token is placed on it.
4. At end of turn, check Resource Market for empty rows and replenish if needed.

### 7. Missing: turn order / who goes first

The rules don't describe who takes the first turn or how turn order is determined. This is missing from Setup.

### 8. Missing: end condition timing

When a player acquires their 3rd Seat, does the game end immediately or at the end of the round (giving other players a final turn)? This is not stated.

### 9. Fixer and Advocate are listed but never described

The starting Conference row includes Fixer and Advocate, but neither card has a description anywhere in the rules. Broker and Forester are described. Fixer and Advocate need entries.

### 10. "Action card" in Overview is a leftover term

Line 7 in the Overview says "acquiring a Personnel or Action card." "Action card" doesn't appear anywhere else in the rules — it appears to be a holdover from an earlier version. Should be "Personnel card" (or "Personnel or Event card" if acquiring both is possible).

---

## Clarity / Wording Issues

### 11. Hotelier description conflates two steps

In the Winning Conditions section: "A Resort produces Coins when an Action Token is placed on a Builder." This skips the Procurement step entirely. The actual flow is: token on Builder → Build card generated → token on Procurement → resources generated. The current phrasing implies Resorts produce directly from the Builder action, which is misleading.

### 12. Inconsistent framing of the Bureaucrat's Vote generation

In the Tokens section (Votes): "each Infrastructure produces 1 Vote per adjacent Industrial Zone, Resort, Village, Farm, and Housing hex."

In the Winning Conditions section: "generates one Vote for each Resort, Village, Industrial Zone, Farm, or Housing adjacent to Infrastructure."

These describe the same rule from opposite angles (Infrastructure-centric vs. building-centric). Pick one framing and use it consistently.

### 13. "Politics card available for use that same turn" is misleading

When a player buys a Politics card via Procurement, the rules say it "is available for use that same turn." But both tokens are already spent (one on Liaison, one on the Procurement event). In practice the card is only useful that same turn if something grants a bonus action (e.g. Reorganization). The phrasing implies more flexibility than actually exists in the base case. Consider: "it is added to your Tableau and is available for use on a future turn, or immediately if you have remaining actions."

### 14. Tableau visibility applies to Event cards too, but only Personnel cards are mentioned

"All other players can see every card in every player's Tableau at all times." This is stated only in the Personnel cards subsection, which could imply Event cards are hidden. If all Tableau cards are visible (including accumulated Event cards), state this once at the top of the Cards section rather than under Personnel cards specifically.

### 15. Duplicate "Conference Setup" heading

There are two consecutive headings: "## Conference Setup" and "## Conference Setup and Mechanics." The first is empty. Remove the first or merge them.

---

## Design Questions / Suggestions

### 16. Two actions per turn feels tight given the two-step cost

Because Personnel → Event costs 2 tokens, a player is effectively limited to one meaningful action per turn (or two if they bank events from a prior turn). This is more constrained than it might appear. It's worth playtesting whether 3 tokens per turn (allowing, say, two complete actions or one complete action plus one event generation) produces a better pace while keeping the "no drawing" advantage of the tableau.

### 17. Liaison is used every turn; Builder and Explorer are situational

Under the tableau system, Liaison (→ Procurement) is the engine for generating resources and buying from the Politics market. Most turns will involve Liaison. Builder and Explorer are used more situationally. This creates an asymmetry where Liaison is effectively the most valuable card in every player's starting Tableau. Consider whether any starting Personnel cards could be differentiated further to make the choice of which two to activate more interesting.

### 18. The Chieftain's token generation is coin-only but costs scale steeply

The Chieftain generates "1 Coin per Reserve not adjacent to any other player's building." Reserve costs scale (1 Coin for the first, 2 for the second, etc.). In a tableau system with 2 actions per turn, the Chieftain's ability to generate and spend coins feels tight. This may be intentional (the Chieftain is deliberately the most constrained player), but worth watching in playtesting.

### 19. Consider a "turn summary" card / reference sheet structure

With the tableau system, players have full information but also more to track (which cards are refreshed, which events are banked, timing of Promotion/Seat). A reference card section or a concise "quick reference" appendix to the rules would help at the table.
