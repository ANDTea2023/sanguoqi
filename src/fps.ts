type Enemy = {
  id: number; x: number; y: number; hp: number; maxHp: number; alive: boolean;
  attackTimer: number; hitFlash: number; deathTimer: number;
};
type Tracer = { x: number; y: number; life: number };
type Player = {
  x: number; y: number; angle: number; hp: number; ammo: number; reserve: number;
  fireTimer: number; reloadTimer: number; muzzle: number; damageFlash: number;
};

export class MissionWaves {
  wave = 1;
  complete = false;
  private remaining = 0;

  update(dt: number, alive: number) {
    if (this.complete || alive > 0) {
      this.remaining = 0;
      return false;
    }
    if (this.remaining === 0) this.remaining = 1.35;
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining > 0) return false;
    if (this.wave === 3) this.complete = true;
    else this.wave += 1;
    return true;
  }
}

const MAP = [
  '####################', '#........#.........#', '#........#.........#', '#..##....#..###....#',
  '#........#.........#', '#..................#', '#....######........#', '#..................#',
  '#........####......#', '#..................#', '#....#.............#', '#..................#',
  '####################',
];
const MAP_W = MAP[0].length; const MAP_H = MAP.length; const FOV = Math.PI / 3; const TAU = Math.PI * 2;
const SPAWN_POINTS = [[16.5, 2.4], [17.2, 10.3], [13.6, 4.7], [3.4, 9.5], [11.5, 10.7], [15.3, 7.2], [7.1, 10.5]] as const;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const wrapAngle = (angle: number) => { let result = angle % TAU; if (result > Math.PI) result -= TAU; if (result < -Math.PI) result += TAU; return result; };
function isWall(x: number, y: number) { const col = Math.floor(x); const row = Math.floor(y); return row < 0 || row >= MAP_H || col < 0 || col >= MAP_W || MAP[row][col] === '#'; }
function hasLineOfSight(ax: number, ay: number, bx: number, by: number) { const distance = Math.hypot(bx - ax, by - ay); const steps = Math.ceil(distance / 0.12); for (let i = 1; i < steps; i += 1) { const t = i / steps; if (isWall(ax + (bx - ax) * t, ay + (by - ay) * t)) return false; } return true; }
function getCanvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  return context;
}
function playTone(frequency: number, duration: number, volume = 0.025) { try { const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.type = 'square'; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(volume, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + duration); oscillator.addEventListener('ended', () => void context.close()); } catch { /* Audio is optional. */ } }

