# Studio AI

PWA statica in italiano per trasformare appunti in flashcard, schemi, riassunti e testi su misura con Gemini. Puoi incollare appunti o caricare file di testo, PDF, immagini e audio. Gli audio e le immagini sono inviati a Gemini insieme all’istruzione di trascrivere/leggere il contenuto prima di elaborarlo.

## Avvio locale

Apri questa cartella in un server statico locale (serve HTTP/HTTPS per la PWA e il service worker). Per esempio, con Python:

```bash
python -m http.server 8000
```

Poi visita `http://localhost:8000`. La prima volta inserisci una Gemini API key ottenuta da [Google AI Studio](https://aistudio.google.com/apikey). La chiave è salvata solo nel browser; scegli la casella per ricordarla in modo persistente oppure tienila solo per la sessione. Non aggiungerla mai ai file o al repository.

## Pubblicare su GitHub Pages

1. Carica tutti i file di questa cartella nella root del repository GitHub.
2. In **Settings → Pages**, imposta la pubblicazione dal branch desiderato e dalla cartella `/ (root)`.
3. Apri l’URL Pages. La PWA richiede HTTPS, già fornito da GitHub Pages.

Non serve compilazione, secret in Actions o server backend: le richieste Gemini partono dal browser dell’utente. La chiave non è però protetta da abuso nell’ambiente client; usa una chiave personale, applica restrizioni disponibili nel pannello Google e non condividere il browser/profilo dove viene memorizzata. La cache offline conserva solo i file dell’app, mai i contenuti generati o la chiave.

Modello predefinito: `gemini-3.1-flash-lite` (modificabile in `app.js`). Le richieste richiedono una connessione internet. Dimensione massima per file: 20 MB.
