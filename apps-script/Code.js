/**
 * 60 di Carmela: ricezione conferme (Google Apps Script, runtime V8).
 *
 * Proprietà dello script (Impostazioni progetto > Proprietà script):
 *   SPREADSHEET_ID  ID del Google Sheet privato
 *   SHARED_SECRET   stesso valore del segreto APPS_SCRIPT_SECRET del Worker (almeno 32 caratteri)
 *
 * Il Worker non invia il segreto: firma (HMAC-SHA256) orario e contenuto. Richieste non firmate,
 * scadute (oltre 5 minuti) o alterate vengono rifiutate senza toccare il foglio.
 *
 * Pubblicazione: Distribuisci > Nuova distribuzione > App web,
 *   Esegui come: Me | Chi ha accesso: Chiunque.
 * Non esiste doGet: nessuna API di lettura pubblica.
 */

var MAX_GUESTS = 8
var MAX_NAME = 80
var MAX_DIETARY = 200
var SHEET_CONFERME = 'Conferme'
var SHEET_PARTECIPANTI = 'Partecipanti'
var HEAD_CONFERME = ['ID conferma', 'Data e ora invio', 'Nome referente', 'Partecipazione (Sì/No)', 'Numero partecipanti', 'Nomi partecipanti', 'Stato conferma']
var HEAD_PARTECIPANTI = ['ID conferma', 'Nome e cognome', 'Eventuali esigenze alimentari']
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
var NAME_RE = /^\p{L}[\p{L}\p{M} '’.-]*$/u
var DIETARY_RE = /^[\p{L}\p{M}\p{N} '’.,;:()/%+-]*$/u
var MIN_SECRET = 32
var MAX_SKEW_SECONDS = 300
// Tetti di sicurezza indipendenti dal Worker: oltre questi valori il foglio non accetta altre righe.
var MAX_CONFERME = 300
var MAX_WRITES = 60
var WRITES_WINDOW_SECONDS = 600

/**
 * PRIMA FUNZIONE DEL FILE, quindi selezionata di default accanto a "Esegui".
 * Da eseguire a mano una volta: controlla le proprietà e crea le schede Conferme e Partecipanti.
 */
function setup() {
  var props = PropertiesService.getScriptProperties()
  var id = props.getProperty('SPREADSHEET_ID')
  var secret = props.getProperty('SHARED_SECRET')
  if (!id) throw new Error('Manca la proprietà script SPREADSHEET_ID (Impostazioni progetto > Proprietà script).')
  if (!secret || secret.length < MIN_SECRET) throw new Error('SHARED_SECRET manca o è più corto di ' + MIN_SECRET + ' caratteri.')
  var ss = SpreadsheetApp.openById(id)
  sheet_(ss, SHEET_CONFERME, HEAD_CONFERME)
  sheet_(ss, SHEET_PARTECIPANTI, HEAD_PARTECIPANTI)
  Logger.log('Pronto: schede create nel foglio "' + ss.getName() + '".')
}

function doPost(e) {
  var result
  try {
    result = handle_(e)
  } catch (err) {
    result = { ok: false, error: 'server' }
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON)
}

function handle_(e) {
  var props = PropertiesService.getScriptProperties()
  var secret = props.getProperty('SHARED_SECRET')
  if (!secret || secret.length < MIN_SECRET) return { ok: false, error: 'config' }
  var raw = e && e.postData && e.postData.contents
  if (!raw || raw.length > 16384) return { ok: false, error: 'invalid' }

  var envelope
  try { envelope = JSON.parse(raw) } catch (err) { return { ok: false, error: 'invalid' } }
  if (!envelope || typeof envelope.payload !== 'string' || typeof envelope.sig !== 'string' || typeof envelope.ts !== 'number') {
    return { ok: false, error: 'forbidden' }
  }
  if (Math.abs(Date.now() / 1000 - envelope.ts) > MAX_SKEW_SECONDS) return { ok: false, error: 'forbidden' }
  if (!safeEqual_(hmacHex_(secret, envelope.ts + '.' + envelope.payload), envelope.sig)) return { ok: false, error: 'forbidden' }

  var body
  try { body = JSON.parse(envelope.payload) } catch (err) { return { ok: false, error: 'invalid' } }
  var data = body && typeof body === 'object' ? validate_(body) : null
  if (!data) return { ok: false, error: 'invalid' }

  var lock = LockService.getScriptLock()
  if (!lock.tryLock(15000)) return { ok: false, error: 'busy' }
  try {
    var ss = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'))
    var conferme = sheet_(ss, SHEET_CONFERME, HEAD_CONFERME)
    var partecipanti = sheet_(ss, SHEET_PARTECIPANTI, HEAD_PARTECIPANTI)

    // Idempotenza: lo stesso ID non viene mai scritto due volte.
    var found = conferme.getRange('A:A').createTextFinder(data.id).matchEntireCell(true).findNext()
    if (found) return { ok: true, id: data.id, duplicate: true }

    if (conferme.getLastRow() - 1 >= MAX_CONFERME) return { ok: false, error: 'full' }
    var cache = CacheService.getScriptCache()
    var writes = Number(cache.get('writes') || 0)
    if (writes >= MAX_WRITES) return { ok: false, error: 'busy' }

    var r = rows_(data, new Date())
    conferme.getRange(conferme.getLastRow() + 1, 1, 1, r.conferma.length).setValues([r.conferma])
    if (r.partecipanti.length) {
      partecipanti.getRange(partecipanti.getLastRow() + 1, 1, r.partecipanti.length, 3).setValues(r.partecipanti)
    }
    SpreadsheetApp.flush()
    cache.put('writes', String(writes + 1), WRITES_WINDOW_SECONDS)
    return { ok: true, id: data.id }
  } finally {
    lock.releaseLock()
  }
}

function hmacHex_(key, message) {
  return Utilities.computeHmacSha256Signature(message, key, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2) })
    .join('')
}

