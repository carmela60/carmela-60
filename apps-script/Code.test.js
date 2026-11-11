// @vitest-environment node
// Esegue il vero Code.js in una sandbox con finti servizi Google.
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { beforeEach, describe, expect, it } from 'vitest'

const CODE = readFileSync(new URL('./Code.js', import.meta.url), 'utf8')
const SECRET = 'a'.repeat(16) + 'segreto-di-prova-lungo'
const ID = '3f2b8c1e-9a4d-4c2e-8f1a-0b6d5e7c9a21'
const ID2 = '9c1d2e3f-4a5b-4c6d-8e7f-001122334455'

function fakeSheet() {
  const rows = []
  return {
    rows,
    getRange: (a) => {
      if (typeof a === 'string') {
        return {
          setNumberFormat: () => {},
          createTextFinder: text => ({
            matchEntireCell: () => ({ findNext: () => (rows.slice(1).some(r => r[0] === text) ? {} : null) }),
          }),
        }
      }
      return { setValues: values => { values.forEach((v, i) => { rows[a - 1 + i] = [...v] }); return { setFontWeight: () => {} } } }
    },
    getLastRow: () => rows.length,
    setFrozenRows: () => {},
    deleteRows: (start, n) => rows.splice(start - 1, n),
  }
}

let ctx, sheets, lock, cache, props
beforeEach(() => {
  sheets = {}
  lock = { held: false, released: 0 }
  cache = new Map()
  props = { SHARED_SECRET: SECRET, SPREADSHEET_ID: 'sheet-id' }
  ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] }) },
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = fakeSheet()) }),
      flush: () => {},
    },
    LockService: { getScriptLock: () => ({ tryLock: () => (lock.held = true), releaseLock: () => { lock.held = false; lock.released++ } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    // Come in Apps Script: byte con segno (Java)
    Utilities: {
      Charset: { UTF_8: 'utf8' },
      computeHmacSha256Signature: (msg, key) => [...createHmac('sha256', key).update(msg, 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)),
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this } }) },
  }
  vm.createContext(ctx)
  vm.runInContext(CODE, ctx)
})

const envelope = (payload, { ts = Math.floor(Date.now() / 1000), secret = SECRET } = {}) => {
  const body = JSON.stringify(payload)
  return { payload: body, ts, sig: createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex') }
}
const raw = obj => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(obj) } }).text)
const post = (payload, opts) => raw(envelope(payload, opts))
const yes = (guests, extra = {}) => ({ id: ID, attending: true, guests, ...extra })

describe('Apps Script: scrittura', () => {
  it('scrive una riga in Conferme e una per partecipante, collegate dall\'ID', () => {
    const res = post(yes([{ name: 'Maria  Rossi', dietary: '' }, { name: 'Giuseppe Rossi', dietary: 'Senza lattosio' }]))
    expect(res).toEqual({ ok: true, id: ID })
    const [head, row] = sheets.Conferme.rows
    expect(head).toEqual(['ID conferma', 'Data e ora invio', 'Nome referente', 'Partecipazione (Sì/No)', 'Numero partecipanti', 'Stato conferma'])
    expect(row[0]).toBe(ID)
    expect(row[1]).toBeInstanceOf(vm.runInContext('Date', ctx))
    expect(row.slice(2)).toEqual(['Maria Rossi', 'Sì', 2, 'Ricevuta'])
    expect(sheets.Partecipanti.rows).toEqual([
      ['ID conferma', 'Nome e cognome', 'Eventuali esigenze alimentari'],
      [ID, 'Maria Rossi', ''],
      [ID, 'Giuseppe Rossi', 'Senza lattosio'],
    ])
    expect(lock.released).toBe(1)
  })

  it('partecipazione negativa: solo la conferma, zero partecipanti', () => {
    expect(post({ id: ID, attending: false, guests: [{ name: 'Luca Bianchi' }] }).ok).toBe(true)
    expect(sheets.Conferme.rows[1].slice(2)).toEqual(['Luca Bianchi', 'No', 0, 'Ricevuta'])
    expect(sheets.Partecipanti.rows).toHaveLength(1)
  })

  it('lo stesso ID non viene scritto due volte', () => {
    post(yes([{ name: 'Maria Rossi' }]))
    expect(post(yes([{ name: 'Maria Rossi' }]))).toEqual({ ok: true, id: ID, duplicate: true })
    expect(sheets.Conferme.rows).toHaveLength(2)
    expect(sheets.Partecipanti.rows).toHaveLength(2)
    post(yes([{ name: 'Anna Verdi' }], { id: ID2 }))
    expect(sheets.Conferme.rows).toHaveLength(3)
  })

  it('neutralizza le formule nei campi che possono iniziare con + o -', () => {
    post(yes([{ name: 'Mario Rossi', dietary: '+SUM(A1)' }, { name: 'Anna Rossi', dietary: '-1' }]))
    expect(sheets.Partecipanti.rows[1][2]).toBe("'+SUM(A1)")
    expect(sheets.Partecipanti.rows[2][2]).toBe("'-1")
  })

  it('rifiuta formule, simboli e caratteri invisibili nei nomi; ripulisce i caratteri di controllo', () => {
    expect(post(yes([{ name: '=HYPERLINK("http://x") Rossi' }])).ok).toBe(false)
    expect(post(yes([{ name: '@Mario Rossi' }])).ok).toBe(false)
    expect(post(yes([{ name: 'Maria Rossi', dietary: '=IMPORTXML("http://x")' }])).ok).toBe(false)
    expect(sheets.Conferme).toBeUndefined()
    post(yes([{ name: 'Maria‮ Rossi​', dietary: 'No\u200Bci\u0000' }]))
    expect(sheets.Partecipanti.rows[1].slice(1)).toEqual(['Maria Rossi', 'Noci'])
  })
})

