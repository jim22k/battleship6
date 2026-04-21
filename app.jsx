/* global React, ReactDOM */

const LS_KEY = "battleship_recorder_v1";
const SCHEMA_VERSION = 2;

const MODES = {
  SETUP_PLAYERS: "SETUP_PLAYERS",
  PLACE_SHIPS: "PLACE_SHIPS",
  RECORD_SHOTS: "RECORD_SHOTS",
};

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
  "#7dd3fc",
  "#fda4af",
  "#c4b5fd",
  "#86efac",
  "#fcd34d",
  "#f9a8d4",
  "#a7f3d0",
  "#93c5fd",
  "#fdba74",
  "#e9d5ff",
  "#bef264",
  "#fecaca",
];

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function cellId(r, c) {
  return `${r}-${c}`;
}

function colorForRound(r) {
  return ROUND_COLORS[(r - 1) % ROUND_COLORS.length];
}

function makeEmptyDamage() {
  return Object.fromEntries(Object.keys(SHIPS).map((letter) => [letter, Array(SHIPS[letter].length).fill("")]));
}

function makeDefaultPlayers() {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `p${i + 1}`,
    name: "",
    damage: makeEmptyDamage(),
  }));
}

function makeInitialState() {
  return {
    version: SCHEMA_VERSION,
    mode: MODES.SETUP_PLAYERS,
    setup: {
      playerCount: 2,
      userPlayerId: null,
    },
    rounds: {
      current: 1,
      recording: 1,
      highlights: [],
      playerByRound: {},
    },
    shotsByCell: {},
    shotsByRound: {},
    ships: {
      placed: {
        A: null,
        B: null,
        C: null,
        D: null,
        S: null,
      },
      byCell: {},
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

function normalizeDamageTrack(track, expectedLength) {
  const filled = (Array.isArray(track) ? track : [])
    .filter((v) => v !== "")
    .map((v) => String(v))
    .sort((a, b) => Number(a) - Number(b));

  return [...filled, ...Array(Math.max(0, expectedLength - filled.length)).fill("")].slice(0, expectedLength);
}

function normalizeDamageMap(damage) {
  return Object.fromEntries(
    Object.keys(SHIPS).map((letter) => [letter, normalizeDamageTrack(damage?.[letter], SHIPS[letter].length)])
  );
}

function normalizePlayer(rawPlayer, idx) {
  return {
    id: rawPlayer?.id || `p${idx + 1}`,
    name: typeof rawPlayer?.name === "string" ? rawPlayer.name : "",
    damage: normalizeDamageMap(rawPlayer?.damage),
  };
}

function inferPlayerCount(players) {
  let lastNamedIdx = -1;
  players.forEach((player, idx) => {
    if (player.name.trim()) lastNamedIdx = idx;
  });
  return clamp(lastNamedIdx + 1 || 2, 2, 6);
}

function getActivePlayers(players, playerCount) {
  return players.slice(0, clamp(playerCount, 2, 6));
}

function buildShipsByCell(placed) {
  const byCell = {};
  for (const [letter, info] of Object.entries(placed)) {
    if (!info || !Array.isArray(info.cells)) continue;
    for (const id of info.cells) byCell[id] = letter;
  }
  return byCell;
}

function rebuildShotsByCellFromRounds(shotsByRound) {
  const rebuilt = {};
  for (const [rk, arr] of Object.entries(shotsByRound || {})) {
    const round = Number(rk);
    if (!Number.isFinite(round) || !Array.isArray(arr)) continue;
    for (const id of arr) rebuilt[id] = round;
  }
  return rebuilt;
}

function rebuildShotsByRoundFromCells(shotsByCell) {
  const rebuilt = {};
  for (const [id, round] of Object.entries(shotsByCell || {})) {
    const roundNum = Number(round);
    if (!Number.isFinite(roundNum)) continue;
    if (!rebuilt[roundNum]) rebuilt[roundNum] = [];
    rebuilt[roundNum].push(id);
  }
  return rebuilt;
}

function inferRoundAssignments(maxRound, activePlayers) {
  const playerByRound = {};
  if (!activePlayers.length) return playerByRound;

  for (let round = 1; round <= maxRound; round += 1) {
    playerByRound[round] = activePlayers[(round - 1) % activePlayers.length].id;
  }

  return playerByRound;
}

function migrateLegacyState(legacy) {
  const base = makeInitialState();
  const normalizedPlayers = (Array.isArray(legacy.players) ? legacy.players : makeDefaultPlayers()).map(normalizePlayer);
  const playerCount = inferPlayerCount(normalizedPlayers);
  const allShipsPlaced = Object.keys(SHIPS).every((letter) => legacy.ships?.placed?.[letter]);
  const activePlayers = getActivePlayers(normalizedPlayers, playerCount);

  const rounds = {
    current: typeof legacy.rounds?.current === "number" ? legacy.rounds.current : 1,
    recording: typeof legacy.rounds?.recording === "number" ? legacy.rounds.recording : 1,
    highlights: Array.isArray(legacy.rounds?.highlights) ? legacy.rounds.highlights : [],
    playerByRound: {},
  };

  const shotsByRound =
    legacy.shotsByRound && Object.keys(legacy.shotsByRound).length > 0
      ? legacy.shotsByRound
      : rebuildShotsByRoundFromCells(legacy.shotsByCell);
  const maxRound = Math.max(
    1,
    rounds.current,
    ...Object.keys(shotsByRound || {})
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n))
  );
  rounds.playerByRound = inferRoundAssignments(maxRound, activePlayers);

  return {
    ...base,
    version: SCHEMA_VERSION,
    mode:
      legacy.mode === MODES.RECORD_SHOTS
        ? MODES.RECORD_SHOTS
        : allShipsPlaced
          ? MODES.PLACE_SHIPS
          : MODES.SETUP_PLAYERS,
    setup: {
      playerCount,
      userPlayerId: activePlayers[0]?.id ?? null,
    },
    rounds,
    shotsByCell: legacy.shotsByCell || {},
    shotsByRound,
    ships: {
      placed: {
        A: legacy.ships?.placed?.A ?? null,
        B: legacy.ships?.placed?.B ?? null,
        C: legacy.ships?.placed?.C ?? null,
        D: legacy.ships?.placed?.D ?? null,
        S: legacy.ships?.placed?.S ?? null,
      },
      byCell: legacy.ships?.byCell || {},
    },
    ui: {
      placement: {
        selectedShip: legacy.ui?.placement?.selectedShip || "A",
        orientation: legacy.ui?.placement?.orientation || "H",
      },
    },
    players: normalizedPlayers,
  };
}

function normalizeState(rawState) {
  const base = makeInitialState();
  const requestedMode = Object.values(MODES).includes(rawState.mode) ? rawState.mode : null;

  const playersSource = Array.isArray(rawState.players) ? rawState.players.slice(0, 6) : [];
  const players = Array.from({ length: 6 }, (_, idx) => normalizePlayer(playersSource[idx], idx));

  const setup = {
    playerCount: clamp(Number(rawState.setup?.playerCount) || inferPlayerCount(players), 2, 6),
    userPlayerId: typeof rawState.setup?.userPlayerId === "string" ? rawState.setup.userPlayerId : null,
  };
  const activePlayers = getActivePlayers(players, setup.playerCount);
  const activePlayerIds = new Set(activePlayers.map((player) => player.id));
  if (!activePlayerIds.has(setup.userPlayerId)) {
    setup.userPlayerId = requestedMode === MODES.SETUP_PLAYERS ? null : activePlayers[0]?.id ?? null;
  }

  const shotsByRound =
    rawState.shotsByRound && Object.keys(rawState.shotsByRound).length > 0
      ? rawState.shotsByRound
      : rebuildShotsByRoundFromCells(rawState.shotsByCell);
  const shotsByCell =
    rawState.shotsByRound && Object.keys(rawState.shotsByRound).length > 0
      ? rebuildShotsByCellFromRounds(rawState.shotsByRound)
      : { ...(rawState.shotsByCell || {}) };

  const placed = {
    A: rawState.ships?.placed?.A ?? null,
    B: rawState.ships?.placed?.B ?? null,
    C: rawState.ships?.placed?.C ?? null,
    D: rawState.ships?.placed?.D ?? null,
    S: rawState.ships?.placed?.S ?? null,
  };

  const rounds = {
    current: typeof rawState.rounds?.current === "number" ? rawState.rounds.current : 1,
    recording: typeof rawState.rounds?.recording === "number" ? rawState.rounds.recording : 1,
    highlights: Array.isArray(rawState.rounds?.highlights) ? rawState.rounds.highlights : [],
    playerByRound: { ...(rawState.rounds?.playerByRound || {}) },
  };

  const maxRound = Math.max(
    1,
    rounds.current,
    ...Object.keys(shotsByRound)
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n)),
    ...Object.keys(rounds.playerByRound)
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n))
  );

  rounds.current = clamp(rounds.current, 1, maxRound);
  rounds.recording = clamp(rounds.recording, 1, maxRound);

  const inferredAssignments = inferRoundAssignments(maxRound, activePlayers);
  for (let round = 1; round <= maxRound; round += 1) {
    const playerId = rounds.playerByRound[round];
    rounds.playerByRound[round] = activePlayerIds.has(playerId) ? playerId : inferredAssignments[round] ?? null;
  }

  const allShipsPlaced = Object.keys(SHIPS).every((letter) => !!placed[letter]);
  const normalizedMode = requestedMode || (allShipsPlaced ? MODES.RECORD_SHOTS : MODES.SETUP_PLAYERS);

  return {
    ...base,
    version: SCHEMA_VERSION,
    mode: normalizedMode,
    setup,
    rounds,
    shotsByCell,
    shotsByRound,
    ships: {
      placed,
      byCell: buildShipsByCell(placed),
    },
    ui: {
      placement: {
        selectedShip: rawState.ui?.placement?.selectedShip || "A",
        orientation: rawState.ui?.placement?.orientation || "H",
      },
    },
    players,
  };
}

function tryLoadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version === 1) return normalizeState(migrateLegacyState(parsed));
    if (parsed.version !== SCHEMA_VERSION) return null;

    return normalizeState(parsed);
  } catch {
    return null;
  }
}

function computeMainPlayerDamage(shipsPlaced, shotsByCell) {
  const damage = makeEmptyDamage();

  for (const letter of Object.keys(SHIPS)) {
    const placed = shipsPlaced[letter];
    if (!placed || !Array.isArray(placed.cells)) continue;

    const hits = [];
    placed.cells.forEach((id, idx) => {
      const round = shotsByCell[id];
      if (round != null) hits.push({ round: Number(round), idx });
    });

    hits.sort((a, b) => (a.round - b.round) || (a.idx - b.idx));

    for (let i = 0; i < Math.min(hits.length, damage[letter].length); i += 1) {
      damage[letter][i] = String(hits[i].round);
    }
  }

  return damage;
}

function toggleDamageTrackHit(track, clickedIdx, roundNumber) {
  const nextTrack = [...track];
  const roundValue = String(roundNumber);
  const clickedValue = nextTrack[clickedIdx];

  if (clickedValue === "") {
    const targetIdx = nextTrack.findIndex((v) => v === "");
    if (targetIdx === -1) return nextTrack;
    nextTrack[targetIdx] = roundValue;
    return nextTrack;
  }

  const removableIdx = [...nextTrack].reverse().findIndex((v) => v === roundValue);
  if (removableIdx === -1) return nextTrack;

  const actualIdx = nextTrack.length - 1 - removableIdx;
  nextTrack[actualIdx] = "";
  return normalizeDamageTrack(nextTrack, nextTrack.length);
}

