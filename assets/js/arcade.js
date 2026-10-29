"use strict";

const GAME_META = {
  "memory-match": { title: "Memory Match", category: "MEMORY", description: "Turn the cards, remember their places, and find every pair." },
  "tic-tac-toe": { title: "Tic-Tac-Toe", category: "STRATEGY", description: "Build a line of three before the computer finds one." },
  "number-merge": { title: "Number Merge", category: "NUMBERS", description: "Slide matching tiles together and work your way toward 2048." },
  snake: { title: "Snake", category: "ARCADE", description: "Guide the growing line, collect fruit, and leave yourself room to move." },
  minesweeper: { title: "Minesweeper", category: "LOGIC", description: "Use number clues to clear the field without touching a mine." },
  "connect-four": { title: "Connect Four", category: "STRATEGY", description: "Drop four pieces in a row before your computer opponent." },
  "word-scramble": { title: "Word Scramble", category: "WORDS", description: "Unscramble each word with help from a short clue." },
  "simon-sequence": { title: "Simon Sequence", category: "MEMORY", description: "Watch the pattern, then repeat every step in order." },
  "lights-out": { title: "Lights Out", category: "LOGIC", description: "Toggle neighboring lights until the whole board goes quiet." },
  "rock-paper-scissors": { title: "Rock Paper Scissors", category: "QUICK PLAY", description: "Choose your hand and win the first-to-five match." },
  breakout: { title: "Breakout", category: "ARCADE", description: "Keep the ball moving and clear every brick from the wall." },
  "word-guess": { title: "Word Guess", category: "WORDS", description: "Reveal the hidden word before your six misses run out." },
  "sliding-puzzle": { title: "Sliding Puzzle", category: "PUZZLE", description: "Move the numbered tiles back into order." },
  "math-sprint": { title: "Math Sprint", category: "NUMBERS", description: "Solve ten quick questions and race your best time." },
  "color-match": { title: "Color Match", category: "FOCUS", description: "Ignore the word and choose the color of its ink." },
  neon: { title: "Neon", category: "LOGIC", description: "Connect matching signals without crossing paths or leaving a cell dark." },
  currents: { title: "Currents", category: "PATHS", description: "Trace one continuous current through every cell and checkpoint in order." },
  snippets: { title: "Snippets", category: "LOGIC", description: "Divide the grid into rectangles whose areas match their single clues." },
  starstruck: { title: "Starstruck", category: "STRATEGY", description: "Place one star in every row, column, and region without letting stars touch." },
};

const gameId = new URLSearchParams(window.location.search).get("game") || "memory-match";
const meta = GAME_META[gameId];
const elements = {
  title: document.querySelector("#game-title"),
  category: document.querySelector("#game-category"),
  description: document.querySelector("#game-description"),
  toolbar: document.querySelector("#game-toolbar"),
  root: document.querySelector("#game-root"),
  instructions: document.querySelector("#game-instructions"),
  controls: document.querySelector("#game-controls"),
  dialog: document.querySelector("#result-dialog"),
  resultMark: document.querySelector("#result-mark"),
  resultLabel: document.querySelector("#result-label"),
  resultTitle: document.querySelector("#result-title"),
  resultMessage: document.querySelector("#result-message"),
  resultStats: document.querySelector("#result-stats"),
  resultActions: document.querySelector("#result-actions"),
  toast: document.querySelector("#toast"),
  announcer: document.querySelector("#announcer"),
};

let cleanupGame = () => {};
let toastTimer = null;

function safeLoad(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function safeSave(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is optional. Every game remains playable without it.
  }
}

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function statMarkup(label, value, id) {
  return `<div class="stat"><span class="stat-label">${label}</span><strong${id ? ` id="${id}"` : ""}>${value}</strong></div>`;
}

function announce(message) {
  elements.announcer.textContent = "";
  window.setTimeout(() => { elements.announcer.textContent = message; }, 20);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 1700);
}

function closeResult() {
  if (elements.dialog.open) elements.dialog.close();
}

function openResult({ label = "ROUND COMPLETE", title, message = "", mark = "✓", stats = [], actions = [] }) {
  closeResult();
  elements.resultLabel.textContent = label;
  elements.resultTitle.textContent = title;
  elements.resultMessage.textContent = message;
  elements.resultMark.textContent = mark;
  elements.resultStats.replaceChildren();
  elements.resultActions.replaceChildren();

  stats.forEach(([name, value]) => {
    const item = document.createElement("div");
    item.className = "result-stat";
    const labelElement = document.createElement("span");
    const valueElement = document.createElement("strong");
    labelElement.textContent = name;
    valueElement.textContent = String(value);
    item.append(labelElement, valueElement);
    elements.resultStats.appendChild(item);
  });

  actions.forEach(({ label: actionLabel, action, primary = false }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn${primary ? " primary" : ""}`;
    button.textContent = actionLabel;
    button.addEventListener("click", action);
    elements.resultActions.appendChild(button);
  });

  elements.dialog.showModal();
}

function setInstructions(html) {
  elements.instructions.innerHTML = html;
}

function setControls(html) {
  elements.controls.innerHTML = html;
}

function activateSegment(container, value) {
  container.querySelectorAll("button[data-value]").forEach((button) => {
    const active = button.dataset.value === value;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setupMemoryMatch() {
  const STORE = "pocket-arcade-memory-v1";
  const configs = {
    easy: { pairs: 6, columns: 4 },
    medium: { pairs: 8, columns: 4 },
    hard: { pairs: 12, columns: 6 },
  };
  const symbols = ["◆", "●", "▲", "✦", "■", "+", "≈", "✿", "◇", "○", "△", "✧"];
  let difficulty = "medium";
  let cards = [];
  let open = [];
  let matched = new Set();
  let moves = 0;
  let seconds = 0;
  let timer = null;
  let mismatchTimer = null;
  let finishTimer = null;
  let locked = false;
  let complete = false;
  const best = safeLoad(STORE, {});

  elements.toolbar.innerHTML = statMarkup("MOVES", "0", "memory-moves") + statMarkup("TIME", "00:00", "memory-time") + statMarkup("BEST", "—", "memory-best") + '<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn" id="memory-new" type="button">New game</button></div>';
  setInstructions("<p>Turn over two cards at a time. Matching symbols stay visible; mismatches turn back over.</p><p>Try to finish with the fewest moves.</p>");
  setControls('<div class="segmented" id="memory-level" aria-label="Difficulty"><button type="button" data-value="easy">Easy</button><button type="button" data-value="medium">Medium</button><button type="button" data-value="hard">Hard</button></div>');

  function stopTimer() { if (timer) window.clearInterval(timer); timer = null; }
  function updateStats() {
    document.querySelector("#memory-moves").textContent = String(moves);
    document.querySelector("#memory-time").textContent = formatTime(seconds);
    document.querySelector("#memory-best").textContent = best[difficulty] || "—";
  }
  function startTimer() {
    if (timer) return;
    timer = window.setInterval(() => { seconds += 1; updateStats(); }, 1000);
  }
  function render() {
    elements.root.innerHTML = '<div class="memory-board" role="grid" aria-label="Memory cards"></div>';
    const board = elements.root.firstElementChild;
    board.style.setProperty("--columns", String(configs[difficulty].columns));
    cards.forEach((symbol, index) => {
      const button = document.createElement("button");
      const visible = open.includes(index) || matched.has(index);
      button.type = "button";
      button.className = `memory-card${visible ? " flipped" : ""}${matched.has(index) ? " matched" : ""}`;
      button.dataset.index = String(index);
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", matched.has(index) ? `Matched ${symbol}` : visible ? `Card ${index + 1}, ${symbol}` : `Hidden card ${index + 1}`);
      button.disabled = locked || matched.has(index) || open.includes(index) || complete;
      button.innerHTML = `<span class="memory-card-inner"><span class="memory-face memory-back"></span><span class="memory-face memory-front">${symbol}</span></span>`;
      button.addEventListener("click", () => flip(index));
      board.appendChild(button);
    });
  }
  function finish() {
    complete = true;
    stopTimer();
    const oldBest = Number(best[difficulty]) || Infinity;
    const isBest = moves < oldBest;
    if (isBest) { best[difficulty] = moves; safeSave(STORE, best); }
    updateStats();
    openResult({ title: isBest ? "A new best." : "All pairs found.", message: isBest ? "Your memory was especially sharp this round." : "Every card found its partner.", stats: [["Moves", moves], ["Time", formatTime(seconds)], ["Best", best[difficulty]]], actions: [{ label: "Play again", primary: true, action: () => { closeResult(); start(difficulty, true); } }] });
  }
  function flip(index) {
    if (locked || complete || open.includes(index) || matched.has(index)) return;
    startTimer();
    open.push(index);
    render();
    if (open.length < 2) return;
    moves += 1;
    updateStats();
    const [first, second] = open;
    if (cards[first] === cards[second]) {
      matched.add(first); matched.add(second); open = [];
      announce(`Match found: ${cards[first]}.`);
      render();
      if (matched.size === cards.length) finishTimer = window.setTimeout(finish, 350);
      return;
    }
    locked = true;
    announce("No match.");
    mismatchTimer = window.setTimeout(() => { open = []; locked = false; render(); }, 720);
  }
  function start(nextDifficulty = difficulty, force = false) {
    if (!force && moves > 0 && !complete && !window.confirm("Start a new memory game?")) return;
    closeResult(); stopTimer(); window.clearTimeout(mismatchTimer); window.clearTimeout(finishTimer);
    difficulty = nextDifficulty; cards = shuffle(symbols.slice(0, configs[difficulty].pairs).flatMap((symbol) => [symbol, symbol]));
    open = []; matched = new Set(); moves = 0; seconds = 0; locked = false; complete = false;
    activateSegment(document.querySelector("#memory-level"), difficulty); updateStats(); render();
  }

  document.querySelector("#memory-new").addEventListener("click", () => start(difficulty));
  document.querySelector("#memory-level").addEventListener("click", (event) => { if (event.target.dataset.value) start(event.target.dataset.value); });
  start("medium", true);
  return () => { stopTimer(); window.clearTimeout(mismatchTimer); window.clearTimeout(finishTimer); };
}

function setupTicTacToe() {
  const STORE = "pocket-arcade-tic-v1";
  let scores = safeLoad(STORE, { player: 0, draws: 0, cpu: 0 });
  if (![scores.player, scores.draws, scores.cpu].every(Number.isFinite)) scores = { player: 0, draws: 0, cpu: 0 };
  let board = Array(9).fill("");
  let difficulty = "medium";
  let over = false;
  let thinking = false;
  let aiTimer = null;
  let resultTimer = null;
  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

  elements.toolbar.innerHTML = statMarkup("YOU", scores.player, "tic-player") + statMarkup("DRAWS", scores.draws, "tic-draws") + statMarkup("COMPUTER", scores.cpu, "tic-cpu") + '<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn" id="tic-new" type="button">New round</button></div>';
  setInstructions("<p>You are <strong>X</strong>. Choose any open square, then the computer plays <strong>O</strong>.</p><p>Hard mode uses perfect play.</p>");
  setControls('<div class="segmented" id="tic-level" aria-label="Computer difficulty"><button type="button" data-value="easy">Easy</button><button type="button" data-value="medium">Medium</button><button type="button" data-value="hard">Hard</button></div><button class="btn danger" id="tic-reset" type="button">Reset score</button>');

  function result(currentBoard) {
    for (const line of wins) {
      const [a,b,c] = line;
      if (currentBoard[a] && currentBoard[a] === currentBoard[b] && currentBoard[a] === currentBoard[c]) return { player: currentBoard[a], line };
    }
    return currentBoard.every(Boolean) ? { player: "draw", line: [] } : null;
  }
  function updateScores() {
    document.querySelector("#tic-player").textContent = scores.player;
    document.querySelector("#tic-draws").textContent = scores.draws;
    document.querySelector("#tic-cpu").textContent = scores.cpu;
  }
  function render(winningLine = []) {
    elements.root.innerHTML = '<div><div class="tic-board" role="grid" aria-label="Tic-Tac-Toe board"></div><p class="turn-note" id="tic-status"></p></div>';
    const grid = elements.root.querySelector(".tic-board");
    board.forEach((value, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tic-cell ${value.toLowerCase()}${winningLine.includes(index) ? " winner" : ""}`;
      button.textContent = value === "X" ? "×" : value === "O" ? "○" : "";
      button.disabled = Boolean(value) || over || thinking;
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", `Row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}, ${value || "empty"}`);
      button.addEventListener("click", () => playHuman(index));
      grid.appendChild(button);
    });
    const status = elements.root.querySelector("#tic-status");
    status.textContent = over ? "Round complete" : thinking ? "Computer is thinking…" : "Your turn — place X";
  }
  function finish(outcome) {
    over = true;
    if (outcome.player === "X") scores.player += 1;
    else if (outcome.player === "O") scores.cpu += 1;
    else scores.draws += 1;
    safeSave(STORE, scores); updateScores(); render(outcome.line);
    const won = outcome.player === "X";
    const title = won ? "You found the line." : outcome.player === "O" ? "Computer takes it." : "A thoughtful draw.";
    announce(title);
    resultTimer = window.setTimeout(() => openResult({ label: "ROUND COMPLETE", title, mark: won ? "✓" : outcome.player === "O" ? "○" : "=", message: won ? "Three in a row." : outcome.player === "O" ? "Try another opening." : "Neither side gave way.", stats: [["You", scores.player], ["Draws", scores.draws], ["Computer", scores.cpu]], actions: [{ label: "Rematch", primary: true, action: () => { closeResult(); startRound(); } }] }), 350);
  }
  function available(currentBoard) { return currentBoard.map((value,index) => value ? -1 : index).filter((index) => index >= 0); }
  function immediateMove(mark) {
    return available(board).find((index) => { const copy = [...board]; copy[index] = mark; return result(copy)?.player === mark; });
  }
  function minimax(currentBoard, maximizing, depth = 0) {
    const outcome = result(currentBoard);
    if (outcome) return outcome.player === "O" ? 10 - depth : outcome.player === "X" ? depth - 10 : 0;
    const scoresList = available(currentBoard).map((index) => { const copy = [...currentBoard]; copy[index] = maximizing ? "O" : "X"; return minimax(copy, !maximizing, depth + 1); });
    return maximizing ? Math.max(...scoresList) : Math.min(...scoresList);
  }
  function chooseMove() {
    const choices = available(board);
    if (difficulty === "easy") return choices[Math.floor(Math.random() * choices.length)];
    const win = immediateMove("O"); if (win !== undefined) return win;
    const block = immediateMove("X"); if (block !== undefined) return block;
    if (difficulty === "medium") {
      if (!board[4] && Math.random() < .7) return 4;
      const useful = choices.filter((index) => [0,2,4,6,8].includes(index));
      const pool = useful.length && Math.random() < .65 ? useful : choices;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    let bestScore = -Infinity; let bestMove = choices[0];
    choices.forEach((index) => { const copy = [...board]; copy[index] = "O"; const score = minimax(copy, false); if (score > bestScore) { bestScore = score; bestMove = index; } });
    return bestMove;
  }
  function playHuman(index) {
    if (board[index] || over || thinking) return;
    board[index] = "X"; let outcome = result(board); if (outcome) { finish(outcome); return; }
    thinking = true; render();
    aiTimer = window.setTimeout(() => { board[chooseMove()] = "O"; thinking = false; outcome = result(board); if (outcome) finish(outcome); else { render(); announce("Your turn."); } }, 380);
  }
  function startRound() { window.clearTimeout(aiTimer); window.clearTimeout(resultTimer); closeResult(); board = Array(9).fill(""); over = false; thinking = false; activateSegment(document.querySelector("#tic-level"), difficulty); render(); }

  document.querySelector("#tic-new").addEventListener("click", startRound);
  document.querySelector("#tic-level").addEventListener("click", (event) => { if (event.target.dataset.value) { difficulty = event.target.dataset.value; startRound(); } });
  document.querySelector("#tic-reset").addEventListener("click", () => { if (window.confirm("Reset the Tic-Tac-Toe scoreboard?")) { scores = { player:0,draws:0,cpu:0 }; safeSave(STORE,scores); updateScores(); startRound(); } });
  updateScores(); startRound();
  return () => { window.clearTimeout(aiTimer); window.clearTimeout(resultTimer); };
}

