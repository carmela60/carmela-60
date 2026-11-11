# 60 di Carmela

Invito digitale per il 60° compleanno di Carmela: domenica 3 gennaio 2027, ore 13:00, Villa Sirena, Durazzano (BN).

Sito statico React su GitHub Pages. Le conferme di partecipazione arrivano in un Google Sheet privato passando da un piccolo Cloudflare Worker e da un Google Apps Script.

```
Browser invitato ──HTTPS──▶ Cloudflare Worker ──HTTPS + firma HMAC──▶ Apps Script ──▶ Google Sheet privato
(GitHub Pages, CSP)         (Turnstile anti-bot, rate limit,        (verifica firma, validazione,
                             CORS, validazione, nessun log)          tetti, lock, idempotenza)
```

Le misure di sicurezza sono descritte in [Sicurezza](#sicurezza).

## Struttura

| Percorso | Contenuto |
| --- | --- |
| `src/config/event.js` | **Tutti i dati dell'evento** (data, luogo, testi, massimo persone) |
| `src/components/` | Hero con parallax, countdown, wizard RSVP, finestra calendario |
| `src/lib/` | Date e fuso orario, file `.ics`, link Maps e Google Calendar, validazione e invio RSVP |
| `public/fiori/` | Livelli floreali trasparenti (WebP) ricavati dall'invito originale |
| `worker/` | Cloudflare Worker (proxy RSVP) |
| `apps-script/` | Codice Apps Script da incollare nell'editor di Google |
| `tools/` | Script Python usati per ricavare fiori, anteprima social e favicon |
| `.env.example` | Modello dei valori pubblici del frontend. Il vero `.env` resta solo sul tuo computer (escluso da Git); in produzione i valori arrivano dalle Variables di GitHub |
| `.npmrc` | Script di installazione npm disattivati, versioni esatte |

## Sviluppo locale

Serve Node.js 20 o superiore.

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

Il file `60-di-carmela.ics` viene generato automaticamente dalla configurazione, sia in sviluppo sia nella build.

## Configurazione dell'evento

Modifica solo `src/config/event.js`:

- `durationMinutes`: oggi `null` perché la durata non è definita. Il calendario riceve solo l'inizio (nessuna fine inventata). Quando sarà nota, inserisci i minuti (es. `300`).
- `maxGuests`: massimo di persone per conferma (8). Se lo cambi, aggiorna anche `MAX_GUESTS` in `apps-script/Code.js` e in `worker/wrangler.toml`.
- `mapsPlaceId`: facoltativo, vedi [Indicazioni stradali](#indicazioni-stradali).

## Messa in funzione delle conferme

Servono: un account Google, un account Cloudflare gratuito, un account GitHub.

### 0. Proteggere gli account

Il punto debole più probabile non è il codice ma gli account. Prima di iniziare:

1. Attiva la **verifica in due passaggi** su Google, Cloudflare e GitHub (meglio con app di autenticazione o chiave di sicurezza che con SMS).
2. Consigliato: crea un **account Google dedicato** solo a questa festa. Lo script gira con i permessi di quell'account: se mai qualcosa andasse storto, non avrebbe accesso ad altri tuoi documenti.
3. Non condividere con nessuno segreti, URL dell'Apps Script e accesso a Cloudflare.

### 1. Creare il foglio nel proprio Google Drive

1. Apri [sheets.new](https://sheets.new) con il tuo account.
2. Rinominalo `60 di Carmela - Conferme partecipazione`.
3. In **File > Impostazioni** imposta il fuso orario su `(GMT+01:00) Roma`.
4. Copia l'ID dall'indirizzo: è la parte tra `/d/` e `/edit` in `https://docs.google.com/spreadsheets/d/QUESTO-È-L-ID/edit`.
5. Non condividerlo: il pulsante **Condividi** deve indicare "Con restrizioni" e solo il tuo account.

Le schede `Conferme` e `Partecipanti` vengono create dallo script.

### 2. Creare e autorizzare l'Apps Script

1. Nel foglio: **Estensioni > Apps Script**.
2. Sostituisci il contenuto di `Codice.gs` con quello di `apps-script/Code.js`.
3. Facoltativo ma consigliato: **Impostazioni progetto > Mostra il file manifest "appsscript.json"** e incolla `apps-script/appsscript.json`.
4. **Impostazioni progetto > Proprietà script**, aggiungi:
   - `SPREADSHEET_ID` = ID copiato al punto 1
   - `SHARED_SECRET` = una stringa casuale di almeno 32 caratteri (sotto questa soglia lo script rifiuta tutto). Per generarla:

     ```bash
     openssl rand -hex 32
     ```

5. Nell'editor seleziona la funzione `setup` ed esegui **Esegui**. Google chiede l'autorizzazione: accetta con il tuo account (l'avviso "app non verificata" è normale per uno script personale: **Avanzate > Vai a ...**). Nel foglio compaiono le due schede con le intestazioni.

### 3. Pubblicare la Web App

1. **Esegui il deployment > Nuovo deployment > Tipo: App web**.
2. **Esegui come: Me**. **Chi ha accesso: Chiunque**.
   "Chiunque" serve perché il Worker non ha un account Google. Lo script accetta solo richieste firmate dal Worker con il segreto (che non viaggia mai in rete) e scadute da meno di 5 minuti; non esiste alcuna funzione di lettura.
3. Copia l'**URL dell'app web** (termina con `/exec`). Resta privato: va solo nei segreti del Worker, mai nel sito.

Se modifichi il codice in seguito: **Gestisci deployment > Modifica > Versione: Nuova versione**, così l'URL non cambia.

### 4. Creare il controllo anti-bot (Cloudflare Turnstile)

1. Nella dashboard Cloudflare: **Turnstile > Add widget**.
2. Nome: `60 di Carmela`. **Hostname**: solo il dominio del sito, per esempio `tuo-utente.github.io`.
3. **Widget mode: Managed**. Per quasi tutti gli invitati il controllo è invisibile; raramente compare una casella da toccare.
4. Copia la **Site Key** (pubblica, va nelle Variables di GitHub al passo 6) e la **Secret Key** (segreta, va solo nel Worker al passo successivo).

### 5. Configurare il Cloudflare Worker

```bash
cd worker
```

```bash
npx wrangler login
```

1. In `worker/wrangler.toml` imposta `ALLOWED_ORIGINS` con l'origine del sito, senza percorso e senza barra finale, per esempio `https://tuo-utente.github.io`. In produzione non aggiungere indirizzi `localhost`.
2. Salva i segreti (incolla i valori quando richiesto):

   ```bash
   npx wrangler secret put APPS_SCRIPT_URL
   ```

   ```bash
   npx wrangler secret put APPS_SCRIPT_SECRET
   ```

   ```bash
   npx wrangler secret put TURNSTILE_SECRET
   ```

   `APPS_SCRIPT_SECRET` è lo stesso valore di `SHARED_SECRET`; `TURNSTILE_SECRET` è la Secret Key del passo 4. Se manca uno dei tre segreti, l'URL non è un indirizzo Apps Script valido o il segreto è troppo corto, il Worker rifiuta ogni invio.
3. Pubblica:

   ```bash
   npx wrangler deploy
   ```

   Wrangler mostra l'indirizzo del Worker, per esempio `https://carmela-60-rsvp.tuo-sottodominio.workers.dev`.

Il rate limit (5 invii al minuto per IP) usa il binding gratuito `ratelimits`. Se Wrangler segnala un conflitto su `namespace_id`, sostituisci `1060` con un altro numero intero.

### 6. Inserire gli indirizzi su GitHub

I valori del frontend non stanno in nessun file del repository. Su GitHub, nel repository: **Settings > Secrets and variables > Actions > scheda Variables > New repository variable**, una per riga:

| Name | Value |
| --- | --- |
| `VITE_SITE_URL` | `https://tuo-utente.github.io/carmela-60` |
| `VITE_RSVP_API_URL` | `https://carmela-60-rsvp.tuo-sottodominio.workers.dev` |
| `VITE_TURNSTILE_SITE_KEY` | la Site Key del passo 4 |
| `VITE_ROBOTS` | `noindex, nofollow` (facoltativa, è il valore predefinito) |

`VITE_SITE_URL` serve all'anteprima di WhatsApp, che richiede indirizzi assoluti. La build si blocca se una variabile manca, è un segnaposto o è la chiave Turnstile di prova. Per lavorare in locale, metti gli stessi valori nel tuo `.env` (escluso da Git).

### 7. Pubblicare su GitHub Pages

1. Crea il repository e carica il progetto sul ramo `main`.
2. Su GitHub: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
3. Nella stessa pagina attiva **Enforce HTTPS**.
4. Ogni push su `main` esegue controllo vulnerabilità, test e build, poi pubblica `dist/` (workflow in `.github/workflows/deploy.yml`).

Il sito usa percorsi relativi: funziona sia su `https://utente.github.io/nome-repo/` sia su un dominio personalizzato.

### 8. Invio di prova

Dal sito pubblicato, compila il wizard con un nome di prova (es. "Prova Prova") e invia: deve comparire "Grazie! La tua conferma è stata ricevuta." e la riga nel foglio.

### 9. Verificare le righe

- Scheda **Conferme**: una riga per invio con ID, data e ora, referente, Sì/No, numero di partecipanti, nomi di tutto il gruppo, stato "Ricevuta".
- Scheda **Partecipanti**: una riga per persona, collegata alla conferma tramite **ID conferma**.
- Il totale degli invitati è la somma della colonna "Numero partecipanti" (oppure il numero di righe in Partecipanti).

Elimina poi le righe di prova.

### 10. Verificare le difese

1. Apri il link del foglio in una finestra in incognito: deve chiedere l'accesso.
2. Apri l'URL `/exec` dell'Apps Script nel browser: deve mostrare un errore (non esiste `doGet`), mai dati.
3. Controlla che in **Condividi** non ci siano altre persone o link pubblici.
4. Un invio senza controllo anti-bot deve essere respinto (sostituisci URL e origine):

   ```bash
   curl -s -X POST "https://carmela-60-rsvp.tuo-sottodominio.workers.dev" -H "Origin: https://tuo-utente.github.io" -H "Content-Type: application/json" -d '{"id":"00000000-0000-4000-8000-000000000001","attending":false,"guests":[{"name":"Prova Prova"}]}'
   ```

   Risposta attesa: `{"ok":false,"error":"verify"}`. Da un'origine diversa la risposta è `{"ok":false,"error":"origin"}`.

## Sicurezza

Ogni livello controlla di nuovo i dati, senza fidarsi del precedente.

**Sito (GitHub Pages)**
- Content Security Policy restrittiva: script solo dal sito stesso e da Turnstile, connessioni solo verso il Worker, nessuno stile o script inline, nessun form esterno, nessun `<base>`.
- Nessun segreto nel codice e nessun file `.env` nel repository: i valori pubblici del frontend arrivano dalle Variables di GitHub Actions.
- Nessun dato salvato nel browser, negli URL o in strumenti di statistica; nessuna mappa sorgente pubblicata.
- Non viene mostrato dentro iframe di altri siti (clickjacking); referrer limitato all'origine.
- Testo inserito dagli utenti sempre trattato come testo (React non interpreta HTML).

**Worker (Cloudflare)**
- Accetta solo `POST` su `/`, JSON, dall'origine del sito; corpo massimo 8 KB letto a blocchi (anche senza `Content-Length`), UTF-8 valido.
- Rate limit per IP (5 al minuto), campo esca per i bot, verifica **Turnstile** con controllo di azione e dominio.
- Validazione completa: nomi solo con lettere, apostrofi e trattini; esigenze alimentari con punteggiatura semplice; caratteri invisibili o di controllo eliminati.
- Inoltro firmato con **HMAC-SHA256** e orario: il segreto non viaggia mai; redirect seguiti solo verso `script.googleusercontent.com`; timeout su ogni chiamata.
- Rifiuta di funzionare se la configurazione è incompleta o debole; nessun log dei contenuti; nessun URL di anteprima aggiuntivo.

**Apps Script e foglio**
- Verifica firma a tempo costante e scadenza di 5 minuti; ripete tutta la validazione.
- Tetti indipendenti: massimo 60 scritture ogni 10 minuti e 300 conferme in totale.
- Lock contro scritture simultanee, idempotenza sull'ID, celle di testo con prefisso anti-formula.
- Nessuna funzione di lettura; risposte con il solo esito, mai dati di altri invitati.

**Catena di fornitura**
- Versioni npm esatte con `package-lock.json`, script di installazione disattivati (`.npmrc`), `npm audit` a ogni pubblicazione.
- GitHub Actions fissate a commit precisi, permessi minimi per ogni job, credenziali non conservate dopo il checkout.

**Cosa resta fuori dal controllo del codice**
- Chi ha il link può confermare a nome di qualcun altro: senza login per gli invitati non si può evitare. Le righe sospette si riconoscono e si cancellano dal foglio.
- La sicurezza degli account Google, Cloudflare e GitHub dipende dalla verifica in due passaggi (passo 0).
- La disponibilità dipende da GitHub, Cloudflare e Google.

**Se un segreto finisce dove non deve**
1. Genera un nuovo segreto con `openssl rand -hex 32`.
2. Aggiornalo in **Proprietà script** (`SHARED_SECRET`) e nel Worker (`npx wrangler secret put APPS_SCRIPT_SECRET`).
3. Per la chiave Turnstile: **Turnstile > widget > Rotate secret key**, poi `npx wrangler secret put TURNSTILE_SECRET`.
4. Controlla il foglio e cancella eventuali righe anomale.

## Calendario

- **iPhone/iPad**: "Scarica l'evento" apre il file `.ics` direttamente nel Calendario, con il promemoria 15 giorni prima (19 dicembre 2026, ore 13:00).
- **Android**: il file viene scaricato e si apre con l'app Calendario (Samsung e la maggior parte dei calendari lo importano). In alternativa c'è il link Google Calendar: precompila l'evento ma **non può impostare il promemoria**, quindi il sito chiede di aggiungerlo a mano.
- **Computer**: il file si apre con Apple Calendar, Outlook e simili.

Il sito non dichiara mai che il promemoria è attivo: invita a controllarlo prima di salvare.

## Indicazioni stradali

"Ricevi indicazioni" apre Google Maps in modalità indicazioni verso `Villa Sirena, Viale Sant'Alfonso 30, 82015 Durazzano BN, Italia`, senza API key, nell'app se installata o nel browser.

Per una destinazione ancora più precisa puoi aggiungere il Place ID: cerca "Villa Sirena Durazzano" nel [Place ID Finder di Google](https://developers.google.com/maps/documentation/places/web-service/place-id#find-id), verifica che sia la struttura giusta e copia l'ID in `mapsPlaceId`. Prima della pubblicazione apri il link da un telefono e controlla che la destinazione sia corretta.

## Privacy

Il sito non mostra un'informativa né chiede consensi: le conferme sono raccolte da una persona per la festa di famiglia con i propri amici, un'attività personale che rientra nell'esenzione domestica del GDPR (art. 2, par. 2, lett. c), esattamente come chiedere le stesse cose su WhatsApp. Se a raccogliere i dati fosse un soggetto professionale (organizzatore di eventi, struttura, azienda) andrebbero aggiunti informativa e consenso per le esigenze alimentari.

Restano comunque, per riguardo verso gli invitati:

- una riga nel wizard che spiega che le esigenze alimentari servono solo per il menù e verranno cancellate dopo la festa;
- solo i dati necessari: risposta, nome e cognome e, se indicate, esigenze alimentari;
- nessun dato salvato nel browser, negli URL o in strumenti di statistica;
- nessun log del contenuto delle richieste nel Worker;
- foglio Google privato, senza API di lettura.

**Cancellazione**: dopo la festa esegui `cancellaTutteLeConferme` dall'editor Apps Script (svuota entrambe le schede) oppure elimina il foglio, poi disattiva il deployment e il Worker (`npx wrangler delete`).

## Test

`npm test` copre: data e fuso Europe/Rome, countdown senza valori negativi, data del promemoria (19 dicembre 2026), validità del file `.ics` (CRLF, righe da 75 ottetti, escaping, UTF-8, VALARM `-P15D`), riconoscimento iOS/Android/computer, wizard con una o più persone, risposta negativa, validazione dei nomi, errori di rete con nuovo tentativo sullo stesso ID, successo solo dopo risposta verificata, controllo anti-bot fallito, Worker (CORS, tipo e dimensione del corpo, Turnstile, firma HMAC, redirect, rate limit, configurazione debole, assenza di log) e Apps Script eseguito in una sandbox (firma e scadenza, righe, caratteri invisibili, formule, duplicati, tetti, lock, nessuna lettura pubblica).

Non è testabile in automatico l'import reale del file nei calendari dei telefoni: provalo una volta su un iPhone e un Android prima di inviare il link.

## Asset grafici

I fiori sono livelli trasparenti ricavati dall'invito originale (`tools/extract_fiori.py`): ghirlanda superiore, bordo inferiore e, sopra, le singole rose Wollerton e il bocciolo, che si muovono di pochi pixel per creare profondità. Con file originali a livelli basta sostituire i WebP in `public/fiori/` mantenendo nomi e dimensioni.

Rigenerazione (richiede Python con Pillow, NumPy e SciPy):

```bash
python tools/extract_fiori.py invito.webp public/fiori
```

```bash
python tools/og_image.py invito.webp public/fiori public
```

## Limiti noti

- Apps Script ha quote giornaliere ampiamente sufficienti per un evento privato, ma una risposta può richiedere 1 o 2 secondi.
- Se una conferma è stata salvata ma la risposta si è persa, il nuovo tentativo con lo stesso ID non crea duplicati. Se però l'invitato modifica i dati prima di riprovare, viene generato un nuovo ID e potrebbe comparire una seconda riga: in quel caso vale la più recente.
- Chi apre il sito con "Riduci movimento" attivo vede solo dissolvenze, senza parallax.
