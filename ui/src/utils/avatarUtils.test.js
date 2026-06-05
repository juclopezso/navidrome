import { describe, it, expect } from 'vitest'
import { getInitials } from './avatarUtils'

describe('getInitials', () => {
  it('returns empty string for empty input', () => {
    expect(getInitials('')).toBe('')
    expect(getInitials(null)).toBe('')
    expect(getInitials(undefined)).toBe('')
  })

  it('returns single uppercase initial for one-word name', () => {
    expect(getInitials('admin')).toBe('A')
    expect(getInitials('Juan')).toBe('J')
  })

  it('returns two uppercase initials for multi-word name', () => {
    expect(getInitials('Juan García')).toBe('JG')
    expect(getInitials('john doe')).toBe('JD')
  })

  it('returns at most two initials for names with more than two words', () => {
    expect(getInitials('Juan Carlos García')).toBe('JC')
  })

  it('handles extra whitespace', () => {
    expect(getInitials('  Ana   López  ')).toBe('AL')
  })
})
