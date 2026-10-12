import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, COUNTRIES, createGame, getPieceAt, isInCheck, legalMoves, positionKey, type Country, type GameState, type Mode, type Piece, type PieceType, type Position } from './engine';

const at = (camp: Country, row: number, col: number): Position => ({ camp, row, col });
const piece = (id: string, country: Country, type: PieceType, position: Position): Piece => ({ id, country, type, position });
function position(mode: Mode, extras: Piece[], turn: Country = 'wei'): GameState {
  const generals = (mode === 'classic' ? ['wei', 'shu'] : COUNTRIES).map(country =>
    piece(`${country}-king`, country as Country, 'general', at(country as Country, 0, 3)));
  const overrideIds = new Set(extras.map(candidate => candidate.id));
  return { mode, pieces: [...generals.filter(general => !overrideIds.has(general.id)), ...extras], turn, eliminated: [], history: [], winner: null, ply: 0 };
}
function moves(state: GameState, id: string): string[] {
  return legalMoves(state, id).map(positionKey).sort();
}
const key = (camp: Country, row: number, col: number) => positionKey(at(camp, row, col));

test('opening preserves all 16 original pieces and formation for each country', () => {
  const state = createGame('three');
  assert.equal(state.pieces.length, 48);
  for (const country of COUNTRIES) {
    assert.equal(state.pieces.filter(candidate => candidate.country === country).length, 16);
    assert.equal(getPieceAt(state, at(country, 0, 4))?.type, 'general');
    assert.equal(getPieceAt(state, at(country, 2, 1))?.type, 'cannon');
    for (const col of [0, 2, 4, 6, 8]) {
      assert.equal(getPieceAt(state, at(country, 3, col))?.type, 'pawn');
      assert.deepEqual(moves(state, `${country}-pawn-${col}`), [key(country, 4, col)]);
    }
    assert.equal(isInCheck(state, country), false);
  }
  assert.equal(createGame('classic').pieces.length, 32);
});

test('original pawn cannot move sideways before the river and crosses opposing halves in classic mode', () => {
  const state = position('classic', [piece('pawn', 'wei', 'pawn', at('wei', 4, 2))]);
  assert.deepEqual(moves(state, 'pawn'), [key('shu', 4, 6)]);
  const result = applyMove(state, 'pawn', at('shu', 4, 6));
  assert.equal(result.error, undefined);
  const crossed = result.state.pieces.find(candidate => candidate.id === 'pawn')!;
  assert.equal(crossed.crossed, true);
  assert.equal(crossed.invasion, 'shu');
  assert.deepEqual(moves(result.state, 'pawn'), [key('shu', 3, 6), key('shu', 4, 5), key('shu', 4, 7)]);
  assert.ok(!moves(result.state, 'pawn').includes(key('wei', 4, 2)));
});

test('three-country river has reciprocal left and right entries and a choice at the middle file', () => {
  for (const country of COUNTRIES) {
    const index = COUNTRIES.indexOf(country);
    const next = COUNTRIES[(index + 1) % 3]!;
    const previous = COUNTRIES[(index + 2) % 3]!;
    const left = position('three', [piece('p', country, 'pawn', at(country, 4, 2))], country);
    assert.deepEqual(moves(left, 'p'), [key(next, 4, 6)]);
    const right = position('three', [piece('p', country, 'pawn', at(country, 4, 6))], country);
    assert.deepEqual(moves(right, 'p'), [key(previous, 4, 2)]);
    const middle = position('three', [piece('p', country, 'pawn', at(country, 4, 4))], country);
    assert.deepEqual(moves(middle, 'p'), [key(next, 4, 4), key(previous, 4, 4)].sort());
    const reciprocal = position('three', [piece('r', next, 'rook', at(next, 4, 6))], next);
    assert.ok(moves(reciprocal, 'r').includes(key(country, 4, 2)));
  }
});

test('rook rays remain straight after the river and branch only at the central file', () => {
  const state = position('three', [piece('rook', 'wei', 'rook', at('wei', 3, 2))]);
  const legal = moves(state, 'rook');
  assert.ok(legal.includes(key('shu', 4, 6)));
  assert.ok(legal.includes(key('shu', 0, 6)));
  assert.ok(!legal.some(candidate => candidate.startsWith('wu:')));
  const central = position('three', [piece('rook', 'wei', 'rook', at('wei', 3, 4))]);
  assert.ok(moves(central, 'rook').includes(key('shu', 0, 4)));
  assert.ok(moves(central, 'rook').includes(key('wu', 0, 4)));
});

