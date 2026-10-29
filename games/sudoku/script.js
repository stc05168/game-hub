"use strict";

const GRID_SIZE = 9;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;
const STORAGE_KEY = "sudoku-game-v1";
const PREFERENCE_KEY = "sudoku-difficulty";

const DIFFICULTIES = {
  easy: { label: "Easy", clues: [40, 44], baseScore: 1000, hints: 3 },
  medium: { label: "Medium", clues: [33, 36], baseScore: 1400, hints: 3 },
  hard: { label: "Hard", clues: [27, 30], baseScore: 1800, hints: 3 },
};

const elements = {
  board: document.querySelector("#game-board"),
  loader: document.querySelector("#board-loader"),
  timer: document.querySelector("#timer"),
  score: document.querySelector("#score"),
  accuracy: document.querySelector("#accuracy"),
  newGame: document.querySelector("#new-game-button"),
  undo: document.querySelector("#undo-button"),
  redo: document.querySelector("#redo-button"),
  erase: document.querySelector("#erase-button"),
  hint: document.querySelector("#hint-button"),
  hintCount: document.querySelector("#hint-count"),
  difficultyButtons: [...document.querySelectorAll(".difficulty-button")],
  numberButtons: [...document.querySelectorAll("[data-number]")],
  helpButton: document.querySelector("#help-button"),
  helpDialog: document.querySelector("#help-dialog"),
  resultDialog: document.querySelector("#result-dialog"),
  playAgain: document.querySelector("#play-again-button"),
  finalTime: document.querySelector("#final-time"),
  finalScore: document.querySelector("#final-score"),
  finalAccuracy: document.querySelector("#final-accuracy"),
  toast: document.querySelector("#toast"),
  announcer: document.querySelector("#announcer"),
};

let state = createEmptyState();
let timerId = null;
let generationId = 0;
let toastId = null;
let cells = [];

function createEmptyState() {
  return {
    difficulty: "easy",
    puzzle: Array(CELL_COUNT).fill(0),
    solution: Array(CELL_COUNT).fill(0),
    board: Array(CELL_COUNT).fill(0),
    selectedIndex: -1,
    history: [],
    redoStack: [],
    awardedCells: new Set(),
    hintedCells: new Set(),
    correctAttempts: 0,
    totalAttempts: 0,
    mistakes: 0,
    hintsUsed: 0,
    hintsRemaining: DIFFICULTIES.easy.hints,
    elapsedSeconds: 0,
    completed: false,
    loading: true,
  };
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function generateSolution() {
  const base = [0, 1, 2];
  const rows = shuffled(base).flatMap((band) => shuffled(base).map((row) => band * 3 + row));
  const columns = shuffled(base).flatMap((stack) => shuffled(base).map((column) => stack * 3 + column));
  const numbers = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const pattern = (row, column) => (row * 3 + Math.floor(row / 3) + column) % GRID_SIZE;

  return rows.flatMap((row) => columns.map((column) => numbers[pattern(row, column)]));
}

function getCandidates(board, index) {
  if (board[index] !== 0) return [];

  const row = Math.floor(index / GRID_SIZE);
  const column = index % GRID_SIZE;
  const used = new Set();

  for (let offset = 0; offset < GRID_SIZE; offset += 1) {
    used.add(board[row * GRID_SIZE + offset]);
    used.add(board[offset * GRID_SIZE + column]);
  }

  const boxRow = Math.floor(row / 3) * 3;
  const boxColumn = Math.floor(column / 3) * 3;
  for (let rowOffset = 0; rowOffset < 3; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < 3; columnOffset += 1) {
      used.add(board[(boxRow + rowOffset) * GRID_SIZE + boxColumn + columnOffset]);
    }
  }

  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((number) => !used.has(number));
}

function countSolutions(board, limit = 2) {
  let bestIndex = -1;
  let bestCandidates = null;

  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (board[index] !== 0) continue;
    const candidates = getCandidates(board, index);
    if (candidates.length === 0) return 0;
    if (bestCandidates === null || candidates.length < bestCandidates.length) {
      bestIndex = index;
      bestCandidates = candidates;
      if (candidates.length === 1) break;
    }
  }

  if (bestIndex === -1) return 1;

  let solutions = 0;
  for (const number of bestCandidates) {
    board[bestIndex] = number;
    solutions += countSolutions(board, limit - solutions);
    board[bestIndex] = 0;
    if (solutions >= limit) break;
  }

  return solutions;
}

