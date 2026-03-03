/* global React, ReactDOM */

const LS_KEY = "battleship_recorder_v1";
const SCHEMA_VERSION = 1;

const ROW_WORDS = [
  "Alpha",
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
  "India",
  "Juliette",
];

const SHIPS = {
  A: { name: "Aircraft Carrier", length: 5 },
  B: { name: "Battleship", length: 4 },
  C: { name: "Cruiser", length: 3 },
  D: { name: "Destroyer", length: 2 },
  S: { name: "Submarine", length: 1 },
};

const ORIENTATIONS = {
  H: { label: "Horizontal →", dr: 0, dc: 1 },
  V: { label: "Vertical ↓", dr: 1, dc: 0 },
  D1: { label: "Diagonal ↘", dr: 1, dc: 1 },
  D2: { label: "Diagonal ↙", dr: 1, dc: -1 },
};

const ROUND_COLORS = [
  "#7dd3fc", // sky
  "#fda4af", // rose
  "#c4b5fd", // violet
  "#86efac", // green
  "#fcd34d", // amber
  "#f9a8d4", // pink
  "#a7f3d0", // mint
  "#93c5fd", // blue
  "#fdba74", // orange
  "#e9d5ff", // lavender
  "#bef264", // lime
  "#fecaca", // light red
];

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function cellId(r, c) {
  // r: 0..9, c: 1..10
  return `${r}-${c}`;
}

function parseCellId(id) {
  const [rs, cs] = id.split("-");
  return { r: Number(rs), c: Number(cs) };
}

function colorForRound(r) {
  return ROUND_COLORS[(r - 1) % ROUND_COLORS.length];
}

function makeDefaultPlayers() {
  const mkDamage = () => ({
    A: Array(SHIPS.A.length).fill(""),
    B: Array(SHIPS.B.length).fill(""),
    C: Array(SHIPS.C.length).fill(""),
    D: Array(SHIPS.D.length).fill(""),
    S: Array(SHIPS.S.length).fill(""),
  });

  return Array.from({ length: 6 }, (_, i) => ({
    id: `p${i + 1}`,
    name: "",
    damage: mkDamage(),
  }));
}

function makeInitialState() {
  return {
    version: SCHEMA_VERSION,
    mode: "PLACE_SHIPS", // PLACE_SHIPS | RECORD_SHOTS
    rounds: {
      current: 1,
      recording: 1,
      highlights: [], // array of numbers (persistable)
    },
    shotsByCell: {}, // { [cellId]: roundNumber }
    shotsByRound: {}, // { [roundNumber]: [cellId...] }
    ships: {
      placed: {
        A: null,
        B: null,
        C: null,
        D: null,
        S: null,
      },
      byCell: {}, // { [cellId]: shipLetter }
    },
    ui: {
      placement: {
        selectedShip: "A",
        orientation: "H",
      },
    },
    players: makeDefaultPlayers(),
  };
}

function computeMainPlayerDamage(shipsPlaced, shotsByCell) {
  const damage = {
    A: Array(SHIPS.A.length).fill(""),
    B: Array(SHIPS.B.length).fill(""),
    C: Array(SHIPS.C.length).fill(""),
    D: Array(SHIPS.D.length).fill(""),
    S: Array(SHIPS.S.length).fill(""),
  };

  for (const letter of Object.keys(SHIPS)) {
    const placed = shipsPlaced[letter];
    if (!placed || !Array.isArray(placed.cells)) continue;

    // Hits are shots on any cell occupied by this ship
    const hits = [];
    placed.cells.forEach((id, idx) => {
      const r = shotsByCell[id];
      if (r != null) hits.push({ round: Number(r), idx });
    });

    // Stable order: round asc, then ship-cell order asc
    hits.sort((a, b) => (a.round - b.round) || (a.idx - b.idx));

    for (let i = 0; i < Math.min(hits.length, damage[letter].length); i++) {
      damage[letter][i] = String(hits[i].round);
    }
  }

  return damage;
}

function tryLoadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== SCHEMA_VERSION) return null;

    // Normalize / repair minimal invariants
    const s = parsed;

    if (!s.rounds) s.rounds = { current: 1, recording: 1, highlights: [] };
    if (!Array.isArray(s.rounds.highlights)) s.rounds.highlights = [];
    if (typeof s.rounds.current !== "number") s.rounds.current = 1;
    if (typeof s.rounds.recording !== "number") s.rounds.recording = s.rounds.current;

    if (!s.shotsByCell || typeof s.shotsByCell !== "object") s.shotsByCell = {};
    if (!s.shotsByRound || typeof s.shotsByRound !== "object") s.shotsByRound = {};

    if (!s.ships) s.ships = { placed: { A: null, B: null, C: null, D: null, S: null }, byCell: {} };
    if (!s.ships.placed) s.ships.placed = { A: null, B: null, C: null, D: null, S: null };
    if (!s.ships.byCell || typeof s.ships.byCell !== "object") s.ships.byCell = {};

    if (!s.ui) s.ui = { placement: { selectedShip: "A", orientation: "H" } };
    if (!s.ui.placement) s.ui.placement = { selectedShip: "A", orientation: "H" };

    if (!Array.isArray(s.players) || s.players.length !== 6) s.players = makeDefaultPlayers();

    // Rebuild shotsByCell from shotsByRound if needed/safer:
    // (authoritative: shotsByRound; but if empty and shotsByCell exists, keep)
    const hasRoundData = Object.keys(s.shotsByRound).length > 0;
    if (hasRoundData) {
      const rebuilt = {};
      for (const [rk, arr] of Object.entries(s.shotsByRound)) {
        const r = Number(rk);
        if (!Array.isArray(arr)) continue;
        for (const id of arr) rebuilt[id] = r;
      }
      s.shotsByCell = rebuilt;
    } else {
      // Build shotsByRound from shotsByCell
      const rebuiltRound = {};
      for (const [id, r] of Object.entries(s.shotsByCell)) {
        const rr = Number(r);
        if (!rebuiltRound[rr]) rebuiltRound[rr] = [];
        rebuiltRound[rr].push(id);
      }
      s.shotsByRound = rebuiltRound;
    }

    // Rebuild ships.byCell from ships.placed if needed
    const hasPlaced = s.ships?.placed && Object.values(s.ships.placed).some(Boolean);
    if (hasPlaced) {
      const byCell = {};
      for (const [letter, info] of Object.entries(s.ships.placed)) {
        if (!info || !Array.isArray(info.cells)) continue;
        for (const id of info.cells) byCell[id] = letter;
      }
      s.ships.byCell = byCell;
    }

    // Clamp rounds
    const maxUsedRound = Math.max(
      1,
      s.rounds.current,
      ...Object.keys(s.shotsByRound).map((k) => Number(k)).filter((n) => Number.isFinite(n))
    );
    s.rounds.current = clamp(s.rounds.current, 1, maxUsedRound);
    s.rounds.recording = clamp(s.rounds.recording, 1, maxUsedRound);

    // Auto mode if ships all placed
    const allShipsPlaced = Object.keys(SHIPS).every((k) => s.ships.placed[k]);
    if (allShipsPlaced) s.mode = s.mode || "RECORD_SHOTS";
    if (!s.mode) s.mode = "PLACE_SHIPS";

    return s;
  } catch {
    return null;
  }
}

