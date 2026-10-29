import { useEffect, useMemo, useState } from "react";
import { LibraryView } from "./components/LibraryView";
import { SettingsBar } from "./components/SettingsBar";
import { SongView } from "./components/SongView";
import { useSettings } from "./lib/settings";
import { songSummaries } from "./lib/songs";

type Route = { name: "library" } | { name: "song"; id: string };

function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/";
  const path = raw.split("?")[0] || "/";
  const match = path.match(/^\/song\/([^/]+)\/?$/);
  if (match) return { name: "song", id: decodeURIComponent(match[1]) };
  return { name: "library" };
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function App() {
  const route = useRoute();
  const songs = useMemo(() => songSummaries(), []);
  const settings = useSettings();
  const routeKey = route.name === "song" ? `song:${route.id}` : "library";

  useEffect(() => {
    const top = document.querySelector(".top");
    if (!(top instanceof HTMLElement)) return;
    const apply = () => {
      document.documentElement.style.setProperty("--sticky-top", `${Math.ceil(top.getBoundingClientRect().height)}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(top);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (route.name === "library") {
      document.title = "Tongue Drum Songs";
      return;
    }
    const song = songs.find((item) => item.id === route.id);
    document.title = song ? `${song.title} · Tongue Drum Songs` : "Tongue Drum Songs";
  }, [route, songs]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routeKey]);

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className={route.name === "song" ? "top is-song" : "top"} data-sticky-chrome>
        <header className="site-header">
          <a className="brand" href="#/">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="32" height="32">
                <circle cx="16" cy="16" r="15" fill="#8a4e28" />
                <circle cx="16" cy="16" r="11" fill="none" stroke="#f8efe3" strokeWidth="1.4" />
                <circle cx="16" cy="16" r="4.5" fill="#f6c445" />
              </svg>
            </span>
            <span>
              <span className="brand-name">Tongue Drum Songs</span>
              <span className="brand-tag">Numbered tunes for steel tongue drums</span>
            </span>
          </a>
        </header>
        <SettingsBar
          drumKey={settings.drumKey}
          layout={settings.layout}
          onKey={settings.setDrumKey}
          onLayout={settings.setLayout}
        />
      </div>
      <main id="main" className={route.name === "song" ? "has-player" : undefined}>
        {route.name === "library" ? (
          <LibraryView songs={songs} drumKey={settings.drumKey} layout={settings.layout} />
        ) : (
          <SongView
            songId={route.id}
            drumKey={settings.drumKey}
            layout={settings.layout}
            noteSize={settings.noteSize}
            onNoteSize={settings.setNoteSize}
            followScroll={settings.followScroll}
            onFollowScroll={settings.setFollowScroll}
          />
        )}
      </main>
      <footer className="site-footer">
        <p>Melodies in this library are public domain or openly licensed. The preview tone is synthesized in your browser.</p>
      </footer>
    </>
  );
}