function setupNumberMerge() {
  const STORE = "pocket-arcade-merge-v1";
  const saved = safeLoad(STORE, null);
  let board = saved && Array.isArray(saved.board) && saved.board.length === 16 ? saved.board : Array(16).fill(0);
  let score = saved && Number.isFinite(saved.score) ? saved.score : 0;
  let best = saved && Number.isFinite(saved.best) ? saved.best : 0;
  let wonShown = Boolean(saved?.wonShown);
  let previous = null;
  let touchStart = null;

  elements.toolbar.innerHTML = statMarkup("SCORE", score, "merge-score") + statMarkup("BEST", best, "merge-best") + '<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn" id="merge-undo" type="button">Undo</button><button class="btn primary" id="merge-new" type="button">New game</button></div>';
  setInstructions("<p>Use <kbd>Arrow keys</kbd> or <kbd>WASD</kbd> to slide every tile. On touch screens, swipe across the board.</p><p>Equal tiles merge once per move.</p>");
  setControls('<button class="btn" data-move="up" type="button">↑</button><button class="btn" data-move="left" type="button">←</button><button class="btn" data-move="down" type="button">↓</button><button class="btn" data-move="right" type="button">→</button>');

  function addRandom() {
    const empty = board.map((value,index) => value ? -1 : index).filter((index) => index >= 0);
    if (!empty.length) return;
    board[empty[Math.floor(Math.random()*empty.length)]] = Math.random() < .9 ? 2 : 4;
  }
  function save() { best = Math.max(best,score); safeSave(STORE,{board,score,best,wonShown}); }
  function render(spawned = -1) {
    elements.root.innerHTML = '<div class="merge-wrap"><div class="merge-board" role="grid" aria-label="Number Merge board"></div><p class="swipe-note">Swipe or use Arrow keys / WASD</p></div>';
    const grid = elements.root.querySelector(".merge-board");
    board.forEach((value,index) => { const tile=document.createElement("div"); tile.className=`merge-tile${index===spawned?" spawned":""}`; tile.dataset.value=String(value); tile.setAttribute("role","gridcell"); tile.setAttribute("aria-label",value?String(value):"empty"); tile.textContent=value||""; grid.appendChild(tile); });
    document.querySelector("#merge-score").textContent=score.toLocaleString(); document.querySelector("#merge-best").textContent=best.toLocaleString(); document.querySelector("#merge-undo").disabled=!previous;
    grid.addEventListener("touchstart",(event)=>{const touch=event.changedTouches[0];touchStart={x:touch.clientX,y:touch.clientY};},{passive:true});
    grid.addEventListener("touchend",(event)=>{if(!touchStart)return;const touch=event.changedTouches[0];const dx=touch.clientX-touchStart.x,dy=touch.clientY-touchStart.y;touchStart=null;if(Math.max(Math.abs(dx),Math.abs(dy))<28)return;move(Math.abs(dx)>Math.abs(dy)?dx>0?"right":"left":dy>0?"down":"up");},{passive:true});
  }
  function mergeLine(values) {
    const packed=values.filter(Boolean);const output=[];let gained=0;
    for(let index=0;index<packed.length;index+=1){if(packed[index]===packed[index+1]){const value=packed[index]*2;output.push(value);gained+=value;index+=1;}else output.push(packed[index]);}
    while(output.length<4)output.push(0);return{values:output,gained};
  }
  function canMove() {
    if(board.includes(0))return true;
    for(let row=0;row<4;row+=1)for(let column=0;column<4;column+=1){const value=board[row*4+column];if(column<3&&value===board[row*4+column+1])return true;if(row<3&&value===board[(row+1)*4+column])return true;}
    return false;
  }
  function move(direction) {
    if(elements.dialog.open)return;
    const before=[...board];let gained=0;
    for(let outer=0;outer<4;outer+=1){let indexes=[];for(let inner=0;inner<4;inner+=1){if(direction==="left"||direction==="right")indexes.push(outer*4+inner);else indexes.push(inner*4+outer);}if(direction==="right"||direction==="down")indexes.reverse();const merged=mergeLine(indexes.map((index)=>board[index]));gained+=merged.gained;indexes.forEach((index,position)=>{board[index]=merged.values[position];});}
    if(board.every((value,index)=>value===before[index]))return;
    previous={board:before,score};score+=gained;addRandom();const spawned=board.findIndex((value,index)=>value!==before[index]&&(value===2||value===4));save();render(spawned);if(gained)announce(`Merged for ${gained} points.`);
    if(board.some((value)=>value>=2048)&&!wonShown){wonShown=true;save();openResult({label:"2048 REACHED",title:"You made 2048.",message:"Keep building, or begin with a clean board.",stats:[["Score",score.toLocaleString()],["Best",best.toLocaleString()]],actions:[{label:"Continue",primary:true,action:closeResult},{label:"New game",action:()=>{closeResult();start(true);}}]});}
    else if(!canMove())openResult({label:"NO MOVES LEFT",title:"Board complete.",mark:"=",message:"No tile can move or merge.",stats:[["Score",score.toLocaleString()],["Best",best.toLocaleString()]],actions:[{label:"Try again",primary:true,action:()=>{closeResult();start(true);}}]});
  }
  function start(force=false){if(!force&&score>0&&!window.confirm("Start a new Number Merge game?"))return;closeResult();board=Array(16).fill(0);score=0;previous=null;wonShown=false;addRandom();addRandom();save();render();}
  function undo(){if(!previous)return;board=previous.board;score=previous.score;previous=null;save();render();showToast("Last move undone");}
  function keyHandler(event){const map={ArrowUp:"up",w:"up",W:"up",ArrowDown:"down",s:"down",S:"down",ArrowLeft:"left",a:"left",A:"left",ArrowRight:"right",d:"right",D:"right"};if(map[event.key]){event.preventDefault();move(map[event.key]);}}

  document.querySelector("#merge-new").addEventListener("click",()=>start());document.querySelector("#merge-undo").addEventListener("click",undo);elements.controls.addEventListener("click",(event)=>{if(event.target.dataset.move)move(event.target.dataset.move);});document.addEventListener("keydown",keyHandler);
  if(!board.some(Boolean)){addRandom();addRandom();save();}render();
  return()=>document.removeEventListener("keydown",keyHandler);
}

function setupSnake() {
  const STORE="pocket-arcade-snake-v1";let best=Number(safeLoad(STORE,0))||0;let snake=[],food={},direction={x:1,y:0},nextDirection={x:1,y:0},score=0,loop=null,running=false,stepMode=false;const size=20;
  elements.toolbar.innerHTML=statMarkup("SCORE",0,"snake-score")+statMarkup("BEST",best,"snake-best")+'<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn primary" id="snake-start" type="button">Start</button></div>';
  setInstructions("<p>Use <kbd>Arrow keys</kbd> or <kbd>WASD</kbd>. Eat the orange fruit without hitting a wall or your own trail.</p><p>Step mode pauses between moves and announces the complete board state for nonvisual play.</p>");
  setControls('<button class="btn" id="snake-new" type="button">New game</button><button class="btn" id="snake-step" type="button" aria-pressed="false">Step mode: off</button>');
  elements.root.innerHTML='<div class="canvas-wrap"><canvas class="game-canvas" id="snake-canvas" width="500" height="500" aria-label="Snake play field" aria-describedby="snake-state"></canvas><p class="sr-only" id="snake-state" aria-live="off"></p><div class="canvas-overlay" id="snake-overlay"><div><h2>Ready?</h2><p>Press Start or a direction key.</p></div></div><div class="direction-pad" aria-label="Touch direction controls"><button class="btn up" data-dir="up" type="button">↑</button><button class="btn left" data-dir="left" type="button">←</button><button class="btn down" data-dir="down" type="button">↓</button><button class="btn right" data-dir="right" type="button">→</button></div></div>';
  const canvas=document.querySelector("#snake-canvas"),ctx=canvas.getContext("2d"),overlay=document.querySelector("#snake-overlay"),stateText=document.querySelector("#snake-state");
  function placeFood(){do{food={x:Math.floor(Math.random()*size),y:Math.floor(Math.random()*size)};}while(snake.some((part)=>part.x===food.x&&part.y===food.y));}
  function draw(){const unit=canvas.width/size;ctx.fillStyle="#e5e8df";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle="rgba(68,84,74,.08)";for(let i=1;i<size;i++){ctx.beginPath();ctx.moveTo(i*unit,0);ctx.lineTo(i*unit,canvas.height);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*unit);ctx.lineTo(canvas.width,i*unit);ctx.stroke();}ctx.fillStyle="#d76c45";ctx.beginPath();ctx.arc((food.x+.5)*unit,(food.y+.5)*unit,unit*.34,0,Math.PI*2);ctx.fill();snake.forEach((part,index)=>{ctx.fillStyle=index===0?"#285846":"#3f725f";ctx.beginPath();ctx.roundRect(part.x*unit+2,part.y*unit+2,unit-4,unit-4,5);ctx.fill();});document.querySelector("#snake-score").textContent=score;document.querySelector("#snake-best").textContent=best;stateText.textContent=`Snake head at column ${snake[0].x+1}, row ${snake[0].y+1}, moving ${direction.x===1?"right":direction.x===-1?"left":direction.y===1?"down":"up"}. Fruit at column ${food.x+1}, row ${food.y+1}. Body occupies ${snake.slice(1).map(part=>`column ${part.x+1} row ${part.y+1}`).join(", ")||"no other cells"}.`;}
  function reset(){window.clearInterval(loop);loop=null;running=false;snake=[{x:8,y:10},{x:7,y:10},{x:6,y:10}];direction={x:1,y:0};nextDirection={x:1,y:0};score=0;placeFood();overlay.hidden=false;overlay.querySelector("h2").textContent="Ready?";overlay.querySelector("p").textContent="Press Start or a direction key.";document.querySelector("#snake-start").textContent="Start";draw();}
  function gameOver(){running=false;window.clearInterval(loop);loop=null;best=Math.max(best,score);safeSave(STORE,best);draw();announce("Game over.");openResult({label:"GAME OVER",title:"Trail complete.",mark:"×",message:"The next space was already occupied.",stats:[["Score",score],["Best",best]],actions:[{label:"Play again",primary:true,action:()=>{closeResult();reset();start();}}]});}
  function tick(){direction=nextDirection;const head={x:snake[0].x+direction.x,y:snake[0].y+direction.y},growing=head.x===food.x&&head.y===food.y,collisionBody=growing?snake:snake.slice(0,-1);if(head.x<0||head.x>=size||head.y<0||head.y>=size||collisionBody.some((part)=>part.x===head.x&&part.y===head.y)){gameOver();return;}snake.unshift(head);if(growing){score+=10;best=Math.max(best,score);safeSave(STORE,best);placeFood();announce(`Fruit collected. Score ${score}.`);}else snake.pop();draw();}
  function start(){if(running)return;closeResult();overlay.hidden=true;running=true;document.querySelector("#snake-start").textContent=stepMode?"Step mode":"Pause";if(stepMode){draw();announce("Step mode ready. Choose a direction for each move.");}else loop=window.setInterval(tick,115);}
  function toggle(){if(stepMode){if(!running)start();return;}if(running){running=false;window.clearInterval(loop);loop=null;overlay.hidden=false;overlay.querySelector("h2").textContent="Paused";overlay.querySelector("p").textContent="Press Resume when ready.";document.querySelector("#snake-start").textContent="Resume";}else start();}
  function turn(name){const dirs={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};const chosen=dirs[name];if(chosen.x===-direction.x&&chosen.y===-direction.y)return;nextDirection=chosen;if(stepMode){if(!running)start();tick();}else if(!running)start();}
  function toggleStep(){stepMode=!stepMode;const button=document.querySelector("#snake-step");button.textContent=`Step mode: ${stepMode?"on":"off"}`;button.setAttribute("aria-pressed",String(stepMode));stateText.setAttribute("aria-live",stepMode?"polite":"off");reset();}
  function onKey(event){if(["INPUT","SELECT"].includes(event.target.tagName))return;const map={ArrowUp:"up",w:"up",W:"up",ArrowDown:"down",s:"down",S:"down",ArrowLeft:"left",a:"left",A:"left",ArrowRight:"right",d:"right",D:"right"};if(map[event.key]){event.preventDefault();turn(map[event.key]);}else if(event.key===" "){event.preventDefault();toggle();}}
  document.querySelector("#snake-start").addEventListener("click",toggle);document.querySelector("#snake-new").addEventListener("click",reset);document.querySelector("#snake-step").addEventListener("click",toggleStep);elements.root.querySelector(".direction-pad").addEventListener("click",(event)=>{if(event.target.dataset.dir)turn(event.target.dataset.dir);});document.addEventListener("keydown",onKey);reset();
  return()=>{window.clearInterval(loop);document.removeEventListener("keydown",onKey);};
}

