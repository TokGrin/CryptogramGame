const LEVELS = [
  {
    text: "ПЕСЕЦ",
    answer: "Песец",
    label: "Зашифрованное слово",
    map: { "П":1,"Е":2,"С":3,"Ц":4 }
  },
  {
    text: "ПРОГРАММИСТ",
    answer: "Программист",
    label: "Зашифрованное слово",
    map: { "П":1,"Р":2,"О":3,"Г":4,"А":5,"М":6,"И":7,"С":8,"Т":9 }
  },
  {
    text: "МОЖНО ГРАБИТЬ КОРОВАНЫ",
    answer: "Можно грабить корованы",
    label: "Зашифрованная фраза",
    map: { "М":1,"О":2,"Ж":3,"Н":4,"Г":5,"Р":6,"А":7,"Б":8,"И":9,"Т":10,"Ь":11,"К":12,"В":13,"Ы":14," ":" " }
  }
]

const ALPHABET = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ".split("");

// Для каждой фразы назначаем уникальные случайные номера от 1 до 36.
// Одинаковые буквы всегда получают один и тот же номер внутри уровня.
function randomizeLevelMaps() {
  LEVELS.forEach(level => {
    const letters = [...new Set([...level.text].filter(ch => ch !== " "))];
    const pool = Array.from({ length: 36 }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    level.map = {};
    letters.forEach((letter, i) => {
      level.map[letter] = pool[i];
    });
  });
}
randomizeLevelMaps();
const INITIAL_REVEALED = [
  ["П","С"],
  ["П","О","А","И"],
  ["Е","И","О","А","М","Г","К"]
];
const HINTS_KEY = "cryptogramHints_v8";
const COMPLETED_KEY = "cryptogramCompletedLevels_v6";
const UNLOCKED_KEY = "cryptogramUnlockedLevel_v6";
const REWARDS_KEY = "cryptogramHintRewards_v2";
let levelIndex = 0, selectedNumber = null, mistakes = 0, solved = new Set(), wrongKeys = new Set(), hintsLeft = Number(localStorage.getItem(HINTS_KEY));
if (!Number.isFinite(hintsLeft) || hintsLeft < 0) { hintsLeft = 3; localStorage.setItem(HINTS_KEY, String(hintsLeft)); }
let lastRevealedNumber = null, revealAnimationNumber = null, inputAnimating = false;
let rulesAcknowledgedThisCycle = false;

function selectNextUnsolved() {
  const level = LEVELS[levelIndex];
  const nums = numbersForText(level);
  selectedNumber = nums.find(num => num !== null && !solved.has(num)) ?? null;
}

function getUnsolvedNumbers() {
  const nums = numbersForText(LEVELS[levelIndex]);
  return [...new Set(nums.filter(num => num !== null && !solved.has(num)))];
}

function moveSelectedSlot(direction) {
  const unsolved = getUnsolvedNumbers();
  if (!unsolved.length) return;

  // Если слот ещё не выбран — начинаем с первого/последнего в зависимости от направления.
  if (selectedNumber === null || !unsolved.includes(selectedNumber)) {
    selectedNumber = direction > 0 ? unsolved[0] : unsolved[unsolved.length - 1];
    render();
    return;
  }

  const currentIndex = unsolved.indexOf(selectedNumber);
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= unsolved.length) return;

  selectedNumber = unsolved[nextIndex];
  render();
}

