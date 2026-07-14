import Link from "next/link";
import { createSchool } from "../actions";

export default async function NewSchoolPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error === "duplicate" ? "Kode atau slug sudah digunakan." : error ? "Periksa kembali data yang diisi." : null;

  return (
    <div className="admin-page narrow-page">
      <header className="page-header">
        <div><span className="eyebrow">Onboarding tenant</span><h1>Tambah sekolah</h1><p>Buat tenant baru dengan trial dan batas penggunaan awal.</p></div>
        <Link href="/platform/schools" className="secondary-button">Kembali</Link>
      </header>

      <form action={createSchool} className="panel form-panel">
        {message && <div className="form-alert">{message}</div>}
        <div className="form-grid">
          <label className="field field-wide"><span>Nama sekolah</span><input name="name" required minLength={3} placeholder="SMA Nusantara" /></label>
          <label className="field"><span>Kode</span><input name="code" required placeholder="SMA-001" /></label>
          <label className="field"><span>Slug</span><input name="slug" required pattern="[a-z0-9-]+" placeholder="sma-nusantara" /></label>
          <label className="field"><span>Email</span><input name="email" type="email" placeholder="admin@sekolah.sch.id" /></label>
          <label className="field"><span>Telepon</span><input name="phone" placeholder="021 555 1234" /></label>
          <label className="field"><span>Limit siswa</span><input name="studentLimit" type="number" min="1" defaultValue="200" required /></label>
          <label className="field"><span>Limit pengguna</span><input name="userLimit" type="number" min="1" defaultValue="20" required /></label>
          <label className="field"><span>Masa trial (hari)</span><input name="trialDays" type="number" min="0" max="365" defaultValue="30" required /></label>
        </div>
        <div className="form-actions"><button type="submit" className="primary-button">Buat tenant sekolah</button></div>
      </form>
    </div>
  );
}
