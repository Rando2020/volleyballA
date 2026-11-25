export function BulkBar({
  selected,
  setModal,
  update,
  setChecked,
}: {
  selected: number[];
  setModal: (v: string) => void;
  update: (ids: number[], values: { starred: boolean }) => void;
  setChecked: (ids: number[]) => void;
}) {
  return (
    <div className="bulk">
      <strong>{selected.length} selected</strong>
      <button onClick={() => setModal("Bulk tag")}>Tag</button>
      <button onClick={() => update(selected, { starred: true })}>Star</button>
      <button onClick={() => setModal("Export clips")}>Export</button>
      <button onClick={() => setModal("Delete clips")}>Delete</button>
      <button onClick={() => setChecked([])}>Clear</button>
    </div>
  );
}
