import { Clip, Tag } from "../api/client";
export function TagChips({
  ids,
  all,
  tags,
  busy,
  editTags,
}: {
  ids: number[];
  all: Clip[];
  tags: Tag[];
  busy: boolean;
  editTags: (id: number, ids: number[]) => void;
}) {
  return (
    <div className="chiprow">
      {tags.map((t) => {
        const on = ids.every((k) =>
          all.find((x) => x.id === k)?.tags.includes(t.id),
        );
        return (
          <button
            disabled={busy}
            key={t.id}
            aria-pressed={on}
            style={{ borderColor: on ? t.color : undefined, color: t.color }}
            onClick={() => editTags(t.id, ids)}
          >
            {t.name} {t.hotkey && <kbd>{t.hotkey}</kbd>}
          </button>
        );
      })}
    </div>
  );
}
