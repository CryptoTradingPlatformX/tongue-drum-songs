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
- `dur` is in beats (0.5 = eighth note in 4/4, 1.5 = dotted quarter, 2 = half).
- No accidentals: anything off the major scale must be simplified away by the arranger.

Time signatures
- `timeSignature` must be one of `"4/4"`, `"3/4"`, `"2/4"`, `"2/2"`, or `"6/8"`.
- In every meter, `dur` stays in quarter-note beats and `tempo` is the quarter-note BPM.
- A 4/4 bar is 4 quarter-beats. A 3/4 bar is 3 quarter-beats. A 2/4 bar is 2 quarter-beats.
- A 2/2 bar is 4 quarter-beats, grouped as two half-note pulses (each pulse is `dur` 2).
- A 6/8 bar is 3 quarter-beats, grouped as two dotted-quarter pulses (each pulse is `dur` 1.5). An eighth note is `dur` 0.5; a dotted quarter is `dur` 1.5; a bar of 6/8 that is held for its full length is `dur` 3.
- `lyric` on a line is optional. Instrumental phrases omit it.
- C and D arrangements are separate. They can use different notes and a different `minLayout`. The page plays whichever drum is selected.
