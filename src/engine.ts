/** Traditional Xiangqi moves on two or three connected nine-file home halves. */
export type Country = 'wei' | 'shu' | 'wu';
export type Mode = 'three' | 'classic';
export type PieceType = 'general' | 'advisor' | 'elephant' | 'horse' | 'rook' | 'cannon' | 'pawn';
export interface Position { camp: Country; row: number; col: number }
export interface Piece {
  id: string;
  country: Country;
  type: PieceType;
  position: Position;
  crossed?: boolean;
  invasion?: Country;
}
export interface MoveRecord {
  country: Country;
  piece: string;
  from: Position;
  to: Position;
  captured?: string;
  notation: string;
  eliminated?: Country[];
}
export interface GameState {
  mode: Mode;
  pieces: Piece[];
  turn: Country;
  eliminated: Country[];
  history: MoveRecord[];
  winner: Country | null;
  ply: number;
}

export const COUNTRIES: Country[] = ['wei', 'shu', 'wu'];
export const COUNTRY_NAMES: Record<Country, string> = { wei: '魏', shu: '蜀', wu: '吴' };
export const PIECE_NAMES: Record<PieceType, string> = {
  general: '将', advisor: '士', elephant: '象', horse: '马', rook: '车', cannon: '炮', pawn: '兵',
};

export function positionKey(position: Position): string {
  return `${position.camp}:${position.row}:${position.col}`;
}

function countriesFor(mode: Mode): Country[] {
  return mode === 'classic' ? ['wei', 'shu'] : COUNTRIES;
}

function validPosition(mode: Mode, position: Position): boolean {
  return countriesFor(mode).includes(position.camp)
    && Number.isInteger(position.row) && position.row >= 0 && position.row <= 4
    && Number.isInteger(position.col) && position.col >= 0 && position.col <= 8;
}

export function getPieceAt(state: GameState, position: Position): Piece | undefined {
  return state.pieces.find(piece => positionKey(piece.position) === positionKey(position));
}

/** A crossing reverses both axes, as it does between the two original halves. */
function step(mode: Mode, position: Position, dr: number, dc: number): { position: Position; flipped: boolean }[] {
  const row = position.row + dr;
  const col = position.col + dc;
  if (col < 0 || col > 8 || row < 0) return [];
  if (row <= 4) return [{ position: { ...position, row, col }, flipped: false }];
  if (row !== 5) return [];
  let targets: Country[];
  if (mode === 'classic') {
    targets = [position.camp === 'wei' ? 'shu' : 'wei'];
  } else {
    const index = COUNTRIES.indexOf(position.camp);
    const next = COUNTRIES[(index + 1) % 3]!;
    const previous = COUNTRIES[(index + 2) % 3]!;
    targets = col < 4 ? [next] : col > 4 ? [previous] : [next, previous];
  }
  return targets.map(camp => ({ position: { camp, row: 4, col: 8 - col }, flipped: true }));
}

function inPalace(piece: Piece, position: Position): boolean {
  return position.camp === piece.country && position.row <= 2 && position.col >= 3 && position.col <= 5;
}

function canLand(state: GameState, piece: Piece, position: Position): boolean {
  return getPieceAt(state, position)?.country !== piece.country;
}

/** A branch shares the same blockers/screens until it crosses the central file. */
function rayMoves(state: GameState, piece: Piece, dr: number, dc: number, cannon: boolean): Position[] {
  const result: Position[] = [];
  const pending = [{ position: piece.position, dr, dc, screened: false }];
  while (pending.length) {
    const cursor = pending.pop()!;
    for (const next of step(state.mode, cursor.position, cursor.dr, cursor.dc)) {
      const occupant = getPieceAt(state, next.position);
      const direction = next.flipped ? { dr: -cursor.dr, dc: -cursor.dc } : cursor;
      if (!cannon) {
        if (!occupant || occupant.country !== piece.country) result.push(next.position);
        if (!occupant) pending.push({ position: next.position, dr: direction.dr, dc: direction.dc, screened: false });
      } else if (!cursor.screened) {
        if (!occupant) result.push(next.position);
        pending.push({ position: next.position, dr: direction.dr, dc: direction.dc, screened: !!occupant });
      } else if (occupant) {
        if (occupant.country !== piece.country) result.push(next.position);
      } else {
        pending.push({ position: next.position, dr: direction.dr, dc: direction.dc, screened: true });
      }
    }
  }
  return result;
}

