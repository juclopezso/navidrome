import themes from './index'
import { describe, it, expect } from 'vitest'

describe('NDPlaylistDetails styles', () => {
  const themeEntries = Object.entries(themes)

  it.each(themeEntries)(
    '%s should not set minWidth on details',
    (themeName, theme) => {
      const details = theme.overrides?.NDPlaylistDetails?.details
      expect(details?.minWidth).toBeUndefined()
    },
  )
})

describe('LightBlueTheme', () => {
  it('is registered in the themes index', () => {
    expect(themes.LightBlueTheme).toBeDefined()
  })

  it('has the correct themeName', () => {
    expect(themes.LightBlueTheme.themeName).toBe('Light Blue')
  })

  it('uses light palette type', () => {
    expect(themes.LightBlueTheme.palette.type).toBe('light')
  })

  it('uses light player theme', () => {
    expect(themes.LightBlueTheme.player.theme).toBe('light')
  })
})
