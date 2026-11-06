import { useCallback, useEffect, useState } from "react";
import { allocateId, exportSongs, importSongDocuments, isPlayable, type SongFile } from "../lib/mySongs";
import { openSongStore, type SongStore, type StoredSong } from "../lib/songStore";
import type { RecordSensitivity } from "../lib/detect";
import type { NoteSize } from "../lib/settings";
import { SongEditor } from "./SongEditor";

type Props = {
  songId?: string;
  noteSize: NoteSize;
  onNoteSize: (size: NoteSize) => void;
  followScroll: boolean;
  onFollowScroll: (value: boolean) => void;
  recordSensitivity: RecordSensitivity;
  onRecordSensitivity: (value: RecordSensitivity) => void;
};

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function drumsOf(song: SongFile): string {
  const names = (["C", "D"] as const).filter((drum) => isPlayable(song.arrangements[drum]));
  return names.length === 2 ? "C and D" : `${names[0] ?? "—"} only`;
}

export function MySongsView({
  songId,
  noteSize,
  onNoteSize,
  followScroll,
  onFollowScroll,
  recordSensitivity,
  onRecordSensitivity,
}: Props) {
  const [store, setStore] = useState<SongStore | null>(null);
  const [songs, setSongs] = useState<StoredSong[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importNotes, setImportNotes] = useState<string[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rename, setRename] = useState<{ id: string; title: string } | null>(null);

  const reload = useCallback(async (current: SongStore) => {
    setSongs(await current.list());
  }, []);

  useEffect(() => {
    let live = true;
    openSongStore()
      .then((opened) => {
        if (live) setStore(opened);
      })
      .catch((reason: unknown) => {
        if (live) setError(reason instanceof Error ? reason.message : "Could not open song storage");
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!store) return;
    let live = true;
    if (!songId) setSongs(null);
    store.list().then((records) => {
      if (live) setSongs(records);
    });
    return () => {
      live = false;
    };
  }, [store, songId]);

  if (error) {
    return (
      <div className="song-page">
        <h1>My songs</h1>
        <div className="banner" role="alert">
          {error}
        </div>
      </div>
    );
  }
  if (!store || !songs) {
    return (
      <div className="song-page">
        <h1>My songs</h1>
        <p className="loading-tune">Loading songs saved on this device…</p>
      </div>
    );
  }
  if (songId) {
    return (
      <SongEditor
        songId={songId}
        store={store}
        taken={new Set(songs.map((record) => record.song.id))}
        noteSize={noteSize}
        onNoteSize={onNoteSize}
        followScroll={followScroll}
        onFollowScroll={onFollowScroll}
        recordSensitivity={recordSensitivity}
        onRecordSensitivity={onRecordSensitivity}
      />
    );
  }

  async function remove(id: string) {
    await store!.remove(id);
    setConfirmId(null);
    await reload(store!);
  }

  async function commitRename() {
    if (!rename || !store) return;
    const title = rename.title.trim();
    if (!title) return;
    const record = await store.get(rename.id);
    if (!record) return;
    await store.put({
      updatedAt: new Date().toISOString(),
      song: { ...record.song, title },
    });
    setRename(null);
    await reload(store);
  }

  async function duplicate(record: StoredSong) {
    if (!store) return;
    const taken = new Set(songs!.map((item) => item.song.id));
    const id = allocateId(record.song.id, taken);
    await store.put({
      updatedAt: new Date().toISOString(),
      song: { ...record.song, id, title: `${record.song.title} copy` },
    });
    await reload(store);
  }

  async function onImport(file: File) {
    if (!store) return;
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setImportNotes(["That file is not JSON."]);
      return;
    }
    const taken = new Set(songs!.map((record) => record.song.id));
    const result = await importSongDocuments(data, taken);
    const stamp = new Date().toISOString();
    for (const song of result.songs) await store.put({ updatedAt: stamp, song });
    await reload(store);
    const notes = [];
    if (result.songs.length > 0) notes.push(`Imported ${result.songs.length} song${result.songs.length === 1 ? "" : "s"}.`);
    for (const issue of result.errors) {
      notes.push(`Item ${issue.index + 1} was skipped. ${issue.messages.join(" ")}`);
    }
    if (notes.length === 0) notes.push("That file had no songs.");
    setImportNotes(notes);
  }

  return (
    <div className="library my-songs">
      <header className="library-head">
        <h1>My songs</h1>
        <p>Saved in this browser only. Nothing is uploaded. Open a song to edit it, or start a new one.</p>
      </header>
      <div className="editor-actions">
        <a className="button-link" href="#/my-songs/new">
          New song
        </a>
        <button
          type="button"
          onClick={() => downloadJson("my-songs.json", exportSongs(songs.map((record) => record.song)))}
          disabled={songs.length === 0}
        >
          Export all
        </button>
        <label className="import-label">
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void onImport(file);
            }}
          />
        </label>
      </div>
      {importNotes.length > 0 ? (
        <div className="banner" role="status">
          {importNotes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ) : null}
      {songs.length === 0 ? <p>No songs yet.</p> : null}
      <ul className="my-list">
        {songs.map((record) => (
          <li key={record.song.id} className="my-row">
            <div>
              <h2>
                <a href={`#/my-songs/${record.song.id}`}>{record.song.title}</a>
              </h2>
              <p>
                {record.song.timeSignature} · {record.song.tempo} BPM · {drumsOf(record.song)}
                {record.updatedAt ? ` · ${when(record.updatedAt)}` : ""}
              </p>
            </div>
            <div className="editor-actions">
              <a href={`#/my-songs/${record.song.id}`}>Edit</a>
              {rename?.id === record.song.id ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void commitRename();
                  }}
                >
                  <label>
                    <span className="sr-only">New title</span>
                    <input
                      value={rename.title}
                      onChange={(event) => setRename({ id: record.song.id, title: event.target.value })}
                    />
                  </label>
                  <button type="submit">Save title</button>
                  <button type="button" onClick={() => setRename(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <button type="button" onClick={() => setRename({ id: record.song.id, title: record.song.title })}>
                  Rename
                </button>
              )}
              <button type="button" onClick={() => void duplicate(record)}>
                Duplicate
              </button>
              <button type="button" onClick={() => downloadJson(`${record.song.id}.json`, exportSongs([record.song]))}>
                Export
              </button>
              {confirmId === record.song.id ? (
                <span className="confirm-row">
                  Delete this song?
                  <button type="button" onClick={() => void remove(record.song.id)}>
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirmId(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmId(record.song.id)}>
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