function pseudoMoves(state: GameState, piece: Piece): Position[] {
  const result: Position[] = [];
  const add = (position: Position) => {
    if (validPosition(state.mode, position) && canLand(state, piece, position)) result.push(position);
  };
  const { row, col, camp } = piece.position;
  switch (piece.type) {
    case 'general':
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const position = { camp, row: row + dr!, col: col + dc! };
        if (inPalace(piece, position)) add(position);
      }
      break;
    case 'advisor':
      for (const dr of [-1, 1]) for (const dc of [-1, 1]) {
        const position = { camp, row: row + dr, col: col + dc };
        if (inPalace(piece, position)) add(position);
      }
      break;
    case 'elephant':
      for (const dr of [-1, 1]) for (const dc of [-1, 1]) {
        const eye = { camp, row: row + dr, col: col + dc };
        const position = { camp, row: row + 2 * dr, col: col + 2 * dc };
        if (camp === piece.country && !getPieceAt(state, eye)) add(position);
      }
      break;
    case 'horse':
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (const leg of step(state.mode, piece.position, dr!, dc!)) {
          if (getPieceAt(state, leg.position)) continue;
          const sign = leg.flipped ? -1 : 1;
          for (const side of [-1, 1]) {
            const landingDr = (dr! || side) * sign;
            const landingDc = (dc! || side) * sign;
            for (const landing of step(state.mode, leg.position, landingDr, landingDc)) add(landing.position);
          }
        }
      }
      break;
    case 'rook':
    case 'cannon':
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        result.push(...rayMoves(state, piece, dr!, dc!, piece.type === 'cannon'));
      }
      break;
    case 'pawn': {
      const crossed = piece.crossed || camp !== piece.country;
      const forward = crossed ? -1 : 1;
      for (const next of step(state.mode, piece.position, forward, 0)) add(next.position);
      if (crossed) {
        add({ camp, row, col: col - 1 });
        add({ camp, row, col: col + 1 });
      }
      break;
    }
  }
  return [...new Map(result.map(position => [positionKey(position), position])).values()];
}

export function isInCheck(state: GameState, country: Country): boolean {
  if (state.eliminated.includes(country)) return false;
  const general = state.pieces.find(piece => piece.country === country && piece.type === 'general');
  if (!general) return false;
  const target = positionKey(general.position);
  for (const enemy of state.pieces) {
    if (enemy.country === country || state.eliminated.includes(enemy.country)) continue;
    if (pseudoMoves(state, enemy).some(position => positionKey(position) === target)) return true;
    // Generals see each other across an unobstructed file, including both central branches.
    if (enemy.type === 'general' && rayMoves(state, enemy, 1, 0, false)
      .some(position => positionKey(position) === target)) return true;
  }
  return false;
}

function movedState(state: GameState, piece: Piece, to: Position): GameState {
  const crossed = piece.type === 'pawn' && (piece.crossed || to.camp !== piece.country);
  const replacement: Piece = {
    ...piece,
    position: { ...to },
    ...(crossed ? { crossed: true, invasion: piece.invasion ?? to.camp } : {}),
  };
  const destination = positionKey(to);
  return {
    ...state,
    pieces: state.pieces.filter(other => other.id === piece.id || positionKey(other.position) !== destination)
      .map(other => other.id === piece.id ? replacement : other),
  };
}

export function legalMoves(state: GameState, pieceId: string): Position[] {
  if (state.winner) return [];
  const piece = state.pieces.find(candidate => candidate.id === pieceId);
  if (!piece || state.eliminated.includes(piece.country)) return [];
  return pseudoMoves(state, piece).filter(to => {
    if (getPieceAt(state, to)?.type === 'general') return false;
    return !isInCheck(movedState(state, piece, to), piece.country);
  });
}

