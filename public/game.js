// Love Islandle — daily guessing game

const MAX_GUESSES = 8;
const CATEGORIES = ['firstName', 'gender', 'origin', 'status', 'annoying', 'south_florida', 'is_model'];

const els = {
  input:    document.getElementById('guess-input'),
  button:   document.getElementById('guess-button'),
  suggest:  document.getElementById('suggestions'),
  status:   document.getElementById('status-line'),
  board:    document.getElementById('board'),
  backdrop: document.getElementById('endgame-backdrop'),
  endgame:  document.getElementById('endgame'),
  egTitle:  document.getElementById('endgame-title'),
  egDetail: document.getElementById('endgame-detail'),
  egGrid:   document.getElementById('endgame-grid'),
  egClose:  document.getElementById('endgame-close'),
  share:    document.getElementById('share-btn'),
  nextUp:   document.getElementById('next-up'),
  updated:  document.getElementById('last-updated'),
  newGame:  document.getElementById('new-game-btn'),
  daily:    document.getElementById('daily-btn'),
};

let mode = 'daily'; // 'daily' or 'random'

let contestants = [];
let byName = new Map();
let answer = null;
let guesses = []; // [{fullName, tiles: [{value, state}]}]
let activeSuggestionIndex = -1;

// ---------- bootstrap

async function init() {
  const res = await fetch('/api/contestants');
  const data = await res.json();
  contestants = data.contestants;
  byName = new Map(contestants.map((c) => [c.fullName.toLowerCase(), c]));
  if (data.lastUpdated) {
    const d = new Date(data.lastUpdated);
    els.updated.textContent = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  answer = pickTodaysAnswer(contestants);
  loadPersistedState();
  render();
  wireEvents();
  updateModeButtons();
}

function startRandomGame() {
  mode = 'random';
  guesses = [];
  const choices = contestants.filter((c) => c.fullName !== answer.fullName);
  answer = choices[Math.floor(Math.random() * choices.length)];
  els.input.value = '';
  clearStatus();
  hideSuggestions();
  render();
  updateModeButtons();
  setStatus(`New random game! ${MAX_GUESSES} guesses to find a mystery islander 🎲`);
}

function backToDaily() {
  mode = 'daily';
  guesses = [];
  answer = pickTodaysAnswer(contestants);
  loadPersistedState();
  els.input.value = '';
  clearStatus();
  hideSuggestions();
  render();
  updateModeButtons();
}

function updateModeButtons() {
  els.newGame.classList.toggle('active', mode === 'random');
  els.daily.classList.toggle('active', mode === 'daily');
}

// Days since 2026-06-01 → stable daily rotation.
function pickTodaysAnswer(list) {
  const epoch = new Date('2026-06-01T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((today - epoch) / (1000 * 60 * 60 * 24));
  const idx = ((days % list.length) + list.length) % list.length;
  return list[idx];
}

function todayKey() {
  const d = new Date();
  return `love-islandle:${d.toISOString().slice(0, 10)}`;
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(todayKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.guesses)) {
      guesses = parsed.guesses;
    }
  } catch {}
}

function persistState() {
  if (mode !== 'daily') return; // random games are ephemeral
  try {
    localStorage.setItem(todayKey(), JSON.stringify({
      guesses,
      answer: answer.fullName,
    }));
  } catch {}
}

// ---------- compare logic

function compareTile(category, guessVal, answerVal) {
  if (guessVal === undefined || guessVal === null) return 'miss';
  // Don't-know-yet on either side → unknown.
  if (guessVal === "don't know yet" || answerVal === "don't know yet") return 'unknown';
  if (typeof guessVal === 'boolean') {
    return guessVal === answerVal ? 'match' : 'miss';
  }
  if (category === 'annoying') {
    if (guessVal === answerVal) return 'match';
    // "kinda" is partial vs "yes" or "no"; "yes" vs "no" is full miss.
    if (guessVal === 'kinda' || answerVal === 'kinda') return 'partial';
    return 'miss';
  }
  return guessVal === answerVal ? 'match' : 'miss';
}

