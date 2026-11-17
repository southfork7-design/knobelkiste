# Stand der Knobelkiste (15.11.2026)

## Fertig
Alle neun Spiele sind spielbar, mit endlosen, geprüften Leveln, Dunkelmodus, dezenten Geräuschen,
Tipp-Funktion und – wo sinnvoll – Rückgängig:

| Spiel | Kurzbeschreibung | Getestet bis |
|---|---|---|
| Pfeilwerk ✔ überarbeitet (15.11.) | Pfeile herausschieben, 3 Leben; ab 30×44 dicht gepackt (~97 %), jedes 3. Level eine Figur (12 eigene Umrisse, bis 80 breit), Zoomen/Verschieben, Tipp kostet ein Herz, angestoßene Pfeile fliegen nach Freiräumen von selbst | Level 200 lösbar |
| Pfeilwürfel ✔ überarbeitet (15.11.) | Pfeile auf drehbaren Würfeln/Quadern (ab 14×14 je Fläche, bis 22) und – jedes 3. Level – unregelmäßigen Blockgebilden aus 3–5 Quadern mit Wänden und Verdeckung; ~99 % gefüllt, 300–680 Pfeile, Pfeile liegen flach auf der Fläche, Zoomen/Verschieben, Tipp kostet ein Herz, angestoßene Pfeile fliegen nach Freiräumen von selbst | Level 120 lösbar |
| Kronenfeld ✔ überarbeitet (15.11.) | 1, ab Level 6 2, später 3 Kronen je Zeile/Spalte/Region, keine Nachbarn; Felder 7×7 bis 16×16 mit verwinkelten Regionen; Rätsel vorab erzeugt (`bank.js`, gedreht/gespiegelt endlos), Zoomen/Verschieben, 3 Herzen: Regelverstoß und Tipp kosten je ein Herz; Tippen = Kreuz, Doppeltippen = Krone | Bank + Level 150 eindeutig, ohne Raten |
| Gleisbau ✔ überarbeitet (15.11.) | Strecke nach Randzahlen; Einzelfeld 8×8 bis 18×24 (hochkant), jedes 3. Level ab 8 mit Felsen; Großstrecke 2/4/6 Felder à 12–16 → Gesamtkarte; logischer Löser prüft „ohne Raten“; Zoomen/Verschieben, Randzahlen bleiben stehen; 3 Herzen: Regelverstoß (Zahl überschritten, Ring) und Tipp kosten je ein Herz; Tippen/Ziehen = Kreuze, Doppeltippen = Gleisstück, Ziehen verbindet nur gesetzte Gleise | Level 60 / Strecke 12 eindeutig, ohne Raten |
| Bilderrätsel ✔ überarbeitet (16.11.) | Nonogramm 10×10 bis 30×40 (hochkant), anfangs 4 eigene Motive, sonst feine, meist gespiegelte Muster (schwierigstes von 6); Zoomen/Verschieben, Randzahlen bleiben stehen; 3 Herzen: Zeile/Spalte, die nicht mehr aufgehen kann (rot), und Tipp kosten je ein Herz; Wischen = Vorschau bis zum Loslassen; fertige Zeilen/Spalten bekommen automatisch Kreuze | Level 80 eindeutig, ohne Raten |
| Farbbilder (neu, 16.11.) | Farb-Nonogramm mit 2–4 Farben (gleiche Farbe braucht Lücke, verschiedene dürfen sich berühren), 15×15 bis 30×35, Bedienung wie Bilderrätsel, je Farbe ein Werkzeug | Level 60 eindeutig, ohne Raten; Farb-Löser gegen vollständige Suche geprüft |
| Schraubwerk ✔ überarbeitet (16.11.) | Schrauben umsetzen; Bretter 6×8 bis 12×17 Löcher, 16–82 Teile dicht in zwei Lagen, knappe freie Löcher; Physik: Schrauben ragen als Stifte durch die Lagen, pendelnde Teile lehnen sich an, fallende rutschen ab oder bleiben liegen (Starrkörper-Simulation); Zoomen/Verschieben; 3 Herzen: Tipp und Sackgasse (kein Zug mehr, wird zurückgenommen) kosten je ein Herz; Stand im Level wird gespeichert | Level 60 lösbar (Löser spielt nach) |
| Farbräumer ✔ überarbeitet (16.11.) | Figuren in Farb-Behälter (3–5 Stapel), Ablage, Tore; Bretter 7×9 bis 14×20, voll gefüllt (63–300 Figuren), 4–7 Farben; Level entstehen entlang einer Lösung; bei zwei offenen Behältern gleicher Farbe geht die Figur in den volleren; Zoomen/Verschieben, Behälter/Ablage bleiben oben fest; 3 Herzen: Tipp und Sackgasse (kein Zug mehr, wird zurückgenommen) kosten je ein Herz; Stand im Level wird gespeichert | Level 80 lösbar (Lösung nachgespielt) |
| Fallenfeld (neu, 16.11.) | Verdeckte Fallen finden, Zahlen zeigen die Fallen in den 8 Nachbarn; 10×10 bis 50×50 (ab Level 31), Fallen 14 % → 21 %; Startbereich offen, logischer Löser (eine Zahl, zwei Zahlen, Restanzahl) prüft „ohne Raten“, schwierigstes von 6; Tippen wechselt leer → Vermutung (harmlos) → Fahne → leer, Doppeltippen = aufdecken (Fahnen geschützt), Doppeltippen auf Zahl = Rest aufdecken; 3 Herzen: Falle, zu viele Fahnen an einer Zahl, Tipp; Zoomen/Verschieben; Stand im Level wird gespeichert | Level 60 ohne Raten lösbar; Löser gegen vollständige Suche geprüft |
| Kuschelfracht (neu, 16.11.) | Formen Feld für Feld ziehen; fährt eine Form auf ein gleichfarbiges Plüschtier, fällt es hinein (eins je Quadrat), andersfarbige versperren den Weg, volle Formen verschwinden; Räume am Rand (ab 3), graue Hindernisse (ab 4, bis 14), Formen nur waagerecht/senkrecht (ab 6, bis 40 %), Formen mit Schloss (ab 9, bis 8), Brett mit Einbuchtungen (ab 8), Wandriegel (ab 12), Pfeiler (ab 15); ab Level 12 ist jedes 6. Level leichter (Hindernisse wie bei halbem Level); 8×13 bis 16×26 (ab Level 40), ~86 % belegt, 6 Farben (ab 16: 7, ab 31: 8), bis ~85 Formen; Level entstehen rückwärts entlang einer Lösung; Zoomen/Verschieben; 3 Herzen: Tipp und sicher erkannte Sackgasse (wird zurückgenommen); Stand im Level wird gespeichert | Level 60 lösbar (Lösung nachgespielt), Sackgassen-Prüfung auf dem Lösungsweg nie fälschlich |

