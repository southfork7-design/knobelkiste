# Knobelkiste

Logikrätsel-App fürs Handy (PWA): offline, ohne Werbung, unendlich viele generierte Level.

## Spiele
| Spiel | Status |
|---|---|
| Pfeilwerk (Pfeile abbauen, 2D) | spielbar |
| Pfeilwürfel (Pfeile auf Würfeln, Quadern und Blockgebilden, drehbar) | spielbar |
| Kronenfeld (1–3 Kronen pro Zeile/Spalte/Region, 7×7 bis 16×16) | spielbar |
| Gleisbau – Einzelfeld (8×8 bis 18×24, teils mit Felsen) und Großstrecke (2/4/6 verbundene Felder à 12–16, am Ende Gesamtkarte) | spielbar |
| Bilderrätsel (Nonogramm, 10×10 bis 30×40; anfangs eigene Motive, dann erzeugte Muster) | spielbar |
| Farbbilder (Nonogramm mit 2–4 Farben, 15×15 bis 30×35) | spielbar |
| Großbild (4 Bilderrätsel in 2×2, zusammen bis 40×40) | spielbar |
| Schraubwerk (Schrauben umsetzen, 6×8 bis 12×17 Löcher; Teile pendeln, stoßen an Schrauben, rutschen ab oder fallen; Löser prüft jedes Level) | spielbar |
| Farbräumer (Figuren in Farb-Behälter räumen, Ablage, Tore mit nachrückenden Figuren; 7×9 bis 14×20, bis ~300 Figuren) | spielbar |
| Fallenfeld (verdeckte Fallen finden, Zahlen zeigen die Nachbarn; 10×10 bis 50×50, ohne Raten lösbar) | spielbar |
| Kuschelfracht (Formen über gleichfarbige Plüschtiere schieben, die Tiere fallen hinein; Räume, Hindernisse, Richtungsformen, Schlösser; 8×13 bis 16×26) | spielbar |

## Grundsätze (für alle Spiele)
- Keine Werbung, keine Musik, keine motivierenden Ausrufe oder Lobtexte. Texte bleiben nüchtern („Gelöst“, Zeit, Fehler).
- Nur sehr dezente, kurze Geräusche zu Aktionen (`js/ui/sound.js`: whoosh, click, tick, bump, solved). Im Menü abschaltbar.
- Jedes Level ist garantiert lösbar; Logikrätsel haben genau eine Lösung, die ohne Raten erreichbar ist.

## Struktur
- `index.html`, `css/style.css`, `js/app.js` – App-Rahmen, Menü, Spielstand
- `js/ui/shell.js` – gemeinsame Kopfleiste, Leben, Tipp-Knopf, Sieg-/Niederlage-Dialog
- `js/games/<spiel>/generator.js` – erzeugt garantiert lösbare Level (ohne Browser testbar)
- `js/games/<spiel>/game.js` – Darstellung und Bedienung
- `js/games/screws/model.js` – Spielregeln, Geometrie und Physik (Stifte, Pendeln, Fall-Simulation) von Schraubwerk, auch vom Löser genutzt; `worker.js` + `gen-client.js` erzeugen Level im Hintergrund (nächstes vorab, im Browser gespeichert)
- `js/games/nonogram/motifs.js` – eigene Pixel-Motive (werden nur genutzt, wenn rein logisch lösbar)
- `js/games/nonogram/color.js` – Farbbilder: Farb-Zeilenlöser und Generator (`node tools/test-nonogram-color.js`)
- `js/games/nonogram/big.js` – Großbild: Übersicht der 4 Teile; Generator `generateBigLevel` in `generator.js` (`node tools/test-nonogram-big.js`)
- `js/games/tracks/worker.js` + `gen-client.js` – Gleisbau-Rätsel werden im Hintergrund erzeugt (nächstes Feld/Level schon vorab, im Browser gespeichert); `generator.js` enthält den logischen Löser (ohne Raten)
- `js/games/colors/model.js` – Regeln und Tipp-Löser von Farbräumer; `generator.js` baut Level entlang einer Lösung (`node tools/test-colors.js 80`), `worker.js` sucht Tipps im Hintergrund
- `js/games/traps/generator.js` – Fallenfeld: logischer Löser (ohne Raten) und Generator, der Fallen verschiebt, bis der Löser durchkommt (`node tools/test-traps.js 60`); `game.js` zeichnet auf Canvas
- `js/games/plush/model.js` – Kuschelfracht: Regeln, sichere Sackgassen-Prüfung und Tipp-Löser; `generator.js` baut Level rückwärts entlang einer Lösung (`node tools/test-plush.js 60`), `worker.js` sucht Tipps im Hintergrund
- `sw.js` – Offline-Cache (bei Änderungen `VERSION` hochzählen)
- `tools/test-*.js` – prüfen Level auf Lösbarkeit bzw. Eindeutigkeit (`node tools/test-crowns.js` usw.)
- `tools/make-icons.js` – erzeugt die PNG-Symbole
- `tools/make-crowns-bank.js` – erzeugt Kronenfeld-Rätsel vorab (`tools/crowns-bank/` → `js/games/crowns/bank.js`)

## Testzugang
Mit `?debug` in der Adresse stellen Pfeilwürfel und Gleisbau `window.__game` zum automatischen Durchspielen bereit.

## Spiele einzeln testen
Direkt-Links (lokal mit `python tools/serve.py 8123`):

| Spiel | Ordner | Link |
|---|---|---|
| Pfeilwerk | `js/games/arrows/` | http://localhost:8123/?spiel=arrows |
| Pfeilwürfel | `js/games/arrows3d/` | http://localhost:8123/?spiel=arrows3d |
| Kronenfeld | `js/games/crowns/` | http://localhost:8123/?spiel=crowns |
| Gleisbau – Einzelfeld | `js/games/tracks/` | http://localhost:8123/?spiel=tracks |
| Gleisbau – Großstrecke | `js/games/tracks/` | http://localhost:8123/?spiel=tracksRoute |
| Bilderrätsel | `js/games/nonogram/` | http://localhost:8123/?spiel=nonogram |
| Farbbilder | `js/games/nonogram/` (`color.js`) | http://localhost:8123/?spiel=nonogramColor |
| Großbild | `js/games/nonogram/` (`big.js`) | http://localhost:8123/?spiel=nonogramBig |
| Schraubwerk | `js/games/screws/` | http://localhost:8123/?spiel=screws |
| Farbräumer | `js/games/colors/` | http://localhost:8123/?spiel=colors |
| Fallenfeld | `js/games/traps/` | http://localhost:8123/?spiel=traps |
| Kuschelfracht | `js/games/plush/` | http://localhost:8123/?spiel=plush |

Mit `&level=12` startet ein bestimmtes Level als Test – der gespeicherte Spielstand bleibt dabei unverändert.
Feinschliff je Spiel: nur im eigenen Ordner arbeiten; Änderungen an `js/ui/`, `css/style.css` (gemeinsamer Teil) oder `js/app.js` betreffen alle Spiele.

## Lokal starten
`python tools/serve.py 8123`, dann http://localhost:8123 öffnen. Der Server sendet `Cache-Control: no-cache`,
damit Chrome (auch auf dem Handy im selben WLAN) nach Änderungen keine alte Fassung zeigt.

## Aufs Android-Handy
Die App muss über HTTPS erreichbar sein (z. B. GitHub Pages oder Netlify).
In Chrome öffnen → Menü ⋮ → „App installieren“ / „Zum Startbildschirm hinzufügen“.