// Confronto a tempo costante: non rivela quanti caratteri della firma sono corretti.
function safeEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  var diff = 0
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Rimuove caratteri di controllo e invisibili prima di ogni altro controllo.
function clean_(s) {
  return String(s == null ? '' : s).normalize('NFC').replace(/[\p{Cf}\p{Co}\p{Cn}]/gu, '').replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim()
}

// Impedisce che un testo venga interpretato come formula (=, +, -, @, tab, a capo).
function safe_(s) {
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s
}

function validate_(b) {
  if (typeof b.id !== 'string' || !UUID_RE.test(b.id)) return null
  if (typeof b.attending !== 'boolean' || !Array.isArray(b.guests)) return null
  if (b.guests.some(function (g) { return !g || typeof g !== 'object' || Array.isArray(g) })) return null
  var max = b.attending ? MAX_GUESTS : 1
  if (b.guests.length < 1 || b.guests.length > max) return null
  var guests = []
  for (var i = 0; i < b.guests.length; i++) {
    var g = b.guests[i]
    if (!g || typeof g.name !== 'string') return null
    if (g.dietary != null && typeof g.dietary !== 'string') return null
    var name = clean_(g.name)
    var dietary = b.attending ? clean_(g.dietary) : ''
    if (name.length < 3 || name.length > MAX_NAME || !NAME_RE.test(name) || !/\p{L}.*\s.*\p{L}/u.test(name)) return null
    if (dietary.length > MAX_DIETARY || !DIETARY_RE.test(dietary)) return null
    guests.push({ name: name, dietary: dietary })
  }
  return { id: b.id, attending: b.attending, guests: guests }
}

function rows_(data, now) {
  return {
    conferma: [
      data.id,
      now,
      safe_(data.guests[0].name),
      data.attending ? 'Sì' : 'No',
      data.attending ? data.guests.length : 0,
      // Tutto il gruppo in una cella, per leggerlo senza aprire la scheda Partecipanti.
      data.attending ? safe_(data.guests.map(function (g) { return g.name }).join(', ')) : '',
      'Ricevuta',
    ],
    partecipanti: data.attending
      ? data.guests.map(function (g) { return [data.id, safe_(g.name), safe_(g.dietary)] })
      : [],
  }
}

function sheet_(ss, name, head) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name)
  // Crea o aggiorna le intestazioni (es. dopo l'aggiunta di una colonna). Le righe esistenti non vengono spostate.
  var current = sh.getRange(1, 1, 1, head.length).getValues()[0]
  if (current.join('|') !== head.join('|')) {
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold')
    sh.setFrozenRows(1)
    if (name === SHEET_CONFERME) {
      sh.getRange('B:B').setNumberFormat('dd/MM/yyyy HH:mm:ss')
      sh.getRange('C:C').setNumberFormat('@')
      sh.getRange('F:F').setNumberFormat('@')
    } else {
      sh.getRange('B:C').setNumberFormat('@')
    }
  }
  return sh
}

/** Da eseguire a mano a fine evento: cancella tutte le conferme lasciando le intestazioni. */
function cancellaTutteLeConferme() {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'))
  ;[SHEET_CONFERME, SHEET_PARTECIPANTI].forEach(function (n) {
    var sh = ss.getSheetByName(n)
    if (sh && sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1)
  })
}
