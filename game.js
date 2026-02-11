const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// ================= GAME STATE =================
let gamePaused = false;
let lastShotTime = 0;
let gameStartTime = 0;
let gameTime = 0;
let currentPhase = 1;
let gameOver = false;
let pauseStartTime = 0;        // 일시정지 시작 시간
let totalPausedTime = 0;       // 총 일시정지된 시간

// ================= WORLD =================
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 3000;

const TILE_SIZE = 100;
const EDGE_FADE_DISTANCE = 300;

// ================= CAMERA =================
const camera = {
  x: 0,
  y: 0,
};

// ================= PLAYER =================
const playerImage = new Image();
playerImage.src = "player.png";
const player = {
  x: WORLD_WIDTH / 2,
  y: WORLD_HEIGHT / 2,
  r: 32,
  speed: 3,
  maxHp: 100,
  hp: 100,
  level: 1,
  exp: 0,
  expToNext: 100,
  atk: 1,
  fireRate: 500,
  regen: 0,
  magnet: 100,
  bulletCount: 1,        // 한 번에 발사하는 총알 수
  piercing: 0,           // 관통력
  isHitInvincible: false,
  isItemInvincible: false,
  invincibilityDuration: 1.0, // 1초 동안 무적
  invincibleTimer: 0,     // 남은 무적 시간 체크용
  itemInvincibleTimer: 0,
  frameX: 0,      // 현재 프레임 인덱스 (0, 1, 2)
  frameCount: 3,  // 총 프레임 수
  frameTimer: 0,  // 프레임 전환을 위한 타이머
  frameSpeed: 8,  // 애니메이션 속도 (숫자가 낮을수록 빨라짐)
  isMoving: false // 이동 중인지 체크
};

// ================= INPUT =================
const mouse = {
  x: WORLD_WIDTH / 2,
  y: WORLD_HEIGHT / 2,
  isMoving: false
};

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = camera.x + (e.clientX - rect.left);
  mouse.y = camera.y + (e.clientY - rect.top);
  mouse.isMoving = true;
});

canvas.addEventListener("mouseleave", () => {
  mouse.isMoving = false;
});
// ================= PHASE SYSTEM =================
const GAME_DURATION = 300; // 5분 (초 단위)

const PHASES = {
  1: {
    name: "Phase 1: 시작",
    duration: 60,
    spawnInterval: 1000,
    enemyMultiplier: 1.0,
    weights: [0.6, 0.2, 0.1, 0.1] // chaser, dasher, tank, shooter
  },
  2: {
    name: "Phase 2: 증가",
    duration: 60,
    spawnInterval: 700,
    enemyMultiplier: 1.2,
    weights: [0.4, 0.3, 0.15, 0.15]
  },
  3: {
    name: "Phase 3: 격화",
    duration: 60,
    spawnInterval: 500,
    enemyMultiplier: 1.5,
    weights: [0.3, 0.3, 0.2, 0.2]
  },
  4: {
    name: "Phase 4: 위기",
    duration: 60,
    spawnInterval: 400,
    enemyMultiplier: 2.0,
    weights: [0.25, 0.25, 0.25, 0.25]
  },
  5: {
    name: "Phase 5: 최후",
    duration: 60,
    spawnInterval: 300,
    enemyMultiplier: 2.5,
    weights: [0.2, 0.3, 0.2, 0.3]
  }
};

// ================= ENEMIES =================
const enemies = [];
let lastEnemySpawn = 0;

// 적 타입 정의
const ENEMY_TYPES = {
  chaser: {
    hp: 3,
    speed: 1.2,
    r: 12,
    color: "red",
    expValue: 20
  },
  dasher: {
    hp: 2,
    speed: 2.5,
    r: 10,
    dashCooldown: 120,
    color: "orange",
    expValue: 25
  },
  tank: {
    hp: 10,
    speed: 0.6,
    r: 18,
    color: "darkred",
    expValue: 50
  },
  shooter: {
    hp: 3,
    speed: 0.8,
    r: 12,
    shootInterval: 1500,
    color: "purple",
    expValue: 35
  }
};
const particles = [];

// ================= ENEMY BULLETS =================
const enemyBullets = [];
const ENEMY_BULLET_SPEED = 3;
const ENEMY_BULLET_RADIUS = 5;

