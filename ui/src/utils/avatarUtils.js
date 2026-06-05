/**
 * Returns up to 2 uppercase initials from a display name.
 * e.g. "Juan García" → "JG", "admin" → "A", "" → ""
 */
export const getInitials = (name) => {
  if (!name) return ''
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}
