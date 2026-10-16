import { describe, expect, it } from 'vitest'
import { deepMerge, t } from './strings.js'

describe('t()', () => {
  it('fills placeholders and blanks missing values', () => {
    expect(t('Hola {name}, cita {time}', { name: 'Ana' })).toBe('Hola Ana, cita ')
  })
})

describe('deepMerge()', () => {
  it('merges nested keys, replaces arrays, and ignores prototype keys', () => {
    const out = deepMerge({ a: { b: 1, c: 2 }, list: [1, 2] }, JSON.parse('{"a":{"c":3},"list":[9],"__proto__":{"x":1}}'))
    expect(out).toEqual({ a: { b: 1, c: 3 }, list: [9] })
    expect({}.x).toBeUndefined()
  })
})
