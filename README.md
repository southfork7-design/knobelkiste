# Knobelkiste

Logikrätsel-App fürs Handy (PWA): offline, ohne Werbung, unendlich viele generierte Level.

## Spiele
| Spiel | Status |
|---|---|
| Pfeilwerk (Pfeile abbauen, 2D) | spielbar |
| Pfeilwürfel (Pfeile auf Würfeln/Quadern, drehbar) | spielbar |
| Kronenfeld (eine Krone pro Zeile/Spalte/Region) | spielbar |
| Gleisbau – Einzelfeld (7×7 bis 10×10) und Großstrecke (2/4/6 verbundene Felder, am Ende Gesamtkarte) | spielbar |
| Bilderrätsel (Nonogramm, 5×5 bis 15×15; eigene Motive + erzeugte Muster) | spielbar |
| Schraubwerk (Schrauben umsetzen, Teile pendeln und fallen; Löser prüft jedes Level) | spielbar |
| Farbräumer (Figuren in Farb-Behälter räumen, Ablage, Tore mit nachrückenden Figuren) | spielbar |

## Grundsätze (für alle Spiele)
- Keine Werbung, keine Musik, keine motivierenden Ausrufe oder Lobtexte. Texte bleiben nüchtern („Gelöst“, Zeit, Fehler).
- Nur sehr dezente, kurze Geräusche zu Aktionen (`js/ui/sound.js`: whoosh, click, tick, bump, solved). Im Menü abschaltbar.
- Jedes Level ist garantiert lösbar; Logikrätsel haben genau eine Lösung, die ohne Raten erreichbar ist.

## Struktur
- `index.html`, `css/style.css`, `js/app.js` – App-Rahmen, Menü, Spielstand
- `js/ui/shell.js` – gemeinsame Kopfleiste, Leben, Tipp-Knopf, Sieg-/Niederlage-Dialog
- `js/games/<spiel>/generator.js` – erzeugt garantiert lösbare Level (ohne Browser testbar)
- `js/games/<spiel>/game.js` – Darstellung und Bedienung
- `js/games/screws/model.js` – Spielregeln/Geometrie von Schraubwerk (auch vom Löser genutzt)
- `js/games/nonogram/motifs.js` – eigene Pixel-Motive (werden nur genutzt, wenn rein logisch lösbar)
- `js/games/tracks/worker.js` + `gen-client.js` – Gleisbau-Rätsel werden im Hintergrund erzeugt (nächstes Feld/Level schon vorab)
- `sw.js` – Offline-Cache (bei Änderungen `VERSION` hochzählen)
- `tools/test-*.js` – prüfen Level auf Lösbarkeit bzw. Eindeutigkeit (`node tools/test-crowns.js` usw.)
- `tools/make-icons.js` – erzeugt die PNG-Symbole

## Testzugang
Mit `?debug` in der Adresse stellen Pfeilwürfel und Gleisbau `window.__game` zum automatischen Durchspielen bereit.

## Spiele einzeln testen
Direkt-Links (lokal mit `python -m http.server 8123`):

| Spiel | Ordner | Link |
|---|---|---|
| Pfeilwerk | `js/games/arrows/` | http://localhost:8123/?spiel=arrows |
| Pfeilwürfel | `js/games/arrows3d/` | http://localhost:8123/?spiel=arrows3d |
| Kronenfeld | `js/games/crowns/` | http://localhost:8123/?spiel=crowns |
| Gleisbau – Einzelfeld | `js/games/tracks/` | http://localhost:8123/?spiel=tracks |
| Gleisbau – Großstrecke | `js/games/tracks/` | http://localhost:8123/?spiel=tracksRoute |
| Bilderrätsel | `js/games/nonogram/` | http://localhost:8123/?spiel=nonogram |
| Schraubwerk | `js/games/screws/` | http://localhost:8123/?spiel=screws |
| Farbräumer | `js/games/colors/` | http://localhost:8123/?spiel=colors |

Mit `&level=12` startet ein bestimmtes Level als Test – der gespeicherte Spielstand bleibt dabei unverändert.
Feinschliff je Spiel: nur im eigenen Ordner arbeiten; Änderungen an `js/ui/`, `css/style.css` (gemeinsamer Teil) oder `js/app.js` betreffen alle Spiele.

## Lokal starten
`python -m http.server 8123`, dann http://localhost:8123 öffnen.

## Aufs Android-Handy
Die App muss über HTTPS erreichbar sein (z. B. GitHub Pages oder Netlify).
In Chrome öffnen → Menü ⋮ → „App installieren“ / „Zum Startbildschirm hinzufügen“.
