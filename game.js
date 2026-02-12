const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// ================= LOBBY =================
let selectedCharacter = "warrior";
let gameStarted = false;

const characterStats = {
  warrior: {
    name: "전사",
    atk: 1.2,
    maxHp: 120,
    speed: 3,
    fireRate: 500
  },
  mage: {
    name: "마법사",
    atk: 1,
    maxHp: 100,
    speed: 3,
    fireRate: 350,
    piercing: 1
  },
  ranger: {
    name: "레인저",
    atk: 1,
    maxHp: 100,
    speed: 3.75,
    fireRate: 500,
    bulletCount: 2
  }
};

// 캐릭터 선택
document.querySelectorAll('.character-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedCharacter = card.dataset.character;
  });
});

// 게임 시작 버튼
document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('gameContainer').classList.remove('hidden');
  initGame();
  gameStarted = true;
});

// ================= GAME STATE =================
let gamePaused = false;
let lastShotTime = 0;
let gameStartTime = 0;
let gameTime = 0;
let currentPhase = 1;
let gameOver = false;
let pauseStartTime = 0;
let totalPausedTime = 0;
let enemiesKilled = 0;  // 처치한 적 수 추적

// deltaTime을 위한 변수
let lastFrameTime = 0;
let deltaTime = 0;

// ================= AUDIO =================
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const bgm = new Audio('bgm.mp3');

// 1. 모든 효과음의 볼륨을 제어할 Master GainNode 생성
const masterGainNode = audioContext.createGain();
masterGainNode.connect(audioContext.destination);

bgm.loop = true; 
bgm.volume = 0.5;

// 전체 음소거 상태 관리 변수
let isMuted = false;

function playSound(type) {
  // 음소거 상태면 소리를 생성하지 않고 종료
  if (isMuted) return;

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  // 2. destination 대신 masterGainNode에 연결
  gainNode.connect(masterGainNode); 
  
  switch(type) {
    case 'levelup':
      oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.4);
      break;
      
    case 'victory':
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        // 승리 효과음도 masterGainNode에 연결
        gain.connect(masterGainNode);
        osc.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.15);
        gain.gain.setValueAtTime(0.3, audioContext.currentTime + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.15 + 0.3);
        osc.start(audioContext.currentTime + i * 0.15);
        osc.stop(audioContext.currentTime + i * 0.15 + 0.3);
      });
      return;
      
    case 'defeat':
      oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(261.63, audioContext.currentTime + 0.5);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.8);
      break;
      
    case 'bomb':
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(80, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(40, audioContext.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.4);
      break;
  }
}

// ================= SFX (MP3 효과음) =================
// 파일 경로: sounds/ 폴더 안에 mp3 파일을 넣어주세요.
// 필요한 파일 목록:
//   sounds/arrow.mp3        → 플레이어 화살 발사음
//   sounds/chaser_death.mp3 → 고블린(chaser) 처치음
//   sounds/dasher_death.mp3 → 박쥐(dasher) 처치음
//   sounds/shooter_death.mp3→ 해골마법사(shooter) 처치음
//   sounds/tank_death.mp3   → 골렘(tank) 처치음

const sfxSounds = {
  arrow:          new Audio('sounds/arrow.mp3'),
  chaser_death:   new Audio('sounds/chaser_death.mp3'),
  dasher_death:   new Audio('sounds/dasher_death.mp3'),
  shooter_death:  new Audio('sounds/shooter_death.mp3'),
  tank_death:     new Audio('sounds/tank_death.mp3'),
};

// 각 효과음 기본 볼륨 설정 (0.0 ~ 1.0)
sfxSounds.arrow.volume          = 0.5;
sfxSounds.chaser_death.volume   = 0.7;
sfxSounds.dasher_death.volume   = 0.7;
sfxSounds.shooter_death.volume  = 0.75;
sfxSounds.tank_death.volume     = 0.8;  // 골렘은 조금 더 묵직하게

/**
 * MP3 효과음 재생 함수.
 * cloneNode()로 복사해 동시 다중 재생을 지원합니다.
 * @param {string} name  sfxSounds 의 키값 (예: 'arrow', 'chaser_death')
 */
function playSFX(name) {
  if (isMuted) return;
  const original = sfxSounds[name];
  if (!original) return;

  const clone = original.cloneNode();
  clone.volume = original.volume;
  clone.play().catch(() => {});   // 브라우저 자동재생 정책 예외 무시
}

// ================= MUTE BUTTON LOGIC =================


// 3. 재생 함수 (사용자 상호작용 후 호출 가능)
function playBGM() {
    bgm.play().catch(error => {
        console.log("브라우저 정책으로 인해 자동 재생이 차단되었습니다. 클릭 후 재생해주세요!");
    });
}

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
playerImage.src = "image/player.png";
const bossImage = new Image();
bossImage.src = "image/boss.png";
const chaserImage = new Image();
chaserImage.src = "image/chaser.png";
const dasherImage = new Image();
dasherImage.src = "image/dasher.png";
const tankImage = new Image();
tankImage.src = "image/tank.png";
const shooterImage = new Image();
shooterImage.src = "image/shooter.png";
const arrowImage = new Image();
arrowImage.src = "image/arrow.png";
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
  bulletCount: 1,
  piercing: 0,
  isHitInvincible: false,
  isItemInvincible: false,
  invincibilityDuration: 0.5,
  invincibleTimer: 0,
  itemInvincibleTimer: 0,
  frameX: 0,
  frameCount: 3,
  frameTimer: 0,
  frameSpeed: 8,
  isMoving: false
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
const BOSS_SPAWN_TIME = 270; // 4분 30초 (270초)