export function mountFpsGame(root: HTMLElement) {
  root.innerHTML = `
    <div class="fps-app">
      <header class="fps-topbar"><div class="fps-brand"><span class="brand-mark">N</span><div><strong>NIGHTFALL</strong><small>TACTICAL OPERATIONS</small></div></div><div class="topbar-center"><span class="live-dot"></span> LIVE COMBAT FEED <span class="topbar-divider"></span> SECTOR 07 / 22:41</div><div class="topbar-right"><span class="signal">▂▅▇</span><span>ONLINE</span><button class="sound-button" id="sound-toggle" aria-label="切换音效">◉</button></div></header>
      <main class="fps-main"><section class="viewport-panel"><div class="viewport-chrome"><span>OPERATION: DUSTLINE</span><span id="mission-state">ACTIVE · WAVE 01</span></div><div class="viewport-wrap" id="viewport-wrap"><canvas id="game-canvas" aria-label="Nightfall 第一人称射击游戏画面"></canvas><div class="reticle" aria-hidden="true"><i></i><b></b><i></i><b></b></div><div class="damage-vignette" id="damage-vignette"></div><div class="start-prompt" id="start-prompt"><span class="prompt-kicker">MISSION BRIEF</span><strong>点击进入战术视角</strong><span>WASD 移动 · 鼠标瞄准 · 左键开火</span></div><div class="reload-prompt" id="reload-prompt">RELOADING <span></span></div><div class="crosshair-label" id="crosshair-label">HOSTILE</div></div><div class="viewport-footer"><span><b class="keycap">W</b><b class="keycap">A</b><b class="keycap">S</b><b class="keycap">D</b> MOVE</span><span><b class="mouse-icon">●</b> AIM &nbsp; <b class="keycap">LMB</b> FIRE</span><span><b class="keycap">R</b> RELOAD</span></div></section>
        <aside class="mission-sidebar"><div class="sidebar-heading"><div><span class="eyebrow">FIELD COMMAND</span><h1>DUSTLINE</h1></div><span class="mission-badge">CLASSIFIED</span></div><div class="objective-card"><span class="eyebrow">PRIMARY OBJECTIVE</span><h2 id="objective-title">清除敌方小队</h2><p id="objective-copy">肃清所有敌方单位，保持撤离路线畅通。</p><div class="objective-progress"><span id="objective-progress-bar"></span></div><div class="objective-meta"><span id="enemy-counter">HOSTILES 05</span><span id="wave-label">WAVE 01 / 03</span></div></div><div class="intel-card"><div class="card-title"><span>TACTICAL MAP</span><span class="map-live">● LIVE</span></div><div class="mini-map-wrap"><canvas id="mini-map" width="240" height="156"></canvas><span class="map-north">N</span></div></div><div class="stat-grid"><div><span class="eyebrow">SCORE</span><strong id="score-value">000000</strong></div><div><span class="eyebrow">ACCURACY</span><strong id="accuracy-value">100%</strong></div><div><span class="eyebrow">ELIMINATIONS</span><strong id="kills-value">00</strong></div><div><span class="eyebrow">THREAT</span><strong class="threat-value" id="threat-value">LOW</strong></div></div><div class="squad-card"><div class="card-title"><span>SQUAD STATUS</span><span class="squad-count">1 / 1</span></div><div class="squad-row"><span class="operator-avatar">V</span><div><strong>VANGUARD</strong><small>YOU · ASSAULT</small></div><span class="status-online">●</span></div></div><div class="sidebar-tip"><span>i</span><p>保持移动。敌方单位会根据枪声锁定你的位置。</p></div></aside></main>
      <footer class="fps-bottom-hud"><div class="health-hud"><span class="hud-label">VITALS</span><strong id="health-value">100</strong><div class="health-bar"><span id="health-bar-fill"></span></div></div><div class="bottom-center"><span class="compass" id="compass">N&nbsp;&nbsp; · &nbsp;&nbsp;NE&nbsp;&nbsp; · &nbsp;&nbsp;E</span><span class="location-label">ABANDONED CHECKPOINT</span></div><div class="ammo-hud"><div><span class="ammo-label">AMMO</span><strong id="ammo-value">30 <small>/ 090</small></strong></div><div class="ammo-pips" id="ammo-pips"></div></div></footer>
      <div class="game-over" id="game-over" aria-hidden="true"><div class="game-over-card"><span class="eyebrow" id="game-over-kicker">MISSION REPORT</span><h2 id="game-over-title">区域肃清</h2><p id="game-over-copy">Dustline 已恢复安全。</p><div class="report-stats"><span><b id="report-score">000000</b>SCORE</span><span><b id="report-kills">00</b>ELIMINATIONS</span><span><b id="report-accuracy">100%</b>ACCURACY</span></div><button class="restart-button" id="restart-button">重新部署 <span>↻</span></button></div></div>
    </div>`;

  const canvas = root.querySelector<HTMLCanvasElement>('#game-canvas')!; const miniMap = root.querySelector<HTMLCanvasElement>('#mini-map')!; const ctx = getCanvasContext(canvas); const miniCtx = getCanvasContext(miniMap); const wrap = root.querySelector<HTMLDivElement>('#viewport-wrap')!;
  const startPrompt = root.querySelector<HTMLDivElement>('#start-prompt')!; const reloadPrompt = root.querySelector<HTMLDivElement>('#reload-prompt')!; const damageVignette = root.querySelector<HTMLDivElement>('#damage-vignette')!; const crosshairLabel = root.querySelector<HTMLDivElement>('#crosshair-label')!; const missionState = root.querySelector<HTMLSpanElement>('#mission-state')!;
  const objectiveTitle = root.querySelector<HTMLHeadingElement>('#objective-title')!; const objectiveCopy = root.querySelector<HTMLParagraphElement>('#objective-copy')!; const objectiveProgress = root.querySelector<HTMLSpanElement>('#objective-progress-bar')!; const enemyCounter = root.querySelector<HTMLSpanElement>('#enemy-counter')!; const waveLabel = root.querySelector<HTMLSpanElement>('#wave-label')!;
  const scoreValue = root.querySelector<HTMLSpanElement>('#score-value')!; const accuracyValue = root.querySelector<HTMLSpanElement>('#accuracy-value')!; const killsValue = root.querySelector<HTMLSpanElement>('#kills-value')!; const threatValue = root.querySelector<HTMLSpanElement>('#threat-value')!; const healthValue = root.querySelector<HTMLSpanElement>('#health-value')!; const healthBarFill = root.querySelector<HTMLSpanElement>('#health-bar-fill')!; const ammoValue = root.querySelector<HTMLSpanElement>('#ammo-value')!; const ammoPips = root.querySelector<HTMLDivElement>('#ammo-pips')!; const compass = root.querySelector<HTMLSpanElement>('#compass')!;
  const gameOver = root.querySelector<HTMLDivElement>('#game-over')!; const gameOverKicker = root.querySelector<HTMLSpanElement>('#game-over-kicker')!; const gameOverTitle = root.querySelector<HTMLHeadingElement>('#game-over-title')!; const gameOverCopy = root.querySelector<HTMLParagraphElement>('#game-over-copy')!; const reportScore = root.querySelector<HTMLElement>('#report-score')!; const reportKills = root.querySelector<HTMLElement>('#report-kills')!; const reportAccuracy = root.querySelector<HTMLElement>('#report-accuracy')!; const soundToggle = root.querySelector<HTMLButtonElement>('#sound-toggle')!;

  const promptTitle = startPrompt.querySelector('strong')!;
  const promptCopy = startPrompt.querySelector('span:last-child')!;
  const dragStart = document.createElement('button');
  dragStart.className = 'drag-start-button';
  dragStart.textContent = '使用拖动瞄准';
  dragStart.hidden = true;
  startPrompt.append(dragStart);
  let player: Player; let enemies: Enemy[]; let mission = new MissionWaves(); let wave = 1; let score = 0; let kills = 0; let shots = 0; let hits = 0; let started = false; let ended = false; let soundOn = true; let nextEnemyId = 1; let lastTime = performance.now(); const keys = new Set<string>(); let tracers: Tracer[] = []; let zBuffer: number[] = [];
  let controlMode: 'locked' | 'drag' = 'locked';
  let lockPending = false;
  let dragging = false;
  let deployed = false;
  function reset() { player = { x: 3.2, y: 2.25, angle: 0.08, hp: 100, ammo: 30, reserve: 90, fireTimer: 0, reloadTimer: 0, muzzle: 0, damageFlash: 0 }; mission = new MissionWaves(); wave = 1; score = 0; kills = 0; shots = 0; hits = 0; started = false; ended = false; deployed = false; lockPending = false; dragging = false; keys.clear(); nextEnemyId = 1; tracers = []; enemies = []; spawnWave(); gameOver.classList.remove('visible', 'success'); gameOver.setAttribute('aria-hidden', 'true'); reloadPrompt.classList.remove('visible'); startPrompt.classList.remove('hidden'); promptTitle.textContent = '点击进入战术视角'; promptCopy.textContent = 'WASD 移动 · 鼠标瞄准 · 左键开火'; dragStart.hidden = true; missionState.textContent = 'READY · WAVE 01'; requestResize(); updateHud(); }
  function spawnWave() { const count = Math.min(3 + wave * 2, SPAWN_POINTS.length); enemies = SPAWN_POINTS.slice(0, count).map(([x, y]) => ({ id: nextEnemyId++, x, y, hp: 100, maxHp: 100, alive: true, attackTimer: 0.7 + Math.random() * 0.7, hitFlash: 0, deathTimer: 0 })); }
  function requestResize() { const rect = wrap.getBoundingClientRect(); canvas.width = Math.max(480, Math.floor(rect.width)); canvas.height = Math.max(320, Math.floor(rect.height)); zBuffer = new Array(Math.ceil(canvas.width / 2)).fill(20); }
  function tryMove(x: number, y: number) { const radius = 0.22; if (!isWall(x + Math.sign(x - player.x) * radius, player.y) && !isWall(x, player.y)) player.x = x; if (!isWall(player.x, y + Math.sign(y - player.y) * radius) && !isWall(player.x, y)) player.y = y; }
  function reload() { if (!started || player.reloadTimer > 0 || player.ammo === 30 || player.reserve <= 0 || ended) return; player.reloadTimer = 1.35; reloadPrompt.classList.add('visible'); if (soundOn) playTone(220, 0.08, 0.018); }
  function shoot() { if (!started || ended || player.reloadTimer > 0 || player.fireTimer > 0) return; if (player.ammo <= 0) { reload(); return; } player.ammo -= 1; shots += 1; player.fireTimer = 0.095; player.muzzle = 0.07; if (soundOn) playTone(95, 0.055, 0.03); let target: Enemy | undefined; let targetDistance = Infinity; for (const enemy of enemies) { if (!enemy.alive) continue; const dx = enemy.x - player.x; const dy = enemy.y - player.y; const distance = Math.hypot(dx, dy); const angle = Math.abs(wrapAngle(Math.atan2(dy, dx) - player.angle)); const hitAngle = 0.035 + 0.012 / Math.max(distance, 1); if (angle < hitAngle && distance < targetDistance && hasLineOfSight(player.x, player.y, enemy.x, enemy.y)) { target = enemy; targetDistance = distance; } } const length = Math.min(targetDistance === Infinity ? 8 : targetDistance, 8); tracers.push({ x: player.x + Math.cos(player.angle) * length, y: player.y + Math.sin(player.angle) * length, life: 0.08 }); if (target) { hits += 1; target.hp -= 36; target.hitFlash = 0.12; score += 10; if (target.hp <= 0) { target.alive = false; target.deathTimer = 0.4; kills += 1; score += 90; if (soundOn) playTone(130, 0.1, 0.03); } else if (soundOn) playTone(360, 0.04, 0.02); } if (player.ammo === 0) reload(); }
  function update(dt: number) { if (!started || ended) return; player.fireTimer = Math.max(0, player.fireTimer - dt); player.muzzle = Math.max(0, player.muzzle - dt); player.damageFlash = Math.max(0, player.damageFlash - dt); tracers = tracers.filter((tracer) => { tracer.life -= dt; return tracer.life > 0; }); if (player.reloadTimer > 0) { player.reloadTimer -= dt; if (player.reloadTimer <= 0) { const loaded = Math.min(30 - player.ammo, player.reserve); player.ammo += loaded; player.reserve -= loaded; reloadPrompt.classList.remove('visible'); } }
    let moveX = 0; let moveY = 0; if (keys.has('w')) { moveX += Math.cos(player.angle); moveY += Math.sin(player.angle); } if (keys.has('s')) { moveX -= Math.cos(player.angle); moveY -= Math.sin(player.angle); } if (keys.has('a')) { moveX += Math.cos(player.angle - Math.PI / 2); moveY += Math.sin(player.angle - Math.PI / 2); } if (keys.has('d')) { moveX += Math.cos(player.angle + Math.PI / 2); moveY += Math.sin(player.angle + Math.PI / 2); } const moveLength = Math.hypot(moveX, moveY); if (moveLength > 0) { const speed = keys.has('shift') ? 3.5 : 2.25; tryMove(player.x + moveX / moveLength * speed * dt, player.y + moveY / moveLength * speed * dt); }
    for (const enemy of enemies) { if (!enemy.alive) { enemy.deathTimer -= dt; continue; } enemy.hitFlash = Math.max(0, enemy.hitFlash - dt); enemy.attackTimer -= dt; const dx = player.x - enemy.x; const dy = player.y - enemy.y; const distance = Math.hypot(dx, dy); if (distance > 1.35) { const speed = (0.32 + wave * 0.035) * dt; const nx = enemy.x + dx / distance * speed; const ny = enemy.y + dy / distance * speed; if (!isWall(nx, enemy.y) && Math.hypot(nx - player.x, enemy.y - player.y) > 0.8) enemy.x = nx; if (!isWall(enemy.x, ny) && Math.hypot(enemy.x - player.x, ny - player.y) > 0.8) enemy.y = ny; } else if (enemy.attackTimer <= 0 && hasLineOfSight(enemy.x, enemy.y, player.x, player.y)) { enemy.attackTimer = 1.05 + Math.random() * 0.6; player.hp = clamp(player.hp - (5 + wave), 0, 100); player.damageFlash = 0.2; if (soundOn) playTone(175, 0.05, 0.018); if (player.hp <= 0) finish(false); } }
    if (ended) return;
    const alive = enemies.filter((enemy) => enemy.alive).length;
    if (mission.update(dt, alive)) {
      if (mission.complete) finish(true);
      else { wave = mission.wave; spawnWave(); }
    }
  }
  function releaseMouse() { if (document.pointerLockElement === canvas) document.exitPointerLock?.(); }
  function finish(won: boolean) { ended = true; started = false; keys.clear(); dragging = false; reloadPrompt.classList.remove('visible'); releaseMouse(); gameOver.classList.add('visible'); gameOver.setAttribute('aria-hidden', 'false'); gameOverKicker.textContent = won ? 'MISSION COMPLETE' : 'MISSION FAILED'; gameOverTitle.textContent = won ? '区域肃清' : '失去联系'; gameOverCopy.textContent = won ? 'Dustline 已恢复安全。撤离窗口现已打开。' : 'Vanguard 已倒下。重新部署并夺回检查点。'; gameOver.classList.toggle('success', won); reportScore.textContent = String(score).padStart(6, '0'); reportKills.textContent = String(kills).padStart(2, '0'); reportAccuracy.textContent = `${shots ? Math.round(hits / shots * 100) : 100}%`; }
  function drawScene() { const width = canvas.width; const height = canvas.height; const sky = ctx.createLinearGradient(0, 0, 0, height * 0.55); sky.addColorStop(0, '#121923'); sky.addColorStop(1, '#27323b'); ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height * 0.56); const ground = ctx.createLinearGradient(0, height * 0.5, 0, height); ground.addColorStop(0, '#433d3a'); ground.addColorStop(1, '#171a1e'); ctx.fillStyle = ground; ctx.fillRect(0, height * 0.5, width, height * 0.5); const rayCount = Math.ceil(width / 2); const columnWidth = width / rayCount; zBuffer = new Array(rayCount); for (let ray = 0; ray < rayCount; ray += 1) { const rayAngle = player.angle - FOV / 2 + (ray / rayCount) * FOV; let distance = 0; while (distance < 24 && !isWall(player.x + Math.cos(rayAngle) * distance, player.y + Math.sin(rayAngle) * distance)) distance += 0.025; const corrected = Math.max(0.001, distance * Math.cos(rayAngle - player.angle)); zBuffer[ray] = corrected; const wallHeight = Math.min(height * 1.4, height / corrected * 0.92); const top = height * 0.5 - wallHeight * 0.5; const shade = clamp(1 - corrected / 15, 0.16, 1); ctx.fillStyle = `rgb(${Math.floor(86 * shade + 20)},${Math.floor(94 * shade + 23)},${Math.floor(89 * shade + 26)})`; ctx.fillRect(ray * columnWidth, top, columnWidth + 1, wallHeight); if (wallHeight > 10) { ctx.fillStyle = `rgba(191,165,125,${0.08 * shade})`; ctx.fillRect(ray * columnWidth, top, columnWidth + 1, 2); } }
    const visibleEnemies = enemies.filter((enemy) => enemy.alive || enemy.deathTimer > 0).map((enemy) => ({ enemy, distance: Math.hypot(enemy.x - player.x, enemy.y - player.y) })).sort((a, b) => b.distance - a.distance); const projection = width / (2 * Math.tan(FOV / 2)); for (const { enemy, distance } of visibleEnemies) { const angle = wrapAngle(Math.atan2(enemy.y - player.y, enemy.x - player.x) - player.angle); if (Math.abs(angle) > FOV * 0.65) continue; const screenX = width / 2 + Math.tan(angle) * projection; const spriteHeight = clamp(height / Math.max(distance, 0.2) * 0.9, 20, height * 1.2); const spriteWidth = spriteHeight * 0.42; const left = screenX - spriteWidth / 2; const top = height * 0.5 - spriteHeight * 0.5; const bufferAtSprite = zBuffer[clamp(Math.floor(screenX / width * rayCount), 0, rayCount - 1)]; if (distance > bufferAtSprite + 0.3) continue; const alpha = enemy.alive ? 1 : clamp(enemy.deathTimer / 0.4, 0, 1); ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = enemy.hitFlash > 0 ? '#f6d1a1' : '#c45445'; ctx.fillRect(left + spriteWidth * 0.19, top + spriteHeight * 0.25, spriteWidth * 0.62, spriteHeight * 0.7); ctx.fillStyle = '#e0a17e'; ctx.beginPath(); ctx.arc(screenX, top + spriteHeight * 0.17, spriteWidth * 0.25, 0, TAU); ctx.fill(); ctx.fillStyle = '#1d2529'; ctx.fillRect(left + spriteWidth * 0.12, top + spriteHeight * 0.08, spriteWidth * 0.76, spriteHeight * 0.16); ctx.fillStyle = '#252b2f'; ctx.fillRect(left + spriteWidth * 0.08, top + spriteHeight * 0.9, spriteWidth * 0.3, spriteHeight * 0.1); ctx.fillRect(left + spriteWidth * 0.62, top + spriteHeight * 0.9, spriteWidth * 0.3, spriteHeight * 0.1); if (enemy.alive) { ctx.fillStyle = '#0a0d10'; ctx.fillRect(left, top - 10, spriteWidth, 4); ctx.fillStyle = '#d85c4b'; ctx.fillRect(left, top - 10, spriteWidth * clamp(enemy.hp / enemy.maxHp, 0, 1), 4); } ctx.restore(); }
    drawWeapon(width, height); drawCompass(width, height); drawMiniMap(); }
  function drawWeapon(width: number, height: number) { const recoil = player.muzzle > 0 ? 12 : 0; ctx.save(); ctx.translate(width * 0.73, height * 0.83 + recoil); ctx.rotate(-0.12); ctx.fillStyle = '#0e151a'; ctx.beginPath(); ctx.moveTo(-75, height * 0.22); ctx.lineTo(-44, -45); ctx.lineTo(55, -63); ctx.lineTo(100, -18); ctx.lineTo(74, height * 0.22); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#29343a'; ctx.fillRect(-13, -47, 73, 18); ctx.fillStyle = '#53616a'; ctx.fillRect(12, -43, 47, 7); ctx.fillStyle = '#11191e'; ctx.fillRect(-58, -30, 42, 15); ctx.fillStyle = '#6c4e3e'; ctx.fillRect(-27, 0, 29, 80); ctx.fillStyle = '#11181d'; ctx.fillRect(-35, 17, 22, 77); ctx.restore(); if (player.muzzle > 0) { ctx.save(); ctx.translate(width * 0.78, height * 0.75); ctx.fillStyle = `rgba(255, 210, 106, ${player.muzzle / 0.07})`; ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(13, -10); ctx.lineTo(42, 0); ctx.lineTo(11, 11); ctx.lineTo(0, 50); ctx.lineTo(-11, 11); ctx.lineTo(-42, 0); ctx.lineTo(-13, -10); ctx.closePath(); ctx.fill(); ctx.restore(); } }
  function drawCompass(width: number, height: number) { const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']; const index = Math.round(((player.angle + Math.PI / 2) / (TAU / 8))) % 8; compass.textContent = `${directions[(index + 8) % 8]}   ·   ${directions[(index + 1) % 8]}   ·   ${directions[(index + 2) % 8]}`; ctx.fillStyle = 'rgba(218, 226, 213, .5)'; ctx.fillRect(width / 2 - 84, height - 63, 168, 1); }
  function drawMiniMap() { const w = miniMap.width; const h = miniMap.height; miniCtx.clearRect(0, 0, w, h); const cell = Math.min(w / MAP_W, h / MAP_H); miniCtx.fillStyle = '#151d20'; miniCtx.fillRect(0, 0, w, h); for (let row = 0; row < MAP_H; row += 1) for (let col = 0; col < MAP_W; col += 1) { miniCtx.fillStyle = MAP[row][col] === '#' ? '#65726b' : '#222d2e'; miniCtx.fillRect(col * cell, row * cell, cell - 1, cell - 1); } for (const enemy of enemies) if (enemy.alive) { miniCtx.fillStyle = '#db654f'; miniCtx.beginPath(); miniCtx.arc(enemy.x * cell, enemy.y * cell, 3, 0, TAU); miniCtx.fill(); } miniCtx.fillStyle = '#c7e07a'; miniCtx.beginPath(); miniCtx.arc(player.x * cell, player.y * cell, 4, 0, TAU); miniCtx.fill(); miniCtx.strokeStyle = '#c7e07a'; miniCtx.lineWidth = 1.5; miniCtx.beginPath(); miniCtx.moveTo(player.x * cell, player.y * cell); miniCtx.lineTo((player.x + Math.cos(player.angle) * 1.1) * cell, (player.y + Math.sin(player.angle) * 1.1) * cell); miniCtx.stroke(); }
  function updateHud() {
    const alive = enemies.filter((enemy) => enemy.alive).length;
    const accuracy = shots ? Math.round(hits / shots * 100) : 100;
    enemyCounter.textContent = `HOSTILES ${String(alive).padStart(2, '0')}`;
    waveLabel.textContent = `WAVE 0${wave} / 03`;
    scoreValue.textContent = String(score).padStart(6, '0');
    accuracyValue.textContent = `${accuracy}%`;
    killsValue.textContent = String(kills).padStart(2, '0');
    const nearest = enemies.filter((enemy) => enemy.alive).reduce((best, enemy) => Math.min(best, Math.hypot(enemy.x - player.x, enemy.y - player.y)), Infinity);
    threatValue.textContent = nearest < 3.2 ? 'HIGH' : nearest < 6 ? 'MED' : 'LOW';
    threatValue.classList.toggle('high', nearest < 3.2);
    healthValue.textContent = String(Math.ceil(player.hp)).padStart(3, '0');
    healthBarFill.style.width = `${player.hp}%`;
    healthBarFill.classList.toggle('critical', player.hp < 30);
    ammoValue.innerHTML = `${String(player.ammo).padStart(2, '0')} <small>/ ${String(player.reserve).padStart(3, '0')}</small>`;
    ammoPips.innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="${i < Math.ceil(player.ammo / 3) ? 'filled' : ''}"></i>`).join('');
    objectiveProgress.style.width = `${(1 - alive / enemies.length) * 100}%`;
    objectiveTitle.textContent = wave >= 3 && alive === 0 ? '撤离区域' : '清除敌方小队';
    objectiveCopy.textContent = wave >= 3 && alive === 0 ? '检查点已安全，准备前往撤离点。' : '肃清所有敌方单位，保持撤离路线畅通。';
    damageVignette.classList.toggle('active', player.damageFlash > 0);
    crosshairLabel.classList.toggle('visible', nearest < 4.5);
    missionState.textContent = ended ? (player.hp <= 0 ? 'SIGNAL LOST' : 'SECTOR SECURED') : `${started ? 'ACTIVE' : deployed ? 'PAUSED' : 'READY'} · WAVE 0${wave}`;
  }
  function frame(time: number) { const dt = Math.min(0.05, (time - lastTime) / 1000); lastTime = time; update(dt); drawScene(); updateHud(); requestAnimationFrame(frame); }
  function beginCombat() {
    if (ended || document.hidden) { releaseMouse(); return; }
    started = true;
    deployed = true;
    keys.clear();
    startPrompt.classList.add('hidden');
    dragStart.hidden = true;
    updateHud();
  }
  function pauseCombat() {
    started = false;
    dragging = false;
    keys.clear();
    if (ended) return;
    startPrompt.classList.remove('hidden');
    promptTitle.textContent = deployed ? '已暂停 · 点击继续' : '点击进入战术视角';
    promptCopy.textContent = controlMode === 'drag' ? 'WASD 移动 · 按住右键拖动瞄准 · 左键开火' : 'WASD 移动 · 鼠标瞄准 · 左键开火';
    updateHud();
  }
  function handleLockFailure() {
    if (!lockPending) return;
    lockPending = false;
    pauseCombat();
    promptTitle.textContent = '鼠标锁定不可用';
    promptCopy.textContent = '可以点击下方按钮，按住右键拖动瞄准';
    dragStart.hidden = false;
  }
  canvas.addEventListener('click', () => {
    if (ended) return;
    if (started) { shoot(); return; }
    if (controlMode === 'drag') { beginCombat(); return; }
    if (lockPending) return;
    lockPending = true;
    try {
      if (!canvas.requestPointerLock) { handleLockFailure(); return; }
      void Promise.resolve(canvas.requestPointerLock()).catch(handleLockFailure);
    } catch { handleLockFailure(); }
  });
  dragStart.addEventListener('click', () => {
    controlMode = 'drag';
    lockPending = false;
    beginCombat();
  });
  document.addEventListener('pointerlockerror', handleLockFailure);
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      lockPending = false;
      controlMode = 'locked';
      beginCombat();
    } else if (controlMode === 'locked') {
      lockPending = false;
      pauseCombat();
    }
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 2 && started && controlMode === 'drag') { dragging = true; event.preventDefault(); }
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  document.addEventListener('mousemove', (event) => {
    if (started && !ended && (document.pointerLockElement === canvas || dragging)) player.angle = (player.angle + event.movementX * 0.0024 + TAU) % TAU;
  });
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key === 'escape') { lockPending = false; pauseCombat(); releaseMouse(); return; }
    if (!started || ended) return;
    if (['w', 'a', 's', 'd', 'shift', ' ', 'r'].includes(key)) event.preventDefault();
    keys.add(key);
    if (key === 'r') reload();
    if (key === ' ') shoot();
  });
  window.addEventListener('blur', () => { lockPending = false; pauseCombat(); releaseMouse(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { lockPending = false; pauseCombat(); releaseMouse(); }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  root.querySelector<HTMLButtonElement>('#restart-button')!.addEventListener('click', reset);
  soundToggle.addEventListener('click', () => { soundOn = !soundOn; soundToggle.textContent = soundOn ? '◉' : '○'; soundToggle.classList.toggle('muted', !soundOn); });
  window.addEventListener('resize', requestResize);
  reset();
  requestAnimationFrame(frame);
}
