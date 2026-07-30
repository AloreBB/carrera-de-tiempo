/** Unambiguous alphabet (no I/O/0/1). */
export const RACE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const RACE_CODE_LENGTH = 6;

export function generateRaceCode(
  random: () => number = Math.random,
): string {
  let code = "";
  for (let i = 0; i < RACE_CODE_LENGTH; i++) {
    const idx = Math.floor(random() * RACE_CODE_ALPHABET.length);
    code += RACE_CODE_ALPHABET[idx];
  }
  return code;
}

export function isValidRaceCode(code: string): boolean {
  if (code.length !== RACE_CODE_LENGTH) return false;
  for (const ch of code.toUpperCase()) {
    if (!RACE_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

export function normalizeRaceCode(code: string): string {
  return code.trim().toUpperCase();
}
