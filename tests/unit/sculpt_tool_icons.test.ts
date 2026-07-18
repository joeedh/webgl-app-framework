/**
 * Guards ImmediateTODOs "all SculptTools enum entries have icons": every key of
 * the SculptTools enum must have a SCULPT_<KEY> entry in the Icons map (that is
 * how brush_base.ts builds SculptIcons). The Icons side is parsed as text —
 * icon_enum.js drags in path.ux, which the jsdom harness can't load.
 */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {SculptTools} from '../../scripts/brush/brush_enums'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function sculptToolKeys(): string[] {
  return Object.keys(SculptTools).filter((k) => isNaN(Number(k)))
}

function iconKeys(): Set<string> {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'editors', 'icon_enum.js'), 'utf-8')
  const m = src.match(/export let Icons = \{([^}]+)\}/)
  if (!m) {
    throw new Error('Icons map not found in icon_enum.js')
  }
  return new Set([...m[1].matchAll(/^\s*([A-Z_][A-Z0-9_]*)\s*:/gm)].map((k) => k[1]))
}

describe('SculptTools icons', () => {
  test('every SculptTools entry has a SCULPT_<KEY> icon', () => {
    const tools = sculptToolKeys()
    expect(tools.length).toBeGreaterThan(20) // sanity: the enum parse worked

    const icons = iconKeys()
    const missing = tools.filter((k) => !icons.has('SCULPT_' + k))
    expect(missing).toEqual([])
  })
})