// ================= BULLETS =================
const bullets = [];
const BULLET_SPEED = 6;
const BULLET_RADIUS = 4;
const BULLET_LIFETIME = 1200;

// ================= EXPS =================
const exps = [];
const EXP_TIERS = [
  { min: 0,   r: 5,  color: "#4da6ff" }, // 작은 파랑
  { min: 30,  r: 7,  color: "#4dff88" }, // 초록
  { min: 50,  r: 9,  color: "#ffd700" }, // 노랑
  { min: 100, r: 12, color: "#ff4d4d" }  // 빨강 (고급)
];

// ================= ITEMS =================
const items = [];
const ITEM_SPAWN_INTERVAL = 15000; // 15초마다 아이템 스폰 시도
let lastItemSpawn = 0;

const ITEM_TYPES = {
  heart: {
    color: "#ff4d4d", // 빨간색 (체력 회복)
    r: 10,
    chance: 0.5,     // 스폰 확률 (50%)
    apply: () => {
      player.hp = Math.min(player.maxHp, player.hp + 30);
      console.log("체력 회복!");
    }
  },
  star: {
    color: "#ffff4d", // 노란색 (무적)
    r: 12,
    chance: 0.2,     // 스폰 확률 (20%)
    apply: () => {
      player.isItemInvincible = true;
      player.itemInvincibleTimer = 10; // 10초간 무적
      console.log("10초 무적!");
    }
  },
  bomb: {
    color: "#ff8000", // 주황색 (폭탄)
    r: 10,
    chance: 0.15,    // 스폰 확률 (15%)
    apply: () => {
      enemies.forEach(e => {
        spawnExp(e.x, e.y, e.expValue); // 죽으면서 경험치 생성
      });
      enemies.length = 0; // 화면의 모든 적 제거
      console.log("전체 폭발!");
    }
  },
  magnet: {
    color: "#4dffff", // 하늘색 (자석)
    r: 10,
    chance: 0.15,    // 스폰 확률 (15%)
    apply: () => {
      exps.forEach(exp => {
        // 모든 경험치를 플레이어 위치로 즉시 이동시키기 위한 플래그 설정
        exp.isMagnetized = true; 
      });
      console.log("자석 활성화!");
    }
  }
};

// ================= UPGRADES =================
const upgrades = [
  {
    id: "atk",
    name: "공격력 +50%",
    desc: "총알 피해 증가",
    apply: () => player.atk *= 1.5
  },
  {
    id: "speed",
    name: "이동 속도 +10%",
    desc: "플레이어 이동 속도 증가",
    apply: () => player.speed *= 1.1
  },
  {
    id: "fireRate",
    name: "공격 속도 +20%",
    desc: "발사 쿨타임 감소",
    apply: () => player.fireRate *= 0.8
  },
  {
    id: "hp",
    name: "최대 체력 +20",
    desc: "체력 상한 증가",
    apply: () => {
      player.maxHp += 20;
      player.hp += 20;
    }
  },
  {
    id: "regen",
    name: "체력 재생 +0.1/초",
    desc: "초당 체력 회복",
    apply: () => player.regen += 0.1
  },
  {
    id: "magnet",
    name: "경험치 흡수 +30%",
    desc: "경험치 자동 흡수 범위 증가",
    apply: () => player.magnet *= 1.3
  },
  {
    id: "bulletCount",
    name: "탄환 수 +1",
    desc: "한 번에 발사하는 총알 증가",
    apply: () => player.bulletCount += 1
  },
  {
    id: "piercing",
    name: "관통력 +1",
    desc: "총알이 적을 관통",
    apply: () => player.piercing += 1
  }
];

// ================= UI =================
const hpFill = document.getElementById("hpFill");
const expFill = document.getElementById("expFill");
const levelText = document.getElementById("levelText");
const levelUpModal = document.getElementById("levelUpModal");
const phaseText = document.getElementById("phaseText");
const timerText = document.getElementById("timerText");
const gameOverModal = document.getElementById("gameOverModal");
const finalStats = document.getElementById("finalStats");

// ================= UTILS =================
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

// ================= PARTICLES =================
function drawParticles() {
  particles.forEach(p => {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;

    ctx.beginPath();
    ctx.arc(
      p.x - camera.x,
      p.y - camera.y,
      p.r,
      0,
      Math.PI * 2
    );
    ctx.fill();
  });

  ctx.globalAlpha = 1;
}

