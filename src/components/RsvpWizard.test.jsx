import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RsvpWizard, { newDraft } from './RsvpWizard.jsx'
import { RsvpError } from '../lib/rsvp.js'

const human = async () => 'token-turnstile'

function Harness({ submit, humanCheck = human }) {
  const [draft, setDraft] = useState(newDraft)
  return <RsvpWizard draft={draft} setDraft={setDraft} onClose={() => {}} submit={submit} humanCheck={humanCheck} />
}

const setup = (submit, humanCheck) => {
  const user = userEvent.setup()
  render(<Harness submit={submit} humanCheck={humanCheck} />)
  return user
}
const click = (user, name) => user.click(screen.getByRole('button', { name }))
const ok = vi.fn(async p => ({ ok: true, id: p.id }))

describe('wizard RSVP', () => {
  it('un partecipante: dalla risposta al successo', async () => {
    const submit = vi.fn(async p => ({ ok: true, id: p.id }))
    const user = setup(submit)
    expect(screen.getByRole('heading', { name: 'Ci sarai?' })).toBeTruthy()
    await click(user, 'Sì, ci sarò!')
    expect(await screen.findByRole('heading', { name: 'In quanti sarete?' })).toBeTruthy()
    await click(user, 'Continua')
    await screen.findByRole('heading', { name: /Chi festeggerà con Carmela/ })
    await user.type(screen.getByLabelText('Nome e cognome'), 'Maria Rossi')
    await click(user, 'Continua')
    await screen.findByRole('heading', { name: 'Riepilogo' })
    expect(screen.getByText('Maria Rossi')).toBeTruthy()
    await click(user, 'Invia conferma')
    expect(await screen.findByRole('heading', { name: 'Grazie! La tua conferma è stata ricevuta.' })).toBeTruthy()
    expect(screen.getByText('Carmela sarà felice di festeggiare insieme a te!')).toBeTruthy()
    expect(submit).toHaveBeenCalledTimes(1)
    const p = submit.mock.calls[0][0]
    expect(p).toMatchObject({ attending: true, guests: [{ name: 'Maria Rossi', dietary: '' }], token: 'token-turnstile' })
  })

  it('più partecipanti con esigenze alimentari, senza passaggi in più', async () => {
    const submit = vi.fn(async p => ({ ok: true, id: p.id }))
    const user = setup(submit)
    await click(user, 'Sì, ci sarò!')
    await screen.findByRole('heading', { name: 'In quanti sarete?' })
    await click(user, 'Una persona in più')
    await click(user, 'Una persona in più')
    expect(screen.getByText('3')).toBeTruthy()
    await click(user, 'Una persona in meno')
    await click(user, 'Continua')
    await screen.findByRole('heading', { name: /Chi festeggerà/ })

    const names = screen.getAllByLabelText('Nome e cognome')
    expect(names).toHaveLength(2)
    await user.type(names[0], 'Maria Rossi')
    await user.type(names[1], 'Giuseppe Rossi')
    await user.type(screen.getAllByLabelText(/Allergie/)[1], 'Senza lattosio')

    expect(screen.queryByRole('checkbox')).toBeNull()
    await click(user, 'Continua')

    await screen.findByRole('heading', { name: 'Riepilogo' })
    expect(screen.getByText('Esigenze alimentari: Senza lattosio')).toBeTruthy()
    await click(user, 'Invia conferma')
    await screen.findByText('Carmela sarà felice di festeggiare insieme a te!')
    expect(submit.mock.calls[0][0]).toMatchObject({
      attending: true,
      guests: [{ name: 'Maria Rossi', dietary: '' }, { name: 'Giuseppe Rossi', dietary: 'Senza lattosio' }],
    })
  })

  it('rispetta il numero massimo con un messaggio chiaro', async () => {
    const user = setup(ok)
    await click(user, 'Sì, ci sarò!')
    await screen.findByRole('heading', { name: 'In quanti sarete?' })
    for (let i = 0; i < 10; i++) await click(user, 'Una persona in più')
    expect(screen.getByText('8')).toBeTruthy()
    expect(screen.getByText(/al massimo 8 persone/)).toBeTruthy()
  })

  it('partecipazione negativa: solo il nome e un ringraziamento senza riferimenti alla presenza', async () => {
    const submit = vi.fn(async p => ({ ok: true, id: p.id }))
    const user = setup(submit)
    await click(user, 'Mi dispiace, non potrò esserci')
    await screen.findByRole('heading', { name: /Ci dispiace/ })
    expect(screen.queryByLabelText(/Allergie/)).toBeNull()
    await user.type(screen.getByLabelText('Nome e cognome'), 'Luca Bianchi')
    await click(user, 'Continua')
    await screen.findByRole('heading', { name: 'Riepilogo' })
    expect(screen.getByText('Non potrò esserci')).toBeTruthy()
    await click(user, 'Invia conferma')
    await screen.findByRole('heading', { name: 'Grazie! La tua conferma è stata ricevuta.' })
    expect(screen.queryByText(/felice di festeggiare/)).toBeNull()
    expect(submit.mock.calls[0][0]).toMatchObject({ attending: false, guests: [{ name: 'Luca Bianchi', dietary: '' }] })
  })

  it('blocca nomi mancanti o incompleti e porta il focus sul campo', async () => {
    const user = setup(ok)
    await click(user, 'Sì, ci sarò!')
    await screen.findByRole('heading', { name: 'In quanti sarete?' })
    await click(user, 'Continua')
    await screen.findByRole('heading', { name: /Chi festeggerà/ })
    await click(user, 'Continua')
    const input = screen.getByLabelText('Nome e cognome')
    expect(screen.getByText('Scrivi nome e cognome.')).toBeTruthy()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(input)
    await user.type(input, 'Maria')
    await click(user, 'Continua')
    expect(screen.getByText(/sia il nome sia il cognome/)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Riepilogo' })).toBeNull()
  })

  it('errore di rete: dati conservati, nuovo tentativo con lo stesso ID (nessun doppio invio)', async () => {
    const submit = vi.fn()
      .mockRejectedValueOnce(new RsvpError('network'))
      .mockImplementationOnce(async p => ({ ok: true, id: p.id, duplicate: true }))
    const user = setup(submit)
    await click(user, 'Mi dispiace, non potrò esserci')
    await screen.findByRole('heading', { name: /Ci dispiace/ })
    await user.type(screen.getByLabelText('Nome e cognome'), 'Luca Bianchi')
    await click(user, 'Continua')
    await screen.findByRole('heading', { name: 'Riepilogo' })

    await click(user, 'Invia conferma')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/connessione/)
    expect(screen.getByText('Luca Bianchi')).toBeTruthy()
    expect(screen.queryByText(/conferma è stata ricevuta/)).toBeNull()

    await click(user, 'Invia conferma')
    await screen.findByText(/conferma è stata ricevuta/)
    expect(submit).toHaveBeenCalledTimes(2)
    expect(submit.mock.calls[1][0].id).toBe(submit.mock.calls[0][0].id)
  })

  it('una modifica dopo un errore genera un nuovo ID', async () => {
    const submit = vi.fn().mockRejectedValue(new RsvpError('server'))
    const user = setup(submit)
    await click(user, 'Mi dispiace, non potrò esserci')
    await user.type(await screen.findByLabelText('Nome e cognome'), 'Luca Bianchi')
    await click(user, 'Continua')
    await screen.findByRole('heading', { name: 'Riepilogo' })
    await click(user, 'Invia conferma')
    await screen.findByRole('alert')
    await user.click(screen.getAllByRole('button', { name: 'Modifica' })[1])
    await user.type(await screen.findByLabelText('Nome e cognome'), 'o')
    await click(user, 'Continua')
    await screen.findByRole('heading', { name: 'Riepilogo' })
    await click(user, 'Invia conferma')
    await screen.findByRole('alert')
    expect(submit.mock.calls[1][0].id).not.toBe(submit.mock.calls[0][0].id)
  })

  it('il successo compare solo dopo la risposta verificata del backend', async () => {
    let resolve
    const submit = vi.fn(p => new Promise(r => { resolve = () => r({ ok: true, id: p.id }) }))
    const user = setup(submit)
    await click(user, 'Mi dispiace, non potrò esserci')
    await user.type(await screen.findByLabelText('Nome e cognome'), 'Luca Bianchi')
    await click(user, 'Continua')
    await screen.findByRole('heading', { name: 'Riepilogo' })
    await click(user, 'Invia conferma')
    expect(screen.getByRole('button', { name: /Invio in corso/ })).toBeTruthy()
    expect(screen.queryByText(/conferma è stata ricevuta/)).toBeNull()
    // un secondo tocco durante l'invio non genera un'altra richiesta
    await click(user, /Invio in corso/)
    expect(submit).toHaveBeenCalledTimes(1)
    await act(async () => resolve())
    expect(await screen.findByText(/conferma è stata ricevuta/)).toBeTruthy()
  })

  it('non salva nulla nel browser', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const user = setup(ok)
    await click(user, 'Sì, ci sarò!')
    await user.click(await screen.findByRole('button', { name: 'Continua' }))
    await user.type(await screen.findByLabelText('Nome e cognome'), 'Maria Rossi')
    await user.type(screen.getByLabelText(/Allergie/), 'Noci')
    expect(setItem).not.toHaveBeenCalled()
  })

  it('controllo anti-bot fallito: nessun invio, dati conservati, messaggio chiaro', async () => {
    const submit = vi.fn(async p => ({ ok: true, id: p.id }))
    const user = setup(submit, async () => { throw new Error('turnstile') })
    await click(user, 'Mi dispiace, non potrò esserci')
    await user.type(await screen.findByLabelText('Nome e cognome'), 'Luca Bianchi')
    await click(user, 'Continua')
    await screen.findByRole('heading', { name: 'Riepilogo' })
    await click(user, 'Invia conferma')
    expect((await screen.findByRole('alert')).textContent).toMatch(/controllo di sicurezza/)
    expect(submit).not.toHaveBeenCalled()
    expect(screen.getByText('Luca Bianchi')).toBeTruthy()
  })

  it('rifiuta simboli e formule nei nomi', async () => {
    const user = setup(ok)
    await click(user, 'Mi dispiace, non potrò esserci')
    await user.type(await screen.findByLabelText('Nome e cognome'), '=HYPERLINK Rossi')
    await click(user, 'Continua')
    expect(screen.getByText(/Usa solo lettere/)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Riepilogo' })).toBeNull()
  })
})
