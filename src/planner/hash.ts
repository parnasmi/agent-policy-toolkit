import { createHash } from 'node:crypto'

/** Hash the exact UTF-8 byte representation of text. */
export function sha256Utf8(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}
