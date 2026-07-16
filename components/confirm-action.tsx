"use client";

import { useId, useRef, type ReactNode } from "react";

type ConfirmActionProps = {
  action: (formData: FormData) => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  triggerLabel: string;
  triggerClassName?: string;
  confirmClassName?: string;
  disabled?: boolean;
  children?: ReactNode;
};

export function ConfirmAction({
  action,
  title,
  description,
  confirmLabel = "Ya, lanjutkan",
  triggerLabel,
  triggerClassName = "secondary-button",
  confirmClassName = "danger-button",
  disabled = false,
  children,
}: ConfirmActionProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button type="button" className={triggerClassName} disabled={disabled} onClick={() => dialogRef.current?.showModal()}>
        {triggerLabel}
      </button>
      <dialog ref={dialogRef} className="app-dialog" onCancel={() => dialogRef.current?.close()}>
        <div className="dialog-card" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
          <div className="dialog-heading">
            <span className="dialog-icon" aria-hidden="true">!</span>
            <div>
              <h2 id={titleId}>{title}</h2>
              <p>{description}</p>
            </div>
          </div>
          <form action={action} className="dialog-actions">
            {children}
            <button type="button" className="secondary-button" onClick={() => dialogRef.current?.close()}>Batal</button>
            <button type="submit" className={confirmClassName}>{confirmLabel}</button>
          </form>
        </div>
      </dialog>
    </>
  );
}
