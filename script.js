// Log a message to the console to ensure the script is linked correctly
console.log('JavaScript file is linked correctly.');

// ===== Difficulty modes =====
// Each mode changes the goal, the time, and how often leaks show up
const DIFFICULTIES = {
  easy: {
    label: "Easy",
    time: 90,           // seconds
    tankGoal: 3,        // tanks needed to win
    pumpsPerTank: 8,    // pumps to fill one tank
    leakChance: 0.2,    // chance a leak appears each second
    maxLeaks: 1,        // most leaks on screen at once
    leakFixTime: 4,     // seconds to fix a leak
    leakPenalty: 50,
  },
  normal: {
    label: "Normal",
    time: 60,
    tankGoal: 5,
    pumpsPerTank: 10,
    leakChance: 0.35,
    maxLeaks: 1,
    leakFixTime: 3,
    leakPenalty: 100,
  },
  hard: {
    label: "Hard",
    time: 45,
    tankGoal: 6,
    pumpsPerTank: 10,
    leakChance: 0.5,
    maxLeaks: 2,
    leakFixTime: 2,
    leakPenalty: 150,
  },
};

// ===== Game settings that stay the same in every mode =====
const POINTS_PER_DROP = 50;
const POINTS_PER_TANK = 250;
const DROP_SPEED = 900;        // ms for a drop to travel the pipe

// ===== Grab elements =====
const timeEl = document.getElementById("time");
const timeBox = document.getElementById("timeBox");
const scoreEl = document.getElementById("score");
const tanksEl = document.getElementById("tanks");
const tankGoalEl = document.getElementById("tankGoal");
const modeLabel = document.getElementById("modeLabel");
const progress = document.getElementById("progress");
const progressFill = document.getElementById("progressFill");
const factEl = document.getElementById("fact");
const water = document.getElementById("water");
const tankPercent = document.getElementById("tankPercent");
const pipePath = document.getElementById("pipePath");
const dropLayer = document.getElementById("dropLayer");
const pumpBtn = document.getElementById("pumpBtn");
const leakLayer = document.getElementById("leakLayer");
const milestoneEl = document.getElementById("milestone");
const feedback = document.getElementById("feedback");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");
const endScreen = document.getElementById("endScreen");
const endTitle = document.getElementById("endTitle");
const finalScore = document.getElementById("finalScore");
const endMessage = document.getElementById("endMessage");
const playAgainBtn = document.getElementById("playAgainBtn");
const changeModeBtn = document.getElementById("changeModeBtn");

// Tank position in the SVG (matches the rect in index.html)
const TANK_TOP = 145;
const TANK_HEIGHT = 290;
const pipeLength = pipePath.getTotalLength();

// Water facts for the sidebar
const facts = [
  "100% of public donations to charity: water go directly to clean water projects.",
  "In many places, women and girls walk hours every day just to collect water.",
  "Clean water close to home means more time for school and work.",
  "charity: water works with local partners to build wells, rainwater catchments and filters.",
  "Clean water helps prevent diseases that come from dirty water.",
];

// ===== Sound effects (LevelUp) =====
const sounds = {
  pump: new Audio("audio/pump.wav"),
  drop: new Audio("audio/drop.wav"),
  tank: new Audio("audio/tank.wav"),
  leak: new Audio("audio/leak.wav"),
  fix: new Audio("audio/fix.wav"),
  milestone: new Audio("audio/milestone.wav"),
  win: new Audio("audio/win.wav"),
  lose: new Audio("audio/lose.wav"),
  click: new Audio("audio/click.wav"),
};

function playSound(name) {
  // Copy the sound so the same one can overlap (like pumping fast)
  const sound = sounds[name].cloneNode();
  sound.volume = 0.6;
  sound.play().catch(() => {}); // ignore if the browser blocks it
}

// ===== Milestone messages (LevelUp) =====
// Each milestone has a check that looks at the game state.
// When a check is true for the first time, its message shows.
const milestones = [
  {
    check: () => tanksFilled === 1,
    message: "First tank filled! The village is getting closer to clean water.",
  },
  {
    check: () => tanksFilled >= Math.ceil(settings.tankGoal / 2) && tanksFilled < settings.tankGoal - 1,
    message: "Halfway there! Keep pumping!",
  },
  {
    check: () => tanksFilled === settings.tankGoal - 1,
    message: "Just one more tank to go!",
  },
  {
    check: () => score >= 1000,
    message: "1,000 points! You're on a roll!",
  },
  {
    check: () => timeLeft === 10,
    message: "10 seconds left. Pump fast!",
  },
];
let shownMilestones = [];
let milestoneTimeout = null;

