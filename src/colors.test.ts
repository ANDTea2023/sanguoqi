import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PIECE_COLORS, ORIGINAL_PIECE_COLORS, validPieceColors, resolvePieceColors, pieceTextColor, type PieceColors } from './colors';

test('old saves without colors restore the complete default palette', () => {
  for (const missing of [undefined, null, {}]) {
    assert.deepEqual(resolvePieceColors(missing), DEFAULT_PIECE_COLORS);
  }
  const resolved = resolvePieceColors(undefined);
  resolved.wei = '#123456';
  assert.notEqual(resolved.wei, DEFAULT_PIECE_COLORS.wei);
});

test('valid full and partial palettes preserve custom countries and fill missing ones', () => {
  const custom: PieceColors = { wei: '#0011AA', shu: '#bb3300', wu: '#44CC66' };
  assert.equal(validPieceColors(custom), true);
  assert.equal(validPieceColors(ORIGINAL_PIECE_COLORS), true);
  assert.equal(validPieceColors({}), true);
  assert.equal(validPieceColors({ shu: '#FfA012' }), true);
  assert.deepEqual(resolvePieceColors(custom), custom);
  assert.deepEqual(resolvePieceColors({ shu: '#FfA012' }), { ...DEFAULT_PIECE_COLORS, shu: '#FfA012' });
});

test('invalid colors and style injection never enter a restored palette', () => {
  const unsafeColors = ['#FFF', '#11223344', '112233', '#GG0000', ' #112233', '#112233 ', 'red', 'var(--color)', 'rgb(0,0,0)', '#112233;fill:red', '\"><script>alert(1)</script>', '', 0, null, undefined];
  for (const color of unsafeColors) {
    const saved = { wei: '#112233', shu: color };
    assert.equal(validPieceColors(saved), false, `accepted unsafe value ${String(color)}`);
    assert.deepEqual(resolvePieceColors(saved), DEFAULT_PIECE_COLORS);
  }
  for (const saved of [{ han: '#112233' }, JSON.parse('{"__proto__":{"wei":"#112233"}}')]) {
    assert.equal(validPieceColors(saved), false);
    assert.deepEqual(resolvePieceColors(saved), DEFAULT_PIECE_COLORS);
  }
});

test('non-object saved color values and arrays fall back safely', () => {
  for (const saved of [null, undefined, true, false, 1, '#112233', [], ['#112233']]) {
    assert.equal(validPieceColors(saved), false);
    assert.deepEqual(resolvePieceColors(saved), DEFAULT_PIECE_COLORS);
  }
});

test('custom colors survive JSON storage including the Wu color in classic games', () => {
  const colors: PieceColors = { wei: '#112233', shu: '#AA2200', wu: '#00BB88' };
  for (const mode of ['three', 'classic']) {
    const saved = JSON.parse(JSON.stringify({ version: 1, game: { mode }, colors }));
    assert.equal(validPieceColors(saved.colors), true);
    assert.deepEqual(resolvePieceColors(saved.colors), colors);
  }
});

test('piece lettering stays readable on dark and bright faces', () => {
  for (const dark of ['#000000', '#0000FF', '#1D4ED8', '#BE123C', '#047857']) {
    assert.equal(pieceTextColor(dark), '#FFFFFF', `dark face ${dark}`);
  }
  for (const bright of ['#FFFFFF', '#FFFF00', '#00FF00', '#CCCCCC', '#888888']) {
    assert.equal(pieceTextColor(bright), '#000000', `bright face ${bright}`);
  }
});