Alles wurde bisher nur im Browser in Handygröße getestet – noch nicht auf dem echten Handy.

## Nächste Schritte
1. **Feinschliff Spiel für Spiel** – je Spiel eine eigene Sitzung (Gruppe „Knobelkiste“ in der Seitenleiste).
   Ablauf: Spiel im Browser-Fenster öffnen, spielen, Änderungswünsche sagen, umsetzen, prüfen.
   Vorgeschlagene Reihenfolge: ~~Pfeilwerk~~ → ~~Pfeilwürfel~~ → ~~Kronenfeld~~ → ~~Gleisbau~~ → ~~Bilderrätsel/Farbbilder~~ → ~~Schraubwerk~~ → ~~Farbräumer~~ (alle erledigt).
2. **Auf das Android-Handy bringen** – Vorschlag: kostenlos über GitHub Pages veröffentlichen,
   dann in Chrome öffnen → „App installieren“.

## Offene Punkte / Ideen
- Farbräumer: Schwierigkeit auf dem Handy beobachten (Stellschrauben in `levelParams`: Stapel, Ablage, Farben, `target`). Tipp-Löser findet in <1 % der Lagen nichts („Kein Tipp gefunden“, kostet kein Herz). Stand: `knobelkiste-colors-stand`.
- Schraubwerk: große Level brauchen am PC bis ~5 s zum Erzeugen (Handy geschätzt bis 15 s); läuft im Hintergrund vorab und wird im Browser gespeichert (`knobelkiste-screws-cache`). Große Level haben 130–250 Züge – auf dem Handy beobachten, ob das zu lang ist.
- Gleisbau: 18×24 braucht am PC 5–7 s zum Erzeugen (Handy geschätzt 15–20 s); läuft im Hintergrund vorab und wird im Browser gespeichert. Falls es stört: Bank wie bei Kronenfeld.
- Kronenfeld: Bank für 14×14/15×15/16×16 hat 46/39/40 Rätsel (×8 durch Drehen) – bei Bedarf mit
  `node tools/make-crowns-bank.js <n> <k> <anzahl> <startSeed>` erweitern, dann `--build` und `node tools/test-crowns.js`.
- Fallenfeld: Erzeugung 50×50 am PC 0,2–0,8 s (Handy geschätzt 1–2 s, ohne Worker) – beobachten. Startbereich teils klein (9 Felder). Schwierigkeit über Fallenanteil in `levelParams`. Stand: `knobelkiste-traps-stand`.
- Kuschelfracht: Erzeugung am PC bis ~0,3 s (ohne Worker). Sackgassen werden nur sicher erkannt (Formen erreichen ihre Tiere nicht, auch nicht bei leerem Brett; sich blockierende Richtungsformen); manche echten Sackgassen bleiben unbemerkt → Rückgängig (kostet nichts). Tipp-Löser (Probespiele, im Worker) findet abseits der Lösung selten nichts → „Kein Tipp gefunden“, kostet kein Herz. Schwierigkeit/Dichte in `levelParams` (generator.js). Stand: `knobelkiste-plush-stand`. Noch nicht auf dem Handy beurteilt.
- Pfeilwürfel: große Level brauchen auf dem Handy evtl. 1–2 s zum Aufbauen – beobachten.
- Farbbilder sind logisch eher leicht (6–8 Löserrunden), Schwierigkeit kommt über die Feldgröße; Bilderrätsel-Level brauchen am PC bis ~0,4 s (Handy ~1 s) – beobachten.
- Bilderrätsel/Farbbilder: Stand im laufenden Level wird gespeichert (`knobelkiste-nonogram-stand` bzw. `-nonogramColor-stand`); Neu/Nochmal/Lösen verwerfen ihn.

## So startet man lokal
Im Projektordner `python tools/serve.py 8123` (Testserver ohne Zwischenspeicher, damit das Handy Änderungen sofort sieht), dann http://localhost:8123 bzw. vom Handy im WLAN http://192.168.0.227:8123 – Direkt-Links je Spiel siehe README.