function hasLegalMove(state: GameState, country: Country): boolean {
  return state.pieces.some(piece => piece.country === country && legalMoves(state, piece.id).length > 0);
}

function nextCountry(state: GameState, after: Country): Country {
  const countries = countriesFor(state.mode);
  const index = countries.indexOf(after);
  for (let offset = 1; offset <= countries.length; offset++) {
    const country = countries[(index + offset) % countries.length]!;
    if (!state.eliminated.includes(country)) return country;
  }
  return after;
}

function squareName(position: Position): string {
  return `${COUNTRY_NAMES[position.camp]}营${position.col + 1}路${position.row + 1}线`;
}

export function applyMove(state: GameState, pieceId: string, to: Position): { state: GameState; error?: string } {
  if (state.winner) return { state, error: '本局已结束，请重新开局。' };
  const piece = state.pieces.find(candidate => candidate.id === pieceId);
  if (!piece) return { state, error: '没有找到这枚棋子。' };
  if (piece.country !== state.turn) return { state, error: `现在轮到${COUNTRY_NAMES[state.turn]}国行棋。` };
  if (!validPosition(state.mode, to) || !legalMoves(state, pieceId).some(position => positionKey(position) === positionKey(to))) {
    return { state, error: '这一步不符合走法，或会让己方将帅被将军。' };
  }
  const captured = getPieceAt(state, to);
  const record: MoveRecord = {
    country: piece.country,
    piece: PIECE_NAMES[piece.type],
    from: { ...piece.position },
    to: { ...to },
    ...(captured ? { captured: PIECE_NAMES[captured.type] } : {}),
    notation: `${COUNTRY_NAMES[piece.country]} · ${PIECE_NAMES[piece.type]} ${squareName(piece.position)} → ${squareName(to)}${captured ? `，吃${COUNTRY_NAMES[captured.country]}${PIECE_NAMES[captured.type]}` : ''}`,
  };
  let next: GameState = {
    ...movedState(state, piece, to),
    eliminated: [...state.eliminated],
    history: [...state.history],
    ply: state.ply + 1,
    turn: nextCountry(state, state.turn),
  };
  const newlyEliminated: Country[] = [];
  while (countriesFor(next.mode).filter(country => !next.eliminated.includes(country)).length > 1) {
    if (hasLegalMove(next, next.turn)) break;
    const defeated = next.turn;
    newlyEliminated.push(defeated);
    next = {
      ...next,
      pieces: next.pieces.filter(candidate => candidate.country !== defeated),
      eliminated: [...next.eliminated, defeated],
    };
    next.turn = nextCountry(next, defeated);
  }
  const survivors = countriesFor(next.mode).filter(country => !next.eliminated.includes(country));
  if (survivors.length === 1) {
    next.winner = survivors[0]!;
    next.turn = survivors[0]!;
  }
  if (newlyEliminated.length) record.eliminated = newlyEliminated;
  next.history.push(record);
  return { state: next };
}

export function createGame(mode: Mode = 'three'): GameState {
  const pieces: Piece[] = [];
  const backRank: PieceType[] = ['rook', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'rook'];
  for (const country of countriesFor(mode)) {
    backRank.forEach((type, col) => pieces.push({ id: `${country}-${type}-${col}`, country, type, position: { camp: country, row: 0, col } }));
    for (const col of [1, 7]) pieces.push({ id: `${country}-cannon-${col}`, country, type: 'cannon', position: { camp: country, row: 2, col } });
    for (const col of [0, 2, 4, 6, 8]) pieces.push({ id: `${country}-pawn-${col}`, country, type: 'pawn', position: { camp: country, row: 3, col }, crossed: false });
  }
  return { mode, pieces, turn: 'wei', eliminated: [], history: [], winner: null, ply: 0 };
}
