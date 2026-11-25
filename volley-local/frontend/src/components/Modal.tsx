import { useEffect, useRef, ReactNode } from "react";
export default function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-heading"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="sectionTitle">
        <h2 id="dialog-heading">{title}</h2>
        <button aria-label="Close dialog" onClick={close}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
