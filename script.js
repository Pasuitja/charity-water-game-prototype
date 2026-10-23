// Log a message to the console to ensure the script is linked correctly
console.log('JavaScript file is linked correctly.');

// ===== Game settings =====
const GAME_TIME = 60;          // seconds
const PUMPS_PER_TANK = 10;     // each pump adds 10%
const TANK_GOAL = 5;           // tanks needed to win
const POINTS_PER_DROP = 50;
const POINTS_PER_TANK = 250;
const LEAK_PENALTY = 100;
const LEAK_FIX_TIME = 3;       // seconds to fix a leak
const DROP_SPEED = 900;        // ms for a drop to travel the pipe

// ===== Grab elements =====
const timeEl = document.getElementById("time");
const timeBox = document.getElementById("timeBox");
const scoreEl = document.getElementById("score");
const tanksEl = document.getElementById("tanks");
const progress = document.getElementById("progress");
const progressFill = document.getElementById("progressFill");
const factEl = document.getElementById("fact");
const water = document.getElementById("water");
const tankPercent = document.getElementById("tankPercent");
const pipePath = document.getElementById("pipePath");
const dropLayer = document.getElementById("dropLayer");
const pumpBtn = document.getElementById("pumpBtn");
const leakBtn = document.getElementById("leak");
const leakTimerEl = document.getElementById("leakTimer");
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

// ===== Game state =====
let score, timeLeft, tankLevel, tanksFilled;
let isPlaying = false;
let isPaused = false;
let timerId = null;
let factId = null;
let factIndex = 0;
let drops = [];
let leak = null;          // { length, timeLeft } when a leak is active
let leakCooldown = 0;     // seconds until a new leak can show up

// ===== Update the screen =====
function updateStats() {
  scoreEl.textContent = score.toLocaleString();
  const minutes = Math.floor(timeLeft / 60);
  const seconds = String(timeLeft % 60).padStart(2, "0");
  timeEl.textContent = minutes + ":" + seconds;
  timeBox.classList.toggle("low-time", timeLeft <= 10);
  tanksEl.textContent = tanksFilled;
  progressFill.style.width = (tanksFilled / TANK_GOAL) * 100 + "%";
  progress.setAttribute("aria-valuenow", tanksFilled);
}

function updateTank() {
  const height = (tankLevel / 100) * TANK_HEIGHT;
  water.setAttribute("y", TANK_TOP + TANK_HEIGHT - height);
  water.setAttribute("height", height);
  tankPercent.textContent = tankLevel + "%";
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

  // Create a water drop at the start of the pipe
  const drop = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  drop.setAttribute("r", 8);
  drop.setAttribute("class", "drop");
  dropLayer.appendChild(drop);
  drops.push({ el: drop, start: performance.now() });
}

// Move every drop along the pipe each frame
function animateDrops(now) {
  drops = drops.filter((drop) => {
    if (isPaused) {
      drop.start += 16; // freeze drops while paused
      return true;
    }
    const progressAlong = Math.min((now - drop.start) / DROP_SPEED, 1);
    const distance = progressAlong * pipeLength;

    // A leak wastes any drop that reaches it
    if (leak && distance >= leak.length) {
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
  tankLevel += 100 / PUMPS_PER_TANK;
  showFeedback("+" + POINTS_PER_DROP);

  if (tankLevel >= 100) {
    tanksFilled++;
    console.log("Tank filled! Tanks:", tanksFilled, "Score:", score);
    score += POINTS_PER_TANK;
    tankLevel = tanksFilled >= TANK_GOAL ? 100 : 0; // keep the last tank full on a win
    showFeedback("Tank " + tanksFilled + " filled! +" + POINTS_PER_TANK, "big");
  }

  updateTank();
  updateStats();

  if (tanksFilled >= TANK_GOAL) {
    endGame(true);
  }
}

// ===== Leak obstacle =====
function spawnLeak() {
  // Pick a random spot along the middle of the pipe
  const length = pipeLength * (0.2 + Math.random() * 0.6);
  const point = pipePath.getPointAtLength(length);
  leak = { length: length, timeLeft: LEAK_FIX_TIME };

  // Convert SVG coordinates (400 x 500) to percentages of the board
  // (clamped so the button never gets cut off at the edges)
  const left = Math.min(Math.max((point.x / 400) * 100, 22), 78);
  const top = Math.min(Math.max((point.y / 500) * 100, 12), 88);
  leakBtn.style.left = left + "%";
  leakBtn.style.top = top + "%";
  leakTimerEl.textContent = leak.timeLeft;
  leakBtn.hidden = false;
  console.log("Leak appeared at", Math.round(left) + "%,", Math.round(top) + "%");
}

function fixLeak() {
  if (!leak || isPaused) return;
  leak = null;
  leakBtn.hidden = true;
  leakCooldown = 4;
  console.log("Leak fixed");
  showFeedback("Leak fixed!");
}

function leakTick() {
  if (leak) {
    leak.timeLeft--;
    leakTimerEl.textContent = leak.timeLeft;
    if (leak.timeLeft <= 0) {
      // Didn't fix it in time: lose points
      score = Math.max(0, score - LEAK_PENALTY);
      console.log("Leak not fixed, -" + LEAK_PENALTY + ". Score:", score);
      showFeedback("-" + LEAK_PENALTY + " Leak!", "bad");
      leak = null;
      leakBtn.hidden = true;
      leakCooldown = 4;
      updateStats();
    }
  } else if (leakCooldown > 0) {
    leakCooldown--;
  } else if (Math.random() < 0.35) {
    spawnLeak();
  }
}

// ===== Timer (runs once per second) =====
function tick() {
  if (isPaused) return;
  timeLeft--;
  leakTick();
  updateStats();
  if (timeLeft <= 0) {
    endGame(false);
  }
}

// ===== Start / end / reset =====
function resetState() {
  clearInterval(timerId);
  clearInterval(factId);
  score = 0;
  timeLeft = GAME_TIME;
  tankLevel = 0;
  tanksFilled = 0;
  isPlaying = false;
  isPaused = false;
  leak = null;
  leakCooldown = 5;
  leakBtn.hidden = true;
  drops.forEach((drop) => drop.el.remove());
  drops = [];
  feedback.innerHTML = "";
  pauseBtn.textContent = "Pause";
  pauseBtn.disabled = true;
  pumpBtn.disabled = true;
  stopConfetti();
  updateTank();
  updateStats();
}

function startGame() {
  resetState();
  console.log("Game started");
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
  leakBtn.hidden = true;
  leak = null;

  finalScore.textContent = score.toLocaleString();
  if (won) {
    endTitle.textContent = "You did it! 🎉";
    endMessage.textContent = "You filled all 5 tanks with " + timeLeft + " seconds left. That's clean water for a family!";
    startConfetti();
  } else {
    endTitle.textContent = "Time's Up!";
    endMessage.textContent = "You filled " + tanksFilled + " of 5 tanks. Every drop counts. Try again to reach the village goal!";
  }
  endScreen.hidden = false;
  playAgainBtn.focus();
}

function togglePause() {
  if (!isPlaying) return;
  isPaused = !isPaused;
  pauseBtn.textContent = isPaused ? "Resume" : "Pause";
  pumpBtn.disabled = isPaused;
}

// Reset button: go back to a fresh game right away
function resetGame() {
  startGame();
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
leakBtn.addEventListener("click", fixLeak);
startBtn.addEventListener("click", startGame);
playAgainBtn.addEventListener("click", startGame);
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