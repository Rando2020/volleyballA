const help = [
  ["Space", "Play or pause"],
  ["J / K / L", "Reverse / pause / forward faster"],
  ["← / →", "Previous / next visible clip"],
  ["Q / Shift+E", "Previous / next play start"],
  ["1–9", "Toggle assigned tag"],
  ["S / F / E", "Star / filters / export"],
  ["Ctrl or ⌘ Z", "Undo tag change"],
  ["Ctrl or ⌘ Shift Z / Ctrl Y", "Redo tag change"],
  ["Shift-click", "Select range in filmstrip"],
  ["Esc", "Close dialog or clear selection"],
  ["?", "Keyboard shortcuts"],
];

export function ShortcutModal({
  courtKeys,
  change,
}: {
  courtKeys: boolean;
  change: (v: boolean) => void;
}) {
  return (
    <>
      <label>
        Keyboard layout
        <select
          aria-label="Keyboard layout"
          value={courtKeys ? "courtsense" : "studio"}
          onChange={(e) => change(e.target.value === "courtsense")}
        >
          <option value="studio">Studio · E exports</option>
          <option value="courtsense">CourtSense · Q/E navigate</option>
        </select>
      </label>{" "}
      <dl>
        {help.map(([key, v]) => (
          <div className="help" key={key}>
            <dt>
              {courtKeys
                ? key.replace("Shift+E", "E").replace("S / F / E", "S / F / X")
                : key}
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
