"use client";

import { useEffect, useState } from "react";

export function BulkSelectionControls({ formId }: { formId: string }) {
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    const update = () => setSelectedCount(form.querySelectorAll<HTMLInputElement>('input[name="studentIds"]:checked').length);
    form.addEventListener("change", update);
    update();
    return () => form.removeEventListener("change", update);
  }, [formId]);

  function setAll(checked: boolean) {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    form.querySelectorAll<HTMLInputElement>('input[name="studentIds"]:not(:disabled)').forEach((input) => {
      input.checked = checked;
    });
    setSelectedCount(form.querySelectorAll<HTMLInputElement>('input[name="studentIds"]:checked').length);
  }

  return (
    <div className="bulk-selection-summary">
      <strong>{selectedCount} siswa dipilih</strong>
      <div className="dashboard-actions">
        <button type="button" className="text-button" onClick={() => setAll(true)}>Pilih semua di halaman</button>
        {selectedCount > 0 ? <button type="button" className="text-button" onClick={() => setAll(false)}>Kosongkan pilihan</button> : null}
      </div>
    </div>
  );
}
