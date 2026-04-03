import { describe, it, expect } from 'vitest'
import { validateFiles, MAX_FILE_SIZE, MAX_FILES_TOTAL, MAX_PATH_DEPTH } from './file-validation'

describe('validateFiles', () => {
  // ── Path validation ──

  it('rejects paths containing ..', () => {
    const result = validateFiles({ '../etc/passwd': 'content' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file path')
  })

  it('rejects paths with .. in the middle', () => {
    const result = validateFiles({ 'foo/../bar': 'content' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file path')
  })

  it('rejects absolute paths starting with /', () => {
    const result = validateFiles({ '/etc/passwd': 'content' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file path')
  })

  it('rejects paths with < character', () => {
    const result = validateFiles({ 'file<name>.md': 'content' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file path')
  })

  it('rejects paths with > character', () => {
    const result = validateFiles({ 'file>name.md': 'content' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file path')
  })

  it('rejects paths with : character', () => {
    const result = validateFiles({ 'C:file.md': 'content' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file path')
  })

  it('rejects paths with " character', () => {
    const result = validateFiles({ 'file"name.md': 'content' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file path')
  })

  it('rejects paths with | character', () => {
    const result = validateFiles({ 'file|name.md': 'content' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file path')
  })

  it('rejects paths with ? character', () => {
    const result = validateFiles({ 'file?.md': 'content' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file path')
  })

  it('rejects paths with * character', () => {
    const result = validateFiles({ 'file*.md': 'content' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file path')
  })

  it('rejects paths with control characters (null byte)', () => {
    const result = validateFiles({ 'file\x00name.md': 'content' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file path')
  })

  it('rejects paths with control characters (tab)', () => {
    const result = validateFiles({ 'file\tname.md': 'content' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file path')
  })

  it('rejects paths with control characters (newline)', () => {
    const result = validateFiles({ 'file\nname.md': 'content' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file path')
  })

  // ── Path depth validation (AC-42) ──

  it('rejects paths deeper than 3 levels', () => {
    // 4 segments = depth > MAX_PATH_DEPTH (3)
    const result = validateFiles({ 'a/b/c/d': 'content' })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('File path too deep')
    expect(result.error).toContain(`max ${MAX_PATH_DEPTH} levels`)
  })

  it('accepts paths at exactly 3 levels deep', () => {
    // 3 segments = exactly MAX_PATH_DEPTH
    const result = validateFiles({ 'a/b/c': 'content' })
    expect(result.valid).toBe(true)
  })

  it('accepts paths with 2 levels', () => {
    const result = validateFiles({ 'subdir/file.md': 'content' })
    expect(result.valid).toBe(true)
  })

  it('accepts paths with 1 level (flat file)', () => {
    const result = validateFiles({ 'SKILL.md': 'content' })
    expect(result.valid).toBe(true)
  })

  // ── Size validation (AC-40, AC-41) ──

  it('rejects individual file exceeding 1MB', () => {
    const oversizedContent = 'x'.repeat(MAX_FILE_SIZE + 1)
    const result = validateFiles({ 'SKILL.md': oversizedContent })
    expect(result.valid).toBe(false)
    expect(result.error).toContain(`exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`)
  })

  it('accepts individual file at exactly 1MB', () => {
    const exactContent = 'x'.repeat(MAX_FILE_SIZE)
    const result = validateFiles({ 'SKILL.md': exactContent })
    expect(result.valid).toBe(true)
  })

  it('rejects total files exceeding 5MB', () => {
    // 6 files each at 900KB = 5.27MB > 5MB total
    const content900k = 'x'.repeat(900 * 1024)
    const result = validateFiles({
      'file1.md': content900k,
      'file2.md': content900k,
      'file3.md': content900k,
      'file4.md': content900k,
      'file5.md': content900k,
      'file6.md': content900k,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain(`Total files size exceeds ${MAX_FILES_TOTAL / (1024 * 1024)}MB limit`)
  })

  it('accepts total files within 5MB limit', () => {
    const content900k = 'x'.repeat(900 * 1024)
    const result = validateFiles({
      'file1.md': content900k,
      'file2.md': content900k,
      'file3.md': content900k,
      'file4.md': content900k,
    })
    // 3.5MB total < 5MB
    expect(result.valid).toBe(true)
  })

  // ── Type validation (AC-44) ──

  it('rejects non-string file content (number)', () => {
    const result = validateFiles({ 'SKILL.md': 123 as unknown })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('File content must be a string')
  })

  it('rejects non-string file content (null)', () => {
    const result = validateFiles({ 'SKILL.md': null as unknown })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('File content must be a string')
  })

  it('rejects non-string file content (object)', () => {
    const result = validateFiles({ 'SKILL.md': { nested: 'object' } as unknown })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('File content must be a string')
  })

  it('rejects non-string file content (boolean)', () => {
    const result = validateFiles({ 'SKILL.md': true as unknown })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('File content must be a string')
  })

  it('rejects non-string file content (undefined)', () => {
    const result = validateFiles({ 'SKILL.md': undefined as unknown })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('File content must be a string')
  })

  it('accepts string file content', () => {
    const result = validateFiles({ 'SKILL.md': 'valid content' })
    expect(result.valid).toBe(true)
  })

  // ── Edge cases ──

  it('returns valid for single SKILL.md file', () => {
    const result = validateFiles({ 'SKILL.md': '# My Skill\nSome content' })
    expect(result.valid).toBe(true)
  })

  it('handles UTF-8 content size correctly', () => {
    // Each emoji is 4 bytes in UTF-8. Fill close to MAX_FILE_SIZE with emoji.
    // 1MB = 1048576 bytes. Each emoji = 4 bytes. 262144 emojis = exactly 1MB
    const emojiContent = '\u{1F600}'.repeat(262144) // exactly 1MB
    const result = validateFiles({ 'SKILL.md': emojiContent })
    expect(result.valid).toBe(true)
  })

  it('rejects UTF-8 content that exceeds byte limit despite short char count', () => {
    // 262145 emojis = 1048580 bytes = 1MB + 4 bytes
    const emojiContent = '\u{1F600}'.repeat(262145)
    const result = validateFiles({ 'SKILL.md': emojiContent })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('exceeds')
  })

  it('accepts multiple valid files with nested paths', () => {
    const result = validateFiles({
      'SKILL.md': '# Main',
      'lib/utils.ts': 'export const foo = 1',
      'lib/types.ts': 'export type Bar = string',
    })
    expect(result.valid).toBe(true)
  })

  it('validates all files and stops at first invalid path', () => {
    const result = validateFiles({
      'valid.md': 'ok',
      '../bad.md': 'bad',
      'also-valid.md': 'ok',
    })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file path')
  })

  it('accepts empty string content', () => {
    const result = validateFiles({ 'SKILL.md': '' })
    expect(result.valid).toBe(true)
  })
})
