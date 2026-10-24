# Tongue Drum Songs

A small static site for steel tongue drum players. Browse a library of public-domain tunes, read them in numbered notation, and practice on a picture of the drum. A C major / D major switch keeps the same scale degrees and changes the note names. The preview tone is synthesized in the browser.

## Develop

```bash
npm install
npm run dev
```

The dev server uses the GitHub Pages base path, so open `http://localhost:5173/tongue-drum-songs/`.

```bash
npm test                 # notation, transposition, layout fit, meters
npm run validate:songs   # JSON Schema + layout checks for songs/*.json
npm run build            # typecheck and production build into dist/
npm run preview
```

## Add a song

1. Copy the shape in [docs/song-schema.md](docs/song-schema.md). The machine-readable copy is [schemas/song.schema.json](schemas/song.schema.json).
2. Save it as `songs/<id>.json`. The `id` is kebab-case and must match the filename.
3. Include both a `C` and a `D` arrangement. Scale degrees are the same idea on either drum (1 is the tonic). `minLayout` is the smallest drum that can play that arrangement: `"8"`, `"11"`, `"13"`, or `"15"`.
4. `timeSignature` is `"4/4"`, `"3/4"`, or `"6/8"`. `dur` is always in quarter-note beats, and `tempo` is always the quarter-note BPM. A 6/8 bar is 3 quarter-beats, grouped as two dotted-quarter pulses (`dur` 1.5 each).
5. Only public-domain or openly licensed melodies. `source.url` should point at the score or transcription you used, and `attribution` is shown on the song page.
6. Run `npm run validate:songs`. The app does not need a hand-written index: Vite builds one from `songs/*.json` on the next `npm run dev` or `npm run build`.

Drum maps live in [data/layouts.json](data/layouts.json).

| Layout | Tongues | Notes |
| --- | --- | --- |
| 8 | 1–7 in the main octave, plus high 1 | C drum C4–C5, D drum D4–D5 |
| 11 | the 8-note set, plus low 5, 6, and 7 | Typical extended layout; makers vary |
| 13 | the 11-note set, plus high 2 and high 3 | Typical extended layout; makers vary |
| 15 | low 3–7, main 1–7, high 1–3 | Hopewell-style. No high 4 or high 5. C drum E3–E5, D drum F♯3–F♯5. Typical; makers vary |

Numbers in the app are scale degrees. A dot above is the octave above the main one (`oct: 1`), a dot below is the octave below (`oct: -1`).

## GitHub Pages

The workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) validates songs, runs tests, builds, and on a push to `main` deploys `dist/` to GitHub Pages. The site is built for `/tongue-drum-songs/`, which matches this repository’s name.

To turn on Pages the first time:

1. Open the repository **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Merge to `main`. The **CI** workflow publishes the site.

The address will be `https://<user>.github.io/tongue-drum-songs/`. The first deploy creates the `github-pages` environment. If that job fails before Pages has a source, set the source to GitHub Actions and re-run the workflow.