function setupMinesweeper(){
  const STORE="pocket-arcade-mines-v1",configs={easy:{size:9,mines:10,cell:38},medium:{size:12,mines:22,cell:34},hard:{size:16,mines:40,cell:30}};let best=safeLoad(STORE,{}),difficulty="easy",mines=new Set(),revealed=new Set(),flags=new Set(),started=false,over=false,flagMode=false,seconds=0,timer=null;
  elements.toolbar.innerHTML=statMarkup("MINES",10,"mine-count")+statMarkup("TIME","00:00","mine-time")+statMarkup("BEST","—","mine-best")+'<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn" id="mine-new" type="button">New field</button></div>';setInstructions("<p>Reveal safe squares. Numbers show how many mines touch that square.</p><p>Right-click to flag, or turn on Flag mode for touch.</p>");setControls('<div class="segmented" id="mine-level" aria-label="Difficulty"><button type="button" data-value="easy">Easy</button><button type="button" data-value="medium">Medium</button><button type="button" data-value="hard">Hard</button></div><button class="btn" id="flag-mode" type="button" aria-pressed="false">Flag mode: off</button>');
  function neighbors(index){const n=[],size=configs[difficulty].size,row=Math.floor(index/size),column=index%size;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const r=row+dr,c=column+dc;if((dr||dc)&&r>=0&&r<size&&c>=0&&c<size)n.push(r*size+c);}return n;}
  function near(index){return neighbors(index).filter((cell)=>mines.has(cell)).length;}
  function generate(safeIndex){const config=configs[difficulty],blocked=new Set([safeIndex,...neighbors(safeIndex)]),choices=shuffle(Array.from({length:config.size*config.size},(_,i)=>i).filter((i)=>!blocked.has(i)));mines=new Set(choices.slice(0,config.mines));started=true;timer=window.setInterval(()=>{seconds++;update();},1000);}
  function update(){const config=configs[difficulty];document.querySelector("#mine-count").textContent=Math.max(0,config.mines-flags.size);document.querySelector("#mine-time").textContent=formatTime(seconds);document.querySelector("#mine-best").textContent=best[difficulty]?formatTime(best[difficulty]):"—";}
  function render(){const config=configs[difficulty];elements.root.innerHTML='<div class="mine-wrap"><div class="mine-board" role="grid" aria-label="Minesweeper field"></div></div>';const boardEl=elements.root.querySelector(".mine-board");boardEl.style.setProperty("--size",config.size);boardEl.style.setProperty("--cell-size",`${config.cell}px`);for(let index=0;index<config.size*config.size;index++){const button=document.createElement("button"),isOpen=revealed.has(index),isMine=mines.has(index),count=isOpen&&!isMine?near(index):0;button.type="button";button.className=`mine-cell${isOpen?" revealed":""}${isOpen&&isMine?" mine":""}${flags.has(index)?" flagged":""}`;button.disabled=over||isOpen;button.dataset.near=String(count);button.textContent=isOpen?(isMine?"×":count||""):flags.has(index)?"⚑":"";button.setAttribute("role","gridcell");button.setAttribute("aria-label",isOpen?(isMine?"mine":count?`${count} nearby mines`:"clear"):flags.has(index)?"flagged square":"hidden square");button.addEventListener("click",()=>flagMode?toggleFlag(index):reveal(index));button.addEventListener("contextmenu",(event)=>{event.preventDefault();toggleFlag(index);});boardEl.appendChild(button);}update();}
  function toggleFlag(index){if(over||revealed.has(index))return;if(flags.has(index))flags.delete(index);else if(flags.size<configs[difficulty].mines)flags.add(index);render();}
  function reveal(index){if(over||flags.has(index))return;if(!started)generate(index);if(mines.has(index)){revealed.add(index);mines.forEach((mine)=>revealed.add(mine));over=true;window.clearInterval(timer);render();openResult({label:"MINE FOUND",title:"Field interrupted.",mark:"×",message:"That square held a mine.",stats:[["Time",formatTime(seconds)]],actions:[{label:"Try again",primary:true,action:()=>{closeResult();start(difficulty,true);}}]});return;}const queue=[index];while(queue.length){const cell=queue.shift();if(revealed.has(cell)||flags.has(cell))continue;revealed.add(cell);if(near(cell)===0)neighbors(cell).forEach((next)=>{if(!revealed.has(next))queue.push(next);});}render();const config=configs[difficulty];if(revealed.size===config.size*config.size-config.mines){over=true;window.clearInterval(timer);if(!best[difficulty]||seconds<best[difficulty]){best[difficulty]=seconds;safeSave(STORE,best);}update();openResult({title:"Field cleared.",message:"Every safe square is open.",stats:[["Time",formatTime(seconds)],["Best",formatTime(best[difficulty])]],actions:[{label:"Play again",primary:true,action:()=>{closeResult();start(difficulty,true);}}]});}}
  function start(next=difficulty,force=false){if(!force&&started&&!over&&revealed.size&& !window.confirm("Start a new minefield?"))return;window.clearInterval(timer);difficulty=next;mines=new Set();revealed=new Set();flags=new Set();started=false;over=false;seconds=0;activateSegment(document.querySelector("#mine-level"),difficulty);render();}
  document.querySelector("#mine-new").addEventListener("click",()=>start());document.querySelector("#mine-level").addEventListener("click",(e)=>{if(e.target.dataset.value)start(e.target.dataset.value);});document.querySelector("#flag-mode").addEventListener("click",(e)=>{flagMode=!flagMode;e.currentTarget.textContent=`Flag mode: ${flagMode?"on":"off"}`;e.currentTarget.setAttribute("aria-pressed",flagMode);});start("easy",true);return()=>window.clearInterval(timer);
}

function setupConnectFour(){
  const STORE="pocket-arcade-connect-v1";let scores=safeLoad(STORE,{player:0,draws:0,cpu:0});let board=Array(42).fill(0),over=false,thinking=false,aiTimer=null,resultTimer=null;const lines=[];for(let r=0;r<6;r++)for(let c=0;c<7;c++){if(c<=3)lines.push([0,1,2,3].map(i=>r*7+c+i));if(r<=2)lines.push([0,1,2,3].map(i=>(r+i)*7+c));if(r<=2&&c<=3)lines.push([0,1,2,3].map(i=>(r+i)*7+c+i));if(r>=3&&c<=3)lines.push([0,1,2,3].map(i=>(r-i)*7+c+i));}
  elements.toolbar.innerHTML=statMarkup("YOU",scores.player,"connect-player")+statMarkup("DRAWS",scores.draws,"connect-draws")+statMarkup("COMPUTER",scores.cpu,"connect-cpu")+'<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn" id="connect-new" type="button">New round</button></div>';setInstructions("<p>Choose a column to drop your orange piece. Connect four horizontally, vertically, or diagonally.</p>");setControls('<button class="btn danger" id="connect-reset" type="button">Reset score</button>');
  function outcome(test=board){for(const line of lines){if(test[line[0]]&&line.every(i=>test[i]===test[line[0]]))return{player:test[line[0]],line};}return test.every(Boolean)?{player:3,line:[]}:null;}
  function validColumns(test=board){return[0,1,2,3,4,5,6].filter(c=>!test[c]);}
  function drop(test,column,player){for(let r=5;r>=0;r--){const i=r*7+column;if(!test[i]){test[i]=player;return i;}}return-1;}
  function update(){document.querySelector("#connect-player").textContent=scores.player;document.querySelector("#connect-draws").textContent=scores.draws;document.querySelector("#connect-cpu").textContent=scores.cpu;}
  function render(win=[]){elements.root.innerHTML='<div><div class="connect-board" role="grid" aria-label="Connect Four board"></div><p class="turn-note"></p></div>';const grid=elements.root.querySelector(".connect-board");board.forEach((value,index)=>{const button=document.createElement("button");button.type="button";button.className=`connect-cell${value===1?" player":value===2?" cpu":""}${win.includes(index)?" winner":""}`;button.disabled=over||thinking||Boolean(board[index%7]);button.setAttribute("role","gridcell");button.setAttribute("aria-label",`Row ${Math.floor(index/7)+1}, column ${index%7+1}, ${value===1?"your piece":value===2?"computer piece":"empty"}`);button.addEventListener("click",()=>play(index%7));grid.appendChild(button);});elements.root.querySelector(".turn-note").textContent=over?"Round complete":thinking?"Computer is choosing…":"Your turn — choose a column";update();}
  function finish(result){over=true;if(result.player===1)scores.player++;else if(result.player===2)scores.cpu++;else scores.draws++;safeSave(STORE,scores);render(result.line);const title=result.player===1?"Four in a row.":result.player===2?"Computer connects four.":"The board is full.";resultTimer=window.setTimeout(()=>openResult({title,mark:result.player===1?"✓":result.player===2?"○":"=",message:result.player===1?"A clean winning line.":result.player===2?"Try another column order.":"No line could break through.",stats:[["You",scores.player],["Draws",scores.draws],["Computer",scores.cpu]],actions:[{label:"Rematch",primary:true,action:()=>{closeResult();start();}}]}),350);}
  function tactical(player){return validColumns().find(c=>{const copy=[...board];drop(copy,c,player);return outcome(copy)?.player===player;});}
  function cpuMove(){let column=tactical(2);if(column===undefined)column=tactical(1);if(column===undefined){const choices=validColumns().sort((a,b)=>Math.abs(a-3)-Math.abs(b-3));const weighted=choices.slice(0,Math.min(3,choices.length));column=weighted[Math.floor(Math.random()*weighted.length)];}drop(board,column,2);thinking=false;const result=outcome();if(result)finish(result);else{render();announce("Your turn.");}}
  function play(column){if(over||thinking||!validColumns().includes(column))return;drop(board,column,1);let result=outcome();if(result){finish(result);return;}thinking=true;render();aiTimer=window.setTimeout(cpuMove,420);}
  function start(){window.clearTimeout(aiTimer);window.clearTimeout(resultTimer);closeResult();board=Array(42).fill(0);over=false;thinking=false;render();}
  document.querySelector("#connect-new").addEventListener("click",start);document.querySelector("#connect-reset").addEventListener("click",()=>{if(window.confirm("Reset the Connect Four scoreboard?")){scores={player:0,draws:0,cpu:0};safeSave(STORE,scores);start();}});start();return()=>{window.clearTimeout(aiTimer);window.clearTimeout(resultTimer);};
}

