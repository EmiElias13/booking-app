import { describe, expect, it } from 'vitest'
import { createLatestGate, isSlotRejected, keepTherapist } from './bookingLogic.js'

describe('isSlotRejected', () => {
  it('is true for 409 slot errors', () => {
    for (const code of ['slot_taken', 'past_slot', 'outside_hours', 'time_off', undefined]) {
      expect(isSlotRejected({ status: 409, code })).toBe(true)
    }
  })
  it('is false for inactive_staff, other statuses and missing errors', () => {
    expect(isSlotRejected({ status: 409, code: 'inactive_staff' })).toBe(false)
    expect(isSlotRejected({ status: 422, code: 'too_far' })).toBe(false)
    expect(isSlotRejected({ status: 0, network: true })).toBe(false)
    expect(isSlotRejected(undefined)).toBe(false)
  })
})

describe('keepTherapist', () => {
  const list = [{ id: 'a' }, { id: 'b' }]
  it('keeps a therapist still in the list', () => {
    expect(keepTherapist(list, 'b')).toBe('b')
  })
  it("drops a therapist no longer listed, and returns '' for no selection", () => {
    expect(keepTherapist(list, 'gone')).toBe('')
    expect(keepTherapist([], 'a')).toBe('')
    expect(keepTherapist(list, '')).toBe('')
  })
})

describe('createLatestGate', () => {
  it('only the latest id is current', () => {
    const gate = createLatestGate()
    const first = gate.next()
    const second = gate.next()
    expect(second).toBeGreaterThan(first)
    expect(gate.isCurrent(first)).toBe(false)
    expect(gate.isCurrent(second)).toBe(true)
  })
  it('gates are independent', () => {
    const a = createLatestGate()
    const b = createLatestGate()
    const idA = a.next()
    b.next(); b.next()
    expect(a.isCurrent(idA)).toBe(true)
  })
})