function checkMilestones() {
  milestones.forEach((milestone, index) => {
    if (!shownMilestones.includes(index) && milestone.check()) {
      shownMilestones.push(index);
      showMilestone(milestone.message);
    }
  });
}

function showMilestone(message) {
  milestoneEl.textContent = message;
  milestoneEl.classList.add("show");
  playSound("milestone");
  clearTimeout(milestoneTimeout);
  milestoneTimeout = setTimeout(() => milestoneEl.classList.remove("show"), 2500);
}

// ===== Game state =====
let difficulty = "normal";
let settings = DIFFICULTIES[difficulty];
let score, timeLeft, tankLevel, tanksFilled;
let isPlaying = false;
let isPaused = false;
let timerId = null;
let factId = null;
let factIndex = 0;
let drops = [];
let leaks = [];           // each leak: { el, length, timeLeft }
let leakCooldown = 0;     // seconds until a new leak can show up

// ===== Update the screen =====
function updateStats() {
  scoreEl.textContent = score.toLocaleString();
  const minutes = Math.floor(timeLeft / 60);
  const seconds = String(timeLeft % 60).padStart(2, "0");
  timeEl.textContent = minutes + ":" + seconds;
  timeBox.classList.toggle("low-time", timeLeft <= 10);
  tanksEl.textContent = tanksFilled;
  tankGoalEl.textContent = settings.tankGoal;
  modeLabel.textContent = settings.label;
  progressFill.style.width = (tanksFilled / settings.tankGoal) * 100 + "%";
  progress.setAttribute("aria-valuemax", settings.tankGoal);
  progress.setAttribute("aria-valuenow", tanksFilled);
}

function updateTank() {
  const height = (tankLevel / 100) * TANK_HEIGHT;
  water.setAttribute("y", TANK_TOP + TANK_HEIGHT - height);
  water.setAttribute("height", height);
  tankPercent.textContent = Math.round(tankLevel) + "%";
}

// Floating message like "+50" or "-100 Leak!"
function showFeedback(text, type) {
  const item = document.createElement("span");
  item.className = "feedback-item" + (type ? " " + type : "");
  item.textContent = text;
  feedback.appendChild(item);
  // Only keep the 2 newest messages so they don't pile up
  while (feedback.children.length > 2) {
    feedback.firstChild.remove();
  }
  setTimeout(() => item.remove(), 1200);
}

// ===== Pumping =====
function pump() {
  if (!isPlaying || isPaused) return;

  // Animate the pump handle
  pumpBtn.classList.add("pumping");
  setTimeout(() => pumpBtn.classList.remove("pumping"), 120);
  playSound("pump");

  // Create a water drop at the start of the pipe (added to the page)
  const drop = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  drop.setAttribute("r", 8);
  drop.setAttribute("class", "drop");
  dropLayer.appendChild(drop);
  drops.push({ el: drop, start: performance.now() });
}

// The leak closest to the pump is where water escapes first
function firstLeakLength() {
  if (leaks.length === 0) return Infinity;
  return Math.min(...leaks.map((leak) => leak.length));
}

// Move every drop along the pipe each frame
function animateDrops(now) {
  const leakAt = firstLeakLength();
  drops = drops.filter((drop) => {
    if (isPaused) {
      drop.start += 16; // freeze drops while paused
      return true;
    }
    const progressAlong = Math.min((now - drop.start) / DROP_SPEED, 1);
    const distance = progressAlong * pipeLength;

    // A leak wastes any drop that reaches it, so remove the drop from the page
    if (distance >= leakAt) {
      drop.el.remove();
      return false;
    }

    const point = pipePath.getPointAtLength(distance);
    drop.el.setAttribute("cx", point.x);
    drop.el.setAttribute("cy", point.y);

    if (progressAlong >= 1) {
      drop.el.remove();
      dropArrived();
      return false;
    }
    return true;
  });
  requestAnimationFrame(animateDrops);
}

