const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동하기 쉬운 문자 제외 (0, O, 1, I)

export function generateRoomCode(length: number = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return code;
}

export function isValidRoomCode(code: string): boolean {
  if (!code || code.length !== 6) {
    return false;
  }
  return /^[A-Z0-9]+$/.test(code);
}
