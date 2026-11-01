export type LibraryCategory = {
  id: string;
  label: string;
  /** A song matches when it has any of these tags. */
  tags: string[];
  /** Shown when the library has no songs in this category yet. */
  emptyMessage?: string;
  /** Short line under the chips while this category is selected. */
  subtitle?: string;
};

export const LIBRARY_CATEGORIES: LibraryCategory[] = [
  { id: "hymns", label: "Hymns", tags: ["hymn"] },
  { id: "folk", label: "Folk", tags: ["folk"] },
  { id: "holiday", label: "Holiday", tags: ["holiday"] },
  { id: "american-classics", label: "American Classics", tags: ["american"] },
  {
    id: "jazz-blues",
    label: "Jazz & Blues",
    tags: ["jazz", "blues", "ragtime"],
    emptyMessage: "Jazz & Blues songs are coming soon",
  },
  {
    id: "black-composers",
    label: "Black Composers",
    tags: ["african-american-composers", "black-composers"], // primary tag, plus the shorter alias
    emptyMessage: "Black Composers songs are coming soon",
  },
  {
    id: "sinatra-standards",
    label: "Sinatra Standards",
    tags: ["sinatra"],
    emptyMessage: "Sinatra Standards songs are coming soon",
    subtitle: "Public-domain standards Frank Sinatra sang, arranged from the original sheet music.",
  },
];

export function categoryById(id: string): LibraryCategory | null {
  return LIBRARY_CATEGORIES.find((category) => category.id === id) ?? null;
}
