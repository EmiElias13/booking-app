import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Home from './Home.jsx'
import { strings } from '../i18n/strings.js'

// Clinic "now" is midnight so no slot counts as already past.
vi.mock('../data/clinic.js', async (orig) => ({ ...(await orig()), clinicTimeHHMM: () => '00:00' }))

const store = vi.hoisted(() => ({ therapistId: '', loading: false, slotsLoading: false, therapists: null, requestSlot: null }))

vi.mock('../store/appointments.jsx', () => ({
  useAppointments: () => ({
    myRequests: [],
    apiError: '',
    requestSlot: store.requestSlot ?? vi.fn(),
    clinicToday: '2099-01-05',
    loading: store.loading,
    therapists: store.therapists ?? [{ id: 't1', displayName: 'Dra. Prueba' }],
    therapistId: store.therapistId,
    selectTherapist: vi.fn(),
    // 09:00 is taken: the server leaves it out of the free list.
    availableSlots: new Map([['2099-01-05', ['10:00', '11:00']]]),
    slotsLoading: store.slotsLoading,
    therapistsError: false,
    slotsError: false,
    retrySlots: vi.fn(),
    refresh: vi.fn(),
  }),
}))

beforeEach(() => {
  Object.assign(store, { therapistId: '', loading: false, slotsLoading: false, therapists: null, requestSlot: null })
})

describe('Home booking form (store mocked)', () => {
  it('shows only free slots for the chosen therapist (taken ones are not offered)', () => {
    store.therapistId = 't1'
    render(<Home />)
    expect(screen.queryByRole('button', { name: '09:00' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10:00' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '11:00' })).toBeEnabled()
  })

  it('shows Spanish required-field errors on empty submit, including the therapist', () => {
    store.therapistId = ''
    const { container } = render(<Home />)
    fireEvent.submit(container.querySelector('form'))
    expect(screen.getByText(strings.errors.name)).toBeInTheDocument()
    expect(screen.getByText(strings.errors.email)).toBeInTheDocument()
    expect(screen.getByText('Elige un fisioterapeuta')).toBeInTheDocument()
    expect(screen.getByText(strings.errors.time)).toBeInTheDocument()
  })
})

describe('Home picker loading and accessibility', () => {
  it('shows "Cargando fisioterapeutas…" as the dropdown placeholder while therapists load', () => {
    Object.assign(store, { loading: true, therapists: [] })
    render(<Home />)
    expect(screen.getByRole('option', { name: strings.home.therapistsLoading })).toBeInTheDocument()
  })

  it('shows "Cargando horarios…" in the times area while times load', () => {
    Object.assign(store, { therapistId: 't1', slotsLoading: true })
    render(<Home />)
    expect(screen.getByRole('status')).toHaveTextContent(strings.home.slotsLoading)
  })

  it('links each field to its error and focuses the first invalid field on submit', () => {
    const { container } = render(<Home />)
    const name = screen.getByLabelText(strings.home.name)
    const email = screen.getByLabelText(strings.home.email)
    const therapist = screen.getByLabelText(strings.home.therapist)
    expect(name).not.toHaveAttribute('aria-describedby')
    fireEvent.submit(container.querySelector('form'))
    expect(name).toHaveAccessibleDescription(strings.errors.name)
    expect(email).toHaveAccessibleDescription(strings.errors.email)
    expect(therapist).toHaveAccessibleDescription(strings.errors.therapist)
    expect(container.querySelector('fieldset')).toHaveAccessibleDescription(strings.errors.time)
    expect(name).toHaveFocus()
  })

  it('focuses the first invalid field further down when earlier ones are valid', () => {
    store.therapistId = 't1'
    render(<Home />)
    fireEvent.change(screen.getByLabelText(strings.home.name), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText(strings.home.email), { target: { value: 'ana@ejemplo.com' } })
    fireEvent.click(screen.getByRole('button', { name: strings.home.submit }))
    expect(screen.getByRole('button', { name: '10:00' })).toHaveFocus()
  })

  it('marks the chosen time with aria-pressed', () => {
    store.therapistId = 't1'
    render(<Home />)
    const ten = screen.getByRole('button', { name: '10:00' })
    expect(ten).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(ten)
    expect(ten).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '11:00' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('announces the general send error with role="alert"', async () => {
    Object.assign(store, { therapistId: 't1', requestSlot: vi.fn(() => Promise.reject(new Error('boom'))) })
    render(<Home />)
    fireEvent.change(screen.getByLabelText(strings.home.name), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText(strings.home.email), { target: { value: 'ana@ejemplo.com' } })
    fireEvent.click(screen.getByRole('button', { name: '10:00' }))
    fireEvent.click(screen.getByRole('button', { name: strings.home.submit }))
    expect(await screen.findByRole('alert')).toHaveTextContent(strings.errors.send)
  })
})