describe('Apps Script: autenticazione', () => {
  it('rifiuta firma errata, segreto diverso, firma assente o richiesta scaduta', () => {
    const ok = envelope(yes([{ name: 'Maria Rossi' }]))
    expect(raw({ ...ok, sig: ok.sig.replace(/^./, c => (c === 'a' ? 'b' : 'a')) })).toEqual({ ok: false, error: 'forbidden' })
    expect(post(yes([{ name: 'Maria Rossi' }]), { secret: 'altro-segreto-altrettanto-lungo-xx' })).toEqual({ ok: false, error: 'forbidden' })
    expect(raw({ payload: ok.payload, ts: ok.ts })).toEqual({ ok: false, error: 'forbidden' })
    expect(raw({ ...yes([{ name: 'Maria Rossi' }]), secret: SECRET })).toEqual({ ok: false, error: 'forbidden' })
    expect(post(yes([{ name: 'Maria Rossi' }]), { ts: Math.floor(Date.now() / 1000) - 600 })).toEqual({ ok: false, error: 'forbidden' })
    expect(sheets.Conferme).toBeUndefined()
  })

  it('una firma valida non vale per un contenuto modificato', () => {
    const ok = envelope(yes([{ name: 'Maria Rossi' }]))
    const tampered = { ...ok, payload: ok.payload.replace('Maria', 'Mario') }
    expect(raw(tampered)).toEqual({ ok: false, error: 'forbidden' })
  })

  it('senza un segreto robusto configurato non accetta nulla', () => {
    props.SHARED_SECRET = 'corto'
    expect(post(yes([{ name: 'Maria Rossi' }]), { secret: 'corto' })).toEqual({ ok: false, error: 'config' })
  })

  it('rifiuta payload malformati o eccessivi senza scrivere', () => {
    expect(post(yes([{ name: 'Maria' }])).ok).toBe(false)
    expect(post(yes(Array.from({ length: 9 }, () => ({ name: 'Ospite Rossi' })))).ok).toBe(false)
    expect(post({ ...yes([{ name: 'Maria Rossi' }]), id: '1; DROP' }).ok).toBe(false)
    expect(post(yes([[]])).ok).toBe(false)
    expect(post([]).ok).toBe(false)
    expect(JSON.parse(ctx.doPost({ postData: { contents: 'x'.repeat(20000) } }).text).ok).toBe(false)
    expect(JSON.parse(ctx.doPost({ postData: { contents: '{rotto' } }).text).ok).toBe(false)
    expect(JSON.parse(ctx.doPost({}).text).ok).toBe(false)
    expect(sheets.Conferme).toBeUndefined()
  })
})

describe('Apps Script: tetti e riservatezza', () => {
  it('non espone dati: nessun doGet e risposte senza dati di altri invitati', () => {
    expect(ctx.doGet).toBeUndefined()
    post(yes([{ name: 'Anna Verdi', dietary: 'Noci' }], { id: ID2 }))
    const res = post(yes([{ name: 'Maria Rossi' }]))
    expect(Object.keys(res).sort()).toEqual(['id', 'ok'])
    expect(JSON.stringify(res)).not.toMatch(/Anna|Noci/)
  })

  it('limita le scritture ravvicinate e il numero totale di conferme', () => {
    cache.set('writes', '60')
    expect(post(yes([{ name: 'Maria Rossi' }]))).toEqual({ ok: false, error: 'busy' })
    cache.clear()
    post(yes([{ name: 'Maria Rossi' }]))
    for (let i = 0; i < 299; i++) sheets.Conferme.rows.push([`riga-${i}`])
    expect(post(yes([{ name: 'Anna Verdi' }], { id: ID2 }))).toEqual({ ok: false, error: 'full' })
    // un reinvio di una conferma già registrata resta riconosciuto anche a foglio pieno
    expect(post(yes([{ name: 'Maria Rossi' }]))).toEqual({ ok: true, id: ID, duplicate: true })
  })

  it('rilascia il lock anche in caso di errore e risponde busy se occupato', () => {
    ctx.SpreadsheetApp.openById = () => { throw new Error('quota') }
    expect(post(yes([{ name: 'Maria Rossi' }]))).toEqual({ ok: false, error: 'server' })
    expect(lock.held).toBe(false)
    ctx.LockService.getScriptLock = () => ({ tryLock: () => false, releaseLock: () => {} })
    expect(post(yes([{ name: 'Maria Rossi' }]))).toEqual({ ok: false, error: 'busy' })
  })
})
