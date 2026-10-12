import './chess.css';
import { applyMove, COUNTRIES, COUNTRY_NAMES, createGame, getPieceAt, isInCheck, legalMoves, positionKey, type Country, type GameState, type Mode, type Piece, type Position } from './engine';
import { validGame } from './storage';
import { DEFAULT_PIECE_COLORS, ORIGINAL_PIECE_COLORS, pieceTextColor, resolvePieceColors, type PieceColors } from './colors';

const GAME_KEY = 'sanguoyi.game.v1';
const COLOR_KEY = 'sanguoyi.piece-colors.v1';
const COUNTRY_POEMS: Record<Country, string> = { wei: '北境雄风', shu: '汉室之志', wu: '江东烟雨' };
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const clone = (state: GameState): GameState => JSON.parse(JSON.stringify(state));
const read = (key: string): unknown => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };

export function mountChessGame(root: HTMLElement): void {
  const stored = read(GAME_KEY) as { version?: unknown; game?: unknown; snapshots?: unknown; hints?: unknown; sound?: unknown; colors?: unknown } | null;
  let game: GameState = stored?.version === 1 && validGame(stored.game) ? stored.game : createGame();
  let snapshots: GameState[] = Array.isArray(stored?.snapshots) ? stored.snapshots.filter(validGame).filter(item => item.mode === game.mode && item.ply < game.ply).slice(-100) : [];
  let colors = resolvePieceColors(read(COLOR_KEY) ?? stored?.colors);
  let hints = stored?.hints !== false;
  let sound = stored?.sound !== false;
  let selected: string | null = null;
  let rotation = 0;
  let notice = game.ply ? '已恢复上次棋局，继续落子吧。' : '魏国先行。点击己方棋子，再点击目标位置。';
  let pendingMode: Mode = game.mode;
  let audio: AudioContext | undefined;

  root.innerHTML = `<div class="chess-app">
    <header class="chess-header"><a class="chess-brand" href="#" aria-label="三国弈首页"><span class="chess-seal">弈</span><span><b>三国弈</b><small>一局山河 · 三分天下</small></span></a><div class="chess-header-actions"><span class="chess-local"><i></i>同屏对弈</span><button class="chess-text-button" data-action="rules">棋规说明 <span>↗</span></button></div></header>
    <main class="chess-main"><section class="chess-intro"><div><span class="chess-eyebrow">THE THREE KINGDOMS · XIANGQI</span><h1>落子之间，<em>三分天下。</em></h1><p>熟悉的中国象棋，魏、蜀、吴共赴一局。</p></div><div class="chess-mode" role="group" aria-label="对局模式"><button data-mode="three">三国对弈<small>三人 · 48 子</small></button><button data-mode="classic">经典象棋<small>双人 · 32 子</small></button></div></section>
    <div class="chess-layout"><section class="chess-board-card" aria-label="象棋对局"><div class="chess-board-heading"><div><span class="chess-eyebrow">山河为局</span><h2 id="chess-board-title">三国对弈</h2></div><div class="chess-board-tools"><button data-action="colors" title="调整棋子颜色" aria-label="棋子配色">◐</button><button data-action="rotate" title="旋转棋盘" aria-label="旋转棋盘视角">↻</button><button data-action="focus" title="专注模式" aria-label="专注模式">⛶</button></div></div><div id="chess-board" class="chess-board"></div><div class="chess-notice" role="status" aria-live="polite" id="chess-notice"></div><div class="chess-controls"><button class="chess-primary" data-action="new">新开一局 <span>↗</span></button><button data-action="undo">↶ 悔棋</button><button data-action="hints" aria-pressed="true">◉ 落点提示</button><button data-action="sound" aria-pressed="true">♪ 音效</button></div><div class="chess-board-note"><span>兵卒过河可横走，始终不能后退。</span><button data-action="colors">◐ 棋子配色</button></div></section>
    <aside class="chess-sidebar"><section class="chess-turn-card" id="chess-turn"></section><section class="chess-seats" id="chess-seats" aria-label="三国席位"></section>
    <details class="chess-colors" id="chess-colors"><summary><span>◐ 棋子配色</span><small>自定义三国颜色</small></summary><div class="chess-color-body"><p>颜色实时生效，文字自动适配黑白。每枚棋子还带有国名字样。</p>${COUNTRIES.map(country => `<label class="chess-color-row"><b>${COUNTRY_NAMES[country]}国</b><input type="color" data-color="${country}" aria-label="${COUNTRY_NAMES[country]}国棋子颜色" value="${colors[country]}"><input class="chess-hex" data-hex="${country}" aria-label="${COUNTRY_NAMES[country]}国六位十六进制色值" maxlength="7" spellcheck="false" value="${colors[country]}"></label>`).join('')}<div class="chess-presets"><button data-preset="vivid">鲜明配色</button><button data-preset="original">原有配色</button><button data-preset="contrast">高对比</button></div><button class="chess-reset-colors" data-preset="vivid">恢复默认颜色</button><small class="chess-save-note">配色独立保存，开新局和悔棋均可保留。</small></div></details>
    <section class="chess-history-card"><div class="chess-section-heading"><h3>落子记录</h3><button data-action="export">导出 ↗</button></div><div class="chess-history" id="chess-history" aria-live="polite"></div></section><div class="chess-sidebar-note"><span>闲来一局</span><p>车走直，马走日，炮打隔山。<br>三国各守九宫，共用一片河界。</p></div></aside></div>
    <footer class="chess-footer"><span>三国弈 <i>·</i> 保留传统之形，续写三国之局</span><span>本地自动存档 <i>·</i> 无需登录</span></footer></main>
    <dialog class="chess-dialog" id="chess-rules"><button class="chess-dialog-close" data-action="close-rules" aria-label="关闭棋规">×</button><span class="chess-eyebrow">对弈有道</span><h2>三国棋规</h2><p>默认魏 → 蜀 → 吴轮流行棋，每国保留传统 16 枚棋子、开局阵型与九宫。</p><ul><li><b>车、马、炮：</b>车走直线，马走日且不能蹩马腿，炮隔一枚棋子吃子。</li><li><b>将、士、象：</b>将和士只能在本国九宫内活动，象走田、不能塞象眼且不过河。</li><li><b>兵卒：</b>未过河只能前进一步；过河后可以前进或横走，永不后退。</li><li><b>将军：</b>不能让己方将帅被将军，不能将帅照面；将死或困毙在轮到该国时判负，移除该国棋子，最后一国获胜。</li></ul><h3>三人河界 · 扩展规则</h3><p>三个九路五行半场以 120° 排列。各国河岸第 1–4 路通向下一国，6–9 路通向上一国，第 5 路可择任一国；跨河后的路数镜像对应（1 对 9）。棋盘虚线标示河界通路。</p><p>兵卒跨河后朝所进入敌国底线前进，并可横走；不能退出或转入第三国。经典模式为原版 9 路 10 行双人棋盘。当前提供同屏对弈，不含联网、AI 或长将长捉裁决。</p><p class="chess-keyboard-note">键盘：Tab 选棋子，Enter / 空格确认，Tab 选合法落点，Esc 取消选择。</p><button class="chess-primary" data-action="close-rules">开始落子</button></dialog>
    <dialog class="chess-dialog chess-confirm" id="chess-confirm"><span class="chess-eyebrow">另起新局</span><h2>重新布阵？</h2><p>当前棋局将结束，棋子配色会保留。</p><div class="chess-dialog-actions"><button data-action="cancel-new">继续当前局</button><button class="chess-primary" data-action="confirm-new">开启新局</button></div></dialog>
  </div>`;
  const app = root.querySelector<HTMLElement>('.chess-app')!;
  const board = root.querySelector<HTMLElement>('#chess-board')!;
  const colorPanel = root.querySelector<HTMLDetailsElement>('#chess-colors')!;
  const rules = root.querySelector<HTMLDialogElement>('#chess-rules')!;
  const confirm = root.querySelector<HTMLDialogElement>('#chess-confirm')!;

  function save(): void {
    try { localStorage.setItem(GAME_KEY, JSON.stringify({ version: 1, game, snapshots, hints, sound, colors })); } catch { /* A blocked browser store does not prevent play. */ }
  }
  function saveColors(): void {
    try { localStorage.setItem(COLOR_KEY, JSON.stringify(colors)); } catch { /* Color selection remains available for this session. */ }
    save();
  }
  function point(position: Position): [number, number] {
    if (game.mode === 'classic') {
      const row = position.camp === 'wei' ? 9 - position.row : position.row;
      const col = position.camp === 'wei' ? position.col : 8 - position.col;
      const angle = rotation * Math.PI;
      const x = 72 + col * 54, y = 60 + row * 54;
      return angle ? [576 - x, 606 - y] : [x, y];
    }
    const angle = ((COUNTRIES.indexOf(position.camp) + rotation) * 120) * Math.PI / 180;
    const x = (position.col - 4) * 48, y = 340 - position.row * 48;
    return [450 + x * Math.cos(angle) - y * Math.sin(angle), 420 + x * Math.sin(angle) + y * Math.cos(angle)];
  }
  const line = (a: [number, number], b: [number, number], klass = '') => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="${klass}"/>`;
  function pieceName(piece: Piece): string {
    const names = piece.country === 'shu' ? { general: '帅', advisor: '仕', elephant: '相', horse: '马', rook: '车', cannon: '炮', pawn: '兵' } : { general: '将', advisor: '士', elephant: '象', horse: '马', rook: '车', cannon: '炮', pawn: '卒' };
    return names[piece.type];
  }
  function renderBoard(): void {
    const countries: Country[] = game.mode === 'classic' ? ['wei', 'shu'] : COUNTRIES;
    const moves = selected ? legalMoves(game, selected) : [];
    const allowed = new Set(moves.map(positionKey));
    const latest = game.history.at(-1);
    const radius = game.mode === 'classic' ? 23 : 21;
    let grid = '';
    let targets = '';
    let pieces = '';
    for (const country of countries) {
      for (let row = 0; row <= 4; row++) grid += line(point({ camp: country, row, col: 0 }), point({ camp: country, row, col: 8 }));
      for (let col = 0; col <= 8; col++) grid += line(point({ camp: country, row: 0, col }), point({ camp: country, row: 4, col }));
      grid += line(point({ camp: country, row: 0, col: 3 }), point({ camp: country, row: 2, col: 5 }), 'palace');
      grid += line(point({ camp: country, row: 0, col: 5 }), point({ camp: country, row: 2, col: 3 }), 'palace');
      for (let row = 0; row <= 4; row++) for (let col = 0; col <= 8; col++) {
        const position = { camp: country, row, col };
        const key = positionKey(position);
        const [x, y] = point(position);
        const occupant = getPieceAt(game, position);
        const legal = allowed.has(key);
        if (latest && (positionKey(latest.from) === key || positionKey(latest.to) === key)) targets += `<circle class="chess-last-move" cx="${x}" cy="${y}" r="${radius + 5}"/>`;
        if (!occupant) targets += `<g class="chess-square${legal ? ' is-legal' : ''}" role="button" tabindex="${legal ? '0' : '-1'}" data-position="${key}" aria-label="${COUNTRY_NAMES[country]}营${col + 1}路${row + 1}线${legal ? '，可落子' : ''}"><circle cx="${x}" cy="${y}" r="${radius}" fill="transparent"/>${legal && hints ? `<circle class="chess-legal-dot" cx="${x}" cy="${y}" r="7"/>` : ''}</g>`;
      }
      if (game.mode === 'three') {
        const labelPoint = point({ camp: country, row: -0.9, col: 4 });
        grid += `<line x1="${labelPoint[0] - 24}" y1="${labelPoint[1] + 20}" x2="${labelPoint[0] + 24}" y2="${labelPoint[1] + 20}" style="stroke:${colors[country]};stroke-width:4;filter:drop-shadow(0 1px 0 #81745a)"/><text class="chess-camp-label" x="${labelPoint[0]}" y="${labelPoint[1]}">${COUNTRY_NAMES[country]} 国</text>`;
        const next = COUNTRIES[(COUNTRIES.indexOf(country) + 1) % 3];
        for (let col = 0; col <= 4; col++) grid += line(point({ camp: country, row: 4, col }), point({ camp: next, row: 4, col: 8 - col }), 'chess-river-link');
      }
    }
    if (game.mode === 'classic') {
      grid += line(point({ camp: 'shu', row: 4, col: 0 }), point({ camp: 'wei', row: 4, col: 8 }));
      grid += line(point({ camp: 'shu', row: 4, col: 8 }), point({ camp: 'wei', row: 4, col: 0 }));
    }
    for (const piece of game.pieces) {
      const [x, y] = point(piece.position);
      const legal = allowed.has(positionKey(piece.position));
      const checked = piece.type === 'general' && isInCheck(game, piece.country);
      const active = selected === piece.id;
      pieces += `<g class="chess-piece${active ? ' is-selected' : ''}${legal ? ' is-capture' : ''}${checked ? ' is-check' : ''}" role="button" tabindex="0" data-piece="${escape(piece.id)}" data-position="${positionKey(piece.position)}" aria-label="${COUNTRY_NAMES[piece.country]}国${pieceName(piece)}，${piece.position.col + 1}路${piece.position.row + 1}线${active ? '，已选中' : ''}${legal ? '，可吃子' : ''}"><title>${COUNTRY_NAMES[piece.country]}国 · ${pieceName(piece)}</title><circle class="chess-piece-shadow" cx="${x}" cy="${y + 3}" r="${radius}"/><circle class="chess-piece-face" cx="${x}" cy="${y}" r="${radius}" fill="${colors[piece.country]}"/><circle class="chess-piece-rim" cx="${x}" cy="${y}" r="${radius - 3}" stroke="${pieceTextColor(colors[piece.country])}"/><text class="chess-piece-letter" x="${x}" y="${y - 1}" style="fill:${pieceTextColor(colors[piece.country])}">${pieceName(piece)}</text><text class="chess-piece-country" x="${x}" y="${y + 14}" style="fill:${pieceTextColor(colors[piece.country])}">${COUNTRY_NAMES[piece.country]}</text>${active || checked || legal && hints ? `<circle class="chess-piece-highlight" cx="${x}" cy="${y}" r="${radius + 5}"/>` : ''}</g>`;
    }
    const classic = game.mode === 'classic';
    board.innerHTML = `<svg class="chess-svg${classic ? ' is-classic' : ''}" viewBox="0 0 ${classic ? '576 606' : '900 850'}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="${classic ? '经典双人象棋' : '魏蜀吴三人象棋'}棋盘"><defs><pattern id="chess-paper" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="3" cy="5" r=".6" fill="#ab9068" opacity=".16"/><circle cx="18" cy="16" r=".5" fill="#ab9068" opacity=".13"/></pattern></defs><rect x="1" y="1" width="${classic ? 574 : 898}" height="${classic ? 604 : 848}" rx="12" class="chess-board-paper"/><rect width="100%" height="100%" fill="url(#chess-paper)"/><g class="chess-grid">${grid}</g>${classic ? '<g class="chess-river-words"><text x="180" y="310">楚 河</text><text x="396" y="310">汉 界</text></g>' : '<g class="chess-center-mark"><circle cx="450" cy="420" r="49"/><text x="450" y="417">三 国</text><text x="450" y="439" class="chess-center-small">河 界</text></g>'}<g>${targets}</g><g>${pieces}</g></svg>`;
  }
  function render(): void {
    for (const country of COUNTRIES) app.style.setProperty(`--${country}`, colors[country]);
    root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => { const active = button.dataset.mode === game.mode; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
    root.querySelector('#chess-board-title')!.textContent = game.mode === 'three' ? '三国对弈' : '经典象棋';
    const inCheck = isInCheck(game, game.turn);
    root.querySelector('#chess-turn')!.innerHTML = `<span class="chess-eyebrow">${game.winner ? '本局终章' : '此刻 · 轮到'}</span><div class="chess-turn-name"><span style="background:${colors[game.turn]};color:${pieceTextColor(colors[game.turn])}">${COUNTRY_NAMES[game.turn]}</span><h2>${COUNTRY_NAMES[game.turn]}国${game.winner ? '获胜' : '行棋'}</h2></div><p>${game.winner ? '山河既定，另起一局再会。' : inCheck ? '将军！请先化解己方将帅的威胁。' : '谋定而后动，落子无悔。'}</p><div class="chess-turn-meta"><span>第 <b>${game.ply + (game.winner ? 0 : 1)}</b> 着</span><span>${game.mode === 'three' ? '魏 → 蜀 → 吴' : '魏 → 蜀'}</span></div>`;
    root.querySelector('#chess-seats')!.innerHTML = (game.mode === 'classic' ? ['wei', 'shu'] as Country[] : COUNTRIES).map(country => `<div class="chess-seat${game.turn === country ? ' is-current' : ''}${game.eliminated.includes(country) ? ' is-out' : ''}" style="--seat-color:${colors[country]}"><span class="chess-seat-seal" style="background:${colors[country]};color:${pieceTextColor(colors[country])}">${COUNTRY_NAMES[country]}</span><div><b>${COUNTRY_NAMES[country]}国</b><small>${COUNTRY_POEMS[country]}</small></div><span class="chess-seat-count">${game.eliminated.includes(country) ? '已出局' : `${game.pieces.filter(piece => piece.country === country).length} 子`}<small>${game.turn === country ? game.winner ? '胜者' : '行棋中' : '待落子'}</small></span></div>`).join('');
    root.querySelector('#chess-notice')!.textContent = notice;
    const history = root.querySelector<HTMLElement>('#chess-history')!;
    history.innerHTML = game.history.length ? game.history.map((move, index) => `<div class="chess-history-row"><span>${String(index + 1).padStart(2, '0')}</span><b style="background:${colors[move.country]};color:${pieceTextColor(colors[move.country])}">${COUNTRY_NAMES[move.country]}</b><p title="${escape(move.notation)}">${escape(move.notation.replace(/^. · /, '').replace(/营/g, '').replace(/线/g, ''))}</p>${move.captured ? '<i>吃</i>' : ''}</div>`).join('') : '<div class="chess-history-empty"><span>弈</span><p>棋局初开，静候第一着。</p><small>每一步，都记在这里。</small></div>';
    history.scrollTop = history.scrollHeight;
    root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled = snapshots.length === 0;
    for (const [action, enabled, label] of [['hints', hints, '◉ 落点提示'], ['sound', sound, '♪ 音效']] as const) { const button = root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!; button.setAttribute('aria-pressed', String(enabled)); button.classList.toggle('is-enabled', enabled); button.textContent = `${label}${enabled ? ' · 开' : ' · 关'}`; }
    renderBoard();
  }
  function updateColorControls(except?: HTMLInputElement): void {
    root.querySelectorAll<HTMLInputElement>('[data-color], [data-hex]').forEach(input => { if (input !== except) { input.value = colors[(input.dataset.color || input.dataset.hex) as Country]; input.removeAttribute('aria-invalid'); } });
  }
  function playSound(): void {
    if (!sound) return;
    try { audio ??= new AudioContext(); void audio.resume(); const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.connect(gain); gain.connect(audio.destination); oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(420, audio.currentTime); oscillator.frequency.exponentialRampToValueAtTime(170, audio.currentTime + .08); gain.gain.setValueAtTime(.12, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .12); oscillator.start(); oscillator.stop(audio.currentTime + .13); } catch { /* Sound is optional. */ }
  }
  function choose(position: Position): void {
    const piece = getPieceAt(game, position);
    if (selected && piece?.country !== game.turn) {
      const result = applyMove(game, selected, position);
      if (result.error) { notice = result.error; render(); return; }
      snapshots = [...snapshots, clone(game)].slice(-100); game = result.state; selected = null;
      notice = game.winner ? `${COUNTRY_NAMES[game.winner]}国获胜！` : `${game.history.at(-1)!.notation}。轮到${COUNTRY_NAMES[game.turn]}国。`;
      playSound(); save(); render(); return;
    }
    if (piece?.country === game.turn && !game.winner) {
      selected = selected === piece.id ? null : piece.id;
      notice = selected ? `已选${COUNTRY_NAMES[piece.country]}国${pieceName(piece)}，请选择${hints ? '标记的' : '合法'}落点。` : '已取消选择。';
    } else notice = game.winner ? '本局已结束，请新开一局。' : `现在轮到${COUNTRY_NAMES[game.turn]}国，请选择己方棋子。`;
    render();
    if (selected) [...board.querySelectorAll<SVGGElement>('[data-piece]')].find(node => node.dataset.piece === selected)?.focus();
  }
  function newGame(mode: Mode): void {
    game = createGame(mode); snapshots = []; selected = null; rotation = 0;
    notice = '新局已开。魏国先行，点击己方棋子开始。'; save(); render(); confirm.close();
  }
  function requestNew(mode: Mode): void { pendingMode = mode; if (game.ply > 0) confirm.showModal(); else newGame(mode); }
  root.addEventListener('click', event => {
    const target = (event.target as Element).closest<HTMLElement>('[data-action], [data-mode], [data-preset], [data-position]');
    if (!target) return;
    if (target.dataset.position) { const [camp, row, col] = target.dataset.position.split(':'); choose({ camp: camp as Country, row: Number(row), col: Number(col) }); return; }
    if (target.dataset.mode) { if (target.dataset.mode !== game.mode) requestNew(target.dataset.mode as Mode); return; }
    if (target.dataset.preset) { colors = { ...(target.dataset.preset === 'original' ? ORIGINAL_PIECE_COLORS : target.dataset.preset === 'contrast' ? { wei: '#172554', shu: '#B91C1C', wu: '#EAB308' } : DEFAULT_PIECE_COLORS) }; updateColorControls(); saveColors(); render(); return; }
    switch (target.dataset.action) {
      case 'new': requestNew(game.mode); break;
      case 'confirm-new': newGame(pendingMode); break;
      case 'cancel-new': confirm.close(); break;
      case 'rules': rules.showModal(); break;
      case 'close-rules': rules.close(); break;
      case 'colors': colorPanel.open = true; colorPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); break;
      case 'undo': { const previous = snapshots.pop(); if (previous) { game = previous; selected = null; notice = `已退回上一着，轮到${COUNTRY_NAMES[game.turn]}国。`; save(); render(); } break; }
      case 'hints': hints = !hints; save(); render(); break;
      case 'sound': sound = !sound; save(); render(); break;
      case 'rotate': rotation = (rotation + 1) % (game.mode === 'three' ? 3 : 2); renderBoard(); break;
      case 'focus': app.classList.toggle('is-focused'); break;
      case 'export': { const contents = `三国弈 · ${game.mode === 'three' ? '魏蜀吴三人对弈' : '双人经典象棋'}\n${new Date().toLocaleString('zh-CN')}\n\n${game.history.map((move, index) => `${index + 1}. ${move.notation}`).join('\n') || '尚未落子'}\n`; const url = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `三国弈-${new Date().toISOString().slice(0, 10)}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); break; }
    }
  });
  root.addEventListener('input', event => {
    const input = event.target as HTMLInputElement;
    const country = (input.dataset.color || input.dataset.hex) as Country | undefined;
    if (!country) return;
    const value = input.value.startsWith('#') ? input.value : `#${input.value}`;
    if (!/^#[0-9a-f]{6}$/i.test(value)) { input.setAttribute('aria-invalid', 'true'); return; }
    input.removeAttribute('aria-invalid'); colors[country] = value.toUpperCase(); updateColorControls(input); saveColors(); render();
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { selected = null; app.classList.remove('is-focused'); notice = '已取消选择。'; render(); }
    if ((event.key === 'Enter' || event.key === ' ') && (event.target as Element).closest('.chess-piece, .chess-square')) {
      event.preventDefault();
      (event.target as Element).closest<SVGGElement>('.chess-piece, .chess-square')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      if (selected) board.querySelector<SVGGElement>('.chess-square.is-legal, .chess-piece.is-capture')?.focus();
    }
  });
  render();
}