// ================= GROUND / EDGE =================
function drawGround() {
  const startX = Math.floor(camera.x / TILE_SIZE) * TILE_SIZE;
  const startY = Math.floor(camera.y / TILE_SIZE) * TILE_SIZE;

  const endX = camera.x + canvas.width;
  const endY = camera.y + canvas.height;

  for (let x = startX; x < endX; x += TILE_SIZE) {
    for (let y = startY; y < endY; y += TILE_SIZE) {
      ctx.fillStyle = ((x / TILE_SIZE + y / TILE_SIZE) % 2 === 0)
        ? "#1f1f1f"
        : "#252525";

      ctx.fillRect(
        x - camera.x,
        y - camera.y,
        TILE_SIZE,
        TILE_SIZE
      );
    }
  }
}

function drawWorldEdge() {
  let alpha = 0;

  const left = player.x;
  const right = WORLD_WIDTH - player.x;
  const top = player.y;
  const bottom = WORLD_HEIGHT - player.y;

  const minDist = Math.min(left, right, top, bottom);

  if (minDist < EDGE_FADE_DISTANCE) {
    alpha = 1 - minDist / EDGE_FADE_DISTANCE;
  }

  if (alpha > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.5})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}


// ================= PLAYER =================
function updatePlayer() {
  let dx = 0;
  let dy = 0;

  // 마우스 위치로 이동
  if (mouse.isMoving) {
    dx = mouse.x - player.x;
    dy = mouse.y - player.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 5) {
      dx /= dist;
      dy /= dist;
      player.isMoving = true; // 이동 중
    } else {
      dx = 0;
      dy = 0;
      player.isMoving = false; // 정지
    }
  } else {
    player.isMoving = false; // 정지
  }

  player.x += dx * player.speed;
  player.y += dy * player.speed;

  // --- 애니메이션 로직 추가 ---
  if (player.isMoving) {
    player.frameTimer++;
    if (player.frameTimer >= player.frameSpeed) {
      player.frameX = (player.frameX + 1) % player.frameCount; // 0 -> 1 -> 2 반복
      player.frameTimer = 0;
    }
  } else {
    player.frameX = 1; // 멈춰있을 때는 중간 프레임(보통 정면/대기)으로 고정
  }

  // 캔버스 밖 못 나가게
  player.x = Math.max(player.r, Math.min(WORLD_WIDTH - player.r, player.x));
  player.y = Math.max(player.r, Math.min(WORLD_HEIGHT - player.r, player.y));

  camera.x = player.x - canvas.width / 2;
  camera.y = player.y - canvas.height / 2;

  // 카메라도 월드 밖 안 나가게
  camera.x = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, camera.x));
  camera.y = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, camera.y));

  if (player.regen > 0 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + player.regen / 60);
  }
}

// 플레이어 데미지 처리 함수
function playerTakeDamage(amount) {
  if (player.isHitInvincible || player.isItemInvincible) return; // 무적 상태면 무시

  player.hp -= amount;
  player.isHitInvincible = true;
  player.invincibleTimer = player.invincibilityDuration; // 1초 설정

  if (player.hp <= 0) endGame(false);
}

// 무적 상태 업데이트 함수 (loop에서 호출)
function updateInvincibilityTimer() {
  // 피격 무적
  if (player.isHitInvincible) {
    player.invincibleTimer -= 1/60;
    if (player.invincibleTimer <= 0) {
      player.isHitInvincible = false;
      player.invincibleTimer = 0;
    }
  }

  // 아이템 무적
  if (player.isItemInvincible) {
    player.itemInvincibleTimer -= 1/60;
    if (player.itemInvincibleTimer <= 0) {
      player.isItemInvincible = false;
      player.itemInvincibleTimer = 0;
    }
  }
}

// ================= PHASE =================
function updatePhase() {
  gameTime = (Date.now() - gameStartTime - totalPausedTime) / 1000;
  
  if (gameTime >= GAME_DURATION) {
    endGame(true);
    return;
  }

  // 페이즈 결정
  if (gameTime < 60) currentPhase = 1;
  else if (gameTime < 120) currentPhase = 2;
  else if (gameTime < 180) currentPhase = 3;
  else if (gameTime < 240) currentPhase = 4;
  else currentPhase = 5;
}

