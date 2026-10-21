# D&D fight simulator

Simulatore di duelli per D&D 5e: **Paladino della Vendetta (Firbolg)** contro **Chierico della Tomba (Halfling)**, livello 5 di default. Combatte il duello migliaia di volte e mostra le medie.

## Uso

Apri `duello_dnd.html` in un browser (doppio clic, funziona anche offline). Non serve installare nulla.

- Statistiche, armi e strategie di entrambi i personaggi sono modificabili.
- Le armi hanno incantamento (+N) e danni aggiuntivi (fuoco, freddo, radioso, solo critico, una volta per turno, ...).
- La Punizione Divina ha politiche di scelta dello slot (intelligente, più basso, più alto, solo critici, riserva di slot, soglia sui PF del chierico).
- «Simula» fa da 1 a 500.000 duelli, «Un solo duello» mostra la cronaca round per round, «Confronta strategie» cambia una sola impostazione alla volta.

## Struttura

| Percorso | Contenuto |
|---|---|
| `duello_dnd.html` | Pagina unica pronta all'uso (generata) |
| `src/engine.js` | Motore di simulazione |
| `src/template.html` | Interfaccia grafica |
| `build.py` | Unisce template e motore in `duello_dnd.html` |
| `tests/` | Prove da riga di comando con Node (`node tests/test_smoke.js`) |

Dopo aver modificato `src/`, esegui `python3 build.py` per rigenerare la pagina.

## Regole modellate

Combattimento 1 contro 1 fino a 0 PF, il chierico resta fermo. Non modellati: dimezzamento della velocità dentro Spirito Guardiano, riposi, talenti, Raggio Indebolente, Sanctuary. L'Aura di Protezione arriva al livello 6.
