import { LAYOUTS } from "../lib/music";
import type { DrumKey, LayoutId } from "../lib/types";

type Props = {
  drumKey: DrumKey;
  layout: LayoutId;
  onKey: (key: DrumKey) => void;
  onLayout: (layout: LayoutId) => void;
};

export function SettingsBar({ drumKey, layout, onKey, onLayout }: Props) {
  return (
    <div className="settings">
      <fieldset className="pills">
        <legend>Drum</legend>
        {(["C", "D"] as const).map((key) => (
          <label key={key} className={drumKey === key ? "is-selected" : ""}>
            <input
              type="radio"
              name="drum-key"
              value={key}
              checked={drumKey === key}
              onChange={() => onKey(key)}
            />
            {key} major
          </label>
        ))}
      </fieldset>
      <fieldset className="pills">
        <legend>Layout</legend>
        {LAYOUTS.map((item) => (
          <label key={item.id} className={layout === item.id ? "is-selected" : ""}>
            <input
              type="radio"
              name="drum-layout"
              value={item.id}
              checked={layout === item.id}
              onChange={() => onLayout(item.id)}
            />
            {item.noteCount}
            {item.typical ? <span className="pill-note">typical</span> : null}
          </label>
        ))}
      </fieldset>
      <p className="settings-hint" id="layout-hint">
        11, 13, and 15 are typical layouts. Makers don’t all cut the same extra tongues.
      </p>
    </div>
  );
}
