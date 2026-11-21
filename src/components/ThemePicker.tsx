import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  APPEARANCE_EVENT,
  applyAppearance,
  readAppearance,
  systemPrefersDark,
  type Appearance,
} from "../theme";

const OPTIONS: { id: Appearance; label: string; swatch: string }[] = [
  { id: "classic", label: "Tongue Drum", swatch: "classic" },
  { id: "clarity", label: "Clarity", swatch: "clarity" },
  { id: "neon", label: "Neon Studio", swatch: "neon" },
  { id: "cozy", label: "Cozy", swatch: "cozy" },
  { id: "command", label: "Command Center", swatch: "command" },
  { id: "headline", label: "Headline", swatch: "headline" },
  { id: "lavender", label: "Lavender Glass", swatch: "lavender" },
  { id: "system", label: "Match system", swatch: "system" },
];

export function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Appearance>(() => readAppearance());
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<Appearance>).detail;
      if (detail) setChoice(detail);
    };
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      if (readAppearance() === "system") applyAppearance("system", media.matches);
    };
    window.addEventListener(APPEARANCE_EVENT, onChange);
    media.addEventListener("change", onSystem);
    return () => {
      window.removeEventListener(APPEARANCE_EVENT, onChange);
      media.removeEventListener("change", onSystem);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const selected = rootRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    selected?.focus();
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(next: Appearance) {
    setChoice(next);
    applyAppearance(next, systemPrefersDark());
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onMenuKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const buttons = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>(".theme-option") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : event.key === "ArrowDown"
              ? (index + 1 + buttons.length) % buttons.length
              : (index - 1 + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }

  return (
    <div className="theme-dock" ref={rootRef}>
      <button
        ref={buttonRef}
        className="theme-button"
        type="button"
        data-testid="theme-button"
        aria-label="Appearance"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="theme-dots" aria-hidden="true" />
        <span className="theme-button-label">Appearance</span>
      </button>
      {open ? (
        <div className="theme-menu" id={menuId} role="listbox" aria-label="Appearance" onKeyDown={onMenuKey}>
          {OPTIONS.map((option) => (
            <button
              key={option.id}
              className="theme-option"
              type="button"
              role="option"
              data-testid={`theme-${option.id}`}
              aria-selected={choice === option.id}
              onClick={() => choose(option.id)}
            >
              <span className="swatch" data-swatch={option.swatch} aria-hidden="true" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
