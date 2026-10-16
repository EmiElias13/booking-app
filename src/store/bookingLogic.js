// Small pure helpers for the guest booking flow (kept free of React so they are easy to test).

// Booking was rejected because the slot is no longer bookable (taken, past, outside hours, time off).
// inactive_staff is handled separately: the therapist list is reloaded instead.
export function isSlotRejected(error) {
  return error?.status === 409 && error.code !== 'inactive_staff'
}

// The selected therapist id, or '' when it is no longer in the (active) list.
export function keepTherapist(therapists, selectedId) {
  return selectedId && therapists.some((x) => x.id === selectedId) ? selectedId : ''
}

// Hands out increasing request ids; only the latest one is current, so late responses can be ignored.
export function createLatestGate() {
  let latest = 0
  return {
    next: () => ++latest,
    isCurrent: (id) => id === latest,
  }
}

// Own-key lookup so codes like 'constructor' or 'toString' never hit Object.prototype (L1).
export function lookupCode(table, code) {
  return typeof code === 'string' && Object.hasOwn(table, code) ? table[code] : undefined
}