// ================= ENEMY =================
function spawnEnemy(time) {
  const phase = PHASES[currentPhase];
  if (time - lastEnemySpawn < phase.spawnInterval) return;
  lastEnemySpawn = time;

  const margin = 200;
  let x, y;

  if (Math.random() < 0.5) {
    x = camera.x + (Math.random() < 0.5 ? -margin : canvas.width + margin);
    y = camera.y + Math.random() * canvas.height;
  } else {
    x = camera.x + Math.random() * canvas.width;
    y = camera.y + (Math.random() < 0.5 ? -margin : canvas.height + margin);
  }

  // 페이즈별 적 타입 선택
  const types = ["chaser", "dasher", "tank", "shooter"];
  const weights = phase.weights;
  
  let rand = Math.random();
  let typeIndex = 0;
  let cumulative = 0;
  
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (rand < cumulative) {
      typeIndex = i;
      break;
    }
  }
  
  const type = types[typeIndex];
  const template = ENEMY_TYPES[type];

  // 페이즈에 따라 적 강화
  const hpMultiplier = phase.enemyMultiplier;

  const enemy = {
    x,
    y,
    type,
    hp: template.hp * hpMultiplier,
    maxHp: template.hp * hpMultiplier,
    speed: template.speed,
    r: template.r,
    color: template.color,
    expValue: template.expValue
  };

  // 타입별 추가 속성
  if (type === "dasher") {
    enemy.dashTimer = 0;
    enemy.isDashing = false;
  }
  
  if (type === "shooter") {
    enemy.lastShot = 0;
  }

  enemies.push(enemy);
}


function updateEnemies(time) {
  enemies.forEach(enemy => {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const len = Math.hypot(dx, dy);
    const dirX = dx / len;
    const dirY = dy / len;

    // 타입별 AI
    if (enemy.type === "chaser") {
      enemy.x += dirX * enemy.speed;
      enemy.y += dirY * enemy.speed;
    }
    
    else if (enemy.type === "dasher") {
      enemy.dashTimer++;
      
      if (enemy.dashTimer >= ENEMY_TYPES.dasher.dashCooldown) {
        enemy.isDashing = true;
        enemy.dashTimer = 0;
      }
      
      const dashSpeed = enemy.isDashing ? enemy.speed * 3 : enemy.speed * 0.5;
      enemy.x += dirX * dashSpeed;
      enemy.y += dirY * dashSpeed;
      
      if (enemy.isDashing && enemy.dashTimer > 20) {
        enemy.isDashing = false;
      }
    }
    
    else if (enemy.type === "tank") {
      enemy.x += dirX * enemy.speed;
      enemy.y += dirY * enemy.speed;
    }
    
    else if (enemy.type === "shooter") {
      const keepDistance = 250;
      
      if (len > keepDistance) {
        enemy.x += dirX * enemy.speed;
        enemy.y += dirY * enemy.speed;
      } else if (len < keepDistance - 50) {
        enemy.x -= dirX * enemy.speed;
        enemy.y -= dirY * enemy.speed;
      }
      
      if (time - enemy.lastShot > ENEMY_TYPES.shooter.shootInterval) {
        enemy.lastShot = time;
        shootEnemyBullet(enemy);
      }
    }
  });

  // 적끼리 겹침 방지
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i];
      const b = enemies[j];
      const dist = distance(a, b);
      const min = a.r + b.r;

      if (dist < min && dist > 0) {
        const overlap = (min - dist) / 2;
        const dx = (a.x - b.x) / dist;
        const dy = (a.y - b.y) / dist;
        a.x += dx * overlap;
        a.y += dy * overlap;
        b.x -= dx * overlap;
        b.y -= dy * overlap;
      }
    }
  }
}

function spawnDeathParticles(enemy) {
  const count = 10 + Math.floor(enemy.r / 2);

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 3 + 1;

    particles.push({
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 30,
      maxLife: 30,
      r: Math.random() * 3 + 2,
      color: enemy.color
    });
  }
}


// ================= ENEMY BULLETS =================
function shootEnemyBullet(enemy) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const len = Math.hypot(dx, dy);

  enemyBullets.push({
    x: enemy.x,
    y: enemy.y,
    vx: (dx / len) * ENEMY_BULLET_SPEED,
    vy: (dy / len) * ENEMY_BULLET_SPEED
  });
}

