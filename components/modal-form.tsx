"use client";

import { useRef, type ReactNode } from "react";

type ModalFormProps = {
  action?: (formData: FormData) => void | Promise<void>;
  title: string;
  description?: string;
  triggerLabel: string;
  triggerClassName?: string;
  submitLabel?: string;
  children: ReactNode;
};

export function ModalForm({
  action,
  title,
  description,
  triggerLabel,
  triggerClassName = "primary-button",
  submitLabel = "Simpan",
  children,
}: ModalFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => dialogRef.current?.showModal()}>{triggerLabel}</button>
      <dialog ref={dialogRef} className="app-dialog" onCancel={() => dialogRef.current?.close()}>
        <div className="dialog-card dialog-card-wide">
          <div className="dialog-heading">
            <div>
              <h2>{title}</h2>
              {description ? <p>{description}</p> : null}
            </div>
            <button type="button" className="dialog-close" aria-label="Tutup" onClick={() => dialogRef.current?.close()}>×</button>
          </div>
          {action ? (
            <form action={action} className="admin-form">
              {children}
              <div className="dialog-actions">
                <button type="button" className="secondary-button" onClick={() => dialogRef.current?.close()}>Batal</button>
                <button type="submit" className="primary-button">{submitLabel}</button>
              </div>
            </form>
          ) : children}
        </div>
      </dialog>
    </>
  );
}