// A drop made it to the tank
function dropArrived() {
  if (!isPlaying) return;
  score += POINTS_PER_DROP;
  tankLevel += 100 / settings.pumpsPerTank;
  showFeedback("+" + POINTS_PER_DROP);
  playSound("drop");

  if (tankLevel >= 99.9) {
    tanksFilled++;
    console.log("Tank filled! Tanks:", tanksFilled, "Score:", score);
    score += POINTS_PER_TANK;
    tankLevel = tanksFilled >= settings.tankGoal ? 100 : 0; // keep the last tank full on a win
    showFeedback("Tank " + tanksFilled + " filled! +" + POINTS_PER_TANK, "big");
    playSound("tank");
  }

  updateTank();
  updateStats();

  if (tanksFilled >= settings.tankGoal) {
    endGame(true);
  } else {
    checkMilestones();
  }
}

// ===== Leak obstacle =====
// Leaks are created as new buttons on the page, and removed when fixed or when time runs out
function spawnLeak() {
  // Pick a random spot along the middle of the pipe, not too close to another leak
  let length;
  let tries = 0;
  do {
    length = pipeLength * (0.2 + Math.random() * 0.6);
    tries++;
  } while (leaks.some((leak) => Math.abs(leak.length - length) < pipeLength * 0.15) && tries < 10);

  const point = pipePath.getPointAtLength(length);

  // Convert SVG coordinates (400 x 500) to percentages of the board
  // (clamped so the button never gets cut off at the edges)
  const left = Math.min(Math.max((point.x / 400) * 100, 22), 78);
  const top = Math.min(Math.max((point.y / 500) * 100, 12), 88);

  const button = document.createElement("button");
  button.className = "leak";
  button.setAttribute("aria-label", "Fix the leak");
  button.style.left = left + "%";
  button.style.top = top + "%";
  button.innerHTML = `
    <span class="leak-icon">💦</span>
    <span class="leak-text">LEAK! Tap to fix</span>
    <span class="leak-timer">${settings.leakFixTime}</span>
  `;

  const leak = { el: button, length: length, timeLeft: settings.leakFixTime };
  button.addEventListener("click", () => fixLeak(leak));

  leakLayer.appendChild(button);
  leaks.push(leak);
  playSound("leak");
  console.log("Leak appeared at", Math.round(left) + "%,", Math.round(top) + "%");
}

// Take a leak off the page and out of the list
function removeLeak(leak) {
  leak.el.remove();
  leaks = leaks.filter((item) => item !== leak);
}

function fixLeak(leak) {
  if (!isPlaying || isPaused) return;
  removeLeak(leak);
  leakCooldown = 3;
  playSound("fix");
  console.log("Leak fixed");
  showFeedback("Leak fixed!");
}

function leakTick() {
  // Count down every leak on screen
  leaks.forEach((leak) => {
    leak.timeLeft--;
    leak.el.querySelector(".leak-timer").textContent = leak.timeLeft;
    if (leak.timeLeft <= 0) {
      // Didn't fix it in time: lose points
      score = Math.max(0, score - settings.leakPenalty);
      console.log("Leak not fixed, -" + settings.leakPenalty + ". Score:", score);
      showFeedback("-" + settings.leakPenalty + " Leak!", "bad");
      removeLeak(leak);
      leakCooldown = 3;
    }
  });

  // Maybe add a new leak
  if (leakCooldown > 0) {
    leakCooldown--;
  } else if (leaks.length < settings.maxLeaks && Math.random() < settings.leakChance) {
    spawnLeak();
  }
}

function clearLeaks() {
  leaks.forEach((leak) => leak.el.remove());
  leaks = [];
}

// ===== Timer (runs once per second) =====
function tick() {
  if (isPaused) return;
  timeLeft--;
  leakTick();
  updateStats();
  checkMilestones();
  if (timeLeft <= 0) {
    endGame(false);
  }
}

// ===== Start / end / reset =====
function resetState() {
  clearInterval(timerId);
  clearInterval(factId);
  settings = DIFFICULTIES[difficulty];
  score = 0;
  timeLeft = settings.time;
  tankLevel = 0;
  tanksFilled = 0;
  isPlaying = false;
  isPaused = false;
  clearLeaks();
  leakCooldown = 5;
  drops.forEach((drop) => drop.el.remove());
  drops = [];
  feedback.innerHTML = "";
  shownMilestones = [];
  milestoneEl.classList.remove("show");
  pauseBtn.textContent = "Pause";
  pauseBtn.disabled = true;
  pumpBtn.disabled = true;
  stopConfetti();
  updateTank();
  updateStats();
}