function updateEnemyBullets(time) {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.x += b.vx;
    b.y += b.vy;

    if (b.x < 0 || b.x > WORLD_WIDTH || b.y < 0 || b.y > WORLD_HEIGHT) {
      enemyBullets.splice(i, 1);
      continue;
    }

    if (distance(player, b) < player.r + ENEMY_BULLET_RADIUS) {
      playerTakeDamage(5, time); // 적 총알 데미지 5
      enemyBullets.splice(i, 1);
    }
  }
}

// ================= EXP =================
function getExpStyle(value) {
  for (let i = EXP_TIERS.length - 1; i >= 0; i--) {
    if (value >= EXP_TIERS[i].min) {
      return EXP_TIERS[i];
    }
  }
  return EXP_TIERS[0];
}

function spawnExp(x, y, value = 20) {
  const style = getExpStyle(value);

  exps.push({
    x,
    y,
    value,
    r: style.r,
    color: style.color
  });
}

function updateExps() {
  for (let i = exps.length - 1; i >= 0; i--) {
    const exp = exps[i];
    const d = distance(player, exp);

    // 자석 아이템을 먹었거나(isMagnetized), 자력 범위 안일 때
    if (exp.isMagnetized || d < player.magnet) {
      const dx = player.x - exp.x;
      const dy = player.y - exp.y;
      const pullSpeed = exp.isMagnetized ? 10 : 4; // 자석 아이템이면 더 빠르게 끌려옴
      exp.x += (dx / d) * pullSpeed;
      exp.y += (dy / d) * pullSpeed;
    }

    if (d < player.r) {
      gainExp(exp.value);
      exps.splice(i, 1);
    }
  }
}


// ================= BULLET =================
function shoot(time) {
  if (time - lastShotTime < player.fireRate) return;
  lastShotTime = time;

  // 가장 가까운 적들 찾기
  const targets = enemies
    .map(e => ({ enemy: e, dist: distance(player, e) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, player.bulletCount);

  if (targets.length === 0) return;

  targets.forEach(({ enemy }) => {
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const len = Math.hypot(dx, dy);

    bullets.push({
      x: player.x,
      y: player.y,
      vx: (dx / len) * BULLET_SPEED,
      vy: (dy / len) * BULLET_SPEED,
      born: time,
      pierceCount: 0
    });
  });
}

function updateBullets(time) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;

    if (time - b.born > BULLET_LIFETIME) {
      bullets.splice(i, 1);
      continue;
    }

    // 적 충돌
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + BULLET_RADIUS) {
        e.hp -= player.atk;

        if (e.hp <= 0) {
          spawnDeathParticles(e);
          enemies.splice(j, 1);
          spawnExp(e.x, e.y, e.expValue);
        }

        // 관통력 확인
        b.pierceCount++;
        if (b.pierceCount > player.piercing) {
          bullets.splice(i, 1);
        }
        break;
      }
    }
  }
}

// ================= ITEMS =================
function spawnItem(time) {
  if (time - lastItemSpawn < ITEM_SPAWN_INTERVAL) return;
  lastItemSpawn = time;

  // 플레이어 주변 적당한 거리에 스폰
  const angle = Math.random() * Math.PI * 2;
  const dist = 300 + Math.random() * 200;
  const x = Math.max(20, Math.min(WORLD_WIDTH - 20, player.x + Math.cos(angle) * dist));
  const y = Math.max(20, Math.min(WORLD_HEIGHT - 20, player.y + Math.sin(angle) * dist));

  // 확률에 따른 타입 결정
  const rand = Math.random();
  let cumulative = 0;
  let selectedType = "heart";

  for (const [type, data] of Object.entries(ITEM_TYPES)) {
    cumulative += data.chance;
    if (rand < cumulative) {
      selectedType = type;
      break;
    }
  }

  items.push({ x, y, type: selectedType, ...ITEM_TYPES[selectedType] });
}

function updateItems() {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (distance(player, item) < player.r + item.r) {
      item.apply(); // 아이템 효과 적용
      items.splice(i, 1); // 아이템 제거
    }
  }
}