test('rook cannot pass an occupied intersection and cannot capture a friendly piece', () => {
  const state = position('classic', [
    piece('rook', 'wei', 'rook', at('wei', 1, 0)),
    piece('friend', 'wei', 'pawn', at('wei', 3, 0)),
    piece('enemy', 'shu', 'horse', at('wei', 1, 3)),
  ]);
  const legal = moves(state, 'rook');
  assert.ok(legal.includes(key('wei', 2, 0)));
  assert.ok(!legal.includes(key('wei', 3, 0)));
  assert.ok(!legal.includes(key('wei', 4, 0)));
  assert.ok(legal.includes(key('wei', 1, 3)));
  assert.ok(!legal.includes(key('wei', 1, 4)));
});

test('cannon needs exactly one screen to capture, including across a river branch', () => {
  const state = position('three', [
    piece('cannon', 'wei', 'cannon', at('wei', 2, 4)),
    piece('screen', 'wei', 'pawn', at('wei', 4, 4)),
    piece('target', 'shu', 'horse', at('shu', 2, 4)),
    piece('behind', 'shu', 'rook', at('shu', 1, 4)),
  ]);
  const legal = moves(state, 'cannon');
  assert.ok(legal.includes(key('wei', 3, 4)));
  assert.ok(!legal.includes(key('wei', 4, 4)));
  assert.ok(!legal.includes(key('shu', 4, 4)));
  assert.ok(legal.includes(key('shu', 2, 4)));
  assert.ok(!legal.includes(key('shu', 1, 4)));
  const noScreen = { ...state, pieces: state.pieces.filter(candidate => candidate.id !== 'screen') };
  assert.ok(!moves(noScreen, 'cannon').includes(key('shu', 2, 4)));
  const secondScreen = { ...state, pieces: [...state.pieces, piece('screen2', 'wu', 'pawn', at('shu', 3, 4))] };
  assert.ok(!moves(secondScreen, 'cannon').includes(key('shu', 2, 4)));
  assert.ok(moves(secondScreen, 'cannon').includes(key('shu', 3, 4)));
});

test('horse follows the original eight moves and a blocked leg removes its two moves', () => {
  const state = position('classic', [
    piece('wei-king', 'wei', 'general', at('wei', 0, 4)),
    piece('horse', 'wei', 'horse', at('wei', 2, 4)),
  ]);
  assert.deepEqual(moves(state, 'horse'), [
    key('wei', 0, 3), key('wei', 0, 5), key('wei', 1, 2), key('wei', 1, 6),
    key('wei', 3, 2), key('wei', 3, 6), key('wei', 4, 3), key('wei', 4, 5),
  ].sort());
  const blocked = { ...state, pieces: [...state.pieces, piece('block', 'shu', 'pawn', at('wei', 3, 4))] };
  assert.equal(moves(blocked, 'horse').length, 6);
  assert.ok(!moves(blocked, 'horse').includes(key('wei', 4, 3)));
  assert.ok(!moves(blocked, 'horse').includes(key('wei', 4, 5)));
});

test('horse crossing the original river mirrors coordinates and still checks its leg', () => {
  const state = position('classic', [piece('horse', 'wei', 'horse', at('wei', 4, 4))]);
  const legal = moves(state, 'horse');
  for (const destination of [at('shu', 3, 3), at('shu', 3, 5), at('shu', 4, 2), at('shu', 4, 6)]) {
    assert.ok(legal.includes(positionKey(destination)));
  }
  const blocked = { ...state, pieces: [...state.pieces, piece('block', 'shu', 'pawn', at('shu', 4, 4))] };
  assert.ok(!moves(blocked, 'horse').includes(key('shu', 3, 3)));
  assert.ok(!moves(blocked, 'horse').includes(key('shu', 3, 5)));
});

test('elephant cannot cross the river and its eye must be empty', () => {
  const state = position('classic', [piece('elephant', 'wei', 'elephant', at('wei', 2, 4))]);
  assert.deepEqual(moves(state, 'elephant'), [key('wei', 0, 2), key('wei', 0, 6), key('wei', 4, 2), key('wei', 4, 6)]);
  const blocked = { ...state, pieces: [...state.pieces, piece('block', 'shu', 'pawn', at('wei', 3, 5))] };
  assert.ok(!moves(blocked, 'elephant').includes(key('wei', 4, 6)));
  const bank = position('classic', [piece('elephant', 'wei', 'elephant', at('wei', 4, 2))]);
  assert.ok(!moves(bank, 'elephant').some(candidate => candidate.startsWith('shu:')));
});

test('advisors and generals are confined to their original nine-point palaces', () => {
  const state = position('classic', [piece('advisor', 'wei', 'advisor', at('wei', 2, 3))]);
  assert.deepEqual(moves(state, 'advisor'), [key('wei', 1, 4)]);
  assert.deepEqual(moves(state, 'wei-king'), [key('wei', 0, 4), key('wei', 1, 3)]);
  const upper = position('classic', [piece('wei-king', 'wei', 'general', at('wei', 2, 5))]);
  assert.ok(!moves(upper, 'wei-king').includes(key('wei', 3, 5)));
});

