import { useMemo, useState } from "react";
import { collectTags, filterSongs, type LibrarySort } from "../lib/library";
import { minimumLayout, missingTongues, parseNote } from "../lib/music";
import type { Difficulty, DrumKey, LayoutId, Song } from "../lib/types";

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
  const [fitsOnly, setFitsOnly] = useState(false);
  const [sort, setSort] = useState<LibrarySort>("title");

  const tags = useMemo(() => collectTags(songs), [songs]);
  const visible = useMemo(
    () =>
      filterSongs(songs, {
        text: query,
        difficulty,
        tags: selectedTags,
        fitsOnly,
        sort,
        drumKey,
        layout,
      }),
    [songs, query, difficulty, selectedTags, fitsOnly, sort, drumKey, layout],
  );

  const filtersOn = query.trim() !== "" || difficulty !== "all" || selectedTags.length > 0 || fitsOnly;

  const clear = () => {
    setQuery("");
    setDifficulty("all");
    setSelectedTags([]);
    setFitsOnly(false);
    setSort("title");
  };

  return (
    <div className="library">
      <header className="page-intro">
        <h1>Songs for your drum</h1>
        <p>
          Browse a tune, then see it in numbered notation. Filters follow the C or D drum and the layout
          selected above.
        </p>
      </header>

      <div className="filters">
        <label className="search">
          <span>Search</span>
          <input
            type="search"
            value={query}
            placeholder="Title, artist, or tag"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="tool-row">
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

          <label className="sort">
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as LibrarySort)}>
              <option value="title">Title</option>
              <option value="difficulty">Difficulty</option>
            </select>
          </label>

          <label className={fitsOnly ? "fits-toggle is-on" : "fits-toggle"}>
            <input type="checkbox" checked={fitsOnly} onChange={(event) => setFitsOnly(event.target.checked)} />
            <span>Fits my drum</span>
            <span className="fits-detail">
              {drumKey} major · {layout}-note
            </span>
          </label>
        </div>

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
            <p className="filter-hint">Select any tags. A tune matches if it has one of them.</p>
          </div>
        ) : null}

        {filtersOn ? (
          <button type="button" className="text-button" onClick={clear}>
            Clear filters
          </button>
        ) : null}
      </div>

      <p className="result-count" aria-live="polite">
        {visible.length} of {songs.length} {songs.length === 1 ? "tune" : "tunes"}
      </p>

      {visible.length === 0 ? (
        <div className="empty">
          <p>No tunes match these filters.</p>
          <button type="button" className="text-button" onClick={clear}>
            Clear filters
          </button>
        </div>
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
      {song.tags && song.tags.length > 0 ? <p className="card-tags">{song.tags.join(" · ")}</p> : null}
      <p className={fits ? "fit is-fit" : "fit is-short"}>{fit}</p>
    </a>
  );
}