function drawItems() {
  items.forEach(item => {
    // 외곽선 효과
    ctx.shadowBlur = 10;
    ctx.shadowColor = item.color;
    
    ctx.fillStyle = item.color;
    ctx.beginPath();
    
    // 타입에 따라 모양을 다르게 할 수 있지만, 여기서는 간단히 원과 아이콘 텍스트로 표시
    ctx.arc(item.x - camera.x, item.y - camera.y, item.r, 0, Math.PI * 2);
    ctx.fill();

    // 아이템 종류 구분용 텍스트 (간단하게 아이콘 표시)
    ctx.fillStyle = "white";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    let icon = "❤";
    if (item.type === "star") icon = "⭐";
    if (item.type === "bomb") icon = "💣";
    if (item.type === "magnet") icon = "🧲";
    ctx.fillText(icon, item.x - camera.x, item.y - camera.y + 4);
    
    ctx.shadowBlur = 0; // 그림자 초기화
  });
}
// ================= PLAYER HIT =================
function checkPlayerHit() {
  enemies.forEach(e => {
    if (distance(player, e) < player.r + e.r) {
      // 이제 프레임당 0.3이 아니라, 한 번 부딪히면 10정도 크게 깎고 1초 무적
      playerTakeDamage(10); 
    }
  });
}

// ================= LEVEL / EXP =================
function gainExp(amount) {
  player.exp += amount;
  if (player.exp >= player.expToNext) {
    player.exp -= player.expToNext;
    player.expToNext = Math.floor(player.expToNext * 1.3);
    player.level++;
    openLevelUp();
  }
}

let currentChoices = [];

function openLevelUp() {
  gamePaused = true;
  pauseStartTime = Date.now();  // 일시정지 시작 시간 기록

  player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.05);
  levelUpModal.classList.remove("hidden");

  const buttons = document.querySelectorAll(".choices button");
  currentChoices = [];

  const pool = [...upgrades];

  buttons.forEach(btn => {
    if (pool.length === 0) return;
    const pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    currentChoices.push(pick);

    btn.textContent = pick.name;
    btn.dataset.choice = pick.id;
  });
}


function closeLevelUp() {
  totalPausedTime += Date.now() - pauseStartTime;
  
  gamePaused = false;
  levelUpModal.classList.add("hidden");
  document.getElementById("pauseBtn").textContent = "⏸ 일시정지";
}

document.querySelectorAll(".choices button").forEach((btn, index) => {
  btn.onclick = () => {
    if (currentChoices[index]) {
      currentChoices[index].apply();
      closeLevelUp();
    }
  };
});

// ================= GAME OVER =================
function endGame(victory) {
  gameOver = true;
  gamePaused = true;
  
  const resultText = victory ? "승리!" : "패배...";
  const kills = Math.max(0, player.level - 1) * 5; // 대략적인 킬 수
  
  finalStats.innerHTML = `
    <h2>${resultText}</h2>
    <p>생존 시간: ${formatTime(gameTime)}</p>
    <p>레벨: ${player.level}</p>
    <p>처치한 적: 약 ${kills}마리</p>
  `;
  
  gameOverModal.classList.remove("hidden");
}

document.getElementById("restartBtn").onclick = () => {
  location.reload();
};

// ================= PAUSE BUTTON =================
document.getElementById("pauseBtn").onclick = () => {
  if (gameOver) return;  // 게임 오버 상태에선 무시
  
  if (!gamePaused) {
    // 일시정지 시작
    gamePaused = true;
    pauseStartTime = Date.now();
    document.getElementById("pauseBtn").textContent = "▶ 계속";
  } else {
    // 일시정지 해제
    totalPausedTime += Date.now() - pauseStartTime;
    gamePaused = false;
    document.getElementById("pauseBtn").textContent = "⏸ 일시정지";
  }
};


// ================= UI =================
function updateUI() {
  hpFill.style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
  expFill.style.width = `${(player.exp / player.expToNext) * 100}%`;
  levelText.textContent = `Lv. ${player.level}`;
  
  const remainingTime = Math.max(0, GAME_DURATION - gameTime);
  timerText.textContent = formatTime(remainingTime);
  phaseText.textContent = PHASES[currentPhase].name;
}

