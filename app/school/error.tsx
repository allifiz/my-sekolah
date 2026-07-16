"use client";

import { useEffect } from "react";

export default function SchoolError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);

  return (
    <main className="error-state" role="alert">
      <span className="eyebrow">Terjadi kendala</span>
      <h1>Halaman belum dapat ditampilkan</h1>
      <p>Data Anda tetap aman. Coba muat ulang bagian ini atau kembali beberapa saat lagi.</p>
      <button className="primary-button" type="button" onClick={reset}>Coba lagi</button>
    </main>
  );
}
