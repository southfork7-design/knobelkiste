# Stand der Knobelkiste (15.11.2026)

## Fertig
Alle sieben Spiele sind spielbar, mit endlosen, geprüften Leveln, Dunkelmodus, dezenten Geräuschen,
Tipp-Funktion und – wo sinnvoll – Rückgängig:

| Spiel | Kurzbeschreibung | Getestet bis |
|---|---|---|
| Pfeilwerk ✔ überarbeitet (15.11.) | Pfeile herausschieben, 3 Leben; ab 30×44 dicht gepackt (~97 %), jedes 3. Level eine Figur (12 eigene Umrisse, bis 80 breit), Zoomen/Verschieben, Tipp kostet ein Herz, angestoßene Pfeile fliegen nach Freiräumen von selbst | Level 200 lösbar |
| Pfeilwürfel ✔ überarbeitet (15.11.) | Pfeile auf drehbaren Würfeln/Quadern (ab 14×14 je Fläche, bis 22) und – jedes 3. Level – unregelmäßigen Blockgebilden aus 3–5 Quadern mit Wänden und Verdeckung; ~99 % gefüllt, 300–680 Pfeile, Pfeile liegen flach auf der Fläche, Zoomen/Verschieben, Tipp kostet ein Herz, angestoßene Pfeile fliegen nach Freiräumen von selbst | Level 120 lösbar |
| Kronenfeld ✔ überarbeitet (15.11.) | 1, ab Level 6 2, später 3 Kronen je Zeile/Spalte/Region, keine Nachbarn; Felder 7×7 bis 16×16 mit verwinkelten Regionen; Rätsel vorab erzeugt (`bank.js`, gedreht/gespiegelt endlos), Zoomen/Verschieben, 3 Herzen: Regelverstoß und Tipp kosten je ein Herz | Bank + Level 150 eindeutig, ohne Raten |
| Gleisbau | Strecke nach Randzahlen; Einzelfeld 7×7–10×10 und Großstrecke (2/4/6 Felder → Gesamtkarte) | Level 60 / Strecke 12 eindeutig |
| Bilderrätsel | Nonogramm 5×5–15×15, 17 eigene Motive + erzeugte Muster | Level 80 ohne Raten lösbar |
| Schraubwerk | Schrauben umsetzen, Teile pendeln schräg / fallen | Level 40 lösbar |
| Farbräumer | Figuren in Farb-Behälter (Stapel), Ablage, Tore | Level 30 lösbar |

Alles wurde bisher nur im Browser in Handygröße getestet – noch nicht auf dem echten Handy.

## Nächste Schritte
1. **Feinschliff Spiel für Spiel** – je Spiel eine eigene Sitzung (Gruppe „Knobelkiste“ in der Seitenleiste).
   Ablauf: Spiel im Browser-Fenster öffnen, spielen, Änderungswünsche sagen, umsetzen, prüfen.
   Vorgeschlagene Reihenfolge: ~~Pfeilwerk~~ → ~~Pfeilwürfel~~ → ~~Kronenfeld~~ (erledigt) → Gleisbau → Bilderrätsel → Schraubwerk → Farbräumer.
2. **Auf das Android-Handy bringen** – Vorschlag: kostenlos über GitHub Pages veröffentlichen,
   dann in Chrome öffnen → „App installieren“.

## Offene Punkte / Ideen
- Schwierigkeit von Schraubwerk und Farbräumer auf dem Handy beurteilen und ggf. nachjustieren.
- Gleisbau: Rätsel sind eindeutig, aber nicht auf „ohne Raten lösbar“ geprüft (anders als Kronenfeld).
- Kronenfeld: Bank für 14×14/15×15/16×16 hat 46/39/40 Rätsel (×8 durch Drehen) – bei Bedarf mit
  `node tools/make-crowns-bank.js <n> <k> <anzahl> <startSeed>` erweitern, dann `--build` und `node tools/test-crowns.js`.
- Kronenfeld (Wunsch 15.11.): Kronen nicht mehr mit dem zweiten Tippen setzen – so kommt schnell versehentlich
  eine falsche Krone hinein. Stattdessen: einfaches Tippen nur Kreuz an/aus, Krone NUR per Doppeltippen.
- Idee für ein neues Spiel: im Stil von Minesweeper (nur die Mechanik), Felder etwa 10×10 bis 50×50.
- Pfeilwürfel: große Level brauchen auf dem Handy evtl. 1–2 s zum Aufbauen – beobachten.

## So startet man lokal
Im Projektordner `python tools/serve.py 8123` (Testserver ohne Zwischenspeicher, damit das Handy Änderungen sofort sieht), dann http://localhost:8123 bzw. vom Handy im WLAN http://192.168.0.227:8123 – Direkt-Links je Spiel siehe README.