function useDebouncedEffect(effect, deps, delayMs) {
  React.useEffect(() => {
    const timeoutId = setTimeout(() => effect(), delayMs);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function computeFootprint(anchorR, anchorC, shipLetter, orientationKey) {
  const len = SHIPS[shipLetter].length;
  const { dr, dc } = ORIENTATIONS[orientationKey];
  const cells = [];
  for (let i = 0; i < len; i += 1) {
    const r = anchorR + dr * i;
    const c = anchorC + dc * i;
    cells.push({ r, c, id: cellId(r, c) });
  }
  return cells;
}

function isInBounds(r, c) {
  return r >= 0 && r < 10 && c >= 1 && c <= 10;
}

function getRoundShots(shotsByRound, roundNumber) {
  return Array.isArray(shotsByRound?.[roundNumber]) ? shotsByRound[roundNumber] : [];
}

function getShipDamageAtRound(playerDamage, shipLetter, completedThroughRound) {
  return (playerDamage[shipLetter] || []).filter((value) => value !== "" && Number(value) <= completedThroughRound);
}

function isShipSunkByRound(playerDamage, shipLetter, roundNumber) {
  return getShipDamageAtRound(playerDamage, shipLetter, roundNumber - 1).length >= SHIPS[shipLetter].length;
}

function countActiveShipsForRound(playerDamage, roundNumber) {
  return Object.keys(SHIPS).filter((letter) => !isShipSunkByRound(playerDamage, letter, roundNumber)).length;
}

function getRoundPlayerId(roundNumber, rounds, activePlayers) {
  if (rounds.playerByRound?.[roundNumber]) return rounds.playerByRound[roundNumber];
  if (!activePlayers.length) return null;
  return activePlayers[(roundNumber - 1) % activePlayers.length].id;
}

function getPlayerDisplayName(player, fallbackIdx) {
  if (!player) return fallbackIdx >= 0 ? `Player ${fallbackIdx + 1}` : "Unknown player";
  return player.name.trim() || `Player ${fallbackIdx + 1}`;
}

function findNextEligiblePlayerId({ roundNumber, currentPlayerId, activePlayers, damageByPlayer }) {
  if (!activePlayers.length) return null;

  const startIdx = Math.max(
    0,
    activePlayers.findIndex((player) => player.id === currentPlayerId)
  );

  for (let offset = 1; offset <= activePlayers.length; offset += 1) {
    const candidate = activePlayers[(startIdx + offset) % activePlayers.length];
    const damage = damageByPlayer[candidate.id];
    if (damage && countActiveShipsForRound(damage, roundNumber) > 0) return candidate.id;
  }

  return null;
}

function App() {
  const [state, setState] = React.useState(() => tryLoadState() ?? makeInitialState());
  const [hoverCell, setHoverCell] = React.useState(null);

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

  const activePlayers = React.useMemo(
    () => getActivePlayers(state.players, state.setup.playerCount),
    [state.players, state.setup.playerCount]
  );

  const activePlayerIds = React.useMemo(() => new Set(activePlayers.map((player) => player.id)), [activePlayers]);

  const boardOwnerId = React.useMemo(() => {
    if (activePlayerIds.has(state.setup.userPlayerId)) return state.setup.userPlayerId;
    return activePlayers[0]?.id ?? null;
  }, [activePlayerIds, activePlayers, state.setup.userPlayerId]);

  const allShipsPlaced = React.useMemo(
    () => Object.keys(SHIPS).every((letter) => !!state.ships.placed[letter]),
    [state.ships.placed]
  );

  const mainPlayerDamage = React.useMemo(
    () => computeMainPlayerDamage(state.ships.placed, state.shotsByCell),
    [state.ships.placed, state.shotsByCell]
  );

  const damageByPlayer = React.useMemo(() => {
    const map = {};
    activePlayers.forEach((player) => {
      map[player.id] = player.id === boardOwnerId ? mainPlayerDamage : player.damage;
    });
    return map;
  }, [activePlayers, boardOwnerId, mainPlayerDamage]);

  const maxRoundSeen = React.useMemo(() => {
    const roundKeys = Object.keys(state.shotsByRound)
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n));
    const ownerKeys = Object.keys(state.rounds.playerByRound || {})
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n));
    return Math.max(1, state.rounds.current, ...roundKeys, ...ownerKeys);
  }, [state.shotsByRound, state.rounds.current, state.rounds.playerByRound]);

  const highlightsSet = React.useMemo(() => new Set(state.rounds.highlights), [state.rounds.highlights]);

  const placementPreview = React.useMemo(() => {
    if (!hoverCell || state.mode !== MODES.PLACE_SHIPS) return { cells: [], valid: true };

    const ship = state.ui.placement.selectedShip;
    const orientation = state.ui.placement.orientation;
    if (!ship || !SHIPS[ship]) return { cells: [], valid: true };

    const candidate = computeFootprint(hoverCell.r, hoverCell.c, ship, orientation);

    for (const cell of candidate) {
      if (!isInBounds(cell.r, cell.c)) return { cells: candidate, valid: false };
    }

    for (const cell of candidate) {
      const occupiedBy = state.ships.byCell[cell.id];
      if (occupiedBy && occupiedBy !== ship) return { cells: candidate, valid: false };
    }

    return { cells: candidate, valid: true };
  }, [hoverCell, state.mode, state.ui.placement, state.ships.byCell]);

  const setupComplete = React.useMemo(() => {
    if (!activePlayerIds.has(state.setup.userPlayerId)) return false;
    return activePlayers.every((player) => player.name.trim() !== "");
  }, [activePlayerIds, activePlayers, state.setup.userPlayerId]);

  const recordingRound = state.rounds.recording;
  const currentRound = state.rounds.current;
  const recordingPlayerId = React.useMemo(
    () => getRoundPlayerId(recordingRound, state.rounds, activePlayers),
    [recordingRound, state.rounds, activePlayers]
  );
  const currentPlayerId = React.useMemo(
    () => getRoundPlayerId(currentRound, state.rounds, activePlayers),
    [currentRound, state.rounds, activePlayers]
  );

  const recordingRoundShots = getRoundShots(state.shotsByRound, recordingRound).length;
  const currentRoundShots = getRoundShots(state.shotsByRound, currentRound).length;
  const recordingShotLimit = recordingPlayerId ? countActiveShipsForRound(damageByPlayer[recordingPlayerId], recordingRound) : 0;
  const currentShotLimit = currentPlayerId ? countActiveShipsForRound(damageByPlayer[currentPlayerId], currentRound) : 0;
  const nextRoundNumber = currentRound + 1;
  const nextRoundPlayerId = React.useMemo(
    () =>
      currentPlayerId
        ? findNextEligiblePlayerId({
            roundNumber: nextRoundNumber,
            currentPlayerId,
            activePlayers,
            damageByPlayer,
          })
        : null,
    [activePlayers, currentPlayerId, damageByPlayer, nextRoundNumber]
  );

  const currentRoundComplete =
    currentShotLimit === 0 ? true : currentRoundShots === currentShotLimit;
  const canAdvanceRound =
    state.mode === MODES.RECORD_SHOTS && currentRoundComplete && !!nextRoundPlayerId;

  const modeTag =
    state.mode === MODES.SETUP_PLAYERS
      ? { text: "PLAYER SETUP", cls: "warn" }
      : state.mode === MODES.PLACE_SHIPS
        ? { text: "SHIP PLACEMENT", cls: "warn" }
        : { text: "RECORDING SHOTS", cls: "ok" };

  function toggleHighlightRound(round) {
    setState((prev) => {
      const nextHighlights = new Set(prev.rounds.highlights);
      if (nextHighlights.has(round)) nextHighlights.delete(round);
      else nextHighlights.add(round);
      return {
        ...prev,
        rounds: {
          ...prev.rounds,
          highlights: Array.from(nextHighlights).sort((a, b) => a - b),
        },
      };
    });
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
    setState((prev) => ({
      ...prev,
      ui: { ...prev.ui, placement: { ...prev.ui.placement, selectedShip: letter } },
    }));
  }

  function setPlacementOrientation(orientation) {
    setState((prev) => ({
      ...prev,
      ui: { ...prev.ui, placement: { ...prev.ui.placement, orientation } },
    }));
  }

  function setPlayerCount(value) {
    setState((prev) => {
      if (prev.mode !== MODES.SETUP_PLAYERS) return prev;
      const playerCount = clamp(value, 2, 6);
      const active = getActivePlayers(prev.players, playerCount);
      const activeIds = new Set(active.map((player) => player.id));
      const userPlayerId = activeIds.has(prev.setup.userPlayerId) ? prev.setup.userPlayerId : null;

      return {
        ...prev,
        setup: {
          ...prev.setup,
          playerCount,
          userPlayerId,
        },
      };
    });
  }

  function setUserPlayerId(playerId) {
    setState((prev) => {
      if (prev.mode !== MODES.SETUP_PLAYERS) return prev;
      const activeIds = new Set(getActivePlayers(prev.players, prev.setup.playerCount).map((player) => player.id));
      if (!activeIds.has(playerId)) return prev;
      return {
        ...prev,
        setup: {
          ...prev.setup,
          userPlayerId: playerId,
        },
      };
    });
  }

  function updatePlayerName(idx, value) {
    setState((prev) => {
      if (prev.mode !== MODES.SETUP_PLAYERS) return prev;
      const players = prev.players.map((player, playerIdx) => (
        playerIdx === idx ? { ...player, name: value } : player
      ));
      return { ...prev, players };
    });
  }

  function enterPlacement() {
    setState((prev) => {
      const active = getActivePlayers(prev.players, prev.setup.playerCount);
      const namesReady = active.every((player) => player.name.trim() !== "");
      const activeIds = new Set(active.map((player) => player.id));
      if (!namesReady || !activeIds.has(prev.setup.userPlayerId)) return prev;
      return { ...prev, mode: MODES.PLACE_SHIPS };
    });
  }

  function backToSetup() {
    setState((prev) => ({ ...prev, mode: MODES.SETUP_PLAYERS }));
  }

  function startGame() {
    setState((prev) => {
      const active = getActivePlayers(prev.players, prev.setup.playerCount);
      if (!active.length) return prev;
      const namesReady = active.every((player) => player.name.trim() !== "");
      const activeIds = new Set(active.map((player) => player.id));
      if (!namesReady || !activeIds.has(prev.setup.userPlayerId)) return prev;

      const shipsPlaced = Object.keys(SHIPS).every((letter) => !!prev.ships.placed[letter]);
      if (!shipsPlaced) return prev;

      return {
        ...prev,
        mode: MODES.RECORD_SHOTS,
        rounds: {
          current: 1,
          recording: 1,
          highlights: [],
          playerByRound: { 1: active[0].id },
        },
      };
    });
  }

  function setRecordingRound(round) {
    setState((prev) => ({
      ...prev,
      rounds: {
        ...prev.rounds,
        recording: clamp(round, 1, maxRoundSeen),
      },
    }));
  }

  function nextRound() {
    if (!canAdvanceRound || !nextRoundPlayerId) return;

    setState((prev) => ({
      ...prev,
      rounds: {
        ...prev.rounds,
        current: nextRoundNumber,
        recording: nextRoundNumber,
        playerByRound: {
          ...prev.rounds.playerByRound,
          [nextRoundNumber]: nextRoundPlayerId,
        },
      },
    }));
  }

  function commitShipPlacement(anchorR, anchorC) {
    const ship = state.ui.placement.selectedShip;
    const orientation = state.ui.placement.orientation;
    if (!ship) return;

    const candidate = computeFootprint(anchorR, anchorC, ship, orientation);
    for (const cell of candidate) {
      if (!isInBounds(cell.r, cell.c)) return;
    }

    setState((prev) => {
      const previousPlacement = prev.ships.placed[ship];
      const previousCells = previousPlacement?.cells ? [...previousPlacement.cells] : [];
      const byCell = { ...prev.ships.byCell };

      for (const id of previousCells) {
        if (byCell[id] === ship) delete byCell[id];
      }

      for (const cell of candidate) {
        const occupiedBy = byCell[cell.id];
        if (occupiedBy && occupiedBy !== ship) {
          return prev;
        }
      }

      for (const cell of candidate) byCell[cell.id] = ship;

      const placed = {
        ...prev.ships.placed,
        [ship]: {
          anchor: cellId(anchorR, anchorC),
          orientation,
          cells: candidate.map((cell) => cell.id),
        },
      };

      const nextShip = Object.keys(SHIPS).find((letter) => !placed[letter]) ?? ship;

      return {
        ...prev,
        ships: {
          ...prev.ships,
          placed,
          byCell,
        },
        ui: {
          ...prev.ui,
          placement: {
            ...prev.ui.placement,
            selectedShip: nextShip,
          },
        },
      };
    });
  }

  function handleCellClick(r, c) {
    const id = cellId(r, c);

    if (state.mode === MODES.PLACE_SHIPS) {
      commitShipPlacement(r, c);
      return;
    }

    if (state.mode !== MODES.RECORD_SHOTS) return;

    const existingRound = state.shotsByCell[id];

    if (existingRound != null) {
      if (Number(existingRound) !== Number(recordingRound)) return;

      setState((prev) => {
        const shotsByCell = { ...prev.shotsByCell };
        delete shotsByCell[id];

        const shotsByRound = { ...prev.shotsByRound };
        const roundShots = getRoundShots(shotsByRound, recordingRound).filter((shotId) => shotId !== id);
        shotsByRound[recordingRound] = roundShots;

        return { ...prev, shotsByCell, shotsByRound };
      });
      return;
    }

    if (!recordingPlayerId || recordingRoundShots >= recordingShotLimit) return;

    setState((prev) => {
      const shotsByCell = { ...prev.shotsByCell, [id]: recordingRound };
      const shotsByRound = { ...prev.shotsByRound };
      shotsByRound[recordingRound] = [...getRoundShots(shotsByRound, recordingRound), id];
      return { ...prev, shotsByCell, shotsByRound };
    });
  }

  function handleCellHover(r, c) {
    setHoverCell({ r, c, id: cellId(r, c) });
  }

  function clearHover() {
    setHoverCell(null);
  }

  function togglePlayerDamage(idx, shipLetter, hitIdx) {
    setState((prev) => {
      if (prev.mode !== MODES.RECORD_SHOTS) return prev;
      const player = prev.players[idx];
      if (!player || player.id === boardOwnerId) return prev;

      const playerDamage = player.damage[shipLetter];
      const nextTrack = toggleDamageTrackHit(playerDamage, hitIdx, prev.rounds.recording);
      const players = prev.players.map((candidate, candidateIdx) => (
        candidateIdx === idx
          ? { ...candidate, damage: { ...candidate.damage, [shipLetter]: nextTrack } }
          : candidate
      ));

      return { ...prev, players };
    });
  }

  const recordingPlayer = activePlayers.find((player) => player.id === recordingPlayerId) || null;
  const boardOwnerPlayer = activePlayers.find((player) => player.id === boardOwnerId) || null;
  const nextRoundPlayer = activePlayers.find((player) => player.id === nextRoundPlayerId) || null;
  const playerLayoutClass = activePlayers.length <= 3 ? "compactPlayers" : "crowdedPlayers";

  return (
    <div className={`app ${playerLayoutClass}`}>
      <div className="topbar">
        {state.mode === MODES.SETUP_PLAYERS ? (
          <div className="controls">
            <div className="badge">
              <div className="label">Players</div>
              <select
                className="select"
                value={state.setup.playerCount}
                onChange={(e) => setPlayerCount(Number(e.target.value))}
              >
                {Array.from({ length: 5 }, (_, idx) => idx + 2).map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : state.mode === MODES.PLACE_SHIPS ? (
          <div className="controls">
            <div className="badge">
              <div className="label">Ship</div>
              <select
                className="select"
                value={state.ui.placement.selectedShip}
                onChange={(e) => setPlacementSelectedShip(e.target.value)}
              >
                {Object.keys(SHIPS).map((letter) => (
                  <option key={letter} value={letter}>
                    {letter} = {SHIPS[letter].name} ({SHIPS[letter].length})
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
                {Object.entries(ORIENTATIONS).map(([key, orientation]) => (
                  <option key={key} value={key}>
                    {orientation.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <>
            <div className="badge" title="New shots will be recorded to this round">
              <div className="label">Recording</div>
              <select
                className="select"
                value={state.rounds.recording}
                onChange={(e) => setRecordingRound(Number(e.target.value))}
              >
                {Array.from({ length: maxRoundSeen }, (_, idx) => idx + 1).map((round) => (
                  <option key={round} value={round}>
                    {round}
                  </option>
                ))}
              </select>
            </div>

            <div className="badge">
              <div className="label">Round</div>
              <div className="value">{state.rounds.current}</div>
            </div>

            <div className="badge">
              <div className="label">Turn</div>
              <div className="value playerValue">
                {recordingPlayer ? getPlayerDisplayName(recordingPlayer, activePlayers.indexOf(recordingPlayer)) : "-"}
              </div>
            </div>

            <div className="badge">
              <div className="label">Shots</div>
              <div className="value">
                {recordingRoundShots}/{recordingShotLimit}
              </div>
            </div>

            <button
              className="btn primary"
              onClick={nextRound}
              disabled={!canAdvanceRound}
              title={
                !nextRoundPlayer
                  ? "No remaining players have active ships."
                  : currentRoundComplete
                    ? `Advance to ${getPlayerDisplayName(nextRoundPlayer, activePlayers.indexOf(nextRoundPlayer))}`
                    : `Take ${currentShotLimit} shots before advancing.`
              }
            >
              Next Round
            </button>
          </>
        )}

        {state.mode !== MODES.RECORD_SHOTS ? (
          <span className={`modeTag ${modeTag.cls}`}>{modeTag.text}</span>
        ) : null}

        <div className="spacer" />

        {state.mode === MODES.SETUP_PLAYERS ? (
          <button
            className={setupComplete ? "btn primary" : "btn"}
            onClick={enterPlacement}
            disabled={!setupComplete}
            title={setupComplete ? "Continue to ship placement" : "Add names for all active players and choose yourself."}
          >
            Next
          </button>
        ) : null}

        {state.mode === MODES.PLACE_SHIPS ? (
          <>
            <button className="btn" onClick={backToSetup}>
              Back
            </button>
            <button
              className={allShipsPlaced ? "btn primary" : "btn"}
              onClick={startGame}
              disabled={!allShipsPlaced}
              title={allShipsPlaced ? "Start recording shots" : "Place all ships first"}
            >
              Start Game
            </button>
          </>
        ) : null}

        <button className="btn danger" onClick={clearAll}>
          Clear All Data
        </button>
      </div>

      {state.mode === MODES.SETUP_PLAYERS ? (
        <div className="main singleColumn">
          <div className="card setupCard">
            <h2>Game Setup</h2>
            <p className="setupIntro">
              Enter the players in turn order, then mark which one is you.
            </p>

            <div className="setupPlayers">
              {activePlayers.map((player, idx) => (
                <div key={player.id} className="setupPlayerRow">
                  <div className="setupIndex">{idx + 1}</div>
                  <input
                    className="textInput"
                    value={player.name}
                    onChange={(e) => updatePlayerName(idx, e.target.value)}
                    placeholder={`Player ${idx + 1} name`}
                  />
                  <label className="meToggle">
                    <input
                      type="radio"
                      name="userPlayer"
                      checked={state.setup.userPlayerId === player.id}
                      onChange={() => setUserPlayerId(player.id)}
                    />
                    <span>This is me</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className={`main ${playerLayoutClass}`}>
          <div className="card">
            <div className="gridWrap">
              {state.mode === MODES.RECORD_SHOTS ? (
                <div className="recordingSummary">
                  <div className="pills">
                    <div className="helperText">Round highlights:</div>
                    {Array.from({ length: maxRoundSeen }, (_, idx) => idx + 1).map((round) => {
                      const on = highlightsSet.has(round);
                      const style = on
                        ? { background: colorForRound(round), borderColor: "rgba(255,255,255,0.35)" }
                        : undefined;
                      return (
                        <div
                          key={round}
                          className={`pill ${on ? "on" : ""} ${round === state.rounds.current ? "current" : ""}`}
                          style={style}
                          onClick={() => toggleHighlightRound(round)}
                          title="Toggle highlight"
                        >
                          {round}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="helperText">
                  Place your ships before starting the game.
                </div>
              )}

              <BoardGrid
                mode={state.mode}
                shotsByCell={state.shotsByCell}
                shipsByCell={state.ships.byCell}
                highlights={highlightsSet}
                placementPreview={placementPreview}
                recordingRound={recordingRound}
                recordingShotLimit={recordingShotLimit}
                recordingRoundShots={recordingRoundShots}
                onCellClick={handleCellClick}
                onCellHover={handleCellHover}
                onCellLeave={clearHover}
              />
            </div>
          </div>

          <div className="card">
            <h2>Players</h2>
            <div className="players">
              {activePlayers.map((player, idx) => (
                <PlayerCard
                  key={player.id}
                  idx={idx}
                  player={{
                    ...player,
                    damage: player.id === boardOwnerId ? mainPlayerDamage : player.damage,
                  }}
                  isUserPlayer={player.id === boardOwnerId}
                  isActivePlayer={player.id === recordingPlayerId}
                  damageEditable={state.mode === MODES.RECORD_SHOTS && player.id !== boardOwnerId}
                  recordingRound={recordingRound}
                  onDamageToggle={(ship, hitIdx) => togglePlayerDamage(idx, ship, hitIdx)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
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
  recordingShotLimit,
  recordingRoundShots,
  onCellClick,
  onCellHover,
  onCellLeave,
}) {
  const previewSet = React.useMemo(() => {
    const set = new Set();
    for (const cell of placementPreview.cells) set.add(cell.id);
    return set;
  }, [placementPreview.cells]);

  const previewValid = placementPreview.valid;

  return (
    <div className="boardScroller">
      <div className="grid" onMouseLeave={onCellLeave}>
        <div />

        {Array.from({ length: 10 }, (_, idx) => idx + 1).map((col) => (
          <div key={`ch-${col}`} className="colHeader">
            {col}
          </div>
        ))}

        {ROW_WORDS.map((rowLabel, r) => (
          <React.Fragment key={`row-${r}`}>
            <div className="rowHeader">{rowLabel}</div>
            {Array.from({ length: 10 }, (_, idx) => idx + 1).map((c) => {
              const id = cellId(r, c);
              const shotRound = shotsByCell[id];
              const ship = shipsByCell[id];
              const isPreview = mode === MODES.PLACE_SHIPS && previewSet.has(id);
              const isHighlighted = shotRound != null && highlights.has(Number(shotRound));
              const highlightColor = isHighlighted ? colorForRound(Number(shotRound)) : null;
              const canRemove =
                mode === MODES.RECORD_SHOTS && shotRound != null && Number(shotRound) === Number(recordingRound);
              const shotQuotaReached = mode === MODES.RECORD_SHOTS && shotRound == null && recordingRoundShots >= recordingShotLimit;

              const titleParts = [`${ROW_WORDS[r]}-${c}`];
              if (ship) titleParts.push(`Ship: ${ship}`);
              if (shotRound != null) titleParts.push(`Shot: round ${shotRound}`);
              if (mode === MODES.RECORD_SHOTS && shotRound != null) {
                titleParts.push(canRemove ? "Click to remove (recording round)" : "Locked (different round)");
              }
              if (mode === MODES.RECORD_SHOTS && shotRound == null && shotQuotaReached) {
                titleParts.push("This round already has the maximum number of shots.");
              }
              if (mode === MODES.PLACE_SHIPS && isPreview) {
                titleParts.push(previewValid ? "Click to place ship" : "Invalid placement");
              }

              return (
                <div
                  key={id}
                  className={`cell ${shotQuotaReached ? "disabled" : ""}`}
                  title={titleParts.join(" • ")}
                  onClick={() => onCellClick(r, c)}
                  onMouseEnter={() => onCellHover(r, c)}
                >
                  {ship ? <div className={`shipMark ${shotRound != null ? "hit" : ""}`}>{ship}</div> : null}
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

        <div />
        {Array.from({ length: 10 }, (_, idx) => idx + 1).map((col) => (
          <div key={`cb-${col}`} className="colHeader">
            {col}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerCard({ idx, player, isUserPlayer, isActivePlayer, damageEditable, recordingRound, onDamageToggle }) {
  const sunk = (shipLetter) => {
    const arr = player.damage[shipLetter] || [];
    return arr.length > 0 && arr.every((value) => value !== "");
  };

  return (
    <div className={`playerCard ${isUserPlayer ? "userPlayer" : ""} ${isActivePlayer ? "activePlayer" : ""}`}>
      <div className="playerHeader">
        <div className="playerName">{getPlayerDisplayName(player, idx)}</div>
      </div>

      {Object.keys(SHIPS).map((letter) => (
        <div key={letter} className={`shipRow ${sunk(letter) ? "sunk" : ""}`}>
          <div className="shipLetter" title={SHIPS[letter].name}>
            {letter}
          </div>
          <div className="hitBoxes">
            {player.damage[letter].map((value, hitIdx) => (
              <button
                key={`${letter}-${hitIdx}`}
                type="button"
                className={`hitInput ${value !== "" ? "filled" : ""}`}
                disabled={!damageEditable}
                onClick={() => {
                  if (!damageEditable) return;
                  onDamageToggle(letter, hitIdx);
                }}
                title={
                  damageEditable
                    ? `${letter} hit ${hitIdx + 1} • click to mark/unmark round ${recordingRound}`
                    : isUserPlayer
                      ? `${letter} hits are auto-calculated from board shots`
                      : `${letter} hits are locked until shot recording begins`
                }
              >
                {value || ""}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
