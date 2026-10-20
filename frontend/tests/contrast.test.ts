// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')

/**
 * Guards WCAG AA contrast for every foreground/background pairing the components use.
 * Text needs 4.5:1; focus rings and other non-text indicators need 3:1.
 * If a token change breaks a pairing, this test names it.
 */
const tokens = Object.fromEntries([...css.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]))

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const color = (name: string) => {
  const value = tokens[name]
  if (!value) throw new Error(`Unknown colour token --color-${name}`)
  return value
}

const TEXT_PAIRS: Array<[fg: string, bg: string, where: string]> = [
  ['ink', 'surface', 'titles'],
  ['ink-2', 'surface', 'section titles, cell text'],
  ['ink-3', 'surface', 'body text'],
  ['ink-3', 'surface-muted', 'body on tinted rows'],
  ['muted', 'surface', 'helper text, placeholders'],
  ['muted', 'bg', 'page descriptions'],
  ['muted', 'surface-muted', 'table headers, hovered rows'],
  ['muted', 'surface-tint', 'dialog footer notes'],
  ['primary', 'surface', 'links'],
  ['primary', 'bg', 'links on the workspace'],
  ['primary', 'primary-soft', 'info badge, count pill'],
  ['white', 'primary', 'primary button'],
  ['white', 'primary-hover', 'primary button hover'],
  ['white', 'danger', 'danger button'],
  ['success', 'success-bg', 'success badge'],
  ['warning', 'warning-bg', 'warning badge'],
  ['danger', 'danger-bg', 'danger badge and alert'],
  ['neutral', 'neutral-bg', 'neutral badge'],
  ['success', 'surface', 'positive trend'],
  ['danger', 'surface', 'field errors, negative trend'],
  ['warning', 'surface', 'warning text'],
  ['success', 'bg', 'billing: item added, under the search box'],
  ['danger', 'bg', 'billing: scan errors, under the search box'],
  ['ink', 'surface-tint', 'billing: total to collect'],
  ['ink-3', 'surface-tint', 'billing: labels in the payment total box'],
  ['white', 'navy-2', 'toast title'],
  ['navy-text', 'navy-2', 'toast description'],
  ['navy-text', 'navy', 'sidebar items'],
  ['navy-caption', 'navy', 'sidebar caption'],
  ['white', 'navy-active', 'active sidebar item'],
]

const NON_TEXT_PAIRS: Array<[fg: string, bg: string, where: string]> = [
  ['focus', 'surface', 'focus ring on white'],
  ['focus', 'bg', 'focus ring on the workspace'],
  ['focus', 'navy', 'focus ring in the sidebar'],
  ['primary', 'surface', 'selected chip, checked indicator'],
  ['navy-indicator', 'navy-2', 'toast icon'],
  ['control-border', 'surface', 'field boundary in cards and dialogs'],
  ['control-border', 'bg', 'field boundary on the workspace'],
  ['control-border', 'surface-tint', 'field boundary in dialog footers'],
  ['muted', 'surface', 'hovered field boundary'],
  ['danger', 'surface', 'invalid field boundary'],
  ['danger', 'bg', 'invalid field boundary on the workspace'],
]

describe('colour contrast (WCAG AA)', () => {
  it.each(TEXT_PAIRS)('text %s on %s (%s) is at least 4.5:1', (fg, bg) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(NON_TEXT_PAIRS)('indicator %s on %s (%s) is at least 3:1', (fg, bg) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(3)
  })

  it('the brand primary is unchanged', () => {
    expect(color('primary')).toBe('#3159d9')
    expect(color('navy')).toBe('#17243a')
  })
})
