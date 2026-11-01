# Tongue drum song JSON schema (v1, proposed)

One file per song: `songs/<id>.json`. All fields required unless marked optional.

```json
{
  "schemaVersion": 1,
  "id": "ode-to-joy",                       // kebab-case, unique, matches filename
  "title": "Ode to Joy",
  "artist": "Ludwig van Beethoven",          // composer/performer or "Traditional"
  "source": { "name": "IMSLP score / Mutopia / etc.", "url": "https://..." },
  "license": "public-domain",                // public-domain | CC0 | CC-BY-4.0 | CC-BY-SA-4.0 | other-permissive
  "attribution": "Melody: Beethoven (1824), public domain. Arrangement: Tongue Drum Song Finder.",
  "difficulty": "easy",                      // easy | medium | hard
  "tags": ["classical", "kids"],            // optional
  "tempo": 100,                              // quarter-note BPM in every meter
  "timeSignature": "4/4",
  "arrangements": {
    "C": {
      "minLayout": "8",                      // smallest drum layout that can play it: "8" | "11" | "13" | "15"
      "lines": [                              // one line = one phrase as shown on screen
        {
          "lyric": "Joyful, joyful",         // optional
          "notes": [
            { "deg": 3, "oct": 0, "dur": 1 },  // deg 1-7 = scale degree; oct -1 = dot below, +1 = dot above; dur in beats
            { "deg": 3, "oct": 0, "dur": 1 },
            { "rest": true, "dur": 1 }          // rest
          ]
        }
      ]
    },
    "D": { "minLayout": "8", "lines": [ ] }  // same shape, D major drum
  },
  "arrangerNotes": "Simplified bar 12 (F# removed).",  // optional
  "verified": true                            // arranger double-checked note by note
}
```

Rules
- Only public-domain or properly (openly) licensed melodies. `source.url` must point to where the melody/score came from.
- Octave: oct 0 = the drum's main octave (8-note drum: 1 2 3 4 5 6 7 1̇ where 1̇ is deg 1, oct +1). Extended layouts add notes below (oct -1) and/or above (oct +1).
- `dur` is in beats (0.5 = eighth note in 4/4, 1.5 = dotted quarter, 2 = half). `dur` 1/3 (often written `0.333...`) is a triplet eighth; three in a row fill one quarter-beat.
- No accidentals: anything off the major scale must be simplified away by the arranger.

Time signatures
- `timeSignature` must be one of `"4/4"`, `"3/4"`, `"2/4"`, `"2/2"`, `"3/2"`, `"4/2"`, `"6/4"`, `"6/8"`, `"9/8"`, or `"12/8"`.
- In every meter, `dur` stays in quarter-note beats and `tempo` is the quarter-note BPM.
- A 4/4 bar is 4 quarter-beats. A 3/4 bar is 3 quarter-beats. A 2/4 bar is 2 quarter-beats.
- A 2/2 bar is 4 quarter-beats, grouped as two half-note pulses (each pulse is `dur` 2).
- A 3/2 bar is 6 quarter-beats, grouped as three half-note pulses (each pulse is `dur` 2). A bar of 3/2 held for its full length is `dur` 6.
- A 4/2 bar is 8 quarter-beats, grouped as four half-note pulses (each pulse is `dur` 2). A bar of 4/2 held for its full length is `dur` 8.
- A 6/4 bar is 6 quarter-beats, grouped as two dotted-half pulses (each pulse is `dur` 3). A bar of 6/4 held for its full length is `dur` 6.
- A 6/8 bar is 3 quarter-beats, grouped as two dotted-quarter pulses (each pulse is `dur` 1.5). An eighth note is `dur` 0.5; a dotted quarter is `dur` 1.5; a bar of 6/8 that is held for its full length is `dur` 3.
- A 9/8 bar is 4.5 quarter-beats, grouped as three dotted-quarter pulses (each pulse is `dur` 1.5). A bar of 9/8 held for its full length is `dur` 4.5.
- A 12/8 bar is 6 quarter-beats, grouped as four dotted-quarter pulses (each pulse is `dur` 1.5). A bar of 12/8 held for its full length is `dur` 6.
- `lyric` on a line is optional. Instrumental phrases omit it.
- C and D arrangements are separate. They can use different notes and a different `minLayout`. The page plays whichever drum is selected.
- `section` on a line is an optional slug (`^[a-z][a-z0-9-]*$`). `form` is an optional play order of `{ section, verse? }`. `verses` is an optional map of section to lyric rows: `verses[section][n - 1]` is verse n, one string per line of that section (`""` means no lyric). `schemaVersion` stays 1. With no `form`, `verses` must be omitted and the song plays its lines once. With `form`, every line in C and D has a section, both arrangements share that section sequence, every form entry names a real section, and every section appears in `form`. A section listed in `verses` requires `verse` on each of its form entries, and verse 1 must match the lines' own lyrics. A section not listed in `verses` must not set `verse`; those passes show the lines' own lyric.
- `verseLines` is optional and backward compatible (`schemaVersion` stays 1). Shape: `verseLines[section][verseNumber][lineIndex] = { C: Line, D: Line }`. Verse numbers and line indexes are strings (`"2"`, `"0"`). `lineIndex` is the line's index within that section, starting at 0. Each `Line` has `notes` and an optional `lyric`, the same fields as an arrangement line; `section` is omitted. When `form` plays that section and verse, the variant's notes replace that line for the selected key. If the variant includes `lyric`, that lyric is shown and must equal `verses[section][verse - 1][lineIndex]`; if it omits `lyric`, the shared verse lyric is shown. The section must be a real section and a key of `verses`, the verse number must exist in that table, the line index must be within the section's line count, and both C and D are required. Variant notes must fit that key's `minLayout`, the same tongue check used for arrangement lines. Playback length, the verse indicator, the note cursor, and follow-scroll all use the expanded notes, so a variant changes those too. Songs that omit `verseLines` play exactly as before.