function getUnlockedLevel() {
  const saved = Number(localStorage.getItem(UNLOCKED_KEY));
  return Number.isInteger(saved) ? Math.min(Math.max(saved, 0), LEVELS.length - 1) : 0;
}
function setUnlockedLevel(i) {
  const unlocked = getUnlockedLevel();
  if (i > unlocked) localStorage.setItem(UNLOCKED_KEY, String(Math.min(i, LEVELS.length - 1)));
}
function getCompletedLevels() {
  try {
    const saved = JSON.parse(localStorage.getItem(COMPLETED_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(i => Number.isInteger(i) && i >= 0 && i < LEVELS.length) : [];
  } catch (_) { return []; }
}
function markLevelCompleted(i) {
  const completed = getCompletedLevels();
  const isFirstCompletion = !completed.includes(i);
  if (isFirstCompletion) {
    completed.push(i);
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(completed));
  }
  return isFirstCompletion;
}
function claimHintReward(i) {
  let rewards = [];
  try { rewards = JSON.parse(localStorage.getItem(REWARDS_KEY) || "[]"); } catch (_) { rewards = []; }
  if (!Array.isArray(rewards)) rewards = [];
  if (rewards.includes(i)) return false;
  rewards.push(i);
  localStorage.setItem(REWARDS_KEY, JSON.stringify(rewards));
  return true;
}
const $ = id => document.getElementById(id);
const gameScreen = $("gameScreen"), resultScreen = $("resultScreen");
const rulesDialog = $("rulesDialog");
const settingsDialog = $("settingsDialog");
const levelsDialog = $("levelsDialog");
let levelsOpenedFromResult = false;

function levelMap(level) {
  const m = {};
  for (const [letter, num] of Object.entries(level.map)) if (letter !== " ") m[num] = letter;
  return m;
}
function numbersForText(level) {
  return [...level.text].map(ch => ch === " " ? null : level.map[ch]);
}
function renderErrors() {
  const wrap = $("errorDots");
  wrap.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "error-dot" + (i < mistakes ? " filled" : "");
    wrap.appendChild(dot);
  }
}
function renderLevelChoices() {
  const wrap = $("levelChoices");
  if (!wrap) return;
  wrap.innerHTML = "";
  const completed = getCompletedLevels();
  LEVELS.forEach((_, i) => {
    const b = document.createElement("button");
    const unlocked = i <= getUnlockedLevel();
    const isCompleted = completed.includes(i);
    b.className = "level-choice" + (i === levelIndex ? " active" : "") + (!unlocked ? " locked" : "") + (isCompleted ? " completed" : "");
    b.innerHTML = `<span class="level-number">${unlocked ? (i + 1) : "🔒"}</span>${isCompleted ? '<span class="level-check">✓</span>' : ''}`;
    b.disabled = !unlocked;
    b.addEventListener("click", () => {
      if (!unlocked) return;
      levelsOpenedFromResult = false;
      startLevel(i);
      levelsDialog.close();
    });
    wrap.appendChild(b);
  });
}
function render() {
  const level = LEVELS[levelIndex];
  const gameScreen = $("gameScreen");
  const phraseCard = document.querySelector("#gameScreen .phrase-card");
  if (gameScreen) gameScreen.classList.toggle("long-phrase-level", level.text.replace(/ /g, "").length >= 18);
  if (phraseCard) phraseCard.classList.toggle("long-phrase", level.text.replace(/ /g, "").length >= 18);
  $("hintCount").textContent = hintsLeft;
  $("hintBtn").disabled = hintsLeft <= 0;
  $("levelNumber").textContent = levelIndex + 1;
  $("levelTotal").textContent = LEVELS.length;
  $("phraseLabel").textContent = level.label || "Зашифрованная фраза";
  renderErrors();
  renderLevelChoices();
  const nums = numbersForText(level);
  const cipher = $("cipher");
  cipher.innerHTML = "";
  let word = document.createElement("div"); word.className = "word";
  const currentMap = levelMap(level);

  nums.forEach((num, i) => {
    if (num === null) {
      cipher.appendChild(word);
      word = document.createElement("div"); word.className = "word";
      return;
    }
    const cell = document.createElement("button");
    cell.className = "cell";
    if (selectedNumber === num) cell.classList.add("selected");
    if (solved.has(num)) cell.classList.add("solved");
    if (revealAnimationNumber === num) cell.classList.add("reveal-letter");
    if (lastRevealedNumber !== null && solved.has(num)) {
      const revealedLetter = currentMap[lastRevealedNumber];
      if (currentMap[num] === revealedLetter) {
        cell.classList.add(num === lastRevealedNumber ? "same-letter-main" : "same-letter-dim");
      }
    }
    cell.dataset.number = num;
    cell.innerHTML = `<span class="num">${num}</span><span class="letter">${solved.has(num) ? currentMap[num] : ""}</span>`;
    cell.addEventListener("click", () => { if (!solved.has(num)) { selectedNumber = num; render(); } });
    word.appendChild(cell);
  });
  cipher.appendChild(word);

  $("message").textContent = selectedNumber
    ? `Выбрана цифра ${selectedNumber}. Выберите букву.`
    : "Выберите любую цифру в шифре.";

  // Статус под слотами не сбрасывается при перерисовке.
  // Он меняется только в момент следующего ответа игрока.
  if (!(window.__slotStatusInitialized)) {
    const instruction = $("slotInstruction");
    if (instruction) instruction.textContent = "Выберите букву";
    window.__slotStatusInitialized = true;
  }

  renderKeyboard();
  renderSlotNavigation();
}
function renderKeyboard() {
  const kb = $("keyboard"); kb.innerHTML = "";
  const phraseLetters = new Set(Object.values(levelMap(LEVELS[levelIndex])));
  ALPHABET.forEach(letter => {
    const b = document.createElement("button");
    b.className = "key";
    b.textContent = letter;
    const exists = phraseLetters.has(letter);
    const revealed = [...solved].some(n => levelMap(LEVELS[levelIndex])[n] === letter);
    b.disabled = !exists || !selectedNumber;
    if (!exists) {
      b.classList.add("unavailable");
      b.setAttribute("aria-disabled","true");
    } else {
      b.classList.add("in-phrase");
    }
    if (revealed) b.classList.add("revealed-key");
    if (wrongKeys.has(letter)) b.classList.add("wrong");
    b.addEventListener("click", () => chooseLetter(letter));
    kb.appendChild(b);
  });
}
function renderSlotNavigation() {
  const prev = $("prevSlotBtn");
  const next = $("nextSlotBtn");
  if (!prev || !next) return;
  const unsolved = getUnsolvedNumbers();
  const index = unsolved.indexOf(selectedNumber);
  prev.disabled = !unsolved.length || index <= 0;
  next.disabled = !unsolved.length || index < 0 || index >= unsolved.length - 1;
}
function chooseLetter(letter) {
  if (!selectedNumber || inputAnimating) return;
  const instruction = $("slotInstruction");
  // Уже открытая буква не считается новым ответом и ничего не меняет.
  const currentMap = levelMap(LEVELS[levelIndex]);
  const alreadyRevealed = [...solved].some(n => currentMap[n] === letter);
  if (alreadyRevealed) return;
  // Только после действительно нового ответа меняем предыдущий статус.
  if (instruction) instruction.textContent = "";
  const correct = currentMap[selectedNumber];
  if (letter === correct) {
    const targetNumber = selectedNumber;
    lastRevealedNumber = targetNumber;
    revealAnimationNumber = targetNumber;
    solved.add(targetNumber);
    wrongKeys.delete(letter);
    render();
    $("message").textContent = "Верно!";
    if (instruction) instruction.textContent = "Верно!";

    if (solved.size === Object.keys(levelMap(LEVELS[levelIndex])).length) {
      finishLevel(true);
    } else {
      selectNextUnsolved();
      render();
      $("message").textContent = "Верно!";
      if (instruction) instruction.textContent = "Верно!";
    }
  } else {
    inputAnimating = true;
    mistakes++;
    wrongKeys.add(letter);
    renderErrors();
    $("message").textContent = "Буква не подходит";
    if (instruction) instruction.textContent = "Буква не подходит";
    renderKeyboard();
    requestAnimationFrame(() => {
      const key = [...document.querySelectorAll('.key')].find(b => b.textContent === letter);
      const cell = document.querySelector(`.cell[data-number="${selectedNumber}"]`);
      key?.classList.add('wrong-flash');
      cell?.classList.add('wrong-flash');
    });
    setTimeout(() => {
      inputAnimating = false;
      wrongKeys.delete(letter);
      document.querySelectorAll('.wrong-flash').forEach(el => el.classList.remove('wrong-flash'));
      if (mistakes >= 3) finishLevel(false);
      else renderKeyboard();
    }, 300);
  }
}
function hint() {
  if (hintsLeft <= 0) return;
  const level = LEVELS[levelIndex], map = levelMap(level);
  const unsolved = Object.keys(map).map(Number).filter(n => !solved.has(n));
  if (!unsolved.length) return;

  // Если пользователь уже выбрал ячейку — подсказка помогает именно с ней.
  // Это не сбрасывает выбор и не переключает его на случайную ячейку.
  const target = selectedNumber !== null && unsolved.includes(selectedNumber)
    ? selectedNumber
    : unsolved[Math.floor(Math.random() * unsolved.length)];

  hintsLeft--;
  localStorage.setItem(HINTS_KEY, String(hintsLeft));
  lastRevealedNumber = target;
  solved.add(target);

  // Если подсказка закрыла выбранную ячейку, автоматически переходим
  // на следующую незаполненную. Иначе сохраняем текущий выбор.
  if (selectedNumber === target) {
    selectNextUnsolved();
  }

  render();
  if (solved.size === Object.keys(map).length) finishLevel(true);
}
function finishLevel(win) {
  let firstCompletion = false;
  let allLevelsCompleted = false;
  if (win) {
    firstCompletion = markLevelCompleted(levelIndex);
    const rewardAvailable = claimHintReward(levelIndex);
    if (rewardAvailable) {
      // За первое прохождение любого уровня добавляем +2 к текущему остатку.
      hintsLeft += 2;
      localStorage.setItem(HINTS_KEY, String(hintsLeft));
    }
    if (levelIndex < LEVELS.length - 1) setUnlockedLevel(levelIndex + 1);
    allLevelsCompleted = getCompletedLevels().length === LEVELS.length;
  }

  if (!resultScreen.open) resultScreen.showModal();
  $("resultIcon").textContent = win ? "✓" : "×";

  const retryBtn = $("resultRetryBtn");
  const levelsBtn = $("resultLevelsBtn");
  const mainBtn = $("resultBtn");
  mainBtn.classList.remove("ad-placeholder");

  if (win && allLevelsCompleted) {
    $("resultTitle").textContent = "Все уровни пройдены!";
    $("resultText").innerHTML = `
      <span class="result-congrats">Поздравляем!</span>
      <span class="result-answer-label">Ответ:</span>
      <span class="result-answer">${(LEVELS[levelIndex].answer || LEVELS[levelIndex].text).toUpperCase()}</span>
      ${firstCompletion ? '<span class="result-hint-reward">💡 +2</span>' : ''}
    `;
    mainBtn.classList.remove("hidden");
    mainBtn.textContent = "Играть снова";
    retryBtn.classList.add("hidden");
    levelsBtn.classList.remove("hidden");
  } else if (win) {
    $("resultTitle").textContent = "Уровень пройден!";
    $("resultText").innerHTML = `
      <span class="result-answer-label">Ответ:</span>
      <span class="result-answer">${(LEVELS[levelIndex].answer || LEVELS[levelIndex].text).toUpperCase()}</span>
      ${firstCompletion ? '<span class="result-hint-reward">💡 +2</span>' : ''}
    `;
    mainBtn.classList.remove("hidden");
    mainBtn.textContent = "Дальше";
    retryBtn.classList.add("hidden");
    levelsBtn.classList.remove("hidden");
  } else {
    $("resultTitle").textContent = "Попытки закончились";
    $("resultText").textContent = "Попытки закончились. Выберите, что сделать дальше.";
    mainBtn.classList.remove("hidden");
    mainBtn.textContent = "Посмотреть рекламу и продолжить";
    mainBtn.classList.add("ad-placeholder");
    retryBtn.classList.remove("hidden");
    levelsBtn.classList.remove("hidden");
  }
  render();
}
function startLevel(i = levelIndex) {
  if (i > getUnlockedLevel()) return;
  levelIndex = i; mistakes = 0; selectedNumber = null; wrongKeys = new Set();
  lastRevealedNumber = null;
  const instruction = $("slotInstruction");
  if (instruction) instruction.textContent = "Выберите букву";
  solved = new Set();
  const initialLetters = INITIAL_REVEALED[levelIndex] || [];
  const initialMap = levelMap(LEVELS[levelIndex]);
  initialLetters.forEach(letter => {
    Object.keys(initialMap).forEach(num => {
      if (initialMap[num] === letter) solved.add(Number(num));
    });
  });
  if (resultScreen.open) resultScreen.close();
  gameScreen.classList.remove("hidden");
  selectNextUnsolved();
  render();
}
function resetProgressAndRestart() {
  localStorage.removeItem(COMPLETED_KEY);
  localStorage.removeItem(UNLOCKED_KEY);
  localStorage.removeItem(REWARDS_KEY);
  hintsLeft = 3;
  localStorage.setItem(HINTS_KEY, "3");
  rulesAcknowledgedThisCycle = false;
  startLevel(0);
  openRulesForFreshStart();
}
$("prevSlotBtn").addEventListener("click", () => moveSelectedSlot(-1));
$("nextSlotBtn").addEventListener("click", () => moveSelectedSlot(1));
$("hintBtn").addEventListener("click", hint);
$("resultBtn").addEventListener("click", () => {
  if (mistakes >= 3) return;
  if (getCompletedLevels().length === LEVELS.length) {
    resetProgressAndRestart();
    return;
  }
  if (levelIndex < LEVELS.length - 1 && levelIndex + 1 <= getUnlockedLevel()) startLevel(levelIndex + 1);
  else startLevel(0);
});
$("resultRetryBtn").addEventListener("click", () => startLevel());
$("resultLevelsBtn").addEventListener("click", () => {
  levelsOpenedFromResult = true;
  $("closeLevels").textContent = "Закрыть";
  $("closeLevels").setAttribute("aria-label", "Вернуться к результату");
  render();
  levelsDialog.showModal();
});
function openRulesForFreshStart() {
  if (!rulesDialog.open) rulesDialog.showModal();
}
$("rulesBtn").addEventListener("click", () => rulesDialog.showModal());
$("settingsBtn").addEventListener("click", () => settingsDialog.showModal());
$("closeSettings").addEventListener("click", () => settingsDialog.close());
$("closeRules").addEventListener("click", () => {
  if (!rulesAcknowledgedThisCycle) {
    rulesAcknowledgedThisCycle = true;
    if (hintsLeft === 0) {
      hintsLeft = 3;
      localStorage.setItem(HINTS_KEY, "3");
      const hintCountEl = $("hintCount");
      if (hintCountEl) hintCountEl.textContent = String(hintsLeft);
      const hintBtnEl = $("hintBtn");
      if (hintBtnEl) hintBtnEl.disabled = false;
      selectNextUnsolved();
      render();
    }
  }
  rulesDialog.close();
});
$("levelsBtn").addEventListener("click", () => {
  levelsOpenedFromResult = false;
  $("closeLevels").textContent = "Закрыть";
  $("closeLevels").setAttribute("aria-label", "Закрыть");
  levelsDialog.showModal();
});
$("closeLevels").addEventListener("click", () => {
  levelsDialog.close();
  if (levelsOpenedFromResult) {
    levelsOpenedFromResult = false;
    if (!resultScreen.open) resultScreen.showModal();
  }
});
$("soundBtn").addEventListener("click", () => {
  const btn = $("soundBtn");
  const enabled = btn.getAttribute("aria-pressed") === "true";
  btn.setAttribute("aria-pressed", String(!enabled));
  btn.setAttribute("aria-label", !enabled ? "Звук включен" : "Звук выключен");
});
rulesDialog.addEventListener("click", e => { if (e.target === rulesDialog) rulesDialog.close(); });
settingsDialog.addEventListener("click", e => { if (e.target === settingsDialog) settingsDialog.close(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && rulesDialog.open) rulesDialog.close();
  if (e.key === "Escape" && settingsDialog.open) settingsDialog.close();
  const letter = e.key.toUpperCase();
  if (ALPHABET.includes(letter)) chooseLetter(letter);
});
startLevel(0);
openRulesForFreshStart();