function displayValue(category, value) {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (category === 'south_florida') return value === 'yes' ? 'yes' : value === 'no' ? 'no' : value;
  return String(value);
}

function buildTiles(guess) {
  return CATEGORIES.map((cat) => ({
    value: displayValue(cat, guess[cat]),
    state: compareTile(cat, guess[cat], answer[cat]),
  }));
}

// ---------- rendering

function render() {
  renderBoard();
  renderEndgame();
}

function renderBoard() {
  els.board.innerHTML = '';
  guesses.forEach((g) => els.board.appendChild(renderRow(g.tiles)));
  // Empty placeholder rows
  for (let i = guesses.length; i < MAX_GUESSES; i++) {
    els.board.appendChild(renderRow(null));
  }
}

function renderRow(tiles) {
  const row = document.createElement('div');
  row.className = 'board-row';
  if (!tiles) {
    for (let i = 0; i < CATEGORIES.length; i++) {
      const t = document.createElement('div');
      t.className = 'tile miss';
      t.style.opacity = '0.18';
      t.textContent = '';
      row.appendChild(t);
    }
    return row;
  }
  for (const tile of tiles) {
    const el = document.createElement('div');
    el.className = `tile ${tile.state}`;
    el.textContent = tile.value;
    row.appendChild(el);
  }
  return row;
}

function renderEndgame() {
  const won = guesses.some((g) => g.fullName === answer.fullName);
  const lost = !won && guesses.length >= MAX_GUESSES;
  if (!won && !lost) {
    closeEndgame();
    setInputDisabled(false);
    return;
  }
  if (won) {
    const tries = guesses.length;
    els.egTitle.textContent = `Coupled up! 💞`;
    els.egDetail.textContent = `You found ${answer.fullName} in ${tries} ${tries === 1 ? 'guess' : 'guesses'}.`;
  } else {
    els.egTitle.textContent = `Dumped from the villa 😭`;
    els.egDetail.textContent = `${mode === 'daily' ? "Today's" : "The"} islander was ${answer.fullName}.`;
  }
  renderEndgameGrid();
  els.nextUp.textContent = mode === 'daily'
    ? `Next daily puzzle in ${timeUntilMidnight()}.`
    : `🎲 Hit "New random game" to play again.`;
  setInputDisabled(true);
  // Pop the modal after the final row's flip animation finishes (~0.6s).
  if (els.backdrop.classList.contains('hidden')) {
    setTimeout(openEndgame, 650);
  }
}

function renderEndgameGrid() {
  const symbols = { match: '💖', partial: '💛', miss: '⬛', unknown: '⬜' };
  els.egGrid.innerHTML = guesses
    .map((g) => g.tiles.map((t) => symbols[t.state] || '⬛').join(''))
    .join('<br>');
}

function openEndgame()  { els.backdrop.classList.remove('hidden'); }
function closeEndgame() { els.backdrop.classList.add('hidden'); }