function setupWordScramble(){
  const STORE="pocket-arcade-scramble-v1",words=[{w:"planet",c:"A world orbiting a star"},{w:"garden",c:"A place where plants are grown"},{w:"pencil",c:"A tool used for writing"},{w:"bridge",c:"A path across a river"},{w:"window",c:"An opening that lets in light"},{w:"forest",c:"A large area filled with trees"},{w:"silver",c:"A bright metallic element"},{w:"camera",c:"A device that captures pictures"},{w:"breeze",c:"A gentle wind"},{w:"puzzle",c:"A problem made for solving"},{w:"comet",c:"An icy visitor with a tail"},{w:"island",c:"Land surrounded by water"},{w:"anchor",c:"It keeps a ship in place"},{w:"velvet",c:"A soft fabric"},{w:"rocket",c:"A vehicle built for space"},{w:"basket",c:"A woven container"},{w:"thunder",c:"The sound after lightning"},{w:"compass",c:"A tool that points north"},{w:"lantern",c:"A portable light"},{w:"whisper",c:"A very quiet voice"}];let rounds=[],round=0,score=0,streak=0,attempts=0,best=Number(safeLoad(STORE,0))||0,complete=false,transitioning=false,transitionTimer=null;
  elements.toolbar.innerHTML=statMarkup("ROUND","1 / 10","scramble-round")+statMarkup("SCORE",0,"scramble-score")+statMarkup("BEST",best,"scramble-best")+'<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn" id="scramble-new" type="button">New set</button></div>';setInstructions("<p>Rearrange the large letters into the word described by the clue.</p><p>A correct first try earns 100 points. Each retry costs 15.</p>");setControls('<button class="btn" id="scramble-skip" type="button">Skip word</button>');
  function scrambled(word){let value;do{value=shuffle([...word]).join("");}while(value===word);return value;}
  function update(){document.querySelector("#scramble-round").textContent=`${Math.min(round+1,10)} / 10`;document.querySelector("#scramble-score").textContent=score;document.querySelector("#scramble-best").textContent=best;}
  function render(){const item=rounds[round];elements.root.innerHTML=`<div class="word-panel"><p class="clue">${item.c}</p><h2 class="scrambled-word">${scrambled(item.w)}</h2><form class="text-form" id="scramble-form"><input class="text-input" id="scramble-input" autocomplete="off" aria-label="Your answer" placeholder="Type the word"><button class="btn primary" type="submit">Check</button></form><p class="feedback" id="scramble-feedback" aria-live="polite"></p></div>`;document.querySelector("#scramble-form").addEventListener("submit",check);document.querySelector("#scramble-input").focus();update();}
  function next(){transitioning=false;round++;attempts=0;if(round>=10){complete=true;best=Math.max(best,score);safeSave(STORE,best);openResult({title:"Ten words solved.",message:"A tidy piece of word work.",stats:[["Score",score],["Best",best]],actions:[{label:"New set",primary:true,action:()=>{closeResult();start(true);}}]});return;}render();}
  function check(event){event.preventDefault();if(complete||transitioning)return;const input=document.querySelector("#scramble-input"),feedback=document.querySelector("#scramble-feedback"),answer=input.value.trim().toLowerCase();if(answer===rounds[round].w){transitioning=true;const points=Math.max(25,100-attempts*15)+streak*5;score+=points;streak++;feedback.className="feedback good";feedback.textContent=`Correct · +${points}`;input.disabled=true;announce(feedback.textContent);transitionTimer=window.setTimeout(next,520);}else{attempts++;streak=0;feedback.className="feedback bad";feedback.textContent="Not quite. Try another arrangement.";input.select();}}
  function start(force=false){if(!force&&round>0&&!complete&&!window.confirm("Start a new word set?"))return;window.clearTimeout(transitionTimer);closeResult();rounds=shuffle(words).slice(0,10);round=0;score=0;streak=0;attempts=0;complete=false;transitioning=false;render();}
  document.querySelector("#scramble-new").addEventListener("click",()=>start());document.querySelector("#scramble-skip").addEventListener("click",()=>{if(complete||transitioning)return;transitioning=true;showToast(`The word was ${rounds[round].w.toUpperCase()}`);streak=0;transitionTimer=window.setTimeout(next,500);});start(true);return()=>window.clearTimeout(transitionTimer);
}

function setupSimonSequence(){
  const STORE="pocket-arcade-simon-v1";let best=Number(safeLoad(STORE,0))||0,sequence=[],position=0,level=0,playing=false,started=false,timers=[];
  elements.toolbar.innerHTML=statMarkup("LEVEL",0,"simon-level")+statMarkup("BEST",best,"simon-best")+'<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn primary" id="simon-start" type="button">Start sequence</button></div>';setInstructions("<p>Watch the four pads light up, then repeat the exact pattern.</p><p>Each successful round adds one new step.</p>");setControls('<button class="btn" id="simon-new" type="button">New game</button>');elements.root.innerHTML='<div><div class="simon-board" aria-label="Simon color pads"><button class="simon-pad" data-pad="0" type="button" aria-label="Red pad"></button><button class="simon-pad" data-pad="1" type="button" aria-label="Yellow pad"></button><button class="simon-pad" data-pad="2" type="button" aria-label="Blue pad"></button><button class="simon-pad" data-pad="3" type="button" aria-label="Green pad"></button></div><p class="turn-note" id="simon-status" role="status" aria-live="polite">Press Start to begin</p></div>';
  const pads=[...elements.root.querySelectorAll(".simon-pad")],status=document.querySelector("#simon-status"),padNames=["Red","Yellow","Blue","Green"];
  function later(action,delay){const id=window.setTimeout(action,delay);timers.push(id);return id;}function clearTimers(){timers.forEach(window.clearTimeout);timers=[];}
  function update(){document.querySelector("#simon-level").textContent=level;document.querySelector("#simon-best").textContent=best;pads.forEach(p=>p.disabled=playing||!started);}
  function flash(index,duration=320,describe=false){pads[index].classList.add("active");if(describe)status.textContent=`Watch: ${padNames[index]}`;later(()=>pads[index].classList.remove("active"),duration);}
  function playback(){playing=true;position=0;status.textContent="Watch the pattern…";update();sequence.forEach((pad,index)=>later(()=>flash(pad,320,true),index*560+220));later(()=>{playing=false;status.textContent="Your turn — repeat it";update();announce("Your turn.");},sequence.length*560+260);}
  function nextRound(){level+=1;best=Math.max(best,level-1);safeSave(STORE,best);sequence.push(Math.floor(Math.random()*4));update();later(playback,500);}
  function press(index){if(playing||!started)return;flash(index,180);if(index!==sequence[position]){started=false;best=Math.max(best,level-1);safeSave(STORE,best);update();status.textContent="Pattern missed";openResult({label:"SEQUENCE ENDED",title:"Pattern complete.",mark:"×",message:"One pad broke the sequence.",stats:[["Level",level],["Best",best]],actions:[{label:"Try again",primary:true,action:()=>{closeResult();start();}}]});return;}position+=1;if(position===sequence.length){playing=true;status.textContent="Correct — next level";announce("Sequence correct.");nextRound();}}
  function start(){clearTimers();pads.forEach(pad=>pad.classList.remove("active"));closeResult();sequence=[];position=0;level=0;playing=false;started=true;document.querySelector("#simon-start").textContent="Restart";nextRound();}
  pads.forEach((pad)=>pad.addEventListener("click",()=>press(Number(pad.dataset.pad))));document.querySelector("#simon-start").addEventListener("click",start);document.querySelector("#simon-new").addEventListener("click",start);update();return clearTimers;
}

function setupLightsOut(){
  const STORE="pocket-arcade-lights-v1";let best=Number(safeLoad(STORE,0))||0,board=Array(25).fill(false),moves=0,history=[],complete=false;
  elements.toolbar.innerHTML=statMarkup("MOVES",0,"lights-moves")+statMarkup("BEST",best||"—","lights-best")+'<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn" id="lights-undo" type="button">Undo</button><button class="btn primary" id="lights-new" type="button">New puzzle</button></div>';setInstructions("<p>Pressing a square flips that light and its neighbors above, below, left, and right.</p><p>Turn every light off.</p>");setControls('<button class="btn" id="lights-easy" type="button">Gentle shuffle</button><button class="btn" id="lights-hard" type="button">Deep shuffle</button>');
  function affected(index){const row=Math.floor(index/5),column=index%5,result=[index];if(row>0)result.push(index-5);if(row<4)result.push(index+5);if(column>0)result.push(index-1);if(column<4)result.push(index+1);return result;}
  function apply(index){affected(index).forEach(i=>board[i]=!board[i]);}
  function update(){document.querySelector("#lights-moves").textContent=moves;document.querySelector("#lights-best").textContent=best||"—";document.querySelector("#lights-undo").disabled=!history.length||complete;}
  function render(){elements.root.innerHTML='<div class="lights-board" role="grid" aria-label="Lights Out board"></div>';const grid=elements.root.firstElementChild;board.forEach((on,index)=>{const button=document.createElement("button");button.type="button";button.className=`light-cell${on?" on":""}`;button.disabled=complete;button.setAttribute("role","gridcell");button.setAttribute("aria-label",`Light ${index+1}, ${on?"on":"off"}`);button.addEventListener("click",()=>press(index));grid.appendChild(button);});update();}
  function press(index){if(complete)return;history.push(index);apply(index);moves++;render();if(board.every(on=>!on)){complete=true;if(!best||moves<best){best=moves;safeSave(STORE,best);}render();openResult({title:"All lights out.",message:"The board is completely quiet.",stats:[["Moves",moves],["Best",best]],actions:[{label:"New puzzle",primary:true,action:()=>{closeResult();start(16);}}]});}}
  function start(depth=16){closeResult();board=Array(25).fill(false);moves=0;history=[];complete=false;let previous=-1;for(let step=0;step<depth;step++){let index;do{index=Math.floor(Math.random()*25);}while(index===previous);apply(index);previous=index;}if(board.every(on=>!on))apply(12);render();}
  function undo(){const index=history.pop();if(index===undefined)return;apply(index);moves=Math.max(0,moves-1);render();}
  document.querySelector("#lights-new").addEventListener("click",()=>start(16));document.querySelector("#lights-undo").addEventListener("click",undo);document.querySelector("#lights-easy").addEventListener("click",()=>start(8));document.querySelector("#lights-hard").addEventListener("click",()=>start(28));start();return()=>{};
}

function setupRockPaperScissors(){
  const STORE="pocket-arcade-rps-v1";let matchWins=Number(safeLoad(STORE,0))||0,player=0,cpu=0,rounds=0,locked=false,resultTimer=null;const choices={rock:{label:"Rock",symbol:"●"},paper:{label:"Paper",symbol:"▰"},scissors:{label:"Scissors",symbol:"✂"}};
  elements.toolbar.innerHTML=statMarkup("YOU",0,"rps-player")+statMarkup("COMPUTER",0,"rps-cpu")+statMarkup("MATCH WINS",matchWins,"rps-wins")+'<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn" id="rps-new" type="button">New match</button></div>';setInstructions("<p>Rock beats scissors, scissors beats paper, and paper beats rock.</p><p>The first side to five round wins takes the match.</p>");setControls('<button class="btn danger" id="rps-reset" type="button">Reset match wins</button>');
  elements.root.innerHTML='<div class="rps-wrap"><div class="rps-arena"><div class="rps-choice" id="rps-your"><div>?</div><small>YOUR HAND</small></div><span class="versus">VS</span><div class="rps-choice" id="rps-their"><div>?</div><small>COMPUTER</small></div></div><div class="rps-buttons"></div><p class="turn-note" id="rps-status">Choose your hand</p></div>';const buttons=elements.root.querySelector(".rps-buttons");Object.entries(choices).forEach(([key,value])=>{const button=document.createElement("button");button.type="button";button.className="btn";button.dataset.choice=key;button.textContent=value.label;button.addEventListener("click",()=>play(key));buttons.appendChild(button);});
  function update(){document.querySelector("#rps-player").textContent=player;document.querySelector("#rps-cpu").textContent=cpu;document.querySelector("#rps-wins").textContent=matchWins;buttons.querySelectorAll("button").forEach(b=>b.disabled=locked);}
  function play(yours){if(locked)return;const keys=Object.keys(choices),theirs=keys[Math.floor(Math.random()*keys.length)];document.querySelector("#rps-your div").textContent=choices[yours].symbol;document.querySelector("#rps-their div").textContent=choices[theirs].symbol;let message;if(yours===theirs)message="A draw.";else if((yours==="rock"&&theirs==="scissors")||(yours==="paper"&&theirs==="rock")||(yours==="scissors"&&theirs==="paper")){player++;message=`${choices[yours].label} wins the round.`;}else{cpu++;message=`${choices[theirs].label} wins the round.`;}rounds++;document.querySelector("#rps-status").textContent=message;announce(message);update();if(player===5||cpu===5){locked=true;if(player===5){matchWins++;safeSave(STORE,matchWins);}update();const playerWon=player===5,finalPlayer=player,finalCpu=cpu,finalRounds=rounds;resultTimer=window.setTimeout(()=>openResult({label:"MATCH COMPLETE",title:playerWon?"You win the match.":"Computer wins the match.",mark:playerWon?"✓":"○",message:`Final score ${finalPlayer} to ${finalCpu}.`,stats:[["Rounds",finalRounds],["Match wins",matchWins]],actions:[{label:"Play again",primary:true,action:()=>{closeResult();start();}}]}),450);}}
  function start(){window.clearTimeout(resultTimer);closeResult();player=0;cpu=0;rounds=0;locked=false;document.querySelector("#rps-your div").textContent="?";document.querySelector("#rps-their div").textContent="?";document.querySelector("#rps-status").textContent="Choose your hand";update();}
  document.querySelector("#rps-new").addEventListener("click",start);document.querySelector("#rps-reset").addEventListener("click",()=>{if(window.confirm("Reset saved match wins?")){matchWins=0;safeSave(STORE,0);update();}});start();return()=>window.clearTimeout(resultTimer);
}