function generatePuzzle(difficulty) {
  const [minimumClues, maximumClues] = DIFFICULTIES[difficulty].clues;
  const targetClues = minimumClues + Math.floor(Math.random() * (maximumClues - minimumClues + 1));
  let bestResult = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const solution = generateSolution();
    const puzzle = [...solution];
    let clueCount = CELL_COUNT;
    const pairStarts = shuffled(Array.from({ length: 41 }, (_, index) => index));

    for (const firstIndex of pairStarts) {
      const secondIndex = CELL_COUNT - 1 - firstIndex;
      const removalCount = firstIndex === secondIndex ? 1 : 2;
      if (clueCount - removalCount < targetClues) continue;

      const firstValue = puzzle[firstIndex];
      const secondValue = puzzle[secondIndex];
      puzzle[firstIndex] = 0;
      puzzle[secondIndex] = 0;

      if (countSolutions([...puzzle], 2) === 1) {
        clueCount -= removalCount;
      } else {
        puzzle[firstIndex] = firstValue;
        puzzle[secondIndex] = secondValue;
      }

      if (clueCount === targetClues) break;
    }

    if (!bestResult || clueCount < bestResult.clueCount) {
      bestResult = { puzzle, solution, clueCount };
    }
    if (clueCount <= maximumClues) break;
  }

  return bestResult;
}

function createBoardCells() {
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < CELL_COUNT; index += 1) {
    const cell = document.createElement("button");
    const row = Math.floor(index / GRID_SIZE);
    const column = index % GRID_SIZE;
    cell.type = "button";
    cell.className = "cell";
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-rowindex", String(row + 1));
    cell.setAttribute("aria-colindex", String(column + 1));
    cell.dataset.index = String(index);
    cell.style.setProperty("--cell-index", String(index));
    if (column === 2 || column === 5) cell.classList.add("box-right");
    if (row === 2 || row === 5) cell.classList.add("box-bottom");
    cell.addEventListener("click", () => selectCell(index, true));
    cells.push(cell);
    fragment.appendChild(cell);
  }

  elements.board.appendChild(fragment);
}

function isRelated(firstIndex, secondIndex) {
  const firstRow = Math.floor(firstIndex / GRID_SIZE);
  const firstColumn = firstIndex % GRID_SIZE;
  const secondRow = Math.floor(secondIndex / GRID_SIZE);
  const secondColumn = secondIndex % GRID_SIZE;

  return firstRow === secondRow
    || firstColumn === secondColumn
    || (Math.floor(firstRow / 3) === Math.floor(secondRow / 3)
      && Math.floor(firstColumn / 3) === Math.floor(secondColumn / 3));
}

function isFixed(index) {
  return state.puzzle[index] !== 0 || state.hintedCells.has(index);
}

function getCellLabel(index) {
  const row = Math.floor(index / GRID_SIZE) + 1;
  const column = (index % GRID_SIZE) + 1;
  const value = state.board[index];
  const status = state.puzzle[index] !== 0
    ? "given"
    : state.hintedCells.has(index)
      ? "hint"
      : value !== 0 && value !== state.solution[index]
        ? "incorrect"
        : value !== 0
          ? "entered"
          : "empty";

  return `Row ${row}, column ${column}, ${value || "empty"}, ${status}`;
}

function renderBoard({ focus = false } = {}) {
  const selectedValue = state.selectedIndex >= 0 ? state.board[state.selectedIndex] : 0;

  cells.forEach((cell, index) => {
    const value = state.board[index];
    cell.textContent = value || "";
    cell.disabled = state.loading || state.completed;
    cell.tabIndex = index === state.selectedIndex ? 0 : -1;
    cell.setAttribute("aria-label", getCellLabel(index));
    cell.setAttribute("aria-selected", String(index === state.selectedIndex));
    cell.classList.toggle("is-given", state.puzzle[index] !== 0);
    cell.classList.toggle("is-user", value !== 0 && state.puzzle[index] === 0 && !state.hintedCells.has(index));
    cell.classList.toggle("is-hinted", state.hintedCells.has(index));
    cell.classList.toggle("is-error", value !== 0 && value !== state.solution[index]);
    cell.classList.toggle("is-selected", index === state.selectedIndex);
    cell.classList.toggle("is-related", state.selectedIndex >= 0 && index !== state.selectedIndex && isRelated(index, state.selectedIndex));
    cell.classList.toggle("is-same", selectedValue !== 0 && value === selectedValue && index !== state.selectedIndex);
  });

  if (focus && state.selectedIndex >= 0) cells[state.selectedIndex].focus();
}