function timeUntilMidnight() {
  const now = new Date();
  const tmrw = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const ms = tmrw - now;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function setInputDisabled(disabled) {
  els.input.disabled = disabled;
  els.button.disabled = disabled;
  if (disabled) hideSuggestions();
}

// ---------- input + autocomplete

function wireEvents() {
  els.input.addEventListener('input', onInput);
  els.input.addEventListener('keydown', onKeyDown);
  els.input.addEventListener('blur', () => setTimeout(hideSuggestions, 120));
  els.input.addEventListener('focus', onInput);
  els.button.addEventListener('click', submitGuess);
  els.share.addEventListener('click', copyShareText);
  els.newGame.addEventListener('click', startRandomGame);
  els.daily.addEventListener('click', backToDaily);
  els.egClose.addEventListener('click', closeEndgame);
  els.backdrop.addEventListener('click', (e) => { if (e.target === els.backdrop) closeEndgame(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.backdrop.classList.contains('hidden')) closeEndgame();
  });
  // Keep countdown fresh while modal is open.
  setInterval(() => {
    if (!els.backdrop.classList.contains('hidden') && mode === 'daily') {
      els.nextUp.textContent = `Next daily puzzle in ${timeUntilMidnight()}.`;
    }
  }, 60000);
}

function onInput() {
  const q = els.input.value.trim().toLowerCase();
  if (!q) { hideSuggestions(); clearStatus(); return; }
  const matches = contestants
    .filter((c) => !guesses.some((g) => g.fullName === c.fullName))
    .filter((c) => c.fullName.toLowerCase().includes(q) || c.firstName.toLowerCase().startsWith(q))
    .slice(0, 8);
  showSuggestions(matches);
}

function showSuggestions(list) {
  if (list.length === 0) { hideSuggestions(); return; }
  els.suggest.innerHTML = '';
  list.forEach((c, i) => {
    const li = document.createElement('li');
    li.dataset.fullname = c.fullName;
    li.textContent = c.fullName;
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      els.input.value = c.fullName;
      hideSuggestions();
      submitGuess();
    });
    els.suggest.appendChild(li);
  });
  activeSuggestionIndex = -1;
  els.suggest.classList.add('open');
}

function hideSuggestions() {
  els.suggest.classList.remove('open');
  activeSuggestionIndex = -1;
}

function moveSuggestion(delta) {
  const items = [...els.suggest.children];
  if (items.length === 0) return;
  if (activeSuggestionIndex >= 0) items[activeSuggestionIndex].classList.remove('active');
  activeSuggestionIndex = (activeSuggestionIndex + delta + items.length) % items.length;
  items[activeSuggestionIndex].classList.add('active');
  items[activeSuggestionIndex].scrollIntoView({ block: 'nearest' });
  els.input.value = items[activeSuggestionIndex].dataset.fullname;
}

function onKeyDown(e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveSuggestion(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveSuggestion(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); submitGuess(); }
  else if (e.key === 'Escape') { hideSuggestions(); }
}

function setStatus(msg, isError) {
  els.status.textContent = msg || '';
  els.status.classList.toggle('error', !!isError);
}
function clearStatus() { setStatus(''); }

// ---------- submit

function submitGuess() {
  const raw = els.input.value.trim();
  if (!raw) return;
  const match = byName.get(raw.toLowerCase());
  if (!match) {
    setStatus(`"${raw}" isn't a Season 8 islander. Pick one from the dropdown.`, true);
    return;
  }
  if (guesses.some((g) => g.fullName === match.fullName)) {
    setStatus(`You already guessed ${match.fullName}.`, true);
    return;
  }
  clearStatus();
  const tiles = buildTiles(match);
  guesses.push({ fullName: match.fullName, tiles });
  els.input.value = '';
  hideSuggestions();
  persistState();
  render();
}

// ---------- share

function copyShareText() {
  const symbols = { match: '💖', partial: '💛', miss: '⬛', unknown: '⬜' };
  const lines = guesses.map((g) => g.tiles.map((t) => symbols[t.state] || '⬛').join(''));
  const won = guesses.some((g) => g.fullName === answer.fullName);
  const header = `Love Islandle ${dateStamp()} ${won ? guesses.length : 'X'}/${MAX_GUESSES}`;
  const text = `${header}\n${lines.join('\n')}`;
  navigator.clipboard.writeText(text).then(
    () => { els.share.textContent = 'Copied! 💌'; setTimeout(() => (els.share.textContent = 'Copy result 📋'), 1800); },
    () => { els.share.textContent = 'Copy failed'; }
  );
}

function dateStamp() {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

init().catch((e) => {
  console.error(e);
  setStatus('Failed to load cast. Refresh the page?', true);
});
