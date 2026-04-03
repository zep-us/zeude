export const INVALID_PATH_PATTERN = /(\.\.|^\/|[<>:"|?*\x00-\x1f])/
export const MAX_FILE_SIZE = 1024 * 1024 // 1MB per file
export const MAX_PATH_DEPTH = 3
export const MAX_FILES_TOTAL = 5 * 1024 * 1024 // 5MB total
export const MAX_CONTENT_SIZE = 100 * 1024 // 100KB

export function validateFiles(files: Record<string, unknown>): { valid: boolean; error?: string } {
  const paths = Object.keys(files)

  for (const path of paths) {
    if (INVALID_PATH_PATTERN.test(path)) {
      return { valid: false, error: `Invalid file path: ${path}` }
    }
    if (path.split('/').length > MAX_PATH_DEPTH) {
      return { valid: false, error: `File path too deep (max ${MAX_PATH_DEPTH} levels): ${path}` }
    }
    const content = files[path]
    if (typeof content !== 'string') {
      return { valid: false, error: `File content must be a string: ${path}` }
    }
    if (new TextEncoder().encode(content).length > MAX_FILE_SIZE) {
      return { valid: false, error: `File ${path} exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` }
    }
  }

  // Total size check
  const totalSize = Object.values(files).reduce<number>(
    (sum, content) => sum + new TextEncoder().encode(content as string).length, 0
  )
  if (totalSize > MAX_FILES_TOTAL) {
    return { valid: false, error: `Total files size exceeds ${MAX_FILES_TOTAL / (1024 * 1024)}MB limit` }
  }

  return { valid: true }
}