function selectCell(index, focus = false) {
  if (state.loading || state.completed || index < 0 || index >= CELL_COUNT) return;
  state.selectedIndex = index;
  renderBoard({ focus });
}

function firstEditableCell() {
  return state.board.findIndex((value, index) => value === 0 && !isFixed(index));
}

function calculateAccuracy() {
  if (state.totalAttempts === 0) return 100;
  return Math.round((state.correctAttempts / state.totalAttempts) * 100);
}

function calculateScore() {
  const base = DIFFICULTIES[state.difficulty].baseScore;
  const earned = state.awardedCells.size * 20;
  const penalties = state.mistakes * 50 + state.hintsUsed * 100 + Math.floor(state.elapsedSeconds / 10);
  return Math.max(0, base + earned - penalties);
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateStats() {
  elements.timer.textContent = formatTime(state.elapsedSeconds);
  elements.score.textContent = calculateScore().toLocaleString("en-US");
  elements.accuracy.textContent = `${calculateAccuracy()}%`;
  elements.hintCount.textContent = String(state.hintsRemaining);

  const correctlyPlaced = Array(10).fill(0);
  state.board.forEach((value, index) => {
    if (value !== 0 && value === state.solution[index]) correctlyPlaced[value] += 1;
  });

  elements.numberButtons.forEach((button) => {
    const number = Number(button.dataset.number);
    const remaining = Math.max(0, 9 - correctlyPlaced[number]);
    const badge = button.querySelector(".remaining");
    badge.textContent = String(remaining);
    button.disabled = state.loading || state.completed || remaining === 0;
    button.setAttribute("aria-label", `${number}, ${remaining} remaining`);
  });

  elements.undo.disabled = state.loading || state.completed || state.history.length === 0;
  elements.redo.disabled = state.loading || state.completed || state.redoStack.length === 0;
  elements.erase.disabled = state.loading || state.completed;
  elements.hint.disabled = state.loading || state.completed || state.hintsRemaining === 0;
}

function updateDifficultyButtons() {
  elements.difficultyButtons.forEach((button) => {
    const isActive = button.dataset.difficulty === state.difficulty;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function refresh(options) {
  renderBoard(options);
  updateStats();
  saveGame();
}

function announce(message) {
  elements.announcer.textContent = "";
  window.setTimeout(() => {
    elements.announcer.textContent = message;
  }, 20);
}

function showToast(message) {
  window.clearTimeout(toastId);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastId = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 1800);
}

function enterNumber(number) {
  const index = state.selectedIndex;
  if (state.loading || state.completed || index < 0 || isFixed(index)) return;
  if (state.board[index] === number) return;

  const previousValue = state.board[index];
  const isCorrect = number === state.solution[index];
  state.board[index] = number;
  state.totalAttempts += 1;

  if (isCorrect) {
    state.correctAttempts += 1;
    state.awardedCells.add(index);
    announce(`${number} is correct.`);
  } else {
    state.mistakes += 1;
    announce(`${number} is incorrect.`);
  }

  state.history.push({ index, from: previousValue, to: number, hinted: false });
  state.redoStack = [];
  refresh();
  checkCompletion();
}

function eraseSelected() {
  const index = state.selectedIndex;
  if (state.loading || state.completed || index < 0 || isFixed(index) || state.board[index] === 0) return;

  const previousValue = state.board[index];
  state.board[index] = 0;
  state.history.push({ index, from: previousValue, to: 0, hinted: false });
  state.redoStack = [];
  announce("Cell erased.");
  refresh();
}

function undoMove() {
  const move = state.history.pop();
  if (!move || state.loading || state.completed) return;

  state.board[move.index] = move.from;
  if (move.hinted) state.hintedCells.delete(move.index);
  state.redoStack.push(move);
  state.selectedIndex = move.index;
  announce("Move undone.");
  refresh({ focus: true });
}

function redoMove() {
  const move = state.redoStack.pop();
  if (!move || state.loading || state.completed) return;

  state.board[move.index] = move.to;
  if (move.hinted) state.hintedCells.add(move.index);
  state.history.push(move);
  state.selectedIndex = move.index;
  announce("Move redone.");
  refresh({ focus: true });
  checkCompletion();
}

function useHint() {
  if (state.loading || state.completed || state.hintsRemaining <= 0) return;

  let index = state.selectedIndex;
  if (index < 0 || isFixed(index) || state.board[index] === state.solution[index]) {
    const unsolved = state.board
      .map((value, cellIndex) => ({ value, cellIndex }))
      .filter(({ value, cellIndex }) => value !== state.solution[cellIndex] && !isFixed(cellIndex));
    if (unsolved.length === 0) return;
    index = unsolved[Math.floor(Math.random() * unsolved.length)].cellIndex;
  }

  const previousValue = state.board[index];
  state.board[index] = state.solution[index];
  state.hintedCells.add(index);
  state.hintsRemaining -= 1;
  state.hintsUsed += 1;
  state.history.push({ index, from: previousValue, to: state.solution[index], hinted: true });
  state.redoStack = [];
  state.selectedIndex = index;
  showToast("Hint revealed · −100 points");
  announce(`Hint: row ${Math.floor(index / 9) + 1}, column ${(index % 9) + 1} is ${state.solution[index]}.`);
  refresh({ focus: true });
  checkCompletion();
}

function checkCompletion() {
  if (!state.board.every((value, index) => value === state.solution[index])) return;

  state.completed = true;
  stopTimer();
  renderBoard();
  cells.forEach((cell) => cell.classList.add("is-complete"));
  updateStats();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Completion does not depend on browser storage.
  }

  window.setTimeout(() => {
    elements.finalTime.textContent = formatTime(state.elapsedSeconds);
    elements.finalScore.textContent = calculateScore().toLocaleString("en-US");
    elements.finalAccuracy.textContent = `${calculateAccuracy()}%`;
    elements.resultDialog.showModal();
  }, 800);
}

function moveSelection(key) {
  if (state.selectedIndex < 0) return;
  let row = Math.floor(state.selectedIndex / GRID_SIZE);
  let column = state.selectedIndex % GRID_SIZE;

  if (key === "ArrowUp") row = (row + 8) % 9;
  if (key === "ArrowDown") row = (row + 1) % 9;
  if (key === "ArrowLeft") column = (column + 8) % 9;
  if (key === "ArrowRight") column = (column + 1) % 9;

  selectCell(row * GRID_SIZE + column, true);
}

function handleKeydown(event) {
  if (elements.helpDialog.open || elements.resultDialog.open) return;

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redoMove();
    else undoMove();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redoMove();
    return;
  }

  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    moveSelection(event.key);
    return;
  }

  if (/^[1-9]$/.test(event.key)) {
    event.preventDefault();
    enterNumber(Number(event.key));
    return;
  }

  if (["Backspace", "Delete", "0"].includes(event.key)) {
    event.preventDefault();
    eraseSelected();
  }
}

