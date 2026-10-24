import { useMemo, useState } from "react";
import { minimumLayout, missingTongues, parseNote } from "../lib/music";
import type { Song } from "../lib/types";
import type { Difficulty, DrumKey, LayoutId } from "../lib/types";

type Props = {
  songs: Song[];
  drumKey: DrumKey;
  layout: LayoutId;
};

const DIFFICULTIES: Array<Difficulty | "all"> = ["all", "easy", "medium", "hard"];

function labelDifficulty(value: Difficulty): string {
  if (value === "easy") return "Easy";
  if (value === "medium") return "Medium";
  return "Hard";
}

export function LibraryView({ songs, drumKey, layout }: Props) {
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const tags = useMemo(() => {
    const all = new Set<string>();
    for (const song of songs) for (const tag of song.tags ?? []) all.add(tag);
    return [...all].sort((a, b) => a.localeCompare(b, "en"));
  }, [songs]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return songs.filter((song) => {
      if (needle && !`${song.title} ${song.artist}`.toLowerCase().includes(needle)) return false;
      if (difficulty !== "all" && song.difficulty !== difficulty) return false;
      if (selectedTags.length > 0 && !selectedTags.some((tag) => song.tags?.includes(tag))) return false;
      return true;
    });
  }, [songs, query, difficulty, selectedTags]);

  const filtersOn = query.trim() !== "" || difficulty !== "all" || selectedTags.length > 0;

  return (
    <div className="library">
      <header className="page-intro">
        <h1>Songs for your drum</h1>
        <p>
          Browse a tune, then see it in numbered notation. Switch between a C major and a D major drum, and
          the note names follow.
        </p>
      </header>

      <div className="filters">
        <label className="search">
          <span>Search title or artist</span>
          <input
            type="search"
            value={query}
            placeholder="Try Ode, lullaby, traditional…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <fieldset className="pills compact">
          <legend>Difficulty</legend>
          {DIFFICULTIES.map((value) => (
            <label key={value} className={difficulty === value ? "is-selected" : ""}>
              <input
                type="radio"
                name="difficulty"
                value={value}
                checked={difficulty === value}
                onChange={() => setDifficulty(value)}
              />
              {value === "all" ? "All" : labelDifficulty(value)}
            </label>
          ))}
        </fieldset>
        {tags.length > 0 ? (
          <div className="tag-filter">
            <p id="tag-filter-label">Tags</p>
            <div className="tags" role="group" aria-labelledby="tag-filter-label">
              {tags.map((tag) => {
                const on = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={on ? "tag is-on" : "tag"}
                    aria-pressed={on}
                    onClick={() =>
                      setSelectedTags((current) =>
                        current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
                      )
                    }
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {filtersOn ? (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setQuery("");
              setDifficulty("all");
              setSelectedTags([]);
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <p className="result-count" aria-live="polite">
        {visible.length} {visible.length === 1 ? "tune" : "tunes"}
      </p>

      {visible.length === 0 ? (
        <p className="empty">Nothing matches that yet. Clear a filter, or try another word.</p>
      ) : (
        <ul className="song-grid-list">
          {visible.map((song) => (
            <li key={song.id}>
              <SongCard song={song} drumKey={drumKey} layout={layout} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SongCard({ song, drumKey, layout }: { song: Song; drumKey: DrumKey; layout: LayoutId }) {
  let fit = "Ready to play";
  let fits = true;
  try {
    const notes = song.arrangements[drumKey].lines.flatMap((line) => line.notes.map((note) => parseNote(note)));
    const missing = missingTongues(notes, layout);
    fits = missing.length === 0;
    const needed = minimumLayout(notes) ?? song.arrangements[drumKey].minLayout;
    fit = fits ? `Fits your ${layout}-note drum` : `Needs a ${needed}-note drum`;
  } catch {
    fit = "Could not read this arrangement";
    fits = false;
  }

  return (
    <a className="song-card" href={`#/song/${song.id}`}>
      <div className="card-top">
        <h2>{song.title}</h2>
        <p className="artist">{song.artist}</p>
      </div>
      <p className="card-meta">
        <span className={`diff diff-${song.difficulty}`}>{labelDifficulty(song.difficulty)}</span>
        <span>{song.timeSignature}</span>
        <span>{song.tempo} BPM</span>
      </p>
      {song.tags && song.tags.length > 0 ? (
        <p className="card-tags">{song.tags.join(" · ")}</p>
      ) : null}
      <p className={fits ? "fit is-fit" : "fit is-short"}>{fit}</p>
    </a>
  );
}
