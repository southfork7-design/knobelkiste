# Knobelkiste – Regeln für die Arbeit an diesem Projekt

Werbefreie Logikrätsel-App (PWA) für ein Android-Handy. Reines HTML/CSS/JavaScript ohne Build-Schritt.
Kommunikation mit der Nutzerin bzw. dem Nutzer auf Deutsch.

## Grundsätze (gelten für alle Spiele)
- Keine Werbung, keine Hintergrundmusik, keine motivierenden Ausrufe oder Lobtexte.
  Texte nüchtern halten: „Gelöst“, Level, Zeit, Fehler, Züge, Tipps.
- Nur sehr dezente, kurze Geräusche zu Aktionen – ausschließlich über `js/ui/sound.js`
  (whoosh, click, tick, bump, solved). Keine Jingles, keine Fanfaren.
- Jedes Level muss garantiert lösbar sein. Logikrätsel (Kronenfeld, Bilderrätsel) haben genau eine,
  ohne Raten erreichbare Lösung. Nach Generator-Änderungen den passenden Test in `tools/` laufen lassen.
- Nur Spielmechaniken übernehmen – nie Namen, Grafiken oder Level bestehender Spiele nachbauen.
- Dunkelmodus und Handybreite (375 px) immer mitprüfen.

## Aufbau
- `js/app.js` Menü, Spielstand (localStorage), Direkt-Links `?spiel=<id>&level=<n>`
- `js/ui/shell.js` gemeinsame Kopfleiste/Werkzeugleiste/Dialoge, `js/ui/sound.js` Geräusche
- `css/style.css` gemeinsame Gestaltung (Farb-Variablen für hell/dunkel), je Spiel ein eigener Abschnitt
- `js/games/<spiel>/` je Spiel: `generator.js` (Level), `game.js` (Darstellung/Bedienung), ggf. `model.js`, `worker.js`
- `sw.js` Offline-Cache: bei jeder Änderung `VERSION` hochzählen und neue Dateien in `FILES` eintragen
- `tools/test-*.js` Generator-Tests (`node tools/test-<spiel>.js`)

## Feinschliff pro Spiel
Jedes Spiel wird in einer eigenen Sitzung überarbeitet. In so einer Sitzung:
- nur Dateien in `js/games/<spiel>/` und den Abschnitt des Spiels in `css/style.css` ändern;
- Änderungen an gemeinsamen Teilen (`js/ui/`, `js/app.js`, gemeinsame CSS-Variablen, `sw.js`) vorher ansprechen,
  weil sie alle Spiele betreffen;
- zum Testen den Server `knobelkiste` aus `.claude/launch.json` starten und das Spiel im Browser-Fenster
  in Handygröße per Direkt-Link öffnen (siehe README).

| Spiel | id | Ordner |
|---|---|---|
| Pfeilwerk | arrows | js/games/arrows |
| Pfeilwürfel | arrows3d | js/games/arrows3d |
| Kronenfeld | crowns | js/games/crowns |
| Gleisbau (Einzelfeld / Großstrecke) | tracks / tracksRoute | js/games/tracks |
| Bilderrätsel / Farbbilder | nonogram / nonogramColor | js/games/nonogram |
| Schraubwerk | screws | js/games/screws |
| Farbräumer | colors | js/games/colors |