function startTimer() {
  stopTimer();
  timerId = window.setInterval(() => {
    if (state.loading || state.completed || document.hidden) return;
    state.elapsedSeconds += 1;
    updateStats();
    if (state.elapsedSeconds % 5 === 0) saveGame();
  }, 1000);
}

function stopTimer() {
  if (timerId !== null) window.clearInterval(timerId);
  timerId = null;
}

function hasProgress() {
  return state.history.length > 0 || state.hintsUsed > 0;
}

function requestNewGame(difficulty = state.difficulty) {
  if (!state.completed && !state.loading && hasProgress()) {
    const confirmed = window.confirm("Start a new puzzle? Your current progress will be replaced.");
    if (!confirmed) return false;
  }
  startNewGame(difficulty);
  return true;
}

function startNewGame(difficulty = "easy") {
  const safeDifficulty = Object.hasOwn(DIFFICULTIES, difficulty) ? difficulty : "easy";
  const currentGeneration = ++generationId;
  stopTimer();
  cells.forEach((cell) => cell.classList.remove("is-complete"));
  state = createEmptyState();
  state.difficulty = safeDifficulty;
  state.hintsRemaining = DIFFICULTIES[safeDifficulty].hints;
  elements.board.setAttribute("aria-busy", "true");
  elements.loader.classList.remove("is-hidden");
  updateDifficultyButtons();
  refresh();
  try {
    localStorage.setItem(PREFERENCE_KEY, safeDifficulty);
  } catch {
    // Preferences are optional when browser storage is unavailable.
  }

  window.setTimeout(() => {
    const generated = generatePuzzle(safeDifficulty);
    if (currentGeneration !== generationId) return;

    state.puzzle = generated.puzzle;
    state.solution = generated.solution;
    state.board = [...generated.puzzle];
    state.selectedIndex = firstEditableCell();
    state.loading = false;
    elements.board.setAttribute("aria-busy", "false");
    elements.loader.classList.add("is-hidden");
    refresh();
    startTimer();
    announce(`${DIFFICULTIES[safeDifficulty].label} puzzle ready with ${generated.clueCount} clues.`);
  }, 80);
}