function useDebouncedEffect(effect, deps, delayMs) {
  React.useEffect(() => {
    const t = setTimeout(() => effect(), delayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function computeFootprint(anchorR, anchorC, shipLetter, orientationKey) {
  const len = SHIPS[shipLetter].length;
  const { dr, dc } = ORIENTATIONS[orientationKey];
  const cells = [];
  for (let i = 0; i < len; i++) {
    const r = anchorR + dr * i;
    const c = anchorC + dc * i;
    cells.push({ r, c, id: cellId(r, c) });
  }
  return cells;
}

function isInBounds(r, c) {
  return r >= 0 && r < 10 && c >= 1 && c <= 10;
}

function App() {
  const [state, setState] = React.useState(() => tryLoadState() ?? makeInitialState());
  const [hoverCell, setHoverCell] = React.useState(null); // {r,c,id} or null

  // Persist
  useDebouncedEffect(
    () => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(state));
      } catch {
        // ignore
      }
    },
    [state],
    150
  );

  const allShipsPlaced = React.useMemo(() => {
    return Object.keys(SHIPS).every((k) => !!state.ships.placed[k]);
  }, [state.ships.placed]);

  const maxRoundSeen = React.useMemo(() => {
    const keys = Object.keys(state.shotsByRound).map((k) => Number(k)).filter((n) => Number.isFinite(n));
    return Math.max(1, state.rounds.current, ...keys);
  }, [state.shotsByRound, state.rounds.current]);

  const highlightsSet = React.useMemo(() => new Set(state.rounds.highlights), [state.rounds.highlights]);

  const placementPreview = React.useMemo(() => {
    if (!hoverCell) return { cells: [], valid: true };
    if (state.mode !== "PLACE_SHIPS") return { cells: [], valid: true };

    const ship = state.ui.placement.selectedShip;
    const ori = state.ui.placement.orientation;
    if (!ship || !SHIPS[ship]) return { cells: [], valid: true };

    const candidate = computeFootprint(hoverCell.r, hoverCell.c, ship, ori);

    // bounds
    for (const c of candidate) {
      if (!isInBounds(c.r, c.c)) return { cells: candidate, valid: false };
    }

    // overlap check: allow overlap with the same ship's current cells (since we "move" it)
    const existing = state.ships.placed[ship]?.cells ? new Set(state.ships.placed[ship].cells) : new Set();
    for (const c of candidate) {
      const occ = state.ships.byCell[c.id];
      if (occ && occ !== ship) return { cells: candidate, valid: false };
      if (occ === ship && !existing.has(c.id)) {
        // This is still OK; same ship can overlap itself only if it was there before; but byCell for ship matches existing anyway.
      }
    }

    return { cells: candidate, valid: true };
  }, [hoverCell, state.mode, state.ui.placement, state.ships.byCell, state.ships.placed]);

  const mainPlayerDamage = React.useMemo(() => {
    return computeMainPlayerDamage(state.ships.placed, state.shotsByCell);
  }, [state.ships.placed, state.shotsByCell]);

  function toggleHighlightRound(r) {
    setState((prev) => {
      const set = new Set(prev.rounds.highlights);
      if (set.has(r)) set.delete(r);
      else set.add(r);
      return { ...prev, rounds: { ...prev.rounds, highlights: Array.from(set).sort((a, b) => a - b) } };
    });
  }

  function nextRound() {
    setState((prev) => {
      const next = prev.rounds.current + 1;
      return {
        ...prev,
        rounds: { ...prev.rounds, current: next, recording: next },
      };
    });
  }

  function setRecordingRound(r) {
    setState((prev) => ({ ...prev, rounds: { ...prev.rounds, recording: r } }));
  }

  function setMode(mode) {
    setState((prev) => ({ ...prev, mode }));
  }

  function clearAll() {
    const ok = window.confirm("Clear all game data and start a new game? This cannot be undone.");
    if (!ok) return;
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      // ignore
    }
    setState(makeInitialState());
    setHoverCell(null);
  }

  function setPlacementSelectedShip(letter) {
    setState((prev) => ({ ...prev, ui: { ...prev.ui, placement: { ...prev.ui.placement, selectedShip: letter } } }));
  }

  function setPlacementOrientation(ori) {
    setState((prev) => ({ ...prev, ui: { ...prev.ui, placement: { ...prev.ui.placement, orientation: ori } } }));
  }

  function commitShipPlacement(anchorR, anchorC) {
    const ship = state.ui.placement.selectedShip;
    const ori = state.ui.placement.orientation;
    if (!ship) return;

    const candidate = computeFootprint(anchorR, anchorC, ship, ori);

    // validate bounds first
    for (const c of candidate) {
      if (!isInBounds(c.r, c.c)) return;
    }

    setState((prev) => {
      const prevPlaced = prev.ships.placed[ship]; // maybe null
      const prevCells = prevPlaced?.cells ? [...prevPlaced.cells] : [];
      const prevCellsSet = new Set(prevCells);

      // Remove previous placement for this ship from byCell
      const byCell = { ...prev.ships.byCell };
      for (const id of prevCells) {
        if (byCell[id] === ship) delete byCell[id];
      }

      // Check overlap against other ships (using byCell after removing this ship)
      for (const c of candidate) {
        const occ = byCell[c.id];
        if (occ && occ !== ship) {
          // restore old byCell and abort (no change)
          for (const id of prevCells) byCell[id] = ship;
          return prev;
        }
      }

      // Commit new placement
      for (const c of candidate) byCell[c.id] = ship;

      const placedInfo = {
        anchor: cellId(anchorR, anchorC),
        orientation: ori,
        cells: candidate.map((x) => x.id),
      };

      const placed = { ...prev.ships.placed, [ship]: placedInfo };
      const ships = { ...prev.ships, placed, byCell };

      // Auto-advance selected ship to next unplaced (nice)
      const nextShip = Object.keys(SHIPS).find((k) => !placed[k]) ?? ship;

      return {
        ...prev,
        ships,
        // Stay in PLACE_SHIPS until user explicitly clicks Start Game
        ui: { ...prev.ui, placement: { ...prev.ui.placement, selectedShip: nextShip } },
      };
    });
  }

  function handleCellClick(r, c) {
    const id = cellId(r, c);

    if (state.mode === "PLACE_SHIPS") {
      // Place/move selected ship
      // Only commit if preview is valid and anchor matches clicked cell
      const ship = state.ui.placement.selectedShip;
      if (!ship) return;
      // Validate using current preview logic (recompute quickly)
      const candidate = computeFootprint(r, c, ship, state.ui.placement.orientation);
      // bounds
      for (const cc of candidate) {
        if (!isInBounds(cc.r, cc.c)) return;
      }
      // overlap check is done in commit (with restore)
      commitShipPlacement(r, c);
      return;
    }

    // RECORD_SHOTS
    const recording = state.rounds.recording;
    const existingRound = state.shotsByCell[id];

    // If occupied by some round:
    if (existingRound != null) {
      // remove only if it's the recording round
      if (Number(existingRound) !== Number(recording)) return;

      setState((prev) => {
        const shotsByCell = { ...prev.shotsByCell };
        delete shotsByCell[id];

        const shotsByRound = { ...prev.shotsByRound };
        const arr = Array.isArray(shotsByRound[recording]) ? [...shotsByRound[recording]] : [];
        const idx = arr.indexOf(id);
        if (idx >= 0) arr.splice(idx, 1);
        shotsByRound[recording] = arr;

        return { ...prev, shotsByCell, shotsByRound };
      });
      return;
    }

    // If empty: add shot for recording round
    setState((prev) => {
      const shotsByCell = { ...prev.shotsByCell, [id]: recording };

      const shotsByRound = { ...prev.shotsByRound };
      const arr = Array.isArray(shotsByRound[recording]) ? [...shotsByRound[recording]] : [];
      arr.push(id);
      shotsByRound[recording] = arr;

      return { ...prev, shotsByCell, shotsByRound };
    });
  }

  function handleCellHover(r, c) {
    setHoverCell({ r, c, id: cellId(r, c) });
  }

  function clearHover() {
    setHoverCell(null);
  }

  function updatePlayerName(idx, value) {
    setState((prev) => {
      const players = prev.players.map((p, i) => (i === idx ? { ...p, name: value } : p));
      return { ...prev, players };
    });
  }

  function updatePlayerDamage(idx, shipLetter, hitIdx, rawValue) {
    // allow "" or 1-2 digits
    let v = rawValue;
    if (v.length > 2) v = v.slice(0, 2);
    if (v !== "" && !/^\d{1,2}$/.test(v)) return;

    setState((prev) => {
      const players = prev.players.map((p, i) => {
        if (i !== idx) return p;
        const damageShip = [...p.damage[shipLetter]];
        damageShip[hitIdx] = v;
        return { ...p, damage: { ...p.damage, [shipLetter]: damageShip } };
      });
      return { ...prev, players };
    });
  }

  const modeTag = state.mode === "PLACE_SHIPS"
    ? { text: "SHIP PLACEMENT", cls: "warn" }
    : { text: "RECORDING SHOTS", cls: "ok" };

  return (
    <div className="app">
      <div className="topbar">
        <div className="badge">
          <div className="label">Round</div>
          <div className="value">{state.rounds.current}</div>
        </div>

        <button className="btn primary" onClick={nextRound} title="Increment the current round">
          Next Round
        </button>

        <div className="badge" title="New shots will be recorded to this round">
          <div className="label">Recording</div>
          <select
            className="select"
            value={state.rounds.recording}
            onChange={(e) => setRecordingRound(Number(e.target.value))}
          >
            {Array.from({ length: maxRoundSeen }, (_, i) => i + 1).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <span className={`modeTag ${modeTag.cls}`}>{modeTag.text}</span>

        <div className="spacer" />

        <button className="btn danger" onClick={clearAll}>
          Clear All Data
        </button>
      </div>

      <div className="main">
        <div className="card">
          <h2>Board</h2>

          <div className="controls">
            {state.mode === "PLACE_SHIPS" ? (
              <>
                <div className="badge">
                  <div className="label">Ship</div>
                  <select
                    className="select"
                    value={state.ui.placement.selectedShip}
                    onChange={(e) => setPlacementSelectedShip(e.target.value)}
                  >
                    {Object.keys(SHIPS).map((k) => (
                      <option key={k} value={k}>
                        {k} ({SHIPS[k].length})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="badge">
                  <div className="label">Orientation</div>
                  <select
                    className="select"
                    value={state.ui.placement.orientation}
                    onChange={(e) => setPlacementOrientation(e.target.value)}
                  >
                    {Object.entries(ORIENTATIONS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="helperText">
                  Click a cell to place the selected ship. If it was already placed, it will move.
                  {" "}
                  Ships can be horizontal, vertical, or diagonal. No overlap.
                </div>

                <button
                  className="btn"
                  onClick={() => setMode("RECORD_SHOTS")}
                  disabled={!allShipsPlaced}
                  title={allShipsPlaced ? "Start recording shots" : "Place all ships first"}
                >
                  Start Game
                </button>
              </>
            ) : (
              <>
                <div className="helperText">
                  Click an empty cell to record a shot for the <b>Recording</b> round.
                  Click again to remove <b>only if that cell was recorded in the Recording round</b>.
                  Cells targeted in other rounds cannot be changed from here—switch Recording round.
                </div>
              </>
            )}
          </div>

          <div className="gridWrap">
            <div>
              <div className="helperText" style={{ marginBottom: 8 }}>
                Toggle highlight rounds:
              </div>
              <div className="pills">
                {Array.from({ length: maxRoundSeen }, (_, i) => i + 1).map((r) => {
                  const on = highlightsSet.has(r);
                  const style = on
                    ? { background: colorForRound(r), borderColor: "rgba(255,255,255,0.35)" }
                    : undefined;
                  return (
                    <div
                      key={r}
                      className={`pill ${on ? "on" : ""} ${r === state.rounds.current ? "current" : ""}`}
                      style={style}
                      onClick={() => toggleHighlightRound(r)}
                      title="Toggle highlight"
                    >
                      {r}
                    </div>
                  );
                })}
              </div>
            </div>

            <BoardGrid
              mode={state.mode}
              shotsByCell={state.shotsByCell}
              shipsByCell={state.ships.byCell}
              highlights={highlightsSet}
              placementPreview={placementPreview}
              recordingRound={state.rounds.recording}
              onCellClick={handleCellClick}
              onCellHover={handleCellHover}
              onCellLeave={clearHover}
            />

            <div className="footerNote">
              Row labels use NATO words (Alpha…Juliette). Columns are 1–10.
              Ship markers are shown as small corner letters; shot rounds are shown large.
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Players</h2>
          <div className="players">
            {state.players.map((p, idx) => {
              const isMain = idx === 0;

              const playerForRender = isMain
                ? { ...p, damage: mainPlayerDamage }
                : p;

              return (
                <PlayerCard
                  key={p.id}
                  idx={idx}
                  player={playerForRender}
                  isMainPlayer={isMain}
                  readOnlyDamage={isMain}
                  onNameChange={(v) => updatePlayerName(idx, v)}
                  onDamageChange={(ship, hitIdx, v) => updatePlayerDamage(idx, ship, hitIdx, v)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardGrid({
  mode,
  shotsByCell,
  shipsByCell,
  highlights,
  placementPreview,
  recordingRound,
  onCellClick,
  onCellHover,
  onCellLeave,
}) {
  // Quick lookup for preview
  const previewSet = React.useMemo(() => {
    const s = new Set();
    for (const c of placementPreview.cells) s.add(c.id);
    return s;
  }, [placementPreview.cells]);

  const previewValid = placementPreview.valid;

  return (
    <div className="grid" onMouseLeave={onCellLeave}>
      {/* Top-left corner blank */}
      <div />

      {/* Column headers 1..10 */}
      {Array.from({ length: 10 }, (_, i) => i + 1).map((col) => (
        <div key={`ch-${col}`} className="colHeader">
          {col}
        </div>
      ))}

      {/* Rows */}
      {ROW_WORDS.map((rowLabel, r) => (
        <React.Fragment key={`row-${r}`}>
          <div className="rowHeader">{rowLabel}</div>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((c) => {
            const id = cellId(r, c);
            const shotRound = shotsByCell[id];
            const ship = shipsByCell[id];

            const isPreview = mode === "PLACE_SHIPS" && previewSet.has(id);
            const disabled = false; // we still allow click; logic decides validity

            const isHighlighted = shotRound != null && highlights.has(Number(shotRound));
            const highlightColor = isHighlighted ? colorForRound(Number(shotRound)) : null;

            const canRemove =
              mode === "RECORD_SHOTS" && shotRound != null && Number(shotRound) === Number(recordingRound);

            const titleParts = [];
            titleParts.push(`${ROW_WORDS[r]}-${c}`);
            if (ship) titleParts.push(`Ship: ${ship}`);
            if (shotRound != null) titleParts.push(`Shot: round ${shotRound}`);
            if (mode === "RECORD_SHOTS" && shotRound != null) {
              titleParts.push(canRemove ? "Click to remove (recording round)" : "Locked (different round)");
            }
            if (mode === "PLACE_SHIPS" && isPreview) {
              titleParts.push(previewValid ? "Click to place ship" : "Invalid placement");
            }

            return (
              <div
                key={id}
                className={`cell ${disabled ? "disabled" : ""}`}
                title={titleParts.join(" • ")}
                onClick={() => onCellClick(r, c)}
                onMouseEnter={() => onCellHover(r, c)}
              >
                {ship ? (
                  <div className={`shipMark ${shotRound != null ? "hit" : ""}`}>{ship}</div>
                ) : null}
                {shotRound != null ? <div className="shotNumber">{shotRound}</div> : null}

                {isHighlighted ? (
                  <div
                    className="highlightOverlay"
                    style={{
                      background: highlightColor,
                    }}
                  />
                ) : null}

                {isPreview ? (
                  previewValid ? <div className="previewOverlay" /> : <div className="invalidPreviewOverlay" />
                ) : null}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

function PlayerCard({ idx, player, isMainPlayer, readOnlyDamage, onNameChange, onDamageChange }) {
  const sunk = (shipLetter) => {
    const arr = player.damage[shipLetter] || [];
    return arr.length > 0 && arr.every((v) => v !== "");
  };

  return (
    <div className={`playerCard ${isMainPlayer ? "mainPlayer" : ""}`}>
      <div className="playerHeader">
        <div className="idx">{idx + 1}</div>
        <input
          className="textInput"
          value={player.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Player name"
        />
      </div>

      {Object.keys(SHIPS).map((letter) => (
        <div key={letter} className={`shipRow ${sunk(letter) ? "sunk" : ""}`}>
          <div className="shipLetter" title={SHIPS[letter].name}>
            {letter}
          </div>
          <div className="hitBoxes">
            {player.damage[letter].map((val, i) => (
              <input
                key={`${letter}-${i}`}
                className="hitInput"
                inputMode="numeric"
                pattern="\d*"
                placeholder="__"
                value={val}
                readOnly={!!readOnlyDamage}
                onChange={(e) => {
                  if (readOnlyDamage) return;
                  onDamageChange(letter, i, e.target.value);
                }}
                title={
                  readOnlyDamage
                    ? `${letter} hits (auto-calculated)`
                    : `${letter} hit ${i + 1} (2 digits)`
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);