const PHASES = {
  1: {
    name: "Phase 1: 시작",
    duration: 60,
    spawnInterval: 1000,
    enemyMultiplier: 1.0,
    weights: [0.6, 0.2, 0.1, 0.1]
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
let bossSpawned = false;

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
    hp: 2.5,
    speed: 2.5,
    r: 10,
    dashCooldown: 120,
    color: "orange",
    expValue: 25
  },
  tank: {
    hp: 12,
    speed: 0.6,
    r: 18,
    color: "darkred",
    expValue: 50
  },
  shooter: {
    hp: 4,
    speed: 0.8,
    r: 12,
    shootInterval: 1500,
    color: "purple",
    expValue: 35
  },
  boss: {
    hp: 1000,
    speed: 0.8,
    r: 40,
    color: "#8b0000",
    expValue: 1000,
    shootInterval: 800,
    dashCooldown: 180
  }
};

const particles = [];

// 특수 효과용 변수
let edgeExplosionEffect = { active: false, timer: 0, duration: 1.0 };
let edgeAuraEffect = { active: false, timer: 0, duration: 1.0 };

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
  { min: 0,   r: 5,  color: "#4da6ff" },
  { min: 30,  r: 7,  color: "#4dff88" },
  { min: 50,  r: 9,  color: "#ffd700" },
  { min: 100, r: 12, color: "#ff4d4d" }
];

// ================= ITEMS =================
const items = [];
const ITEM_SPAWN_INTERVAL = 15000;
let lastItemSpawn = 0;

