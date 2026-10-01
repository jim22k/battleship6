# Multiplayer Battleship Game Recorder

A static web app for tracking a multiplayer Battleship game entirely in the browser.

The app now supports player setup, turn ownership by round, ship placement for the selected user, and shot limits based on how many ships each player still has afloat.

## What It Does

### Player Setup
- Create a game with **2 to 6 players**.
- Enter player names in **turn order**.
- Mark exactly one player as **you**.
- Only the first `N` player slots are active, so player selection stays contiguous.
- Player names and the "This is me" choice are editable only during setup.

### Ship Placement
- After setup, click **Next** to move to ship placement.
- The selected user becomes the **board owner**.
- Place the 5 ships on the 10x10 grid:
  - **A** - Aircraft Carrier (5)
  - **B** - Battleship (4)
  - **C** - Cruiser (3)
  - **D** - Destroyer (2)
  - **S** - Submarine (1)
- Ships can be placed horizontally, vertically, or diagonally.
- Ships cannot overlap.
- A **Back** button returns to player setup.
- **Start Game** becomes available once all ships are placed.

### Turn And Round Tracking
- Round 1 always belongs to **player 1**.
- Each round is assigned to exactly one player.
- The active round highlights that player in the player list.
- The selected user keeps a distinct purple style, even when it is not their turn.
- When a player's ships are all sunk, that player is skipped in later rounds.

### Shot Recording
- Shots are recorded on the main board by round number.
- A player gets **one shot per active ship** they still have at the start of that round.
- Example:
  - 5 active ships = 5 shots that round
  - 3 active ships = 3 shots that round
- **Next Round** stays disabled until the current round has taken its full shot count.
- You can still inspect and edit earlier rounds using the recording-round selector.

### Damage Tracking
- The selected user's ship damage is **auto-calculated** from shots on the board.
- Other players' ship damage is tracked manually through their hit boxes.
- Hit boxes record the round number of the hit.
- Fully filled ships are shown as sunk.

### Ship Concealment
- Once **Start Game** is pressed, your ships are **hidden by default** so nobody glancing at your screen can read your fleet.
- Ships are still fully visible during setup and placement, where you need them.
- Your ships reappear in three cases only:
  1. **On your turn**, hovering a cell that contains one of your own ships reveals just that ship (including whether it has been hit). Moving the mouse away hides it again.
  2. **On your turn**, any shot you record this round reveals the ship under it, so tap-only devices can shoot a cell, look, and tap again to undo the shot.
  3. **The ship toggle** in the bottom-right corner of your player card shows or hides all of your ships at once.
- The toggle shows an eye while your ships are visible, and a crossed-out eye while they are hidden.
- The toggle is intentionally **not persisted**, so ships are always hidden again after a reload.

### Layout
- Player cards use a **wrapping flow layout**.
- Cards are intentionally **narrower** and more compact so multiple cards can fit per row when space allows.

### Persistence
- All game state is stored in `localStorage`.
- **Clear All Data** resets the full game after confirmation.
- Legacy saved data is migrated on a best-effort basis.

## Running The App

This project is fully static:

1. Keep these files together:
   - `index.html`
   - `styles.css`
   - `app.jsx`
2. Open `index.html` in a modern browser.

No server or build tooling is required.

## Tech Stack

- React 18 via CDN
- ReactDOM 18 via CDN
- Babel standalone for in-browser JSX
- Browser `localStorage` for persistence

## Notes

This tool records game state and enforces the app's round/shot bookkeeping. It is still a lightweight client-side recorder rather than a full Battleship rules engine.