function saveGame() {
  if (state.loading || state.completed || state.solution.every((value) => value === 0)) return;

  const serializableState = {
    ...state,
    awardedCells: [...state.awardedCells],
    hintedCells: [...state.hintedCells],
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableState));
  } catch {
    // The game still works when browser storage is unavailable.
  }
}

function isValidSavedArray(value) {
  return Array.isArray(value)
    && value.length === CELL_COUNT
    && value.every((cell) => Number.isInteger(cell) && cell >= 0 && cell <= 9);
}

function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved
      || !Object.hasOwn(DIFFICULTIES, saved.difficulty)
      || !isValidSavedArray(saved.puzzle)
      || !isValidSavedArray(saved.solution)
      || !isValidSavedArray(saved.board)
      || saved.completed) {
      return false;
    }

    state = {
      ...createEmptyState(),
      ...saved,
      selectedIndex: Number.isInteger(saved.selectedIndex) ? saved.selectedIndex : -1,
      history: Array.isArray(saved.history) ? saved.history : [],
      redoStack: Array.isArray(saved.redoStack) ? saved.redoStack : [],
      awardedCells: new Set(Array.isArray(saved.awardedCells) ? saved.awardedCells : []),
      hintedCells: new Set(Array.isArray(saved.hintedCells) ? saved.hintedCells : []),
      loading: false,
      completed: false,
    };

    if (state.selectedIndex < 0 || state.selectedIndex >= CELL_COUNT) {
      state.selectedIndex = firstEditableCell();
    }

    elements.board.setAttribute("aria-busy", "false");
    elements.loader.classList.add("is-hidden");
    updateDifficultyButtons();
    refresh();
    startTimer();
    showToast("Your saved puzzle was restored");
    return true;
  } catch {
    return false;
  }
}

function closeOnBackdrop(event) {
  if (event.target !== event.currentTarget) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  const inside = event.clientX >= bounds.left
    && event.clientX <= bounds.right
    && event.clientY >= bounds.top
    && event.clientY <= bounds.bottom;
  if (!inside) event.currentTarget.close();
}

function bindEvents() {
  elements.numberButtons.forEach((button) => {
    button.addEventListener("click", () => enterNumber(Number(button.dataset.number)));
  });

  elements.difficultyButtons.forEach((button) => {
    button.addEventListener("click", () => requestNewGame(button.dataset.difficulty));
  });

  elements.newGame.addEventListener("click", () => requestNewGame());
  elements.undo.addEventListener("click", undoMove);
  elements.redo.addEventListener("click", redoMove);
  elements.erase.addEventListener("click", eraseSelected);
  elements.hint.addEventListener("click", useHint);
  elements.helpButton.addEventListener("click", () => elements.helpDialog.showModal());
  elements.playAgain.addEventListener("click", () => {
    elements.resultDialog.close();
    startNewGame(state.difficulty);
  });

  document.querySelectorAll(".close-dialog").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });

  elements.helpDialog.addEventListener("click", closeOnBackdrop);
  elements.resultDialog.addEventListener("click", closeOnBackdrop);
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("visibilitychange", saveGame);
  window.addEventListener("beforeunload", saveGame);
}

function init() {
  createBoardCells();
  bindEvents();

  if (!loadGame()) {
    let preferredDifficulty = "easy";
    try {
      const savedPreference = localStorage.getItem(PREFERENCE_KEY);
      if (Object.hasOwn(DIFFICULTIES, savedPreference)) preferredDifficulty = savedPreference;
    } catch {
      // Default to easy when browser storage is unavailable.
    }
    startNewGame(preferredDifficulty);
  }
}

init();