function setupBreakout(){
  const STORE="pocket-arcade-breakout-v1";let best=Number(safeLoad(STORE,0))||0,score=0,lives=3,running=false,frame=null,left=false,right=false,started=false,assist=false;let paddle,ball,bricks;
  elements.toolbar.innerHTML=statMarkup("SCORE",0,"breakout-score")+statMarkup("LIVES",3,"breakout-lives")+statMarkup("BEST",best,"breakout-best")+'<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn primary" id="breakout-start" type="button">Start</button></div>';setInstructions("<p>Move with <kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd>. Keep the ball above your paddle and clear every brick.</p><p>Assist mode follows the ball automatically and announces progress for nonvisual play.</p>");setControls('<button class="btn" id="breakout-left" type="button">Hold ←</button><button class="btn" id="breakout-right" type="button">Hold →</button><button class="btn" id="breakout-assist" type="button" aria-pressed="false">Assist: off</button><button class="btn" id="breakout-new" type="button">New game</button>');elements.root.innerHTML='<div class="canvas-wrap"><canvas class="game-canvas wide" id="breakout-canvas" width="640" height="480" aria-label="Breakout game area" aria-describedby="breakout-state"></canvas><p class="sr-only" id="breakout-state"></p><div class="canvas-overlay" id="breakout-overlay"><div><h2>Ready?</h2><p>Press Start to launch the ball.</p></div></div></div>';const canvas=document.querySelector("#breakout-canvas"),ctx=canvas.getContext("2d"),overlay=document.querySelector("#breakout-overlay"),stateText=document.querySelector("#breakout-state");
  function makeBricks(){bricks=[];for(let row=0;row<5;row++)for(let column=0;column<10;column++)bricks.push({x:19+column*61,y:38+row*27,w:54,h:18,on:true,color:["#d76c45","#dfad4d","#58758d","#3f725f","#9a6e88"][row]});}
  function resetBall(){paddle={x:260,y:445,w:120,h:13};ball={x:320,y:420,r:8,dx:(Math.random()>.5?1:-1)*3.4,dy:-3.6};}
  function updateStats(){best=Math.max(best,score);document.querySelector("#breakout-score").textContent=score;document.querySelector("#breakout-lives").textContent=lives;document.querySelector("#breakout-best").textContent=best;safeSave(STORE,best);}
  function draw(){ctx.clearRect(0,0,640,480);ctx.fillStyle="#e5e8df";ctx.fillRect(0,0,640,480);bricks.forEach(brick=>{if(!brick.on)return;ctx.fillStyle=brick.color;ctx.fillRect(brick.x,brick.y,brick.w,brick.h);});ctx.fillStyle="#17211d";ctx.fillRect(paddle.x,paddle.y,paddle.w,paddle.h);ctx.fillStyle="#fffdf8";ctx.strokeStyle="#17211d";ctx.lineWidth=2;ctx.beginPath();ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();ctx.stroke();stateText.textContent=`Ball at column ${Math.round(ball.x/10)} of 64 and row ${Math.round(ball.y/10)} of 48. Paddle spans columns ${Math.round(paddle.x/10)} through ${Math.round((paddle.x+paddle.w)/10)}. ${bricks.filter(brick=>brick.on).length} bricks remain.`;}
  function end(won){running=false;cancelAnimationFrame(frame);best=Math.max(best,score);safeSave(STORE,best);updateStats();openResult({label:won?"WALL CLEARED":"GAME OVER",title:won?"Every brick cleared.":"Last ball lost.",mark:won?"✓":"×",message:won?"A clean sweep from top to bottom.":"The wall will wait for another run.",stats:[["Score",score],["Best",best]],actions:[{label:"Play again",primary:true,action:()=>{closeResult();reset();start();}}]});}
  function step(){if(!running)return;if(left)paddle.x=Math.max(0,paddle.x-7);if(right)paddle.x=Math.min(640-paddle.w,paddle.x+7);if(assist)paddle.x=Math.max(0,Math.min(640-paddle.w,ball.x-paddle.w/2));ball.x+=ball.dx;ball.y+=ball.dy;if(ball.x-ball.r<=0||ball.x+ball.r>=640)ball.dx*=-1;if(ball.y-ball.r<=0)ball.dy=Math.abs(ball.dy);if(ball.dy>0&&ball.y+ball.r>=paddle.y&&ball.y-ball.r<=paddle.y+paddle.h&&ball.x>=paddle.x&&ball.x<=paddle.x+paddle.w){ball.dy=-Math.abs(ball.dy);ball.dx+=(ball.x-(paddle.x+paddle.w/2))*.025;}for(const brick of bricks){if(brick.on&&ball.x+ball.r>brick.x&&ball.x-ball.r<brick.x+brick.w&&ball.y+ball.r>brick.y&&ball.y-ball.r<brick.y+brick.h){brick.on=false;ball.dy*=-1;score+=10;updateStats();announce(`Brick cleared. Score ${score}.`);break;}}if(bricks.every(b=>!b.on)){draw();end(true);return;}if(ball.y-ball.r>480){lives--;updateStats();if(lives<=0){end(false);return;}resetBall();running=false;overlay.hidden=false;overlay.querySelector("h2").textContent="Ball lost";overlay.querySelector("p").textContent="Press Resume for the next ball.";document.querySelector("#breakout-start").textContent="Resume";draw();return;}draw();frame=requestAnimationFrame(step);}
  function start(){if(running)return;overlay.hidden=true;running=true;started=true;document.querySelector("#breakout-start").textContent="Pause";frame=requestAnimationFrame(step);}
  function toggle(){if(running){running=false;cancelAnimationFrame(frame);overlay.hidden=false;overlay.querySelector("h2").textContent="Paused";overlay.querySelector("p").textContent="Press Resume when ready.";document.querySelector("#breakout-start").textContent="Resume";}else start();}
  function reset(){cancelAnimationFrame(frame);running=false;started=false;score=0;lives=3;makeBricks();resetBall();overlay.hidden=false;overlay.querySelector("h2").textContent="Ready?";overlay.querySelector("p").textContent="Press Start to launch the ball.";document.querySelector("#breakout-start").textContent="Start";updateStats();draw();}
  function toggleAssist(){assist=!assist;const button=document.querySelector("#breakout-assist");button.textContent=`Assist: ${assist?"on":"off"}`;button.setAttribute("aria-pressed",String(assist));announce(assist?"Assist mode on. The paddle will follow the ball.":"Assist mode off.");}
  function key(event,down){if(["INPUT","SELECT"].includes(event.target.tagName))return;if(["ArrowLeft","a","A"].includes(event.key)){event.preventDefault();left=down;}if(["ArrowRight","d","D"].includes(event.key)){event.preventDefault();right=down;}if(down&&event.key===" "){event.preventDefault();toggle();}}
  const keyDown=e=>key(e,true),keyUp=e=>key(e,false);document.addEventListener("keydown",keyDown);document.addEventListener("keyup",keyUp);document.querySelector("#breakout-start").addEventListener("click",toggle);document.querySelector("#breakout-new").addEventListener("click",reset);document.querySelector("#breakout-assist").addEventListener("click",toggleAssist);const leftButton=document.querySelector("#breakout-left"),rightButton=document.querySelector("#breakout-right");leftButton.addEventListener("pointerdown",()=>{left=true;if(!running)start();});rightButton.addEventListener("pointerdown",()=>{right=true;if(!running)start();});window.addEventListener("pointerup",()=>{left=false;right=false;});canvas.addEventListener("pointermove",event=>{if(event.pointerType!=="mouse"||!running)return;const rect=canvas.getBoundingClientRect();paddle.x=Math.max(0,Math.min(640-paddle.w,(event.clientX-rect.left)/rect.width*640-paddle.w/2));});reset();return()=>{cancelAnimationFrame(frame);document.removeEventListener("keydown",keyDown);document.removeEventListener("keyup",keyUp);};
}

