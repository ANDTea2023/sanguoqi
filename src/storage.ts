import { COUNTRIES, positionKey, type Country, type GameState, type Position } from './engine';

const pieceTypes = ['general', 'advisor', 'elephant', 'horse', 'rook', 'cannon', 'pawn'];
const isCountry = (value: unknown, countries: Country[]): value is Country => countries.includes(value as Country);

/** Reject incomplete saves instead of leaving the player with an unplayable board. */
export function validGame(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const v = value as GameState;
  if (!['three', 'classic'].includes(v.mode)) return false;
  const countries: Country[] = v.mode === 'classic' ? ['wei', 'shu'] : COUNTRIES;
  const validPosition = (pos: unknown): pos is Position => {
    if (!pos || typeof pos !== 'object') return false;
    const p = pos as Position;
    return isCountry(p.camp, countries) && Number.isInteger(p.row) && p.row >= 0 && p.row <= 4 && Number.isInteger(p.col) && p.col >= 0 && p.col <= 8;
  };
  if (!isCountry(v.turn, countries) || !Array.isArray(v.pieces) || v.pieces.length > countries.length * 16 || !Array.isArray(v.history) || !Array.isArray(v.eliminated) || !Number.isInteger(v.ply) || v.ply < 0 || v.ply !== v.history.length) return false;
  if (!v.eliminated.every(c => isCountry(c, countries)) || new Set(v.eliminated).size !== v.eliminated.length) return false;
  const active = countries.filter(c => !v.eliminated.includes(c));
  if (!active.includes(v.turn)) return false;
  if (v.winner === null ? active.length < 2 : active.length !== 1 || v.winner !== active[0] || v.turn !== v.winner) return false;
  const ids = new Set<string>();
  const occupied = new Set<string>();
  if (!v.pieces.every(p => {
    if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id) || !isCountry(p.country, active) || !pieceTypes.includes(p.type) || !validPosition(p.position) || occupied.has(positionKey(p.position))) return false;
    if (p.crossed !== undefined && typeof p.crossed !== 'boolean') return false;
    if (p.invasion !== undefined && (!isCountry(p.invasion, countries) || p.invasion === p.country || p.position.camp !== p.invasion)) return false;
    if (p.type === 'pawn' && (p.position.camp !== p.country) !== !!p.crossed) return false;
    if (['general', 'advisor', 'elephant'].includes(p.type) && p.position.camp !== p.country) return false;
    if (['general', 'advisor'].includes(p.type) && (p.position.row > 2 || p.position.col < 3 || p.position.col > 5)) return false;
    ids.add(p.id); occupied.add(positionKey(p.position)); return true;
  })) return false;
  if (!active.every(c => v.pieces.filter(p => p.country === c && p.type === 'general').length === 1 && v.pieces.filter(p => p.country === c).length <= 16)) return false;
  return v.history.every(m => m && isCountry(m.country, countries) && typeof m.piece === 'string' && typeof m.notation === 'string' && validPosition(m.from) && validPosition(m.to) && (m.captured === undefined || typeof m.captured === 'string') && (m.eliminated === undefined || Array.isArray(m.eliminated) && m.eliminated.every(c => isCountry(c, countries))));
}
