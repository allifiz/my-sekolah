"use client";

import { useRef } from "react";

export function ConfirmFormSubmit({
  formId,
  triggerLabel,
  title,
  description,
  confirmLabel = "Ya, lanjutkan",
  disabled = false,
}: {
  formId: string;
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel?: string;
  disabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="primary-button"
        disabled={disabled}
        onClick={() => dialogRef.current?.showModal()}
      >
        {triggerLabel}
      </button>
      <dialog ref={dialogRef} className="app-dialog" onCancel={() => dialogRef.current?.close()}>
        <div className="dialog-card">
          <div className="dialog-heading">
            <div>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            <button type="button" className="dialog-close" aria-label="Tutup" onClick={() => dialogRef.current?.close()}>×</button>
          </div>
          <div className="dialog-actions">
            <button type="button" className="secondary-button" onClick={() => dialogRef.current?.close()}>Batal</button>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                dialogRef.current?.close();
                document.getElementById(formId)?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
                (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
