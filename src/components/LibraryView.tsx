import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collectTags, filterSongs, paginate, PAGE_SIZE, type LibrarySort } from "../lib/library";
import {
  libraryHash,
  parseLibraryHash,
  rememberLibraryHash,
  replaceLibraryHash,
  SEARCH_DEBOUNCE_MS,
  type LibraryUrlState,
} from "../lib/libraryUrl";
import { songNeedsBiggerLayout } from "../lib/music";
import { scrollBehavior } from "../lib/scroll";
import type { SongSummary } from "../lib/songs";
import type { Difficulty, DrumKey, LayoutId } from "../lib/types";

type Props = {
  songs: SongSummary[];
  drumKey: DrumKey;
  layout: LayoutId;
};

const DIFFICULTIES: Array<Difficulty | "all"> = ["all", "easy", "medium", "hard"];

function labelDifficulty(value: Difficulty): string {
  if (value === "easy") return "Easy";
  if (value === "medium") return "Medium";
  return "Hard";
}

function useLibraryUrl(): [LibraryUrlState, (next: LibraryUrlState) => void] {
  const [state, setState] = useState<LibraryUrlState>(() => parseLibraryHash(window.location.hash));
  const commit = useCallback((next: LibraryUrlState) => {
    const hash = libraryHash(next);
    replaceLibraryHash(hash);
    rememberLibraryHash(hash);
    setState(parseLibraryHash(hash));
  }, []);

  useEffect(() => {
    rememberLibraryHash(window.location.hash || "#/");
    const onChange = () => setState(parseLibraryHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return [state, commit];
}

export function LibraryView({ songs, drumKey, layout }: Props) {
  const [state, commit] = useLibraryUrl();
  const [draft, setDraft] = useState(state.text);
  const tags = useMemo(() => collectTags(songs), [songs]);
  const visible = useMemo(
    () =>
      filterSongs(songs, {
        text: state.text,
        difficulty: state.difficulty,
        tags: state.tags,
        fitsOnly: state.fitsOnly,
        sort: state.sort,
        drumKey,
        layout,
      }),
    [songs, state, drumKey, layout],
  );
  const paged = paginate(visible, state.page, PAGE_SIZE);
  const countRef = useRef<HTMLParagraphElement>(null);
  const sawPage = useRef(false);

  useEffect(() => {
    setDraft((current) => (current.trim() === state.text ? current : state.text));
  }, [state.text]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const text = draft.trim();
      if (text === state.text) return;
      commit({ ...state, text, page: 1 });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [draft, state, commit]);

  useEffect(() => {
    if (paged.page !== state.page) commit({ ...state, page: paged.page });
  }, [paged.page, state, commit]);

  useEffect(() => {
    if (!sawPage.current) {
      sawPage.current = true;
      return;
    }
    countRef.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  }, [state.page]);

  const filtersOn =
    state.text.trim() !== "" || state.difficulty !== "all" || state.tags.length > 0 || state.fitsOnly || state.sort !== "title";

  const clear = () => {
    setDraft("");
    commit({ text: "", difficulty: "all", tags: [], fitsOnly: false, sort: "title", page: 1 });
  };

  const count =
    paged.pageCount > 1
      ? `Showing ${paged.start}–${paged.end} of ${visible.length} matching ${visible.length === 1 ? "tune" : "tunes"}`
      : `${visible.length} of ${songs.length} ${songs.length === 1 ? "tune" : "tunes"}`;

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
            value={draft}
            placeholder="Title, artist, or tag"
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>

        <div className="tool-row">
          <fieldset className="pills compact">
            <legend>Difficulty</legend>
            {DIFFICULTIES.map((value) => (
              <label key={value} className={state.difficulty === value ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="difficulty"
                  value={value}
                  checked={state.difficulty === value}
                  onChange={() => commit({ ...state, difficulty: value, page: 1 })}
                />
                {value === "all" ? "All" : labelDifficulty(value)}
              </label>
            ))}
          </fieldset>

          <label className="sort">
            <span>Sort</span>
            <select
              value={state.sort}
              onChange={(event) => commit({ ...state, sort: event.target.value as LibrarySort, page: 1 })}
            >
              <option value="title">Title</option>
              <option value="difficulty">Difficulty</option>
            </select>
          </label>

          <label className={state.fitsOnly ? "fits-toggle is-on" : "fits-toggle"}>
            <input
              type="checkbox"
              checked={state.fitsOnly}
              onChange={(event) => commit({ ...state, fitsOnly: event.target.checked, page: 1 })}
            />
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
                const on = state.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={on ? "tag is-on" : "tag"}
                    aria-pressed={on}
                    onClick={() =>
                      commit({
                        ...state,
                        page: 1,
                        tags: on ? state.tags.filter((item) => item !== tag) : [...state.tags, tag],
                      })
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

      <p className="result-count" aria-live="polite" ref={countRef}>
        {count}
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
          {paged.items.map((song) => (
            <li key={song.id}>
              <SongCard song={song} drumKey={drumKey} layout={layout} />
            </li>
          ))}
        </ul>
      )}

      {paged.pageCount > 1 ? (
        <nav className="pager" aria-label="Pages">
          <button type="button" disabled={paged.page <= 1} onClick={() => commit({ ...state, page: paged.page - 1 })}>
            Previous
          </button>
          {Array.from({ length: paged.pageCount }, (_, index) => {
            const number = index + 1;
            return (
              <button
                key={number}
                type="button"
                aria-current={number === paged.page ? "page" : undefined}
                onClick={() => commit({ ...state, page: number })}
              >
                {number}
              </button>
            );
          })}
          <button
            type="button"
            disabled={paged.page >= paged.pageCount}
            onClick={() => commit({ ...state, page: paged.page + 1 })}
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}

function SongCard({ song, drumKey, layout }: { song: SongSummary; drumKey: DrumKey; layout: LayoutId }) {
  const needed = song.minLayout[drumKey];
  const fits = !songNeedsBiggerLayout(needed, layout);
  const fit = fits ? `Fits your ${layout}-note drum` : `Needs a ${needed}-note drum`;

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
      {song.tags.length > 0 ? <p className="card-tags">{song.tags.join(" · ")}</p> : null}
      <p className={fits ? "fit is-fit" : "fit is-short"}>{fit}</p>
    </a>
  );
}