function startGame() {
  // Read the difficulty the player picked on the start screen
  const picked = document.querySelector('input[name="difficulty"]:checked');
  difficulty = picked ? picked.value : "normal";

  resetState();
  console.log("Game started on", settings.label);
  playSound("click");
  startScreen.hidden = true;
  endScreen.hidden = true;
  isPlaying = true;
  pumpBtn.disabled = false;
  pauseBtn.disabled = false;
  pumpBtn.focus();
  timerId = setInterval(tick, 1000);
  factId = setInterval(nextFact, 8000);
}

function endGame(won) {
  isPlaying = false;
  console.log(won ? "Player won!" : "Time's up!", "Final score:", score, "Tanks:", tanksFilled);
  clearInterval(timerId);
  clearInterval(factId);
  pumpBtn.disabled = true;
  pauseBtn.disabled = true;
  clearLeaks();
  milestoneEl.classList.remove("show");

  finalScore.textContent = score.toLocaleString();
  if (won) {
    endTitle.textContent = "You did it! 🎉";
    endMessage.textContent = `You filled all ${settings.tankGoal} tanks on ${settings.label} with ${timeLeft} seconds left. That's clean water for a family!`;
    playSound("win");
    startConfetti();
  } else {
    endTitle.textContent = "Time's Up!";
    endMessage.textContent = `You filled ${tanksFilled} of ${settings.tankGoal} tanks on ${settings.label}. Every drop counts. Try again to reach the village goal!`;
    playSound("lose");
  }
  endScreen.hidden = false;
  playAgainBtn.focus();
}

function togglePause() {
  if (!isPlaying) return;
  isPaused = !isPaused;
  pauseBtn.textContent = isPaused ? "Resume" : "Pause";
  pumpBtn.disabled = isPaused;
  playSound("click");
}

// Reset button: start a fresh game on the same difficulty
function resetGame() {
  startGame();
}

// Go back to the start screen to pick a new difficulty
function showStartScreen() {
  resetState();
  endScreen.hidden = true;
  startScreen.hidden = false;
  playSound("click");
  startBtn.focus();
}

function nextFact() {
  factIndex = (factIndex + 1) % facts.length;
  factEl.textContent = facts[factIndex];
}

// ===== Confetti (win celebration) =====
const canvas = document.getElementById("confetti");
const ctx = canvas.getContext("2d");
let confettiPieces = [];
let confettiId = null;

function startConfetti() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ["#FFC907", "#2E9DF7", "#8BD1CB", "#4FCB53", "#FF902A", "#F16061"];
  confettiPieces = [];
  for (let i = 0; i < 180; i++) {
    confettiPieces.push({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      size: 6 + Math.random() * 8,
      speed: 2 + Math.random() * 4,
      drift: -1.5 + Math.random() * 3,
      spin: Math.random() * 360,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
  const started = performance.now();
  function draw(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    confettiPieces.forEach((p) => {
      p.y += p.speed;
      p.x += p.drift;
      p.spin += 6;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.spin * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    });
    if (now - started < 4000) {
      confettiId = requestAnimationFrame(draw);
    } else {
      stopConfetti();
    }
  }
  confettiId = requestAnimationFrame(draw);
}

function stopConfetti() {
  cancelAnimationFrame(confettiId);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ===== Event listeners =====
pumpBtn.addEventListener("click", pump);
startBtn.addEventListener("click", startGame);
playAgainBtn.addEventListener("click", startGame);
changeModeBtn.addEventListener("click", showStartScreen);
pauseBtn.addEventListener("click", togglePause);
resetBtn.addEventListener("click", resetGame);

// Spacebar pumps on laptop (unless a button is focused, which handles it already)
document.addEventListener("keydown", (event) => {
  if (event.code === "Space" && isPlaying && !isPaused) {
    if (event.target.tagName === "BUTTON") return;
    event.preventDefault();
    pump();
  }
});

// ===== Set up the first screen =====
resetState();
requestAnimationFrame(animateDrops);
