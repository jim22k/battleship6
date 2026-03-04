# Multiplayer Battleship Game Recorder

A static web application for recording and visualizing the progress of a multiplayer Battleship game.

This tool is designed to track rounds, shots fired, ship placement, and player ship damage — all entirely client-side with persistent state stored in the browser.

---

## Overview

This application allows you to:

### Board & Rounds
- Record shots on a 10×10 grid (columns 1–10, rows Alpha–Juliette).
- Track shots by round (Round 1, 2, 3, ...).
- Highlight shots from any combination of previous rounds.
- Prevent targeting the same cell more than once.
- Remove shots by clicking them again (if editing the active recording round).
- Automatically persist state across page reloads.

### Ship Placement
- Place 5 ships before starting the game:
  - **A** – Aircraft Carrier (5)
  - **B** – Battleship (4)
  - **C** – Cruiser (3)
  - **D** – Destroyer (2)
  - **S** – Submarine (1)
- Ships may be placed:
  - Horizontally
  - Vertically
  - Diagonally (both directions)
- Ships cannot overlap.
- Ships may be repositioned before starting the game.
- Ship cells display:
  - Light green when intact
  - Red when hit

### Main Player Automation
- The top player represents the board owner.
- Ship damage is automatically calculated based on recorded shots.
- Damage inputs for this player are read-only.
- Ship segments visually turn red when hit.

### Other Players
- 5 additional players can be tracked.
- Ship damage is manually entered (2-digit round numbers).
- When all hit boxes for a ship are filled, it is visually marked as sunk.

### Data Persistence
- All game state is stored in `localStorage`.
- A **Clear All Data** button resets the game after confirmation.

---

## Technology Stack

This application is intentionally simple and fully static.

### Frontend
- **React 18 (UMD build via CDN)**
- **ReactDOM 18**
- **Babel (in-browser JSX transpilation)**

No build step or bundler is required.

### Storage
- Browser `localStorage`
- Versioned state schema
- Automatic persistence on state changes

### Architecture
- Single-page application
- Pure client-side state management
- Derived data for automatic ship damage computation
- Deterministic rendering from normalized state model

---

## Running the Application

Because this is a static site:

1. Place the files together:
   - `index.html`
   - `styles.css`
   - `app.jsx`
2. Open `index.html` in a modern browser.

No server or build tooling required.

---

## Design Goals

- Zero backend dependencies
- Persistent state without accounts or databases
- Clear round visualization
- Minimal operational friction during live gameplay
- Deterministic, repairable state model

---

This tool is intended as a game-state recorder, not a rules engine. It tracks what happened — it does not enforce turn order, shot counts, or game logic beyond board occupancy.