function setupWordGuess(){
  const STORE="pocket-arcade-word-guess-v1",entries=[{w:"ORCHESTRA",c:"A large group of musicians"},{w:"VOLCANO",c:"A mountain that can erupt"},{w:"TELESCOPE",c:"An instrument for viewing distant space"},{w:"LABYRINTH",c:"A complicated maze"},{w:"HORIZON",c:"Where the land appears to meet the sky"},{w:"BLUEPRINT",c:"A detailed design plan"},{w:"WILDERNESS",c:"Uncultivated natural country"},{w:"JOURNAL",c:"A personal written record"},{w:"CINNAMON",c:"A fragrant brown spice"},{w:"GALAXY",c:"A vast system of stars"},{w:"MOMENTUM",c:"Motion that is hard to stop"},{w:"QUARTZ",c:"A common crystalline mineral"},{w:"PARACHUTE",c:"It slows a fall through the air"},{w:"SYMPHONY",c:"An extended orchestral composition"},{w:"LIGHTHOUSE",c:"A coastal tower that guides ships"}];let stats=safeLoad(STORE,{wins:0,streak:0,best:0}),entry,guessed=new Set(),wrong=new Set(),over=false;
  elements.toolbar.innerHTML=statMarkup("MISSES","0 / 6","guess-misses")+statMarkup("WINS",stats.wins,"guess-wins")+statMarkup("BEST STREAK",stats.best,"guess-best")+'<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn" id="guess-new" type="button">New word</button></div>';setInstructions("<p>Choose letters to reveal the hidden word. Six incorrect letters end the round.</p><p>The clue gives you a place to begin.</p>");setControls('<button class="btn danger" id="guess-reset" type="button">Reset record</button>');
  function update(){document.querySelector("#guess-misses").textContent=`${wrong.size} / 6`;document.querySelector("#guess-wins").textContent=stats.wins;document.querySelector("#guess-best").textContent=stats.best;}
  function render(){elements.root.innerHTML=`<div class="guess-panel"><p class="clue">${entry.c}</p><div class="attempt-dots" aria-label="${6-wrong.size} attempts remaining">${Array.from({length:6},(_,i)=>`<i class="${i<wrong.size?"used":""}"></i>`).join("")}</div><div class="hangman-word" aria-label="Hidden word">${[...entry.w].map(letter=>letter===" "?'<span class="letter-slot space"></span>':`<span class="letter-slot">${guessed.has(letter)?letter:""}</span>`).join("")}</div><div class="letter-keys" aria-label="Letter keyboard"></div><p class="feedback" id="guess-feedback">${over?`The word was ${entry.w}.`:"Choose a letter"}</p></div>`;const keys=elements.root.querySelector(".letter-keys");"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(letter=>{const button=document.createElement("button");button.type="button";button.className=`letter-key${guessed.has(letter)?" correct":wrong.has(letter)?" wrong":""}`;button.textContent=letter;button.disabled=over||guessed.has(letter)||wrong.has(letter);button.setAttribute("aria-label",`Guess ${letter}`);button.addEventListener("click",()=>guess(letter));keys.appendChild(button);});update();}
  function guess(letter){if(over)return;if(entry.w.includes(letter)){guessed.add(letter);announce(`${letter} is in the word.`);}else{wrong.add(letter);announce(`${letter} is not in the word.`);}const solved=[...entry.w].every(letter=>letter===" "||guessed.has(letter));if(solved){over=true;stats.wins++;stats.streak++;stats.best=Math.max(stats.best,stats.streak);safeSave(STORE,stats);render();openResult({title:"Word revealed.",message:entry.w,stats:[["Misses",wrong.size],["Streak",stats.streak],["Best",stats.best]],actions:[{label:"Next word",primary:true,action:()=>{closeResult();start();}}]});}else if(wrong.size>=6){over=true;stats.streak=0;safeSave(STORE,stats);render();openResult({label:"WORD MISSED",title:"Six letters used.",mark:"×",message:`The word was ${entry.w}.`,stats:[["Wins",stats.wins],["Best streak",stats.best]],actions:[{label:"Try another",primary:true,action:()=>{closeResult();start();}}]});}else render();}
  function start(){closeResult();let next;do{next=entries[Math.floor(Math.random()*entries.length)];}while(next===entry);entry=next;guessed=new Set();wrong=new Set();over=false;render();}
  document.querySelector("#guess-new").addEventListener("click",start);document.querySelector("#guess-reset").addEventListener("click",()=>{if(window.confirm("Reset your Word Guess record?")){stats={wins:0,streak:0,best:0};safeSave(STORE,stats);update();}});start();return()=>{};
}

function setupSlidingPuzzle(){
  const STORE="pocket-arcade-sliding-v1";let records=safeLoad(STORE,{moves:null,time:null}),board=[],moves=0,seconds=0,timer=null,started=false,complete=false;
  elements.toolbar.innerHTML=statMarkup("MOVES",0,"slide-moves")+statMarkup("TIME","00:00","slide-time")+statMarkup("BEST",records.moves||"—","slide-best")+'<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn primary" id="slide-new" type="button">New puzzle</button></div>';setInstructions("<p>Select a tile beside the empty space to slide it. You can also use the <kbd>Arrow keys</kbd>.</p><p>Arrange 1 through 15 in reading order.</p>");setControls('<button class="btn" id="slide-reset" type="button">Reset record</button>');
  function neighbors(blank){const row=Math.floor(blank/4),column=blank%4,result=[];if(row>0)result.push(blank-4);if(row<3)result.push(blank+4);if(column>0)result.push(blank-1);if(column<3)result.push(blank+1);return result;}
  function update(){document.querySelector("#slide-moves").textContent=moves;document.querySelector("#slide-time").textContent=formatTime(seconds);document.querySelector("#slide-best").textContent=records.moves||"—";}
  function render(){const blank=board.indexOf(0),near=neighbors(blank);elements.root.innerHTML='<div class="slide-board" role="grid" aria-label="Sliding number puzzle"></div>';const grid=elements.root.firstElementChild;board.forEach((value,index)=>{const button=document.createElement("button");button.type="button";button.className=`slide-tile${value===0?" empty":""}${near.includes(index)?" adjacent":""}`;button.textContent=value||"";button.disabled=complete||value===0||!near.includes(index);button.setAttribute("role","gridcell");button.setAttribute("aria-label",value?`Tile ${value}`:"Empty space");button.addEventListener("click",()=>move(index));grid.appendChild(button);});update();}
  function beginTimer(){if(started)return;started=true;timer=window.setInterval(()=>{seconds++;update();},1000);}
  function solved(){return board.every((value,index)=>value===(index===15?0:index+1));}
  function move(index){const blank=board.indexOf(0);if(!neighbors(blank).includes(index)||complete)return;beginTimer();[board[index],board[blank]]=[board[blank],board[index]];moves++;render();if(solved()){complete=true;window.clearInterval(timer);if(!records.moves||moves<records.moves)records.moves=moves;if(!records.time||seconds<records.time)records.time=seconds;safeSave(STORE,records);update();openResult({title:"Order restored.",message:"Every tile is back in place.",stats:[["Moves",moves],["Time",formatTime(seconds)],["Best",records.moves]],actions:[{label:"New puzzle",primary:true,action:()=>{closeResult();start();}}]});}}
  function start(){window.clearInterval(timer);closeResult();board=Array.from({length:15},(_,i)=>i+1).concat(0);let blank=15,last=-1;for(let step=0;step<220;step++){const choices=neighbors(blank).filter(i=>i!==last),chosen=choices[Math.floor(Math.random()*choices.length)];[board[blank],board[chosen]]=[board[chosen],board[blank]];last=blank;blank=chosen;}moves=0;seconds=0;started=false;complete=false;render();}
  function keyHandler(event){if(elements.dialog.open)return;const blank=board.indexOf(0),row=Math.floor(blank/4),column=blank%4;let target=-1;if(event.key==="ArrowUp"&&row<3)target=blank+4;if(event.key==="ArrowDown"&&row>0)target=blank-4;if(event.key==="ArrowLeft"&&column<3)target=blank+1;if(event.key==="ArrowRight"&&column>0)target=blank-1;if(target>=0){event.preventDefault();move(target);}}
  document.querySelector("#slide-new").addEventListener("click",start);document.querySelector("#slide-reset").addEventListener("click",()=>{if(window.confirm("Reset your Sliding Puzzle record?")){records={moves:null,time:null};safeSave(STORE,records);update();}});document.addEventListener("keydown",keyHandler);start();return()=>{window.clearInterval(timer);document.removeEventListener("keydown",keyHandler);};
}

function setupMathSprint(){
  const STORE="pocket-arcade-math-v1";let records=safeLoad(STORE,{}),difficulty="easy",question=null,round=0,mistakes=0,tenths=0,timer=null,nextTimer=null,complete=false,transitioning=false;
  elements.toolbar.innerHTML=statMarkup("QUESTION","1 / 10","math-round")+statMarkup("TIME","0.0s","math-time")+statMarkup("MISTAKES",0,"math-mistakes")+statMarkup("BEST","—","math-best")+'<div class="toolbar-spacer"></div>';setInstructions("<p>Solve ten questions as quickly as you can. Wrong answers add a two-second penalty.</p><p>Press <kbd>Enter</kbd> to submit.</p>");setControls('<div class="segmented" id="math-level" aria-label="Difficulty"><button type="button" data-value="easy">Easy</button><button type="button" data-value="medium">Medium</button><button type="button" data-value="hard">Hard</button></div><button class="btn" id="math-new" type="button">New sprint</button>');
  function createQuestion(){let a,b,op,answer;if(difficulty==="easy"){a=2+Math.floor(Math.random()*19);b=1+Math.floor(Math.random()*15);op=Math.random()<.5?"+":"−";if(op==="−"&&b>a)[a,b]=[b,a];answer=op==="+"?a+b:a-b;}else if(difficulty==="medium"){if(Math.random()<.55){a=2+Math.floor(Math.random()*11);b=2+Math.floor(Math.random()*11);op="×";answer=a*b;}else{a=10+Math.floor(Math.random()*90);b=5+Math.floor(Math.random()*60);op=Math.random()<.5?"+":"−";if(op==="−"&&b>a)[a,b]=[b,a];answer=op==="+"?a+b:a-b;}}else{const type=Math.floor(Math.random()*4);if(type===0){b=2+Math.floor(Math.random()*11);answer=2+Math.floor(Math.random()*11);a=b*answer;op="÷";}else if(type===1){a=7+Math.floor(Math.random()*18);b=3+Math.floor(Math.random()*13);op="×";answer=a*b;}else{a=50+Math.floor(Math.random()*151);b=10+Math.floor(Math.random()*91);op=type===2?"+":"−";if(op==="−"&&b>a)[a,b]=[b,a];answer=op==="+"?a+b:a-b;}}return{a,b,op,answer};}
  function update(){const elapsed=(tenths/10+mistakes*2).toFixed(1);document.querySelector("#math-round").textContent=`${Math.min(round+1,10)} / 10`;document.querySelector("#math-time").textContent=`${elapsed}s`;document.querySelector("#math-mistakes").textContent=mistakes;document.querySelector("#math-best").textContent=records[difficulty]?`${records[difficulty].toFixed(1)}s`:"—";}
  function render(){question=createQuestion();elements.root.innerHTML=`<div class="math-panel"><p class="clue">Question ${round+1} of 10</p><h2 class="math-question">${question.a} ${question.op} ${question.b}</h2><form class="text-form" id="math-form"><input class="text-input" id="math-input" type="number" inputmode="numeric" aria-label="Answer" autocomplete="off"><button class="btn primary" type="submit">Answer</button></form><p class="feedback" id="math-feedback" aria-live="polite"></p></div>`;document.querySelector("#math-form").addEventListener("submit",submit);document.querySelector("#math-input").focus();update();}
  function submit(event){event.preventDefault();if(complete||transitioning)return;const input=document.querySelector("#math-input"),feedback=document.querySelector("#math-feedback"),rawAnswer=input.value.trim();if(rawAnswer===""){feedback.className="feedback bad";feedback.textContent="Enter an answer first.";input.focus();return;}if(Number(rawAnswer)===question.answer){transitioning=true;input.disabled=true;feedback.className="feedback good";feedback.textContent="Correct";round++;if(round>=10){complete=true;window.clearInterval(timer);const finalTime=tenths/10+mistakes*2;if(!records[difficulty]||finalTime<records[difficulty]){records[difficulty]=finalTime;safeSave(STORE,records);}update();openResult({title:"Sprint complete.",message:"Ten answers across the line.",stats:[["Time",`${finalTime.toFixed(1)}s`],["Mistakes",mistakes],["Best",`${records[difficulty].toFixed(1)}s`]],actions:[{label:"Sprint again",primary:true,action:()=>{closeResult();start();}}]});}else nextTimer=window.setTimeout(()=>{transitioning=false;render();},180);}else{mistakes++;feedback.className="feedback bad";feedback.textContent="Try that one again · +2 sec";input.select();update();}}
  function start(){window.clearInterval(timer);window.clearTimeout(nextTimer);closeResult();round=0;mistakes=0;tenths=0;complete=false;transitioning=false;activateSegment(document.querySelector("#math-level"),difficulty);timer=window.setInterval(()=>{tenths++;update();},100);render();}
  document.querySelector("#math-level").addEventListener("click",event=>{if(event.target.dataset.value){difficulty=event.target.dataset.value;start();}});document.querySelector("#math-new").addEventListener("click",start);start();return()=>{window.clearInterval(timer);window.clearTimeout(nextTimer);};
}

function setupColorMatch(){
  const STORE="pocket-arcade-color-v1",colors=[{name:"RED",value:"#c6534c"},{name:"BLUE",value:"#4e7392"},{name:"GREEN",value:"#3f795f"},{name:"ORANGE",value:"#d57643"}];let best=Number(safeLoad(STORE,0))||0,score=0,attempts=0,seconds=30,timer=null,running=false,prompt=null;
  elements.toolbar.innerHTML=statMarkup("TIME","30s","color-time")+statMarkup("SCORE",0,"color-score")+statMarkup("ACCURACY","100%","color-accuracy")+statMarkup("BEST",best,"color-best")+'<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn primary" id="color-start" type="button">Start</button></div>';setInstructions("<p>Choose the color of the large word's <strong>ink</strong>, not the color named by the letters.</p><p>You have 30 seconds.</p>");setControls('<button class="btn" id="color-new" type="button">Reset round</button>');
  function update(){document.querySelector("#color-time").textContent=`${seconds}s`;document.querySelector("#color-score").textContent=score;document.querySelector("#color-accuracy").textContent=`${attempts?Math.round(score/attempts*100):100}%`;document.querySelector("#color-best").textContent=best;}
  function nextPrompt(){const word=colors[Math.floor(Math.random()*colors.length)],ink=colors[Math.floor(Math.random()*colors.length)];prompt={word,ink};const text=document.querySelector("#color-prompt");text.textContent=word.name;text.style.color=ink.value;text.setAttribute("aria-label",`The word says ${word.name}. Its ink color is ${ink.name}.`);}
  function render(){elements.root.innerHTML='<div class="color-panel"><p class="clue">Choose the ink color</p><div class="color-prompt" id="color-prompt">READY</div><div class="color-options"></div><p class="feedback" id="color-feedback">Press Start when ready</p></div>';const options=elements.root.querySelector(".color-options");shuffle(colors).forEach(color=>{const button=document.createElement("button");button.type="button";button.className="color-option";button.style.background=color.value;button.textContent=color.name;button.disabled=!running;button.addEventListener("click",()=>choose(color));options.appendChild(button);});if(running)nextPrompt();update();}
  function choose(color){if(!running)return;attempts++;const feedback=document.querySelector("#color-feedback");if(color.name===prompt.ink.name){score++;feedback.className="feedback good";feedback.textContent="Correct";}else{feedback.className="feedback bad";feedback.textContent=`The ink was ${prompt.ink.name.toLowerCase()}`;}announce(feedback.textContent);update();nextPrompt();}
  function finish(){running=false;window.clearInterval(timer);best=Math.max(best,score);safeSave(STORE,best);render();openResult({label:"TIME COMPLETE",title:"Focus round finished.",message:"Thirty seconds of careful attention.",stats:[["Score",score],["Accuracy",`${attempts?Math.round(score/attempts*100):100}%`],["Best",best]],actions:[{label:"Play again",primary:true,action:()=>{closeResult();reset();start();}}]});}
  function start(){if(running)return;running=true;document.querySelector("#color-start").textContent="Running";document.querySelector("#color-start").disabled=true;render();timer=window.setInterval(()=>{seconds--;update();if(seconds<=0)finish();},1000);}
  function reset(){window.clearInterval(timer);closeResult();running=false;score=0;attempts=0;seconds=30;document.querySelector("#color-start").textContent="Start";document.querySelector("#color-start").disabled=false;render();}
  document.querySelector("#color-start").addEventListener("click",start);document.querySelector("#color-new").addEventListener("click",reset);render();return()=>window.clearInterval(timer);
}

function makeTransformedSnake(size){
  let path=[];
  for(let row=0;row<size;row++){const columns=Array.from({length:size},(_,index)=>row%2===0?index:size-1-index);columns.forEach(column=>path.push([row,column]));}
  const rotations=Math.floor(Math.random()*4),flip=Math.random()<.5;
  path=path.map(([row,column])=>{let r=row,c=flip?size-1-column:column;for(let turn=0;turn<rotations;turn++) [r,c]=[c,size-1-r];return r*size+c;});
  return path;
}

function gridAdjacent(first,second,size){return Math.abs(Math.floor(first/size)-Math.floor(second/size))+Math.abs(first%size-second%size)===1;}

function bindGridNavigation(button,index,size){
  button.dataset.index=String(index);
  button.addEventListener("keydown",event=>{let target=index;if(event.key==="ArrowUp")target=index-size;if(event.key==="ArrowDown")target=index+size;if(event.key==="ArrowLeft"&&index%size>0)target=index-1;if(event.key==="ArrowRight"&&index%size<size-1)target=index+1;if(target!==index&&target>=0&&target<size*size){event.preventDefault();elements.root.querySelector(`[data-index="${target}"]`)?.focus();}});
}

function restoreGridFocus(index){window.setTimeout(()=>elements.root.querySelector(`[data-index="${index}"]`)?.focus(),0);}

function setupNeon(){
  const STORE="pocket-arcade-neon-v1",configs={easy:{size:5,pairs:4},medium:{size:6,pairs:5},hard:{size:7,pairs:6}},symbols=["◆","●","▲","■","✦","+"];let records=safeLoad(STORE,{}),difficulty="easy",size=5,solution=[],segments=[],endpoints=new Map(),paths=[],targets=[],active=-1,moves=0,seconds=0,timer=null,started=false,complete=false,dragging=false;
  elements.toolbar.innerHTML=statMarkup("PAIRS","0 / 4","neon-pairs")+statMarkup("TIME","00:00","neon-time")+statMarkup("BEST","—","neon-best")+'<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn" id="neon-reset" type="button">Reset paths</button><button class="btn primary" id="neon-new" type="button">New grid</button></div>';
  setInstructions("<p>Select a symbol, then trace through neighboring cells to its matching symbol. Paths cannot overlap.</p><p>Connect every pair and light the entire grid.</p>");
  setControls('<div class="segmented" id="neon-level" aria-label="Difficulty"><button type="button" data-value="easy">Easy</button><button type="button" data-value="medium">Medium</button><button type="button" data-value="hard">Hard</button></div><button class="btn" id="neon-hint" type="button">Hint</button>');
  function stopTimer(){window.clearInterval(timer);timer=null;}function beginTimer(){if(started)return;started=true;timer=window.setInterval(()=>{seconds++;update();},1000);}
  function connectedCount(){return paths.filter((path,color)=>path.length>1&&path[path.length-1]===targets[color]).length;}
  function update(){document.querySelector("#neon-pairs").textContent=`${connectedCount()} / ${segments.length}`;document.querySelector("#neon-time").textContent=formatTime(seconds);document.querySelector("#neon-best").textContent=records[difficulty]?formatTime(records[difficulty]):"—";}
  function ownerAt(index){for(let color=0;color<paths.length;color++)if(paths[color].includes(index))return color;return endpoints.has(index)?endpoints.get(index):null;}
  function render(){elements.root.innerHTML='<div class="neon-wrap"><div class="neon-board" role="group" aria-label="Neon connection grid"></div><p class="turn-note" id="neon-status" aria-live="polite"></p></div>';const board=elements.root.querySelector(".neon-board");board.style.setProperty("--size",size);for(let index=0;index<size*size;index++){const color=ownerAt(index),endpointColor=endpoints.get(index),button=document.createElement("button");button.type="button";button.className=`neon-cell${color!==null?" filled":""}${endpointColor!==undefined?" endpoint":""}${active===color?" active":""}`;if(color!==null)button.dataset.color=String(color);button.setAttribute("aria-label",endpointColor!==undefined?`${symbols[endpointColor]} endpoint, row ${Math.floor(index/size)+1}, column ${index%size+1}`:color!==null?`${symbols[color]} path`:"empty cell");button.textContent=endpointColor!==undefined?symbols[endpointColor]:"";bindGridNavigation(button,index,size);button.addEventListener("pointerdown",event=>{event.preventDefault();dragging=true;choose(index);});button.addEventListener("click",event=>{if(event.detail===0){choose(index);restoreGridFocus(index);}});board.appendChild(button);}const status=elements.root.querySelector("#neon-status");status.textContent=active>=0?`Tracing ${symbols[active]}`:"Choose a symbol to begin";update();}
  function choose(index){if(complete)return;const endpointColor=endpoints.get(index);if(active>=0&&endpointColor===active&&index===targets[active]&&gridAdjacent(paths[active][paths[active].length-1],index,size)){beginTimer();paths[active].push(index);moves++;active=-1;announce("Pair connected.");render();check();return;}if(endpointColor!==undefined){beginTimer();active=endpointColor;const [first,last]=segments[active][0]===index?[segments[active][0],segments[active][segments[active].length-1]]:[segments[active][segments[active].length-1],segments[active][0]];paths[active]=[first];targets[active]=last;moves++;render();return;}if(active<0)return;const path=paths[active],existingIndex=path.indexOf(index);if(existingIndex>=0){paths[active]=path.slice(0,existingIndex+1);moves++;render();return;}const last=path[path.length-1];if(!gridAdjacent(last,index,size))return;const owner=ownerAt(index);if(owner!==null)return;paths[active].push(index);moves++;render();}
  function check(){const used=new Set(paths.flat());if(connectedCount()===segments.length&&used.size===size*size){complete=true;stopTimer();if(!records[difficulty]||seconds<records[difficulty]){records[difficulty]=seconds;safeSave(STORE,records);}render();openResult({title:"Every signal connected.",message:"The full grid is glowing.",stats:[["Time",formatTime(seconds)],["Moves",moves],["Best",formatTime(records[difficulty])]],actions:[{label:"New grid",primary:true,action:()=>{closeResult();start(difficulty,true);}}]});}}
  function generate(){solution=makeTransformedSnake(size);const pairCount=configs[difficulty].pairs,total=size*size,cuts=[0];for(let pair=1;pair<pairCount;pair++){const ideal=Math.round(pair*total/pairCount),jitter=Math.floor(Math.random()*3)-1;cuts.push(Math.max(cuts[pair-1]+2,Math.min(total-(pairCount-pair)*2,ideal+jitter)));}cuts.push(total);segments=[];endpoints=new Map();for(let color=0;color<pairCount;color++){const segment=solution.slice(cuts[color],cuts[color+1]);segments.push(segment);endpoints.set(segment[0],color);endpoints.set(segment[segment.length-1],color);}paths=segments.map(segment=>[segment[0]]);targets=segments.map(segment=>segment[segment.length-1]);}
  function resetPaths(){stopTimer();paths=segments.map(segment=>[segment[0]]);targets=segments.map(segment=>segment[segment.length-1]);active=-1;moves=0;seconds=0;started=false;complete=false;render();}
  function hint(){if(complete)return;beginTimer();for(let color=0;color<segments.length;color++){const occupiedByOther=new Set(paths.flatMap((path,index)=>index===color?[]:path));if(paths[color].length!==segments[color].length&&segments[color].every(cell=>!occupiedByOther.has(cell)||endpoints.get(cell)===color)){paths[color]=[...segments[color]];targets[color]=segments[color][segments[color].length-1];active=-1;moves++;render();announce(`${symbols[color]} path revealed.`);check();return;}}showToast("Backtrack an overlapping path before using a hint");}
  function start(next=difficulty,force=false){if(!force&&moves&&!complete&&!window.confirm("Start a new Neon grid?"))return;stopTimer();closeResult();difficulty=next;size=configs[difficulty].size;moves=0;seconds=0;started=false;complete=false;active=-1;generate();activateSegment(document.querySelector("#neon-level"),difficulty);render();}
  const moveDrag=event=>{if(!dragging||active<0)return;const cell=document.elementFromPoint(event.clientX,event.clientY),index=Number(cell?.dataset.index);if(Number.isInteger(index)&&index!==paths[active][paths[active].length-1])choose(index);},stopDrag=()=>{dragging=false;};window.addEventListener("pointermove",moveDrag);window.addEventListener("pointerup",stopDrag);window.addEventListener("pointercancel",stopDrag);document.querySelector("#neon-new").addEventListener("click",()=>start());document.querySelector("#neon-reset").addEventListener("click",resetPaths);document.querySelector("#neon-hint").addEventListener("click",hint);document.querySelector("#neon-level").addEventListener("click",event=>{if(event.target.dataset.value)start(event.target.dataset.value);});start("easy",true);return()=>{stopTimer();window.removeEventListener("pointermove",moveDrag);window.removeEventListener("pointerup",stopDrag);window.removeEventListener("pointercancel",stopDrag);};
}

function setupCurrents(){
  const STORE="pocket-arcade-currents-v1",configs={easy:{size:5,gates:5},medium:{size:6,gates:7},hard:{size:7,gates:9}};let records=safeLoad(STORE,{}),difficulty="easy",size=5,solution=[],gates=new Map(),trail=[],seconds=0,moves=0,timer=null,started=false,complete=false,dragging=false;
  elements.toolbar.innerHTML=statMarkup("FILLED","1 / 25","current-filled")+statMarkup("TIME","00:00","current-time")+statMarkup("BEST","—","current-best")+'<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn" id="current-reset" type="button">Reset path</button><button class="btn primary" id="current-new" type="button">New grid</button></div>';
  setInstructions("<p>Start at gate 1 and trace through neighboring cells. Visit every numbered gate in order.</p><p>The current cannot cross itself. Select an earlier path cell to backtrack.</p>");
  setControls('<div class="segmented" id="current-level" aria-label="Difficulty"><button type="button" data-value="easy">Easy</button><button type="button" data-value="medium">Medium</button><button type="button" data-value="hard">Hard</button></div><button class="btn" id="current-hint" type="button">Hint</button>');
  function stopTimer(){window.clearInterval(timer);timer=null;}function beginTimer(){if(started)return;started=true;timer=window.setInterval(()=>{seconds++;update();},1000);}
  function nextGate(){let highest=0;trail.forEach(cell=>{if(gates.has(cell)&&gates.get(cell)===highest+1)highest++;});return highest+1;}
  function update(){document.querySelector("#current-filled").textContent=`${trail.length} / ${size*size}`;document.querySelector("#current-time").textContent=formatTime(seconds);document.querySelector("#current-best").textContent=records[difficulty]?formatTime(records[difficulty]):"—";}
  function render(){elements.root.innerHTML='<div class="current-wrap"><div class="current-board" role="group" aria-label="Currents path grid"></div><p class="turn-note" id="current-status" aria-live="polite"></p></div>';const board=elements.root.querySelector(".current-board");board.style.setProperty("--size",size);for(let index=0;index<size*size;index++){const pathIndex=trail.indexOf(index),button=document.createElement("button");button.type="button";button.className=`current-cell${pathIndex>=0?" filled":""}${pathIndex===trail.length-1?" head":""}${gates.has(index)?" gate":""}`;button.textContent=gates.has(index)?gates.get(index):"";button.setAttribute("aria-label",gates.has(index)?`Gate ${gates.get(index)}, ${pathIndex>=0?"visited":"not visited"}`:pathIndex>=0?`Path step ${pathIndex+1}`:"empty cell");bindGridNavigation(button,index,size);button.addEventListener("pointerdown",event=>{event.preventDefault();dragging=true;choose(index);});button.addEventListener("click",()=>{choose(index);restoreGridFocus(index);});board.appendChild(button);}elements.root.querySelector("#current-status").textContent=`Next gate: ${Math.min(nextGate(),gates.size)}`;update();}
  function choose(index){if(complete)return;const existing=trail.indexOf(index);if(existing>=0){if(existing<trail.length-1){beginTimer();trail=trail.slice(0,existing+1);moves++;render();}return;}const last=trail[trail.length-1];if(!gridAdjacent(last,index,size))return;const gate=gates.get(index);if(gate!==undefined&&gate!==nextGate()){showToast(`Find gate ${nextGate()} first`);return;}beginTimer();trail.push(index);moves++;render();if(trail.length===size*size){if(nextGate()===gates.size+1)finish();else showToast(`Gate ${nextGate()} is still missing`);}}
  function finish(){complete=true;stopTimer();if(!records[difficulty]||seconds<records[difficulty]){records[difficulty]=seconds;safeSave(STORE,records);}render();openResult({title:"The current is complete.",message:"One path flows through the entire grid.",stats:[["Time",formatTime(seconds)],["Moves",moves],["Best",formatTime(records[difficulty])]],actions:[{label:"New grid",primary:true,action:()=>{closeResult();start(difficulty,true);}}]});}
  function generate(){solution=makeTransformedSnake(size);gates=new Map();const count=configs[difficulty].gates;for(let gate=1;gate<=count;gate++){const position=Math.round((gate-1)*(solution.length-1)/(count-1));gates.set(solution[position],gate);}trail=[solution[0]];}
  function reset(){stopTimer();trail=[solution[0]];seconds=0;moves=0;started=false;complete=false;render();}
  function hint(){if(complete)return;const matches=trail.every((cell,index)=>cell===solution[index]);if(!matches){showToast("Backtrack until your path follows the hidden current");return;}if(trail.length<solution.length){beginTimer();trail.push(solution[trail.length]);moves++;render();announce("One path cell revealed.");if(trail.length===solution.length)finish();}}
  function start(next=difficulty,force=false){if(!force&&moves&&!complete&&!window.confirm("Start a new Currents grid?"))return;stopTimer();closeResult();difficulty=next;size=configs[difficulty].size;seconds=0;moves=0;started=false;complete=false;generate();activateSegment(document.querySelector("#current-level"),difficulty);render();}
  const moveDrag=event=>{if(!dragging)return;const cell=document.elementFromPoint(event.clientX,event.clientY),index=Number(cell?.dataset.index);if(Number.isInteger(index))choose(index);},stopDrag=()=>{dragging=false;};window.addEventListener("pointermove",moveDrag);window.addEventListener("pointerup",stopDrag);window.addEventListener("pointercancel",stopDrag);document.querySelector("#current-new").addEventListener("click",()=>start());document.querySelector("#current-reset").addEventListener("click",reset);document.querySelector("#current-hint").addEventListener("click",hint);document.querySelector("#current-level").addEventListener("click",event=>{if(event.target.dataset.value)start(event.target.dataset.value);});start("easy",true);return()=>{stopTimer();window.removeEventListener("pointermove",moveDrag);window.removeEventListener("pointerup",stopDrag);window.removeEventListener("pointercancel",stopDrag);};
}

function setupSnippets(){
  const STORE="pocket-arcade-snippets-v1",configs={easy:{size:5,pieces:6},medium:{size:6,pieces:9},hard:{size:7,pieces:12}};let records=safeLoad(STORE,{}),difficulty="easy",size=5,solution=[],clues=new Map(),placements=[],selected=null,moves=0,seconds=0,timer=null,started=false,complete=false;
  elements.toolbar.innerHTML=statMarkup("PIECES","0 / 6","snippet-pieces")+statMarkup("TIME","00:00","snippet-time")+statMarkup("BEST","—","snippet-best")+'<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn" id="snippet-clear" type="button">Clear pieces</button><button class="btn primary" id="snippet-new" type="button">New grid</button></div>';
  setInstructions("<p>Select two opposite corners to place a rectangle. Each rectangle must contain exactly one number.</p><p>The number must equal the rectangle's area, and every cell must be covered.</p>");
  setControls('<div class="segmented" id="snippet-level" aria-label="Difficulty"><button type="button" data-value="easy">Easy</button><button type="button" data-value="medium">Medium</button><button type="button" data-value="hard">Hard</button></div><button class="btn" id="snippet-hint" type="button">Hint</button>');
  function stopTimer(){window.clearInterval(timer);timer=null;}function beginTimer(){if(started)return;started=true;timer=window.setInterval(()=>{seconds++;update();},1000);}
  function rectCells(rect){const cells=[];for(let row=rect.r0;row<=rect.r1;row++)for(let column=rect.c0;column<=rect.c1;column++)cells.push(row*size+column);return cells;}
  function sameRect(a,b){return a.r0===b.r0&&a.c0===b.c0&&a.r1===b.r1&&a.c1===b.c1;}
  function ownerAt(index){return placements.findIndex(rect=>rectCells(rect).includes(index));}
  function update(){document.querySelector("#snippet-pieces").textContent=`${placements.length} / ${solution.length}`;document.querySelector("#snippet-time").textContent=formatTime(seconds);document.querySelector("#snippet-best").textContent=records[difficulty]?formatTime(records[difficulty]):"—";}
  function render(message=""){elements.root.innerHTML='<div class="snippet-wrap"><div class="snippet-board" role="group" aria-label="Rectangle partition grid"></div><p class="turn-note" id="snippet-status" aria-live="polite"></p></div>';const board=elements.root.querySelector(".snippet-board");board.style.setProperty("--size",size);for(let index=0;index<size*size;index++){const owner=ownerAt(index),button=document.createElement("button"),clue=clues.get(index);button.type="button";button.className=`snippet-cell${owner>=0?" placed":""}${selected===index?" selected":""}`;if(owner>=0)button.dataset.piece=String(owner%8);button.textContent=clue||"";button.setAttribute("aria-label",`Row ${Math.floor(index/size)+1}, column ${index%size+1}${clue?`, clue ${clue}`:""}${owner>=0?", covered":""}`);bindGridNavigation(button,index,size);button.addEventListener("click",()=>{choose(index);restoreGridFocus(index);});board.appendChild(button);}elements.root.querySelector("#snippet-status").textContent=message||(selected===null?"Choose the first corner":"Choose the opposite corner");update();}
  function choose(index){if(complete)return;const owner=ownerAt(index);if(selected===null&&owner>=0){beginTimer();placements.splice(owner,1);moves++;render("Piece removed");return;}if(selected===null){selected=index;render();return;}const firstRow=Math.floor(selected/size),firstColumn=selected%size,row=Math.floor(index/size),column=index%size,rect={r0:Math.min(firstRow,row),c0:Math.min(firstColumn,column),r1:Math.max(firstRow,row),c1:Math.max(firstColumn,column)},cells=rectCells(rect),insideClues=cells.filter(cell=>clues.has(cell)),overlaps=cells.some(cell=>ownerAt(cell)>=0);beginTimer();if(insideClues.length!==1||clues.get(insideClues[0])!==cells.length||overlaps){selected=null;moves++;render(overlaps?"That space is already covered":"The rectangle must match its single clue");announce("Rectangle does not fit the clues.");return;}placements.push(rect);selected=null;moves++;render("Piece placed");check();}
  function check(){const covered=new Set(placements.flatMap(rectCells));if(covered.size===size*size){complete=true;stopTimer();if(!records[difficulty]||seconds<records[difficulty]){records[difficulty]=seconds;safeSave(STORE,records);}render("Grid complete");openResult({title:"Every snippet fits.",message:"The grid is divided into matching areas.",stats:[["Time",formatTime(seconds)],["Moves",moves],["Best",formatTime(records[difficulty])]],actions:[{label:"New grid",primary:true,action:()=>{closeResult();start(difficulty,true);}}]});}}
  function generate(){solution=[{r0:0,c0:0,r1:size-1,c1:size-1}];while(solution.length<configs[difficulty].pieces){const candidates=solution.map((rect,index)=>({rect,index,area:(rect.r1-rect.r0+1)*(rect.c1-rect.c0+1)})).filter(item=>item.rect.r1>item.rect.r0||item.rect.c1>item.rect.c0).sort((a,b)=>b.area-a.area),choice=shuffle(candidates.slice(0,Math.min(4,candidates.length)))[0],rect=choice.rect,canHorizontal=rect.r1>rect.r0,canVertical=rect.c1>rect.c0,useHorizontal=canHorizontal&&(!canVertical||Math.random()<.5);let first,second;if(useHorizontal){const split=rect.r0+Math.floor(Math.random()*(rect.r1-rect.r0));first={r0:rect.r0,c0:rect.c0,r1:split,c1:rect.c1};second={r0:split+1,c0:rect.c0,r1:rect.r1,c1:rect.c1};}else{const split=rect.c0+Math.floor(Math.random()*(rect.c1-rect.c0));first={r0:rect.r0,c0:rect.c0,r1:rect.r1,c1:split};second={r0:rect.r0,c0:split+1,r1:rect.r1,c1:rect.c1};}solution.splice(choice.index,1,first,second);}clues=new Map();solution.forEach(rect=>{const cells=rectCells(rect),cell=cells[Math.floor(Math.random()*cells.length)];clues.set(cell,cells.length);});}
  function clear(){stopTimer();placements=[];selected=null;moves=0;seconds=0;started=false;complete=false;render();}
  function hint(){if(complete)return;beginTimer();const available=solution.find(rect=>!placements.some(placed=>sameRect(placed,rect))&&rectCells(rect).every(cell=>ownerAt(cell)<0));if(!available){showToast("Remove an overlapping piece before using a hint");return;}placements.push({...available});selected=null;moves++;render("One piece revealed");announce("A correct rectangle was placed.");check();}
  function start(next=difficulty,force=false){if(!force&&placements.length&&!complete&&!window.confirm("Start a new Snippets grid?"))return;stopTimer();closeResult();difficulty=next;size=configs[difficulty].size;placements=[];selected=null;moves=0;seconds=0;started=false;complete=false;generate();activateSegment(document.querySelector("#snippet-level"),difficulty);render();}
  document.querySelector("#snippet-new").addEventListener("click",()=>start());document.querySelector("#snippet-clear").addEventListener("click",clear);document.querySelector("#snippet-hint").addEventListener("click",hint);document.querySelector("#snippet-level").addEventListener("click",event=>{if(event.target.dataset.value)start(event.target.dataset.value);});start("easy",true);return stopTimer;
}

function setupStarstruck(){
  const STORE="pocket-arcade-starstruck-v1",configs={easy:5,medium:6,hard:7};let records=safeLoad(STORE,{}),difficulty="easy",size=5,solution=[],regions=[],states=[],seconds=0,moves=0,timer=null,started=false,complete=false;
  elements.toolbar.innerHTML=statMarkup("STARS","0 / 5","star-count")+statMarkup("TIME","00:00","star-time")+statMarkup("BEST","—","star-best")+'<div class="toolbar-spacer"></div><div class="toolbar-actions"><button class="btn" id="star-clear" type="button">Clear marks</button><button class="btn primary" id="star-new" type="button">New grid</button></div>';
  setInstructions("<p>Place exactly one star in every row, column, and colored region.</p><p>Stars cannot touch, even diagonally. Select a cell to cycle cross, star, and empty.</p>");
  setControls('<div class="segmented" id="star-level" aria-label="Difficulty"><button type="button" data-value="easy">Easy</button><button type="button" data-value="medium">Medium</button><button type="button" data-value="hard">Hard</button></div><button class="btn" id="star-hint" type="button">Hint</button>');
  function stopTimer(){window.clearInterval(timer);timer=null;}function beginTimer(){if(started)return;started=true;timer=window.setInterval(()=>{seconds++;update();},1000);}
  function stars(){return states.map((state,index)=>state===2?index:-1).filter(index=>index>=0);}
  function conflicts(){const result=new Set(),placed=stars();for(let first=0;first<placed.length;first++)for(let second=first+1;second<placed.length;second++){const a=placed[first],b=placed[second],rowA=Math.floor(a/size),rowB=Math.floor(b/size),colA=a%size,colB=b%size;if(rowA===rowB||colA===colB||regions[a]===regions[b]||(Math.abs(rowA-rowB)<=1&&Math.abs(colA-colB)<=1)){result.add(a);result.add(b);}}return result;}
  function update(){document.querySelector("#star-count").textContent=`${stars().length} / ${size}`;document.querySelector("#star-time").textContent=formatTime(seconds);document.querySelector("#star-best").textContent=records[difficulty]?formatTime(records[difficulty]):"—";}
  function render(message=""){const bad=conflicts();elements.root.innerHTML='<div class="star-wrap"><div class="star-board" role="group" aria-label="Star placement grid"></div><p class="turn-note" id="star-status" aria-live="polite"></p></div>';const board=elements.root.querySelector(".star-board");board.style.setProperty("--size",size);states.forEach((state,index)=>{const row=Math.floor(index/size),column=index%size,region=regions[index],edges=`${row===0||regions[index-size]!==region?" region-top":""}${row===size-1||regions[index+size]!==region?" region-bottom":""}${column===0||regions[index-1]!==region?" region-left":""}${column===size-1||regions[index+1]!==region?" region-right":""}`,button=document.createElement("button");button.type="button";button.className=`star-cell${state===2?" has-star":state===1?" crossed":""}${bad.has(index)?" conflict":""}${edges}`;button.dataset.region=String(region%8);button.textContent=state===2?"★":state===1?"×":"";button.setAttribute("aria-label",`Row ${row+1}, column ${column+1}, region ${region+1}, ${state===2?"star":state===1?"cross":"empty"}${bad.has(index)?", conflict":""}`);button.disabled=complete;bindGridNavigation(button,index,size);button.addEventListener("click",()=>{cycle(index);restoreGridFocus(index);});board.appendChild(button);});elements.root.querySelector("#star-status").textContent=message||(bad.size?"Some stars conflict":"Place one star in each row, column, and region");update();}
  function valid(){const placed=stars();if(placed.length!==size||conflicts().size)return false;for(let value=0;value<size;value++){if(placed.filter(index=>Math.floor(index/size)===value).length!==1)return false;if(placed.filter(index=>index%size===value).length!==1)return false;if(placed.filter(index=>regions[index]===value).length!==1)return false;}return true;}
  function cycle(index){if(complete)return;beginTimer();states[index]=(states[index]+1)%3;moves++;render();if(valid())finish();}
  function finish(){complete=true;stopTimer();if(!records[difficulty]||seconds<records[difficulty]){records[difficulty]=seconds;safeSave(STORE,records);}render("Puzzle complete");openResult({title:"The stars align.",message:"Every row, column, and region has its star.",stats:[["Time",formatTime(seconds)],["Moves",moves],["Best",formatTime(records[difficulty])]],actions:[{label:"New grid",primary:true,action:()=>{closeResult();start(difficulty,true);}}]});}
  function makeSolution(){const place=(row,used,result)=>{if(row===size)return result;const choices=shuffle(Array.from({length:size},(_,index)=>index).filter(column=>!used.has(column)&&(row===0||Math.abs(column-result[row-1])>1)));for(const column of choices){used.add(column);result.push(column);const solved=place(row+1,used,result);if(solved)return solved;result.pop();used.delete(column);}return null;};return place(0,new Set(),[]);}
  function makeRegions(){regions=Array(size*size).fill(-1);solution.forEach((column,row)=>{regions[row*size+column]=row;});let remaining=regions.filter(region=>region<0).length;while(remaining){const frontier=[];for(let index=0;index<regions.length;index++){if(regions[index]>=0)continue;const row=Math.floor(index/size),column=index%size,near=[];if(row>0&&regions[index-size]>=0)near.push(regions[index-size]);if(row<size-1&&regions[index+size]>=0)near.push(regions[index+size]);if(column>0&&regions[index-1]>=0)near.push(regions[index-1]);if(column<size-1&&regions[index+1]>=0)near.push(regions[index+1]);if(near.length)frontier.push({index,near});}const choice=frontier[Math.floor(Math.random()*frontier.length)];regions[choice.index]=choice.near[Math.floor(Math.random()*choice.near.length)];remaining--;}}
  function clear(){stopTimer();states=Array(size*size).fill(0);seconds=0;moves=0;started=false;complete=false;render();}
  function hint(){if(complete)return;beginTimer();const targetRow=solution.findIndex((column,row)=>states[row*size+column]!==2);if(targetRow<0)return;const target=targetRow*size+solution[targetRow];stars().forEach(index=>{const row=Math.floor(index/size),column=index%size,targetColumn=target%size;if(row===targetRow||column===targetColumn||regions[index]===regions[target]||(Math.abs(row-targetRow)<=1&&Math.abs(column-targetColumn)<=1))states[index]=1;});states[target]=2;moves++;render("One star revealed");announce(`Star placed in row ${targetRow+1}.`);if(valid())finish();}
  function start(next=difficulty,force=false){if(!force&&moves&&!complete&&!window.confirm("Start a new Starstruck grid?"))return;stopTimer();closeResult();difficulty=next;size=configs[difficulty];solution=makeSolution();makeRegions();states=Array(size*size).fill(0);seconds=0;moves=0;started=false;complete=false;activateSegment(document.querySelector("#star-level"),difficulty);render();}
  document.querySelector("#star-new").addEventListener("click",()=>start());document.querySelector("#star-clear").addEventListener("click",clear);document.querySelector("#star-hint").addEventListener("click",hint);document.querySelector("#star-level").addEventListener("click",event=>{if(event.target.dataset.value)start(event.target.dataset.value);});start("easy",true);return stopTimer;
}

const GAME_SETUPS={
  "memory-match":setupMemoryMatch,
  "tic-tac-toe":setupTicTacToe,
  "number-merge":setupNumberMerge,
  snake:setupSnake,
  minesweeper:setupMinesweeper,
  "connect-four":setupConnectFour,
  "word-scramble":setupWordScramble,
  "simon-sequence":setupSimonSequence,
  "lights-out":setupLightsOut,
  "rock-paper-scissors":setupRockPaperScissors,
  breakout:setupBreakout,
  "word-guess":setupWordGuess,
  "sliding-puzzle":setupSlidingPuzzle,
  "math-sprint":setupMathSprint,
  "color-match":setupColorMatch,
  neon:setupNeon,
  currents:setupCurrents,
  snippets:setupSnippets,
  starstruck:setupStarstruck,
};

function initialize(){
  if(!meta||!GAME_SETUPS[gameId]){document.title="Game not found — Pocket Arcade";elements.title.textContent="Game not found";elements.category.textContent="POCKET ARCADE";elements.description.textContent="That game is not in this collection.";elements.toolbar.remove();elements.instructions.innerHTML='<p>Return to the game hub and choose one of the available games.</p>';elements.controls.innerHTML='<a class="btn primary" href="../index.html">Browse games</a>';elements.root.innerHTML='<div class="word-panel"><h2>Nothing to play here.</h2><p class="feedback">The game link may be incomplete.</p></div>';return;}
  document.title=`${meta.title} — Pocket Arcade`;document.querySelector('meta[name="description"]').content=meta.description;elements.title.textContent=meta.title;elements.category.textContent=meta.category;elements.description.textContent=meta.description;cleanupGame=GAME_SETUPS[gameId]();
}

window.addEventListener("beforeunload",()=>cleanupGame());
initialize();
