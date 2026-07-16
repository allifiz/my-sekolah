"use client";

import { useEffect, useRef, useState } from "react";

const riskyAction = /^(hapus|batalkan|nonaktifkan|aktifkan|publikasikan|tarik|cabut|void|revoke|arsipkan|putuskan|keluarkan)/i;

type PendingSubmission = {
  form: HTMLFormElement;
  submitter: HTMLButtonElement | HTMLInputElement | null;
  label: string;
};

export function GlobalActionGuard() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bypassRef = useRef(false);
  const [pending, setPending] = useState<PendingSubmission | null>(null);

  useEffect(() => {
    function onSubmit(event: SubmitEvent) {
      if (bypassRef.current) {
        bypassRef.current = false;
        return;
      }

      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.closest("dialog")) return;
      const submitter = event.submitter instanceof HTMLButtonElement || event.submitter instanceof HTMLInputElement ? event.submitter : null;
      const label = submitter?.textContent?.trim() || submitter?.value?.trim() || "Lanjutkan";
      if (!riskyAction.test(label)) return;

      event.preventDefault();
      setPending({ form, submitter, label });
      dialogRef.current?.showModal();
    }

    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  function cancel() {
    dialogRef.current?.close();
    setPending(null);
  }

  function proceed() {
    if (!pending) return;
    dialogRef.current?.close();
    bypassRef.current = true;
    pending.form.requestSubmit(pending.submitter ?? undefined);
    setPending(null);
  }

  return (
    <dialog ref={dialogRef} className="app-dialog" onCancel={cancel}>
      <div className="dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="global-confirm-title">
        <div className="dialog-heading">
          <span className="dialog-icon" aria-hidden="true">!</span>
          <div>
            <h2 id="global-confirm-title">Konfirmasi tindakan</h2>
            <p>Kamu akan menjalankan aksi “{pending?.label ?? "lanjutkan"}”. Pastikan data dan konteks yang dipilih sudah benar.</p>
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={cancel}>Batal</button>
          <button type="button" className="danger-button" onClick={proceed}>Ya, lanjutkan</button>
        </div>
      </div>
    </dialog>
  );
}