// ================= DRAW =================
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGround();

  ctx.save(); // 설정 저장

  // 마우스가 왼쪽에 있다면 이미지 반전
  const isFlip = mouse.x < player.x;
  if (isFlip) {
    ctx.translate(player.x - camera.x, 0); // 캐릭터 위치로 원점 이동
    ctx.scale(-1, 1);                      // 좌우 반전
    ctx.translate(-(player.x - camera.x), 0); // 원점 복구
  }

  if (player.isHitInvincible) {
    // 무적일 때 50% 투명도 (깜빡이는 효과를 주고 싶다면 Math.sin 사용)
    const blinkSpeed = 15; 
    const alpha = 0.4 + Math.abs(Math.sin(player.invincibleTimer * blinkSpeed)) * 0.6;
    ctx.globalAlpha = alpha; 
  }
  else if (player.isItemInvincible) {
  // 아이템 무적: 노란 오오라
  ctx.shadowBlur = 20;
  ctx.shadowColor = "yellow";
}
  // player
  // 소스 이미지(전체 3프레임 이미지) 한 칸의 너비 계산
  const spriteWidth = playerImage.width / 3;
  const spriteHeight = playerImage.height;
  const aspectRatio = spriteWidth / spriteHeight;

  // 시각적 확대 배율 (이 숫자를 조절해서 크기를 바꾸세요!)
  // 1.0 = 충돌 크기와 동일, 2.0 = 2배 큼, 2.5 = 2.5배 큼
  const VISUAL_SCALE = 2.5; 

  // 높이를 기준으로 크기를 정함 (캐릭터는 보통 키가 중요하므로)
  const drawHeight = (player.r * 2) * VISUAL_SCALE;
  const drawWidth = drawHeight * aspectRatio;

  ctx.drawImage(
    playerImage,
    player.frameX * spriteWidth, 0,  // 소스 위치
    spriteWidth, spriteHeight,       // 소스 크기
    player.x - camera.x - drawWidth / 2, // 그릴 위치 X (중앙)
    // 그릴 위치 Y: 발 위치를 맞추기 위해 조정
    // 캐릭터의 발 끝이 히트박스(원)의 바닥 근처에 오도록 설정
    player.y - camera.y - drawHeight / 2 - (player.r * 0.5), 
    drawWidth, drawHeight            // 그릴 크기 (확대됨)
  );

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.restore();

  // enemies
  enemies.forEach(e => {
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(
      e.x - camera.x,
      e.y - camera.y,
      e.r,
      0,
      Math.PI * 2
    );
    ctx.fill();
    
    // 대시 중 표시
    if (e.type === "dasher" && e.isDashing) {
      ctx.strokeStyle = "yellow";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    
    // 모든 적에게 HP 바
    const barWidth = e.r * 2;
    const barHeight = 3;
    const barX = e.x - camera.x - e.r;
    const barY = e.y - camera.y - e.r - 6;
    
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    
    const hpPercent = e.hp / e.maxHp;
    ctx.fillStyle = hpPercent > 0.5 ? "lime" : hpPercent > 0.25 ? "yellow" : "red";
    ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
  });

  // bullets
  ctx.fillStyle = "yellow";
  bullets.forEach(b => {
    ctx.beginPath();
    ctx.arc(
      b.x - camera.x, 
      b.y - camera.y, 
      BULLET_RADIUS, 
      0, 
      Math.PI * 2
    );
    ctx.fill();
  });

  // enemy bullets
  ctx.fillStyle = "magenta";
  enemyBullets.forEach(b => {
    ctx.beginPath();
    ctx.arc(
      b.x - camera.x,
      b.y - camera.y,
      ENEMY_BULLET_RADIUS,
      0,
      Math.PI * 2
    );
    ctx.fill();
  });

  // exps
  exps.forEach(e => {
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(
      e.x - camera.x,
      e.y - camera.y,
      e.r,
      0,
      Math.PI * 2
    );
    ctx.fill();
  });
  drawParticles();
  
  drawItems();

  drawWorldEdge();
}

// ================= LOOP =================
function loop(time) {
  if (gameOver) {
    return;
  }

  if (!gamePaused) {
    updatePhase();
    updatePlayer();
    updateInvincibilityTimer(time); // 추가: 무적 타이머 업데이트
    spawnEnemy(time);
    spawnItem(time);      // 아이템 스폰 추가
    updateEnemies(time);
    shoot(time);
    updateBullets(time);
    updateParticles();
    updateEnemyBullets(time);
    updateExps();
    updateItems();
    checkPlayerHit(time);
    updateUI();
  }

  draw();
  requestAnimationFrame(loop);
}

// 게임 시작
gameStartTime = Date.now();
mouse.x = player.x;
mouse.y = player.y;
loop();