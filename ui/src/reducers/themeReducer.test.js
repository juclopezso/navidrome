import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AUTO_THEME_ID, AUTO_THEME_CONFIG_VALUE } from '../consts'

describe('themeReducer', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it.each([
    {
      configTheme: AUTO_THEME_CONFIG_VALUE,
      expected: AUTO_THEME_ID,
      description: 'is "Auto"',
    },
    { configTheme: 'Dark', expected: 'DarkTheme', description: 'is "Dark"' },
    {
      configTheme: 'NonExistent',
      expected: 'DarkTheme',
      description: 'is unrecognized',
    },
  ])(
    'returns $expected when defaultTheme config $description',
    async ({ configTheme, expected }) => {
      vi.doMock('../config', () => ({
        default: { defaultTheme: configTheme },
      }))
      const { themeReducer } = await import('./themeReducer')
      const result = themeReducer(undefined, { type: 'UNKNOWN' })
      expect(result).toBe(expected)
    },
  )

  it('applies CHANGE_THEME action to update the theme', async () => {
    vi.doMock('../config', () => ({
      default: { defaultTheme: 'Dark' },
    }))
    const { themeReducer } = await import('./themeReducer')
    const result = themeReducer('DarkTheme', {
      type: 'CHANGE_THEME',
      payload: 'LightBlueTheme',
    })
    expect(result).toBe('LightBlueTheme')
  })

  it('retains current theme for unknown actions', async () => {
    vi.doMock('../config', () => ({
      default: { defaultTheme: 'Dark' },
    }))
    const { themeReducer } = await import('./themeReducer')
    const result = themeReducer('NordTheme', { type: 'UNKNOWN' })
    expect(result).toBe('NordTheme')
  })
})
