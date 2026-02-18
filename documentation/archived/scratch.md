# Scratch

Each time an AGM (Annual General Meeting) is played, a player (Hotelier or Industrialist) achieves a milestone, spending 💰 to make an investment or 🪵 and **⚙️** to export goods, bringing them closer to victory. After achieving each milestone, that player will need to spend more resources to achieve the next milestone.


# Conference

The Conference is used to add Personnel and Action cards to a player’s deck.

Instead of using the standard ability of a Personnel card, a player can send that Personnel card to the Conference Room to pay for 1 of 4 cards that appear in a row, (representing the Personnel member engaging in “hiring” or “negotiating” activity on behalf of the player). Each card is priced 💰1, 💰2, 💰3, or 💰4. **When a player purchases a card from the Conference, the Bureaucrat receives 1 Vote.** After a player has purchased a card, the purchased card and the relevant Personnel card are sent to the discard pile. The other cards are moved to fill the gap created by removing the purchased card, and a new card is revealed, which is now worth 💰4. If no player purchases a card on their turn, the 💰1 card is removed from the row of 4 cards, the other cards shift accordingly, and a new card is revealed, priced at 💰4.

The following cards are all available for purchase:

**Event cards**

1. Build: Place one of the following tokens on a hex on the map: 
- Industrialist:
    - Industrial Zone
    - Farm
- Hotelier:
    - Resort
    - Housing
- Chieftain:
    - Village
    - Reserve
- Bureaucrat:
    - Infrastructure
    - Civic Office

2. Purchase Order
3. Expedition
4. Ad Campaign: when played, each Resort produces 1 Coin per adjacent Forest, Water, and Mountain hex
5. Extraction: when played, each Industrial Zone produces 1 Wood per adjacent Forest hex and 1 Ore per adjacent Mountain hex
6. Zoning: reserves a tile for a player to use on the player’s next turn.
7. Reorganization: trash 1 Personnel card from the player’s hand, draw 1 card, shuffle the player’s discard pile into their draw pile, put an AGM on top of the player’s draw pile, and take 1 more action.
8. Urbanization: allows a player to spend 2 🪵W and 2 **⚙️**O to place an additional settlement on a tile where a player already has a settlement, doubling the benefits provided by that settlement.
9. Aquaculture: place a farm on a Water tile.
10. AGM (Annual General Meeting): achieve a Milestone.

**Personnel cards**

1. Builder
2. Liaison
3. Surveyor
4. Elder (Chieftain starting card)
5. Forester: can be used to create 1 of 2 Action cards:
    1. Slash & Burn: convert a Forest tile (that is adjacent to a player-owned Farm or Settlement) into a Field tile;
    2. Reforesting: convert a Field Tile into a Forest tile.
6. Consultant: add a Reorganization card to the player’s discard pile.

## Resource Market

Players can purchase 🪵 and **⚙️** from the Resource Market using the Purchase Order action. Each resource costs 1, 2, 3, or 4 revenue. A player can purchase resources with the Purchase Order card.

When the Industrialist uses Purchase Order, they can also place a resource on a vacant spot in the Resource Market to receive the corresponding revenue for that spot. When all of the 8 resource spots are full, the Industrialist can use a Purchase Order to export 1-2 resources, providing victory points per exported resource.

## Winning

Each player type has different victory conditions (see **Winning Conditions** in the Overview):

- **Hotelier**: Wins by collecting enough Coins (scaled to the number of revealed tiles). Coins are collected when **Procurement** is played.
- **Industrialist**: Wins by collecting and exporting enough Wood and Ore (scaled to the number of revealed tiles). Resources are produced when **Procurement** is played.
- **Bureaucrat**: Wins by collecting enough Votes.
- **Chieftain**: Wins by securing enough hexes and keeping those areas undeveloped as "Reserves". Hexes are secured by placing empty brown rings on Mountain, Field, Sand, or Forest hexes—which blocks the Hotelier and Industrialist from receiving Coins or Wood/Ore from those hexes.


Ok, I need to develop the Market, Policy, and Conference mechanics. My original idea for the Conference: a player could send a Personnel card to a conference to recruit other Personnel, initiating a bidding system for that other Personnel card: Instead of a player playing a Personnel card to generate an Event card, that Personnel card goes to the conference, attempting to recruit a new Personnel, paying a minimum of 1 Coin. Other players can then bid for that Personnel using Coins, with that Personnel card going to the highest bidder. This allows players to unlock new Personnel, like:
- Forester: generates a Logging or Forestry Event card of the player's choice:
Logging: replace a Forest hex with a Field hex
Forestry: replace a Field hex with a Forest hex
- Consultant: generates "Reorganization" Event:
Reorganization: Draw or play an additional card after playing this. Remove a Personnel card from your deck. Pay 2 Coins to take any Personnel card from the Conference cards.
- Broker: generates an Import or Export Event card of the player's choice:
Import: Import a Wood or Ore resource for 1 Coin
Export: Export any number of Wood or Ore resources for an equal amount of Coins.

My idea for the Market was to exchange Coins for Wood/Ore and vice versa. A player would be able to buy/sell Wood/Ore according to market mechanics. The more wood/ore is being purchased, the more expensive it becomes. The Wood/Ore is generally sold on a local market, with Wood/Ore availability controlled through the Industrialist Player - I'm not sure how I would make this mechanism work.

Last but not least, I also wanted to include a "Politics" market for other "Event" cards that, when purchased, give a Vote for the Bureaucrat player, but also provide a benefit for the acquiring player. This would allow me to introduce various, more powerful Event cards into the game, which could be purchased where the Bureaucrat player decides the cost for each card, with the cost of acquiring each card being 1, 2, 3, or 4 Coins, and with cards being acquired using the Procurement event, and with acquired Event cards going immediately into the acquiring player's hand. At the end of the Bureaucrat's turn, if the Event card costing 1 Coin has not been acquired, that card is removed from the Politics market; the Bureaucrat player then draws new Event cards so that there are 4 cards in the Politics market, assigning the costs of each Event card according to her wishes. These Event cards might be:
- Bribe: Pay 1 Coin to remove a Vote from the Bureaucrat
- Zoning: Pay 1 Coin and place a Zoning marker on a Field/Sand hex adjacent to a hex with one of your buildings; only the player placing the Zoning marker can build on this Hex.
- Urban Planning: Place an additional Resort, Industrial Zone, or Infrastructure Building on a hex that already has one such buildings; that hex now generates twice the income from Procurement.
- AGM: The player with the most Buildings takes 1 Coin per Building.
- NGO backing: Chieftain gains 1 Coin per village

I also need to find a way to generate coins for the Chieftain player - perhaps this can be done with the Politics market.


# Politics


The Bureaucrat player chooses the value of each card. There is an exception: When the Bureaucrat is not playing, then the Cards are randomly ordered; if no Politics card has been purchased after a player's turn, the cheapest card in the Politics section is removed and the other cards are shifted to the left (to the 1, 2, 3 positions), and a new card is revealed to occupy the 4-Coin cost position.