import type { Difficulty } from "./types";
import type { LibrarySort } from "./library";

export const LIBRARY_SESSION_KEY = "tongue-drum-library";
export const SEARCH_DEBOUNCE_MS = 200;

export type LibraryUrlState = {
  text: string;
  difficulty: Difficulty | "all";
  tags: string[];
  fitsOnly: boolean;
  sort: LibrarySort;
  page: number;
};

export const DEFAULT_LIBRARY_URL: LibraryUrlState = {
  text: "",
  difficulty: "all",
  tags: [],
  fitsOnly: false,
  sort: "title",
  page: 1,
};

function isDifficulty(value: string): value is Difficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

function isSort(value: string): value is LibrarySort {
  return value === "title" || value === "difficulty";
}

export function parseLibraryHash(hash: string): LibraryUrlState {
  const raw = hash.replace(/^#/, "") || "/";
  const queryAt = raw.indexOf("?");
  const path = queryAt >= 0 ? raw.slice(0, queryAt) : raw;
  if (path !== "/" && path !== "") return { ...DEFAULT_LIBRARY_URL };
  const params = new URLSearchParams(queryAt >= 0 ? raw.slice(queryAt + 1) : "");
  const difficulty = params.get("difficulty") ?? "";
  const sort = params.get("sort") ?? "";
  const page = Number(params.get("page"));
  const tags = (params.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return {
    text: params.get("q") ?? "",
    difficulty: isDifficulty(difficulty) ? difficulty : "all",
    tags,
    fitsOnly: params.get("fits") === "1",
    sort: isSort(sort) ? sort : "title",
    page: Number.isFinite(page) && page > 1 ? Math.floor(page) : 1,
  };
}

export function libraryHash(state: LibraryUrlState): string {
  const params = new URLSearchParams();
  const text = state.text.trim();
  if (text) params.set("q", text);
  if (state.difficulty !== "all") params.set("difficulty", state.difficulty);
  if (state.tags.length > 0) params.set("tags", state.tags.join(","));
  if (state.fitsOnly) params.set("fits", "1");
  if (state.sort !== "title") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(Math.floor(state.page)));
  const query = params.toString();
  return query ? `#/?${query}` : "#/";
}

export function replaceLibraryHash(hash: string): void {
  const next = `${window.location.pathname}${window.location.search}${hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  window.history.replaceState(null, "", next);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function rememberLibraryHash(hash: string): void {
  try {
    if (hash.startsWith("#/song")) return;
    sessionStorage.setItem(LIBRARY_SESSION_KEY, hash || "#/");
  } catch {
    // Private mode can block storage. The link still falls back to the library.
  }
}

export function libraryBackHref(): string {
  try {
    const saved = sessionStorage.getItem(LIBRARY_SESSION_KEY);
    if (saved && (saved === "#/" || saved.startsWith("#/?"))) return saved;
  } catch {
    // Ignore a blocked sessionStorage and return home.
  }
  return "#/";
}
