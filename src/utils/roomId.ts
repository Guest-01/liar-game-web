import { nanoid } from 'nanoid';

export function generateRoomId(length: number = 8): string {
  return nanoid(length);
}
