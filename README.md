# 🔭 CosmoPilot - PWA Mobile-First per Telescopio Dobson Motorizzato

**CosmoPilot** è una Progressive Web App (PWA) mobile-first di livello professionale progettata per il controllo completo di un telescopio Dobson motorizzato altazimutale basato su microcontrollore **ESP32**.

L'applicazione rispecchia in modo rigoroso e speculare le specifiche del **Manuale Utente Ufficiale** (`CosmoPilot_Mobile_App_User_Manual.pdf`) e comunica via **Web Bluetooth (BLE)** direttamente con il firmware open-source della scheda ESP32 ([CosmoPilot_Firmware](https://github.com/CosmoPilotProject/CosmoPilot_Firmware)).

---

## 🚀 Caratteristiche Architetturali & Tecniche

### 1. Connettività Web Bluetooth (BLE) & Simulatore Hardware
- **Servizi GATT**: Servizio primario `0x00FF` (128-bit `000000ff-0000-1000-8000-00805f9b34fb` e `b2e27f67-ffe7-4763-88a8-cc2b2133010e`), caratteristica Read/Write/Notify `0xFF01` (`0000ff01-0000-1000-8000-00805f9b34fb`).
- **Protocollo Testuale e Binario**: Decodifica del byte di stato binario tag `'S'` (bit 0 tracking, bit 1 aligned, bit 2-4 sync location/date/time), stringhe `RADEC`, `READY`, `BUSY`, `SHOW_SETTINGS`, `SOLAR_OBJ_STATUS`.
- **Simulatore Hardware Integrato**: Consente il test completo di tutte le funzioni dell'app (GoTo, tracking, allineamento a 1/2 stelle, calibrazione direzioni e joystick) anche su desktop o senza la scheda fisica collegata.

### 2. UI/UX Astronomica & Personalizzazione
- **7 Temi Spaziali Predefiniti**: *Gold nebula* (default), *Lunar horizon*, *Aurora veil*, *Midnight blue*, *Silent rings*, *Original*, *Stellar dust*, con anteprima a schermo intero e importazione di immagini personalizzate (fino a 5 MB).
- **Night Mode (Modalità Notturna)**: Filtro rosso regolabile su 5 livelli di intensità per preservare l'adattamento al buio, con nascondimento automatico delle barre di sistema.
- **Barra di Stato a 3 Segmenti**: Riempimento progressivo da sinistra a destra (Bluetooth ➔ Sincronizzazione Data/Ora/GPS ➔ Allineamento Stelle).
- **Blocco Controlli Gestuale**: Swipe verso l'alto sull'icona centrale del lucchetto per bloccare o sbloccare il joystick virtuale contro tocchi accidentali.
- **Multilingua (i18n)**: Italiano, Inglese, Spagnolo, Francese, Portoghese.

---

## 🌌 Struttura dei Menu e Schermate (Conforme al Manuale)

### 1. GoTo
- **Cataloghi Celesti**:
  - *Messier* (M1–M110 completo).
  - *Stelle* (Principali stelle di riferimento e calibrazione).
  - *Galassie* & *Nebulose* (NGC e oggetti deep-sky notevoli).
  - *Sistema Solare* (con controllo di visibilità dedicato e avvisi per filtro solare).
  - *Personalizzati* (fino a 200 oggetti con coordinate RA/DEC salvati in memoria locale).
- **Filtri di Visibilità & Pianificazione**: Filtro magnitudine massima, filtro "Solo oggetti visibili" (soglia ~10° altitudine), slider orario a intervalli di 30 minuti e selezione posizione (GPS, coordinate o 5 segnalibri salvati).
- **Manual RA/DEC**: Inserimento manuale a 6 campi (RA in ore/min/sec, DEC in gradi/min/sec con gestione dei segni).
- **Random Target**: Suggerimento istantaneo di un bersaglio visibile con tasto "Next Object" e "Send to Telescope".
- **Observing Tours**: Pianificatore in 3 step (data, ora inizio, durata 30m-6h, selezione fino a 30 oggetti con valutazione visibilità, riordino e salvataggio fino a 10 tour) e modalità di osservazione guidata con card e scorciatoie joystick.
- **Object Identification Game**: Gioco del cielo in cui il telescopio punta un bersaglio casuale e l'utente seleziona il nome tra 3 opzioni, con punteggio iniziale a 50, streak bonus, aiuti 50/50 (5 usi), visualizzazione magnitudine e tasto salta (3 usi).

