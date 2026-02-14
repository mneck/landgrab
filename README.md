## Overview

Landgrab is a strategy game where players take turns playing **Personnel** cards and **Action** cards to build farms, settlements, and other structures on an island map comprised of Field, Mountain, Water, Forest, Fog, and Sand tiles. Each player has different winning conditions depending on one of three **Player Types:** **Tourism, Industry,** or **Government.**

For the initial version of the game, players are playing on hex tiles.In the MVP version (Landgrab 2.0) of the game, 2 players, playing locally, can only choose between Tourism and Industry Player Types and can only build Farms and Settlements.

In Landgrab 3.0, the game is expanded to introduce the **Government** player type responsible for managing policy cards in the game, allowing for 2 to 3 players to play locally.

**2 player types for 2 players**

**Tourism (P1:T)**

> From paradise to parking lots!
> 

P1 builds Farms and Resort Towns (RTs) on Field tiles to gain (per turn) 1 revenue per adjacent Mountain or Water tile; if an RT is built on a Sand tile and also has 1+ adjacent Water tiles, the RT will get an additional 1 revenue; an RT will lose 1 revenue per adjacent Industrial Zone. A player cannot build more RTs than farms. P1 wins after obtaining a certain amount of revenue.

**Industry (P2:I)**

> You see a forest? I see Ikea furniture.
> 

P2 builds Industrial Zones (IZs) on Field and Sand tiles to get +1 Ore (O) per adjacent Mountain or +1 Wood (W) per adjacent Forest. P2 cannot build more IZs than Farms. P2 wins after exporting a certain amount of W and O.

# Example Map (at start of game)

# Assets

## Tiles

# Tokens

Players have 3 types of tokens, which are separate from the Personnel and Action cards that comprise each player’s deck:

### 🪵 **Wood**

### **⚙️** Ore

### 💰 Revenue

# Cards

**Turns**

Players can draw and play a certain number of cards each turn according to the number of settlements a player has built. If a player has built 0-1 settlements, that player draws 1 card per turn from her draw pile and can play 1 card. Otherwise, a player draws and plays a number of cards equal to the number of Districts owned by that player. If P1 has 3 Resort Towns, for example, that player would start her turn by drawing 3 cards and then playing 3 cards.

## Personnel cards

Personnel cards can be played multiple times; after a personnel card is played, it goes to a player’s discard pile. After a player has played all of the cards in her draw pile, the cards in the discard pile are shuffled and then placed in the draw pile.

**Each player starts with 3 cards in her hand:**

1. Buyer: Put a Purchase Order card in your hand; discard the Buyer.
2. Builder: Put a Build card in your hand; discard the Builder.
3. Surveyor: Put an Expedition card in your hand; discard the Surveyor.

Any personnel card can also be discarded to collect a card from the Conference cards.

## Event cards

Event cards are single-use; after each one is played, it is removed from the player’s deck (”trashed”) and cannot be played again.

**A player can use their starting 3 cards (Builder, Buyer, Surveyor) to add the following Event cards to their hand:**

1. **Build [Builder]**
    
    Pay 1 🪵W and 1 **⚙️**O to construct Farmland on a Field tile or a Settlement (a Industrial Zone or Resort Town) on a Field or Sand tile. Player can only build on a tile that is adjacent to a tile already owned by that player. 
    
2. **Purchase Order [Buyer]**
    
    Purchase 1 or 2 resources from the Market.
    
3. **Expedition [Surveyor]**
    
    Select any tile. Any fog tile adjacent to that tile will turn into another tile type.
    

## Conference

The Conference is used to add Personnel and Action cards to a player’s deck.

Instead of using the standard ability of a Personnel card, a player can send that Personnel card to the Conference Room to pay for 1 of 4 cards that appear in a row, (representing the Personnel member engaging in “hiring” or “negotiating” activity on behalf of the player). Each card is priced 💰1, 💰2, 💰3, or 💰4. After a player has purchased a card, the purchased card and the relevant Personnel card are sent to the discard pile. The other cards are moved to fill the gap created by removing the purchased card, and a new card is revealed, which is now worth 💰4. If no player purchases a card on their turn, the 💰1 card is removed from the row of 4 cards, the other cards shift accordingly, and a new card is revealed, priced at 💰4.

The following cards are all available for purchase:

**Action cards**

1. Build
2. Purchase Order
3. Expedition
4. Zoning: reserves a tile for a player to use on the player’s next turn.
5. Reorganization: trash 1 Personnel card from the player’s hand, draw 1 card, shuffle the player’s discard pile into their draw pile, put an AGM on top of the player’s draw pile, and take 1 more action.
6. Urbanization: allows a player to spend 2 🪵W and 2 **⚙️**O to place an additional settlement on a tile where a player already has a settlement, doubling the benefits provided by that settlement.
7. Aquaculture: place a farm on a Water tile.
8. AGM (Annual General Meeting): achieve a Milestone.

**Personnel cards**

1. Builder
2. Buyer
3. Surveyor
4. Forester: can be used to create 1 of 2 Action cards:
    1. Slash & Burn: convert a Forest tile (that is adjacent to a player-owned Farm or Settlement) into a Field tile;
    2. Reforesting: convert a Field Tile into a Forest tile.
5. Consultant: add a Reorganization card to the player’s discard pile.

## Resource Market

Players can purchase 🪵 and **⚙️** from the Resource Market using the Purchase Order action. Each resource costs 1, 2, 3, or 4 revenue. A player can purchase resources with the Purchase Order card.

When the Industry player uses Purchase Order, they can also place a resource on a vacant spot in the Resource Market to receive the corresponding revenue for that spot. When all of the 8 resource spots are full, the Industry player can use a Purchase Order to export 1-2 resources, providing the Industry player with victory points per exported resource.

## Winning

Each time an AGM (Annual General Meeting) is played, a player achieves a milestone, spending 💰 to make an investment or 🪵 and **⚙️** to export goods, bringing the player closer to victory. After achieving each milestone, a player will need to spend more resources to achieve the next milestone.

A **Tourism** player wins once she has collected enough Investment milestones (scaled to 💰 the number of revealed tiles). 

The **Industry** player wins once she has achieved Export milestones (by exporting 🪵 and **⚙️ s**caled to the number of revealed tiles).