const ITEM_TYPES = {
  heart: {
    color: "#ff4d4d",
    r: 10,
    chance: 0.5,
    apply: () => {
      player.hp = Math.min(player.maxHp, player.hp + 30);
      console.log("체력 회복!");
    }
  },
  star: {
    color: "#ffff4d",
    r: 12,
    chance: 0.2,
    apply: () => {
      player.isItemInvincible = true;
      player.itemInvincibleTimer = 10;
      
      // 캔버스 가장자리 노란 오오라 특수효과
      createEdgeAuraEffect();
      
      console.log("10초 무적!");
    }
  },
  bomb: {
    color: "#ff8000",
    r: 10,
    chance: 0.15,
    apply: () => {
      playSound('bomb');
      
      // 캔버스 가장자리 폭발 특수효과
      createEdgeExplosionEffect();
      
      enemies.forEach(e => {
        if (e.type !== "boss") {
          spawnExp(e.x, e.y, e.expValue);
        }
      });
      enemies.splice(0, enemies.length, ...enemies.filter(e => e.type === "boss"));
      console.log("전체 폭발!");
    }
  },
  magnet: {
    color: "#4dffff",
    r: 10,
    chance: 0.15,
    apply: () => {
      exps.forEach(exp => {
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
    p.x += p.vx * deltaTime * 60;
    p.y += p.vy * deltaTime * 60;
    p.life -= deltaTime * 60;

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

function spawnParticles(x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    particles.push({
      x, y,
      vx: Math.cos(angle) * 2,
      vy: Math.sin(angle) * 2,
      r: 3,
      life: 30,
      maxLife: 30,
      color
    });
  }
}

// 폭탄 아이템 획득 시 캔버스 가장자리 폭발 효과
function createEdgeExplosionEffect() {
  edgeExplosionEffect.active = true;
  edgeExplosionEffect.timer = 0;
}

// 무적 아이템 획득 시 캔버스 가장자리 노란 오오라 효과
function createEdgeAuraEffect() {
  edgeAuraEffect.active = true;
  edgeAuraEffect.timer = 0;
}

// 특수 효과 업데이트
function updateSpecialEffects() {
  if (edgeExplosionEffect.active) {
    edgeExplosionEffect.timer += deltaTime;
    if (edgeExplosionEffect.timer >= edgeExplosionEffect.duration) {
      edgeExplosionEffect.active = false;
    }
  }
  
  if (edgeAuraEffect.active) {
    edgeAuraEffect.timer += deltaTime;
    if (edgeAuraEffect.timer >= edgeAuraEffect.duration) {
      edgeAuraEffect.active = false;
    }
  }
}

// ================= GROUND =================
function drawGround() {
  // 배경색 (어두운 흙색)
  ctx.fillStyle = "#2a3d2a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const startX = Math.floor(camera.x / TILE_SIZE) * TILE_SIZE;
  const startY = Math.floor(camera.y / TILE_SIZE) * TILE_SIZE;

  // 잔디 타일 그리기
  for (let y = startY; y < camera.y + canvas.height + TILE_SIZE; y += TILE_SIZE) {
    for (let x = startX; x < camera.x + canvas.width + TILE_SIZE; x += TILE_SIZE) {
      drawGrassTile(x - camera.x, y - camera.y, x, y);
    }
  }
}

function drawGrassTile(screenX, screenY, worldX, worldY) {
  // 시드값으로 일관된 패턴 생성 (월드 좌표 기반)
  const seed = worldX * 73856093 ^ worldY * 19349663;
  
  // 기본 잔디 색상들
  const grassColors = [
    "#3a5a3a", // 어두운 녹색
    "#4a6a4a", // 중간 녹색
    "#5a7a5a", // 밝은 녹색
    "#2a4a2a", // 매우 어두운 녹색
    "#4a5a3a", // 노란빛 녹색
  ];
  
  const random = (n) => {
    const x = Math.sin(seed + n) * 10000;
    return x - Math.floor(x);
  };
  
  // 타일 기본 색상
  const baseColorIndex = Math.abs(seed % grassColors.length);
  ctx.fillStyle = grassColors[baseColorIndex];
  ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
  
  // 자연스러운 잔디 더미들 (원형 + 불규칙한 모양)
  for (let i = 0; i < 15; i++) {
    const px = screenX + random(i * 7) * TILE_SIZE;
    const py = screenY + random(i * 11) * TILE_SIZE;
    const size = 2 + random(i * 13) * 6;
    
    const colorIndex = Math.abs(Math.floor(random(i * 17) * grassColors.length));
    ctx.fillStyle = grassColors[colorIndex];
    
    // 원형으로 그리기
    ctx.beginPath();
    ctx.arc(px, py, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // 작은 잔디 블레이드 (선 형태)
  for (let i = 0; i < 25; i++) {
    const px = screenX + random(i * 23 + 1000) * TILE_SIZE;
    const py = screenY + random(i * 29 + 1000) * TILE_SIZE;
    
    const colorIndex = Math.abs(Math.floor(random(i * 31) * grassColors.length));
    ctx.strokeStyle = grassColors[colorIndex];
    ctx.lineWidth = 1;
    
    const angle = random(i * 37) * Math.PI * 2;
    const length = 3 + random(i * 41) * 5;
    
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(angle) * length, py + Math.sin(angle) * length);
    ctx.stroke();
  }
  
  // 더 큰 잔디 패치 (불규칙한 원형)
  if (random(42) > 0.6) {
    const patchX = screenX + random(43) * TILE_SIZE;
    const patchY = screenY + random(44) * TILE_SIZE;
    const patchSize = 8 + random(45) * 15;
    
    ctx.fillStyle = grassColors[Math.floor(random(46) * grassColors.length)];
    
    // 불규칙한 원형 패치
    ctx.beginPath();
    const points = 6 + Math.floor(random(47) * 4);
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const dist = patchSize * (0.7 + random(i * 48) * 0.6);
      const x = patchX + Math.cos(angle) * dist;
      const y = patchY + Math.sin(angle) * dist;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  
  // 밝은 포인트 (햇빛 효과) - 원형
  if (random(66) > 0.85) {
    ctx.fillStyle = "#6a8a6a";
    const highlightX = screenX + random(67) * TILE_SIZE;
    const highlightY = screenY + random(68) * TILE_SIZE;
    const highlightSize = 2 + random(69) * 4;
    
    ctx.beginPath();
    ctx.arc(highlightX, highlightY, highlightSize, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // 가끔 작은 꽃 (원형)
  if (random(123) > 0.93) {
    const flowerColors = ["#ffeb3b", "#ff9800", "#8bc34a", "#e91e63"];
    ctx.fillStyle = flowerColors[Math.floor(random(456) * flowerColors.length)];
    const dotX = screenX + random(789) * TILE_SIZE;
    const dotY = screenY + random(234) * TILE_SIZE;
    
    ctx.beginPath();
    ctx.arc(dotX, dotY, 2, 0, Math.PI * 2);
    ctx.fill();
    
    // 꽃 중심
    ctx.fillStyle = "#fff59d";
    ctx.beginPath();
    ctx.arc(dotX, dotY, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // 작은 돌멩이 (불규칙한 타원)
  if (random(234) > 0.95) {
    ctx.fillStyle = "#888888";
    const stoneX = screenX + random(345) * TILE_SIZE;
    const stoneY = screenY + random(456) * TILE_SIZE;
    
    ctx.beginPath();
    ctx.ellipse(stoneX, stoneY, 2 + random(567) * 2, 1 + random(678) * 2, random(789) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWorldEdge() {
  // 플레이어와 월드 중심 사이의 거리 계산
  const centerX = WORLD_WIDTH / 2;
  const centerY = WORLD_HEIGHT / 2;
  const distFromCenter = Math.hypot(player.x - centerX, player.y - centerY);
  const maxDist = Math.min(WORLD_WIDTH, WORLD_HEIGHT) / 2;
  
  // 경계에 가까워질수록 비네팅 효과 증가
  if (distFromCenter > maxDist - EDGE_FADE_DISTANCE) {
    const fadeAmount = (distFromCenter - (maxDist - EDGE_FADE_DISTANCE)) / EDGE_FADE_DISTANCE;
    const opacity = Math.min(0.5, fadeAmount * 0.5); // 최대 투명도를 0.5로 제한
    
    // 부드러운 회색 비네팅 효과
    const gradient = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      Math.min(canvas.width, canvas.height) / 3,
      canvas.width / 2,
      canvas.height / 2,
      Math.min(canvas.width, canvas.height) / 2
    );
    gradient.addColorStop(0, "rgba(30, 30, 30, 0)");
    gradient.addColorStop(1, `rgba(20, 20, 20, ${opacity})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  
  // 폭탄 효과 - 가장자리 폭발
  if (edgeExplosionEffect.active) {
    const progress = edgeExplosionEffect.timer / edgeExplosionEffect.duration;
    const alpha = 1 - progress;
    const pulseSize = progress * 40;
    
    ctx.strokeStyle = `rgba(255, 100, 0, ${alpha * 0.8})`;
    ctx.lineWidth = 20 - progress * 15;
    ctx.shadowBlur = 30;
    ctx.shadowColor = "orange";
    
    // 화면 가장자리에 사각형 테두리
    ctx.strokeRect(
      pulseSize, 
      pulseSize, 
      canvas.width - pulseSize * 2, 
      canvas.height - pulseSize * 2
    );
    
    ctx.shadowBlur = 0;
  }
  
  // 무적 효과 - 가장자리 노란 오오라
  if (edgeAuraEffect.active) {
    const progress = edgeAuraEffect.timer / edgeAuraEffect.duration;
    const alpha = 1 - progress;
    const pulseIntensity = Math.sin(edgeAuraEffect.timer * 10) * 0.3 + 0.7;
    
    ctx.strokeStyle = `rgba(255, 255, 0, ${alpha * pulseIntensity})`;
    ctx.lineWidth = 15;
    ctx.shadowBlur = 40;
    ctx.shadowColor = "yellow";
    
    // 화면 가장자리에 사각형 테두리
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
    
    ctx.shadowBlur = 0;
  }
}

// ================= PLAYER =================
function updatePlayer() {
  if (mouse.isMoving) {
    const dx = mouse.x - player.x;
    const dy = mouse.y - player.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 5) {
      const moveSpeed = player.speed * deltaTime * 60;
      player.x += (dx / dist) * moveSpeed;
      player.y += (dy / dist) * moveSpeed;
      player.isMoving = true;
    } else {
      player.isMoving = false;
    }
  } else {
    player.isMoving = false;
  }

  player.x = Math.max(player.r, Math.min(WORLD_WIDTH - player.r, player.x));
  player.y = Math.max(player.r, Math.min(WORLD_HEIGHT - player.r, player.y));

  if (player.regen > 0) {
    player.hp = Math.min(player.maxHp, player.hp + player.regen * deltaTime);
  }

  if (player.isMoving) {
    player.frameTimer += deltaTime * 60;
    if (player.frameTimer >= player.frameSpeed) {
      player.frameTimer = 0;
      player.frameX = (player.frameX + 1) % player.frameCount;
    }
  } else {
    player.frameX = 0;
    player.frameTimer = 0;
  }

  camera.x = player.x - canvas.width / 2;
  camera.y = player.y - canvas.height / 2;

  camera.x = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, camera.x));
  camera.y = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, camera.y));
}

function updateInvincibilityTimer(time) {
  if (player.isHitInvincible) {
    player.invincibleTimer -= deltaTime;
    if (player.invincibleTimer <= 0) {
      player.isHitInvincible = false;
      player.invincibleTimer = 0;
    }
  }

  if (player.isItemInvincible) {
    player.itemInvincibleTimer -= deltaTime;
    if (player.itemInvincibleTimer <= 0) {
      player.isItemInvincible = false;
      player.itemInvincibleTimer = 0;
    }
  }
}

function playerTakeDamage(damage) {
  if (player.isHitInvincible || player.isItemInvincible) return;

  player.hp -= damage;
  player.isHitInvincible = true;
  player.invincibleTimer = player.invincibilityDuration;

  if (player.hp <= 0) {
    player.hp = 0;
    endGame(false);
  }
}

// ================= PHASE =================
function updatePhase() {
  gameTime = (Date.now() - gameStartTime - totalPausedTime) / 1000;
  
  // 보스 스폰 체크
  if (!bossSpawned && gameTime >= BOSS_SPAWN_TIME) {
    spawnBoss();
    bossSpawned = true;
  }

  if (gameTime >= GAME_DURATION) {
    endGame(true);
    return;
  }

  let elapsed = 0;
  for (let p = 1; p <= 5; p++) {
    elapsed += PHASES[p].duration;
    if (gameTime < elapsed) {
      currentPhase = p;
      break;
    }
  }
}

// ================= ENEMIES =================
function spawnEnemy(time) {
  const phase = PHASES[currentPhase];
  if (time - lastEnemySpawn < phase.spawnInterval) return;

  lastEnemySpawn = time;

  const types = ["chaser", "dasher", "tank", "shooter"];
  const rand = Math.random();
  let cumulative = 0;
  let selectedType = types[0];

  for (let i = 0; i < types.length; i++) {
    cumulative += phase.weights[i];
    if (rand < cumulative) {
      selectedType = types[i];
      break;
    }
  }

  const template = ENEMY_TYPES[selectedType];
  const angle = Math.random() * Math.PI * 2;
  const spawnDist = 700;
  const x = player.x + Math.cos(angle) * spawnDist;
  const y = player.y + Math.sin(angle) * spawnDist;

  const enemy = {
    x, y,
    type: selectedType,
    r: template.r,
    speed: template.speed * phase.enemyMultiplier,
    hp: template.hp * phase.enemyMultiplier,
    maxHp: template.hp * phase.enemyMultiplier,
    color: template.color,
    expValue: template.expValue,
    frameX: 0,
    frameCount: 3,
    frameTimer: 0,
    frameSpeed: selectedType === "dasher" ? 8 : 12  // 박쥐는 더 빠르게
  };

  if (selectedType === "dasher") {
    enemy.dashTimer = 0;
    enemy.isDashing = false;
    enemy.dashCooldown = template.dashCooldown;
  }

  if (selectedType === "shooter") {
    enemy.lastShot = 0;
    enemy.shootInterval = template.shootInterval;
  }

  enemies.push(enemy);
}

function spawnBoss() {
  const template = ENEMY_TYPES.boss;
  
  const boss = {
    x: player.x + 500,
    y: player.y,
    type: "boss",
    r: template.r,
    speed: template.speed,
    hp: template.hp,
    maxHp: template.hp,
    color: template.color,
    expValue: template.expValue,
    lastShot: 0,
    shootInterval: template.shootInterval,
    dashTimer: 0,
    isDashing: false,
    dashCooldown: template.dashCooldown,
    frameX: 0,
    frameCount: 3,
    frameTimer: 0,
    frameSpeed: 15  // 보스 애니메이션 속도
  };

  enemies.push(boss);
  console.log("🔥 보스 등장! 🔥");
}

function updateEnemies(time) {
  enemies.forEach(e => {
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const dist = Math.hypot(dx, dy);

    // 모든 적 애니메이션 업데이트
    e.frameTimer += deltaTime * 60;
    if (e.frameTimer >= e.frameSpeed) {
      e.frameTimer = 0;
      e.frameX = (e.frameX + 1) % e.frameCount;
    }

    if (e.type === "dasher" || e.type === "boss") {
      e.dashTimer += deltaTime * 60;

      if (!e.isDashing && e.dashTimer >= e.dashCooldown) {
        e.isDashing = true;
        e.dashTimer = 0;
        e.dashVx = (dx / dist) * e.speed * 5;
        e.dashVy = (dy / dist) * e.speed * 5;
      }

      if (e.isDashing) {
        e.x += e.dashVx * deltaTime * 60;
        e.y += e.dashVy * deltaTime * 60;
        e.dashTimer += deltaTime * 60;

        if (e.dashTimer >= 15) {
          e.isDashing = false;
          e.dashTimer = 0;
        }
      } else {
        const moveSpeed = e.speed * deltaTime * 60;
        e.x += (dx / dist) * moveSpeed;
        e.y += (dy / dist) * moveSpeed;
      }
    } else if (e.type === "shooter" || e.type === "boss") {
      const moveSpeed = e.speed * deltaTime * 60;
      e.x += (dx / dist) * moveSpeed;
      e.y += (dy / dist) * moveSpeed;

      if (time - e.lastShot > e.shootInterval) {
        enemyShoot(e);
        e.lastShot = time;
      }
    } else {
      const moveSpeed = e.speed * deltaTime * 60;
      e.x += (dx / dist) * moveSpeed;
      e.y += (dy / dist) * moveSpeed;
    }

    e.x = Math.max(e.r, Math.min(WORLD_WIDTH - e.r, e.x));
    e.y = Math.max(e.r, Math.min(WORLD_HEIGHT - e.r, e.y));
  });
}

function enemyShoot(enemy) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy);

  const bulletCount = enemy.type === "boss" ? 3 : 1;
  const spreadAngle = enemy.type === "boss" ? 0.3 : 0;

  for (let i = 0; i < bulletCount; i++) {
    const angleOffset = (i - (bulletCount - 1) / 2) * spreadAngle;
    const angle = Math.atan2(dy, dx) + angleOffset;
    
    enemyBullets.push({
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(angle) * ENEMY_BULLET_SPEED,
      vy: Math.sin(angle) * ENEMY_BULLET_SPEED,
      createdAt: Date.now()
    });
  }
}

function updateEnemyBullets(time) {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.x += b.vx * deltaTime * 60;
    b.y += b.vy * deltaTime * 60;

    if (time - b.createdAt > 5000) {
      enemyBullets.splice(i, 1);
      continue;
    }

    if (distance(player, b) < player.r + ENEMY_BULLET_RADIUS) {
      playerTakeDamage(5);
      enemyBullets.splice(i, 1);
    }
  }
}

// ================= BULLETS =================
function shoot(time) {
  if (time - lastShotTime < player.fireRate) return;
  lastShotTime = time;

  if (enemies.length === 0) return;

  const nearest = enemies.reduce((closest, e) => {
    const d = distance(player, e);
    return d < distance(player, closest) ? e : closest;
  }, enemies[0]);

  const dx = nearest.x - player.x;
  const dy = nearest.y - player.y;
  const angle = Math.atan2(dy, dx);

  const spreadAngle = 0.15;
  const count = player.bulletCount;

  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * spreadAngle;
    const bulletAngle = angle + offset;

    bullets.push({
      x: player.x,
      y: player.y,
      vx: Math.cos(bulletAngle) * BULLET_SPEED,
      vy: Math.sin(bulletAngle) * BULLET_SPEED,
      createdAt: time,
      pierced: 0
    });
  }

  // 화살 발사 효과음
  playSFX('arrow');
}

function updateBullets(time) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * deltaTime * 60;
    b.y += b.vy * deltaTime * 60;

    if (time - b.createdAt > BULLET_LIFETIME) {
      bullets.splice(i, 1);
      continue;
    }

    let hitEnemy = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (distance(b, e) < e.r + BULLET_RADIUS) {
        e.hp -= player.atk;
        hitEnemy = true;

        if (e.hp <= 0) {
          spawnExp(e.x, e.y, e.expValue);
          spawnParticles(e.x, e.y, e.color);

          // 적 타입별 처치 효과음
          // boss는 별도 처리 없이 tank_death 공유 (원하면 boss_death.mp3 추가 가능)
          switch (e.type) {
            case 'chaser':  playSFX('chaser_death');  break;  // 고블린
            case 'dasher':  playSFX('dasher_death');  break;  // 박쥐
            case 'shooter': playSFX('shooter_death'); break;  // 해골마법사
            case 'tank':    playSFX('tank_death');    break;  // 골렘
            case 'boss':    playSFX('tank_death');    break;  // 보스 – 골렘음 재활용
          }

          enemies.splice(j, 1);
          enemiesKilled++;  // 처치 카운트 증가
        }

        if (b.pierced >= player.piercing) {
          bullets.splice(i, 1);
          break;
        } else {
          b.pierced++;
        }
      }
    }
  }
}

// ================= EXP =================
function spawnExp(x, y, value) {
  let tier = EXP_TIERS[0];
  for (let i = EXP_TIERS.length - 1; i >= 0; i--) {
    if (value >= EXP_TIERS[i].min) {
      tier = EXP_TIERS[i];
      break;
    }
  }

  exps.push({
    x, y,
    r: tier.r,
    color: tier.color,
    value,
    isMagnetized: false
  });
}

function updateExps() {
  for (let i = exps.length - 1; i >= 0; i--) {
    const exp = exps[i];
    const dist = distance(player, exp);

    if (exp.isMagnetized || dist < player.magnet) {
      const dx = player.x - exp.x;
      const dy = player.y - exp.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 1) {
        const magnetSpeed = 8 * deltaTime * 60;
        exp.x += (dx / dist) * magnetSpeed;
        exp.y += (dy / dist) * magnetSpeed;
      }
    }

    if (dist < player.r + exp.r) {
      gainExp(exp.value);
      exps.splice(i, 1);
    }
  }
}

// ================= ITEMS =================
function spawnItem(time) {
  if (time - lastItemSpawn < ITEM_SPAWN_INTERVAL) return;
  lastItemSpawn = time;

  const angle = Math.random() * Math.PI * 2;
  const dist = 300 + Math.random() * 300;
  const x = player.x + Math.cos(angle) * dist;
  const y = player.y + Math.sin(angle) * dist;

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
      item.apply();
      items.splice(i, 1);
    }
  }
}

function drawItems() {
  items.forEach(item => {
    ctx.shadowBlur = 10;
    ctx.shadowColor = item.color;
    
    ctx.fillStyle = item.color;
    ctx.beginPath();
    
    ctx.arc(item.x - camera.x, item.y - camera.y, item.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.font = "bold 12px Georgia, serif";
    ctx.textAlign = "center";
    let icon = "❤";
    if (item.type === "star") icon = "⭐";
    if (item.type === "bomb") icon = "💣";
    if (item.type === "magnet") icon = "🧲";
    ctx.fillText(icon, item.x - camera.x, item.y - camera.y + 4);
    
    ctx.shadowBlur = 0;
  });
}

// ================= PLAYER HIT =================
function checkPlayerHit() {
  enemies.forEach(e => {
    if (distance(player, e) < player.r + e.r) {
      const damage = e.type === "boss" ? 20 : 10;
      playerTakeDamage(damage);
    }
  });
}

// ================= LEVEL / EXP =================
function gainExp(amount) {
  player.exp += amount;
  if (player.exp >= player.expToNext) {
    player.exp -= player.expToNext;
    player.expToNext = Math.floor(player.expToNext * 1.25);
    player.level++;
    openLevelUp();
  }
}

let currentChoices = [];

function openLevelUp() {
  gamePaused = true;
  pauseStartTime = Date.now();

  player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.05);
  levelUpModal.classList.remove("hidden");
  
  // 레벨업 효과음 재생
  playSound('levelup');

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
  
  // 승리/패배 효과음 재생
  if (victory) {
    playSound('victory');
  } else {
    playSound('defeat');
  }
  
  const resultText = victory ? "승리!" : "패배...";
  
  finalStats.innerHTML = `
    <h2>${resultText}</h2>
    <p>생존 시간: ${formatTime(gameTime)}</p>
    <p>레벨: ${player.level}</p>
    <p>처치한 적: ${enemiesKilled}마리</p>
  `;
  
  gameOverModal.classList.remove("hidden");
}

document.getElementById("restartBtn").onclick = () => {
  location.reload();
};

// ================= PAUSE BUTTON =================
document.getElementById("pauseBtn").onclick = () => {
  if (gameOver) return;
  
  if (!gamePaused) {
    gamePaused = true;
    pauseStartTime = Date.now();
    document.getElementById("pauseBtn").textContent = "▶ 계속";
  } else {
    totalPausedTime += Date.now() - pauseStartTime;
    gamePaused = false;
    document.getElementById("pauseBtn").textContent = "⏸ 일시정지";
  }
};

// ================= MUTE BUTTON =================

document.getElementById("muteBtn").onclick = () => {
  isMuted = !isMuted; // 상태 반전

  if (isMuted) {
    // 음소거 설정
    bgm.muted = true;
    masterGainNode.gain.setValueAtTime(0, audioContext.currentTime); // 효과음 볼륨 0
    document.getElementById("muteBtn").textContent = "🔇 음소거 해제";
  } else {
    // 음소거 해제
    bgm.muted = false;
    masterGainNode.gain.setValueAtTime(1, audioContext.currentTime); // 효과음 볼륨 원복
    document.getElementById("muteBtn").textContent = "🔊 음소거";

    // 브라우저 정책 대응 (Suspended 상태일 경우 재개)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    if (bgm.paused) {
      bgm.play().catch(() => {});
    }
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

  ctx.save();

  const isFlip = mouse.x < player.x;
  if (isFlip) {
    ctx.translate(player.x - camera.x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(player.x - camera.x), 0);
  }

  if (player.isHitInvincible) {
    const blinkSpeed = 15;
    const alpha = 0.4 + Math.abs(Math.sin(player.invincibleTimer * blinkSpeed)) * 0.6;
    ctx.globalAlpha = alpha;
  }
  else if (player.isItemInvincible) {
    ctx.shadowBlur = 20;
    ctx.shadowColor = "yellow";
  }

  const spriteWidth = playerImage.width / 3;
  const spriteHeight = playerImage.height;
  const aspectRatio = spriteWidth / spriteHeight;

  const VISUAL_SCALE = 2.5;

  const drawHeight = (player.r * 2) * VISUAL_SCALE;
  const drawWidth = drawHeight * aspectRatio;

  ctx.drawImage(
    playerImage,
    player.frameX * spriteWidth, 0,
    spriteWidth, spriteHeight,
    player.x - camera.x - drawWidth / 2,
    player.y - camera.y - drawHeight / 2 - (player.r * 0.5),
    drawWidth, drawHeight
  );

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.restore();

  // enemies
  enemies.forEach(e => {
    let enemyImage = null;
    let visualScale = 1.5;
    
    // 적 타입별 이미지 선택
    switch(e.type) {
      case "boss":
        enemyImage = bossImage;
        visualScale = 2.0;
        break;
      case "chaser":
        enemyImage = chaserImage;
        visualScale = 2.0;
        break;
      case "dasher":
        enemyImage = dasherImage;
        visualScale = 2.0;
        break;
      case "tank":
        enemyImage = tankImage;
        visualScale = 1.8;
        break;
      case "shooter":
        enemyImage = shooterImage;
        visualScale = 2.0;
        break;
    }
    
    if (enemyImage && enemyImage.complete) {
      // 스프라이트 렌더링
      const spriteWidth = enemyImage.width / 3;
      const spriteHeight = enemyImage.height;
      const aspectRatio = spriteWidth / spriteHeight;
      
      const drawHeight = (e.r * 2) * visualScale;
      const drawWidth = drawHeight * aspectRatio;
      
      // 대시 중이거나 보스일 때 발광 효과
      if (e.isDashing || e.type === "boss") {
        ctx.shadowBlur = e.type === "boss" ? 20 : 15;
        ctx.shadowColor = e.type === "boss" ? "red" : "yellow";
      }
      
      ctx.drawImage(
        enemyImage,
        e.frameX * spriteWidth, 0,
        spriteWidth, spriteHeight,
        e.x - camera.x - drawWidth / 2,
        e.y - camera.y - drawHeight / 2,
        drawWidth, drawHeight
      );
      
      ctx.shadowBlur = 0;
      
      // HP 바
      if (e.type === "boss") {
        // 보스 HP 바 (더 크고 눈에 띄게)
        const barWidth = e.r * 2.5;
        const barHeight = 8;
        const barX = e.x - camera.x - barWidth / 2;
        const barY = e.y - camera.y - e.r - 50;
        
        // HP 바 배경
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);
        
        ctx.fillStyle = "rgba(50,0,0,0.9)";
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // HP 바 (그라디언트)
        const hpPercent = e.hp / e.maxHp;
        const gradient = ctx.createLinearGradient(barX, barY, barX + barWidth * hpPercent, barY);
        if (hpPercent > 0.5) {
          gradient.addColorStop(0, "#ff0000");
          gradient.addColorStop(1, "#ff4444");
        } else if (hpPercent > 0.25) {
          gradient.addColorStop(0, "#ff4400");
          gradient.addColorStop(1, "#ff8800");
        } else {
          gradient.addColorStop(0, "#ff0000");
          gradient.addColorStop(1, "#aa0000");
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
        
        // HP 텍스트
        ctx.fillStyle = "white";
        ctx.font = "bold 12px Georgia, serif";
        ctx.textAlign = "center";
        ctx.fillText(`${Math.ceil(e.hp)} / ${e.maxHp}`, e.x - camera.x, barY - 5);
        
        // BOSS 라벨
        ctx.fillStyle = "#ffd700";
        ctx.font = "bold 18px Georgia, serif";
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#ffd700";
        ctx.fillText("★ BOSS ★", e.x - camera.x, e.y - camera.y - e.r - 65);
        ctx.shadowBlur = 0;
      } else {
        // 일반 적 HP 바
        const barWidth = e.r * 2;
        const barHeight = 3;
        const barX = e.x - camera.x - e.r;
        const barY = e.y - camera.y - e.r - (drawHeight / 2) - 5;
        
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        const hpPercent = e.hp / e.maxHp;
        ctx.fillStyle = hpPercent > 0.5 ? "lime" : hpPercent > 0.25 ? "yellow" : "red";
        ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
      }
    } else {
      // 이미지 로딩 전 또는 실패 시 원으로 표시 (폴백)
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
      
      // HP 바
      const barWidth = e.r * 2;
      const barHeight = e.type === "boss" ? 6 : 3;
      const barX = e.x - camera.x - e.r;
      const barY = e.y - camera.y - e.r - (e.type === "boss" ? 12 : 6);
      
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(barX, barY, barWidth, barHeight);
      
      const hpPercent = e.hp / e.maxHp;
      ctx.fillStyle = hpPercent > 0.5 ? "lime" : hpPercent > 0.25 ? "yellow" : "red";
      ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
    }
  });

  // bullets - 화살 이미지 사용
  bullets.forEach(b => {
    if (arrowImage.complete) {
      ctx.save();
      
      // 총알 이동 방향 계산 (angle)
      const angle = Math.atan2(b.vy, b.vx);
      
      // 화살 크기 설정
      const arrowWidth = 60;
      const arrowHeight = 60;
      
      // 화살 위치로 이동 및 회전
      ctx.translate(b.x - camera.x, b.y - camera.y);
      ctx.rotate(angle);
      
      // 화살 이미지 그리기 (중앙 기준)
      ctx.drawImage(
        arrowImage,
        -arrowWidth / 2,
        -arrowHeight / 2,
        arrowWidth,
        arrowHeight
      );
      
      ctx.restore();
    } else {
      // 이미지 로딩 전 폴백
      ctx.fillStyle = "yellow";
      ctx.beginPath();
      ctx.arc(
        b.x - camera.x,
        b.y - camera.y,
        BULLET_RADIUS,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  });

  // enemy bullets - 작은 화염구처럼 변경
  enemyBullets.forEach(b => {
    const screenX = b.x - camera.x;
    const screenY = b.y - camera.y;
    
    // 화염구 효과
    const gradient = ctx.createRadialGradient(
      screenX, screenY, 0,
      screenX, screenY, ENEMY_BULLET_RADIUS * 1.5
    );
    gradient.addColorStop(0, "#ffff00");
    gradient.addColorStop(0.4, "#ff8800");
    gradient.addColorStop(0.7, "#ff0000");
    gradient.addColorStop(1, "rgba(255, 0, 0, 0)");
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(screenX, screenY, ENEMY_BULLET_RADIUS * 1.5, 0, Math.PI * 2);
    ctx.fill();
    
    // 중앙 밝은 부분
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(screenX, screenY, ENEMY_BULLET_RADIUS * 0.6, 0, Math.PI * 2);
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

// ================= INIT GAME =================
function initGame() {
  const stats = characterStats[selectedCharacter];
  player.atk = stats.atk;
  player.maxHp = stats.maxHp;
  player.hp = stats.maxHp;
  player.speed = stats.speed;
  player.fireRate = stats.fireRate;
  if (stats.piercing) player.piercing = stats.piercing;
  if (stats.bulletCount) player.bulletCount = stats.bulletCount;
  
  enemiesKilled = 0;  // 처치 카운트 리셋
  
  playBGM();
  gameStartTime = Date.now();
  lastFrameTime = performance.now();
  mouse.x = player.x;
  mouse.y = player.y;
  loop(performance.now());
}

// ================= LOOP =================
function loop(currentTime) {
  if (gameOver) {
    return;
  }

  // deltaTime 계산 (초 단위)
  deltaTime = (currentTime - lastFrameTime) / 1000;
  lastFrameTime = currentTime;
  
  // deltaTime 제한 (너무 큰 값 방지)
  if (deltaTime > 0.1) deltaTime = 0.1;

  const time = Date.now();

  if (!gamePaused) {
    updatePhase();
    updatePlayer();
    updateInvincibilityTimer(time);
    spawnEnemy(time);
    spawnItem(time);
    updateEnemies(time);
    shoot(time);
    updateBullets(time);
    updateParticles();
    updateSpecialEffects();
    updateEnemyBullets(time);
    updateExps();
    updateItems();
    checkPlayerHit(time);
    updateUI();
  }

  draw();
  requestAnimationFrame(loop);
}