test('facing generals are checked through both central river branches', () => {
  const state = position('three', COUNTRIES.map(country => piece(`${country}-king`, country, 'general', at(country, 0, 4))));
  for (const country of COUNTRIES) assert.equal(isInCheck(state, country), true);
  const shielded = { ...state, pieces: [...state.pieces, piece('screen', 'wei', 'pawn', at('wei', 3, 4))] };
  assert.equal(isInCheck(shielded, 'wei'), false);
  assert.equal(isInCheck(shielded, 'shu'), true);
});

test('a pinned blocker cannot expose its general, but may capture the attacking rook', () => {
  const state = position('classic', [
    piece('wei-king', 'wei', 'general', at('wei', 0, 4)),
    piece('guard', 'wei', 'rook', at('wei', 1, 4)),
    piece('attack', 'shu', 'rook', at('wei', 4, 4)),
  ]);
  assert.equal(isInCheck(state, 'wei'), false);
  const legal = moves(state, 'guard');
  assert.ok(!legal.includes(key('wei', 1, 3)));
  assert.ok(legal.includes(key('wei', 4, 4)));
  assert.equal(applyMove(state, 'guard', at('wei', 1, 3)).state, state);
});

test('check can be answered by blocking, and a general may never be captured directly', () => {
  const state = position('classic', [
    piece('wei-king', 'wei', 'general', at('wei', 0, 4)),
    piece('guard', 'wei', 'rook', at('wei', 1, 1)),
    piece('attack', 'shu', 'rook', at('wei', 4, 4)),
  ]);
  assert.equal(isInCheck(state, 'wei'), true);
  assert.deepEqual(moves(state, 'guard'), [key('wei', 1, 4)]);
  assert.ok(!moves(state, 'attack').includes(key('wei', 0, 4)));
});

test('applyMove rejects wrong turns and is immutable for both valid moves and captures', () => {
  const state = position('three', [
    piece('rook', 'wei', 'rook', at('wei', 1, 0)),
    piece('target', 'shu', 'pawn', at('wei', 1, 2)),
  ]);
  const before = JSON.stringify(state);
  assert.ok(applyMove(state, 'shu-king', at('shu', 1, 3)).error);
  const result = applyMove(state, 'rook', at('wei', 1, 2));
  assert.equal(result.error, undefined);
  assert.equal(JSON.stringify(state), before);
  assert.equal(result.state.turn, 'shu');
  assert.equal(result.state.ply, 1);
  assert.equal(result.state.history[0]?.captured, '兵');
  assert.equal(result.state.pieces.some(candidate => candidate.id === 'target'), false);
});

test('checkmate eliminates only the country whose turn comes next and removes its army', () => {
  const state = position('three', [
    piece('shu-king', 'shu', 'general', at('shu', 0, 4)),
    piece('mate1', 'wei', 'rook', at('shu', 1, 4)),
    piece('mate2', 'wei', 'rook', at('shu', 1, 3)),
    piece('mate3', 'wei', 'rook', at('shu', 1, 5)),
    piece('waiting', 'wei', 'pawn', at('wei', 3, 0)),
  ]);
  assert.equal(isInCheck(state, 'shu'), true);
  assert.deepEqual(moves(state, 'shu-king'), []);
  const result = applyMove(state, 'waiting', at('wei', 4, 0));
  assert.equal(result.error, undefined);
  assert.deepEqual(result.state.eliminated, ['shu']);
  assert.equal(result.state.turn, 'wu');
  assert.equal(result.state.winner, null);
  assert.equal(result.state.pieces.some(candidate => candidate.country === 'shu'), false);
  assert.deepEqual(result.state.history[0]?.eliminated, ['shu']);
  const resumed = applyMove(result.state, 'wu-king', at('wu', 1, 3));
  assert.equal(resumed.error, undefined);
  assert.equal(resumed.state.turn, 'wei');
});

test('stalemate loses under Xiangqi rules and leaves the final country victorious', () => {
  const state = position('classic', [
    piece('shu-king', 'shu', 'general', at('shu', 0, 4)),
    piece('wall', 'wei', 'rook', at('shu', 1, 0)),
    piece('left', 'wei', 'rook', at('shu', 2, 3)),
    piece('right', 'wei', 'rook', at('shu', 2, 5)),
    piece('waiting', 'wei', 'pawn', at('wei', 3, 0)),
  ]);
  assert.equal(isInCheck(state, 'shu'), false);
  assert.deepEqual(moves(state, 'shu-king'), []);
  const result = applyMove(state, 'waiting', at('wei', 4, 0));
  assert.deepEqual(result.state.eliminated, ['shu']);
  assert.equal(result.state.winner, 'wei');
  assert.ok(applyMove(result.state, 'waiting', at('shu', 4, 8)).error);
});
