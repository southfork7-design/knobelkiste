# Stand der Knobelkiste (15.11.2026)

## Fertig
Alle sieben Spiele sind spielbar, mit endlosen, geprüften Leveln, Dunkelmodus, dezenten Geräuschen,
Tipp-Funktion und – wo sinnvoll – Rückgängig:

| Spiel | Kurzbeschreibung | Getestet bis |
|---|---|---|
| Pfeilwerk ✔ überarbeitet (15.11.) | Pfeile herausschieben, 3 Leben; ab 30×44 dicht gepackt (~97 %), jedes 3. Level eine Figur (12 eigene Umrisse, bis 80 breit), Zoomen/Verschieben, Tipp kostet ein Herz, angestoßene Pfeile fliegen nach Freiräumen von selbst | Level 200 lösbar |
| Pfeilwürfel | Pfeile auf drehbaren Würfeln/Quadern, auch über Kanten | Level 120 lösbar |
| Kronenfeld | eine Krone je Zeile/Spalte/Region, keine Nachbarn | Level 100 eindeutig, ohne Raten |
| Gleisbau | Strecke nach Randzahlen; Einzelfeld 7×7–10×10 und Großstrecke (2/4/6 Felder → Gesamtkarte) | Level 60 / Strecke 12 eindeutig |
| Bilderrätsel | Nonogramm 5×5–15×15, 17 eigene Motive + erzeugte Muster | Level 80 ohne Raten lösbar |
| Schraubwerk | Schrauben umsetzen, Teile pendeln schräg / fallen | Level 40 lösbar |
| Farbräumer | Figuren in Farb-Behälter (Stapel), Ablage, Tore | Level 30 lösbar |

Alles wurde bisher nur im Browser in Handygröße getestet – noch nicht auf dem echten Handy.

## Nächste Schritte
1. **Feinschliff Spiel für Spiel** – je Spiel eine eigene Sitzung (Gruppe „Knobelkiste“ in der Seitenleiste).
   Ablauf: Spiel im Browser-Fenster öffnen, spielen, Änderungswünsche sagen, umsetzen, prüfen.
   Vorgeschlagene Reihenfolge: ~~Pfeilwerk~~ (erledigt) → Pfeilwürfel → Kronenfeld → Gleisbau → Bilderrätsel → Schraubwerk → Farbräumer.
2. **Auf das Android-Handy bringen** – Vorschlag: kostenlos über GitHub Pages veröffentlichen,
   dann in Chrome öffnen → „App installieren“.

## Offene Punkte / Ideen
- Schwierigkeit von Schraubwerk und Farbräumer auf dem Handy beurteilen und ggf. nachjustieren.
- Gleisbau: Rätsel sind eindeutig, aber nicht auf „ohne Raten lösbar“ geprüft (anders als Kronenfeld).
- Pfeilwürfel: auf großen Würfeln sind Pfeile klein – evtl. Zoomen mit zwei Fingern.
- Weitere Körper für den Pfeilwürfel (z. B. L-Form, Stufen) sind möglich.

## So startet man lokal
Im Projektordner `python -m http.server 8123`, dann http://localhost:8123 – Direkt-Links je Spiel siehe README.
