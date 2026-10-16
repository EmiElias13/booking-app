import { describe, expect, it } from 'vitest'
import { deepMerge, strings, t } from './strings.js'

describe('t()', () => {
  it('fills placeholders and blanks missing values', () => {
    expect(t('Hola {name}, cita {time}', { name: 'Ana' })).toBe('Hola Ana, cita ')
  })
})

describe('deepMerge()', () => {
  it('merges nested keys and replaces arrays', () => {
    const out = deepMerge({ a: { b: 1, c: 2 }, list: [1, 2] }, { a: { c: 3 }, list: [9] })
    expect(out).toEqual({ a: { b: 1, c: 3 }, list: [9] })
  })

  it('ignores __proto__/constructor/prototype keys (result keeps a plain prototype)', () => {
    const over = JSON.parse('{"a":{"__proto__":{"y":1}},"__proto__":{"x":1},"constructor":{"prototype":{"z":1}}}')
    const out = deepMerge({ a: { b: 1 } }, over)
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(out.a)).toBe(Object.prototype)
    expect(out.x).toBeUndefined()
    expect(out.a.y).toBeUndefined()
    expect(Object.hasOwn(out, 'constructor')).toBe(false)
    expect({}.x).toBeUndefined()
  })
})

describe('D3 polish strings (L7, QA low 2)', () => {
  it('therapist-list load error has its own wording, distinct from the slots error', () => {
    expect(strings.home.therapistsLoadError).toBe('No pudimos cargar los fisioterapeutas. Revisa tu conexión e inténtalo de nuevo.')
    expect(strings.home.therapistsLoadError).not.toBe(strings.home.loadError)
  })
  it('has the missing-therapist placeholder', () => {
    expect(strings.approvals.missingTherapist).toBe('Fisioterapeuta no disponible')
  })
})
