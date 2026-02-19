# Linear Tickets — Team LAN

_Last synced: 2026-02-19T08:39:08.713Z_

Reference with **@tickets** in Cursor when coding.

---

### [LAN-13] Use emojis instead of images for cards

| Field | Value |
|-------|-------|
| **Status** | Done |
| **Priority** | 0 |
| **Assignee** | Unassigned |
| **Labels** | — |
| **URL** | https://linear.app/landgrab/issue/LAN-13/use-emojis-instead-of-images-for-cards |

For prototyping purposes, let's use emojis for card images:
👷 Builder
👩‍💼 Liaison
👲 Elder
🧗‍♀️ Cartographer
📜 Charter
🏗️ Build
🏕️ Expedition
🧾 Purchase Order

Cards should be updated accordingly.

### [LAN-12] Create card assets

| Field | Value |
|-------|-------|
| **Status** | Done |
| **Priority** | 0 |
| **Assignee** | Unassigned |
| **Labels** | — |
| **URL** | https://linear.app/landgrab/issue/LAN-12/create-card-assets |

Each card (like Charter, Liaison, Builder, Cartographer) should have a simple image (pixellated, line drawing only \[no shading or colors\]) in the top half, that gives a brief idea of what the card does. The Builder could have a man with a hardhat and hammer, the Cartographer could have an adventurous woman looking at a map, the Liaison could be a woman in a business suit. These assets should be saved to assets/cards.

### [LAN-10] Fix card design

| Field | Value |
|-------|-------|
| **Status** | Done |
| **Priority** | 0 |
| **Assignee** | Unassigned |
| **Labels** | Bug |
| **URL** | https://linear.app/landgrab/issue/LAN-10/fix-card-design |

Each card (like Charter, Liaison, Builder, Cartographer) should appear as a handheld card, with the card title at the top, an image for flavor, and a brief description of what the card does.

### [LAN-11] Fix starting turn

| Field | Value |
|-------|-------|
| **Status** | Done |
| **Priority** | 0 |
| **Assignee** | Unassigned |
| **Labels** | Bug |
| **URL** | https://linear.app/landgrab/issue/LAN-11/fix-starting-turn |

Players are not obligated to play a Charter when starting their turn. In a player's first action, they can play any of the 4 cards from their hand: Charter, Cartographer, Liaison, or Builder. In a player's second action, they can then play any card that was added to their hand, or they can draw the card they just discarded (after it was played), or they can play a card that was originally in their hand.
