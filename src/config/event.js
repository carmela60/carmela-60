// Configurazione unica dell'evento. Tutto il sito, il file .ics e il Worker leggono da qui.
export const EVENT = {
  title: '60 di Carmela',
  honoree: 'Carmela',
  calendarTitle: '60° compleanno di Carmela',

  // Istante di inizio con offset esplicito: a gennaio Roma è in ora solare (+01:00).
  start: '2027-01-03T13:00:00+01:00',
  timeZone: 'Europe/Rome',
  // Durata non ancora definita: con null il calendario riceve solo l'orario di inizio.
  // Quando sarà nota, indicare i minuti (es. 300 per 5 ore).
  durationMinutes: null,

  reminderDaysBefore: 15,
  reminderText: 'Tra 15 giorni festeggiamo i 60 anni di Carmela!',

  venue: 'Villa Sirena',
  street: "Viale Sant'Alfonso 30",
  postalCode: '82015',
  city: 'Durazzano',
  province: 'BN',
  country: 'Italia',
  // Facoltativo: Place ID Google verificato di Villa Sirena (vedi README). Vuoto = solo indirizzo.
  mapsPlaceId: '',

  message: 'Un giorno importante, una gioia ancora più grande se condivisa con te.',
  messageLines: ['Un giorno importante,', 'una gioia ancora più grande', 'se condivisa con te.'],
  invitationLines: ['Ti aspetto il 3 gennaio 2027,', 'alle ore 13:00'],

  // Numero massimo di persone per singola conferma (stesso valore nell'Apps Script).
  maxGuests: 8,

  // Identificativo stabile dell'evento nel calendario: non cambiarlo dopo la pubblicazione.
  uid: '60-di-carmela-20270103@carmela-60',
  icsFileName: '60-di-carmela.ics',
}

export const FULL_ADDRESS = `${EVENT.street}, ${EVENT.postalCode} ${EVENT.city} (${EVENT.province})`
export const LOCATION = `${EVENT.venue}, ${FULL_ADDRESS}`

// Variabili pubbliche del frontend (.env). Nessun segreto qui.
export const RSVP_API_URL = import.meta.env?.VITE_RSVP_API_URL || ''
export const TURNSTILE_SITE_KEY = import.meta.env?.VITE_TURNSTILE_SITE_KEY || ''
