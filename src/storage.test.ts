import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyMove } from './engine';
import { validGame } from './storage';

test('fresh games and real moved saves restore in both modes', () => {
  for (const mode of ['three', 'classic'] as const) {
    const game = createGame(mode);
    assert.equal(validGame(JSON.parse(JSON.stringify(game))), true);
    const result = applyMove(game, 'wei-pawn-0', { camp: 'wei', row: 4, col: 0 });
    assert.equal(result.error, undefined);
    assert.equal(validGame(JSON.parse(JSON.stringify(result.state))), true);
  }
});

test('damaged history, wrong-mode turns and missing generals cannot break restoration', () => {
  const game = createGame('classic');
  assert.equal(validGame({ ...game, history: [{}], ply: 1 }), false);
  assert.equal(validGame({ ...game, turn: 'wu' }), false);
  assert.equal(validGame({ ...game, pieces: game.pieces.filter(p => p.type !== 'general') }), false);
  assert.equal(validGame({ ...game, eliminated: ['wei'], turn: 'wei' }), false);
  assert.equal(validGame({ ...game, winner: 'wei' }), false);
  assert.equal(validGame({ ...game, pieces: [...game.pieces, game.pieces[0]] }), false);
  assert.equal(validGame({ ...game, history: [null], ply: 1 }), false);
});