/* v53: Measure the actual phrase title and size the game around it.
   This replaces level-specific pixel hacks for long phrases. */
let phraseLayoutFrame = null;
function levelIsLongForLayout() {
  const level = LEVELS[levelIndex];
  return !!level && level.text.replace(/\s/g, "").length >= 18;
}
function updateResponsivePhraseLayout() {
  const screen = $("gameScreen");
  const card = screen?.querySelector(".phrase-card");
  const title = $("phraseLabel");
  const cipherArea = screen?.querySelector(".cipher-area");
  const cipher = $("cipher");
  const instruction = $("slotInstruction");
  const controls = screen?.querySelector(".controls");
  const keyboard = $("keyboard");
  const navigation = screen?.querySelector(".slot-navigation");
  if (!screen || !card || !title || !cipherArea || !cipher || !instruction) return;

  const isMobile = window.matchMedia("(max-width: 430px)").matches;
  screen.classList.remove("dynamic-tall");
  screen.style.removeProperty("--dynamic-game-height");
  screen.style.removeProperty("--dynamic-phrase-height");
  screen.style.removeProperty("--dynamic-title-gap");
  screen.style.removeProperty("--dynamic-instruction-gap");

  if (!isMobile) return;

  // Read the real rendered title height (including a two-line wrap).
  const titleHeight = Math.ceil(title.getBoundingClientRect().height);
  const cipherHeight = Math.max(1, Math.ceil(cipher.scrollHeight));
  const instructionHeight = Math.ceil(instruction.getBoundingClientRect().height);

  // Small gap after the title, and a slightly larger gap below the slots.
  const titleGap = 18;
  const instructionGap = 22;
  const bottomGap = 18;

  // The phrase card contains: title + gap + slots + gap + instruction + bottom breathing room.
  const requiredPhraseHeight =
    titleHeight + titleGap + cipherHeight + instructionGap + instructionHeight + bottomGap;

  // Expand when the rendered title would overlap the slots, or when the
  // content genuinely needs more height than the compact card provides.
  const titleRect = title.getBoundingClientRect();
  const cipherRect = cipher.getBoundingClientRect();
  const overlap = cipherRect.top < titleRect.bottom + titleGap;
  const isLongPhrase = levelIsLongForLayout();
  const compactPhraseHeight = card.getBoundingClientRect().height;
  if (!overlap && !isLongPhrase && requiredPhraseHeight <= compactPhraseHeight + 2) return;

  const controlsHeight = controls ? Math.ceil(controls.getBoundingClientRect().height) : 0;
  const keyboardHeight = keyboard ? Math.ceil(keyboard.getBoundingClientRect().height) : 0;
  const navigationHeight = navigation ? Math.ceil(navigation.getBoundingClientRect().height) : 0;

  // Keep the whole keyboard below the phrase instead of letting it overlap.
  const requiredGameHeight =
    requiredPhraseHeight + controlsHeight + keyboardHeight + navigationHeight;

  screen.classList.add("dynamic-tall");
  screen.style.setProperty("--dynamic-title-gap", `${titleGap}px`);
  screen.style.setProperty("--dynamic-instruction-gap", `${instructionGap}px`);
  screen.style.setProperty("--dynamic-phrase-height", `${requiredPhraseHeight}px`);

  const currentHeight = screen.getBoundingClientRect().height;
  screen.style.setProperty(
    "--dynamic-game-height",
    `${Math.max(currentHeight, requiredGameHeight)}px`
  );
}

function schedulePhraseLayout() {
  if (phraseLayoutFrame) cancelAnimationFrame(phraseLayoutFrame);
  phraseLayoutFrame = requestAnimationFrame(() => {
    phraseLayoutFrame = null;
    updateResponsivePhraseLayout();
  });
}

const phraseLayoutObserver = window.ResizeObserver
  ? new ResizeObserver(() => schedulePhraseLayout())
  : null;

if (phraseLayoutObserver) {
  const observeLayout = () => {
    const title = $("phraseLabel");
    const cipher = $("cipher");
    if (title) phraseLayoutObserver.observe(title);
    if (cipher) phraseLayoutObserver.observe(cipher);
  };
  window.addEventListener("load", observeLayout);
}

window.addEventListener("resize", schedulePhraseLayout);
const originalRenderForLayout = render;
render = function() {
  originalRenderForLayout();
  schedulePhraseLayout();
};
schedulePhraseLayout();