### 2. Calib (Calibrazione e Allineamento)
- **Auto Sync**: Sincronizzazione istantanea con un tap di data, ora (UTC) e coordinate GPS dello smartphone.
- **Calendario Manuale**: Inserimento manuale di data/ora UTC e coordinate.
- **1-Star Align**: Procedura guidata di allineamento su una stella di riferimento (mag ≤ 4.0), scelta del metodo di movimento (Scope joystick o App) e conferma centraggio.
- **2-Star Align**: Allineamento sequenziale in due step con puntamento automatico verso la seconda stella e fine-tuning per azzerare l'errore di cono e azimut.

### 3. Free (Movimento Manuale)
- **App Joystick**: Pad virtuale a 8 direzioni, slider velocità motori (1-10), switch di inversione assi (`Invert U/D`, `Invert R/L`), avvio/arresto tracking siderale, assistente a spirale `SkyBox Assist` e visualizzazione telemetria RA/DEC.
- **Analog Joystick**: Schermata dedicata per il controllo tramite levetta analogica fisica collegata alla scheda.
- **Hand Move**: Rilascio elettronico dei motori passo-passo (`Press to Disable` / `Press to Enable`) per muovere il tubo a mano, con esplicito avviso di invalidazione dell'allineamento.

### 4. Config (Impostazioni & Calibrazioni Hardware)
- **Bluetooth Setup**: Scansione, rilevamento, connessione, disconnessione e auto-riconnessione.
- **Calibrazioni Telescopio**:
  - *Gear Ratios*: Rapporti di riduzione per gli assi AZ e ALT (1.0 - 100.0, estendibile fino a 200).
  - *Direction Setup*: Wizard guidato di verifica dei movimenti (+5° in UP e +20° in RIGHT con conferma Yes/No).
  - *Gear Ratio Check*: Test di verifica con cronometro e stima del rapporto (±5%).
  - *Backlash*: Compensazione del gioco meccanico in arcosecondi (0 - 4000 arcsec).
  - *Joystick Calib*: Calibrazione della posizione di riposo (idle) ed escursione massima (10s).
  - *Factory Reset*: Ripristino di fabbrica con pressione prolungata di 3 secondi.
- **Altre Impostazioni Controller**: Selezione selettiva a spunte per aggiornare intervallo refresh tracking (0.2s - 25s), parametri SkyBox (sensibilità e velocità), velocità massima (2.5°/s - 7.0°/s), display OLED e modalità standalone.
- **Parametri Salavati**: Lettura in tempo reale dei dati memorizzati nella flash dell'ESP32.
- **Preferenze App**: Lingua, sfondi, modalità notturna, avviso popup arresto GoTo e blocco gesture.

### 5. About
- Checklist notturna in 6 passaggi.
- Guida alla risoluzione dei problemi sul campo.
- Avviso di sicurezza per osservazione solare.
- Crediti di progetto.

---

## 📲 Installazione e Avvio PWA

### Requisito di Sicurezza HTTPS per Web Bluetooth
I browser moderni (Google Chrome su Android/PC, Bluefy / WebBLE su iOS) richiedono una connessione **HTTPS** (o `localhost`) per abilitare le API Web Bluetooth.

### Test Locale su PC
Per avviare il server di sviluppo locale:
```powershell
.\server.ps1
```
Apri nel browser:
`http://localhost:8080`

### Accesso da Smartphone in Campo
1. **GitHub Pages / Vercel / Netlify**: Carica la cartella `StarWay` sul tuo hosting statico preferito con certificato SSL HTTPS gratuito.
2. **Tunnel HTTPS (ngrok o cloudflared)**:
   ```bash
   npx cloudflared tunnel --url http://localhost:8080
   ```
   Apri l'indirizzo HTTPS generato su Safari (iOS con browser abilitato WebBLE come Bluefy) o Chrome (Android).
3. **Installa come App Nativa**: Dal menu del browser seleziona **"Aggiungi a schermata Home"**. L'app funzionerà a schermo intero senza barre del browser e sarà disponibile al 100% offline grazie al Service Worker integrato.
