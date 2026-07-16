import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { ConfirmAction } from "@/components/confirm-action";
import { FlashMessage } from "@/components/flash-message";
import { ModalForm } from "@/components/modal-form";
import { prisma } from "@/lib/prisma";

import { createGuardian, enrollStudent, linkStudentGuardian } from "../actions";
import { cancelEnrollment, unlinkStudentGuardian } from "../delete-actions";
import { changeStudentStatus, endEnrollment, transferEnrollment, updateStudent } from "../lifecycle-actions";

function dateValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

const errors: Record<string, string> = {
  "invalid-student-update": "Perubahan data siswa belum valid.",
  "duplicate-student": "NIS atau NISN sudah digunakan siswa lain.",
  "invalid-status": "Perubahan status belum valid.",
  "invalid-link": "Hubungan siswa dan wali belum valid.",
  "duplicate-link": "Wali tersebut sudah terhubung ke siswa.",
  "invalid-enrollment": "Data enrollment belum valid.",
  "duplicate-enrollment": "Siswa sudah memiliki enrollment pada tahun ajaran tersebut.",
  "class-full": "Kapasitas rombel sudah penuh.",
  "reference-not-found": "Data referensi tidak ditemukan.",
  "transfer-year-mismatch": "Perpindahan hanya dapat dilakukan dalam tahun ajaran yang sama.",
  "transfer-same-class": "Rombel tujuan sama dengan rombel saat ini.",
};

export default async function StudentWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ error?: string; success?: string; guardianQ?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.schoolId) redirect("/login");
  const { studentId } = await params;
  const query = await searchParams;
  const guardianQ = query.guardianQ?.trim() ?? "";
  const schoolId = session.user.schoolId;

  const [student, classGroups, guardianResults] = await Promise.all([
    prisma.student.findFirst({
      where: { id: studentId, schoolId, deletedAt: null },
      include: {
        guardians: { include: { guardian: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        enrollments: {
          include: { academicYear: true, classGroup: { include: { gradeLevel: true } } },
          orderBy: { startedAt: "desc" },
        },
      },
    }),
    prisma.classGroup.findMany({
      where: { schoolId, isActive: true },
      include: { academicYear: true, gradeLevel: true, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
      orderBy: [{ academicYear: { startDate: "desc" } }, { gradeLevel: { order: "asc" } }, { name: "asc" }],
    }),
    guardianQ
      ? prisma.guardian.findMany({
          where: {
            schoolId,
            deletedAt: null,
            OR: [
              { name: { contains: guardianQ, mode: "insensitive" } },
              { phone: { contains: guardianQ, mode: "insensitive" } },
              { email: { contains: guardianQ, mode: "insensitive" } },
            ],
          },
          include: { _count: { select: { students: true } } },
          orderBy: { name: "asc" },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  if (!student) notFound();
  const activeEnrollment = student.enrollments.find((item) => item.status === "ACTIVE");
  const linkedGuardianIds = new Set(student.guardians.map((item) => item.guardianId));

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Workspace siswa</span>
          <h1>{student.name}</h1>
          <p>NIS {student.nis}{student.nisn ? ` · NISN ${student.nisn}` : ""}. Semua perubahan siswa dilakukan dari konteks ini.</p>
        </div>
        <div className="dashboard-actions"><Link href="/school/students" className="secondary-button">Kembali ke direktori</Link><ModalForm triggerLabel="Edit Profil" title="Edit profil siswa" description="Perubahan identitas akan dicatat pada audit log."><form action={updateStudent} className="admin-form form-grid"><input type="hidden" name="studentId" value={student.id} /><label>NIS<input name="nis" defaultValue={student.nis} required /></label><label>NISN<input name="nisn" defaultValue={student.nisn ?? ""} /></label><label className="field-wide">Nama lengkap<input name="name" defaultValue={student.name} required /></label><label>Jenis kelamin<select name="gender" defaultValue={student.gender ?? ""}><option value="">Tidak diisi</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></label><label>Tempat lahir<input name="birthPlace" defaultValue={student.birthPlace ?? ""} /></label><label>Tanggal lahir<input type="date" name="birthDate" defaultValue={dateValue(student.birthDate)} /></label><div className="form-actions field-wide"><button className="primary-button" type="submit">Simpan perubahan</button></div></form></ModalForm></div>
      </header>

      {query.error ? <FlashMessage tone="error" title="Perubahan gagal" message={errors[query.error] ?? "Periksa data dan coba kembali."} /> : null}
      {query.success ? <FlashMessage tone="success" title="Perubahan berhasil" message="Workspace siswa telah diperbarui." /> : null}

      <section className="detail-grid">
        <article className="detail-card"><span>Status</span><strong>{student.status}</strong><small>Status administratif siswa.</small></article>
        <article className="detail-card"><span>Enrollment aktif</span><strong>{activeEnrollment ? activeEnrollment.classGroup.name : "Belum ada"}</strong><small>{activeEnrollment?.academicYear.name ?? "Tempatkan siswa ke rombel."}</small></article>
        <article className="detail-card"><span>Wali tertaut</span><strong>{student.guardians.length}</strong><small>{student.guardians.some((item) => item.isPrimary) ? "Wali utama sudah ditentukan." : "Belum ada wali utama."}</small></article>
        <article className="detail-card"><span>Riwayat enrollment</span><strong>{student.enrollments.length}</strong><small>Termasuk enrollment selesai/dibatalkan.</small></article>
      </section>

      <section className="content-grid">
        <section className="panel section-panel">
          <div className="section-heading"><div><h2>Wali siswa</h2><p>Cari wali berdasarkan nama, telepon, atau email. Maksimal 20 hasil per pencarian.</p></div><ModalForm triggerLabel="Buat Wali Baru" title="Buat dan tautkan wali" description="Wali baru dibuat dari konteks siswa ini."><form action={createGuardian} className="admin-form"><label>Nama lengkap<input name="name" required /></label><label>Nomor telepon<input name="phone" /></label><label>Email<input type="email" name="email" /></label><label>Alamat<textarea name="address" rows={3} /></label><div className="form-actions"><button className="primary-button" type="submit">Simpan wali</button></div></form></ModalForm></div>
          {student.guardians.length === 0 ? <div className="empty-state compact-empty"><strong>Belum ada wali</strong><p>Cari wali yang sudah ada atau buat wali baru.</p></div> : <div className="management-grid">{student.guardians.map((item) => <article className="management-card" key={item.id}><div className="management-card-head"><div><strong>{item.guardian.name}</strong><p>{item.relationship}{item.isPrimary ? " · Wali utama" : ""}</p></div></div><p>{item.guardian.phone ?? "Tanpa telepon"}{item.guardian.email ? ` · ${item.guardian.email}` : ""}</p><ConfirmAction action={unlinkStudentGuardian} title="Lepaskan wali dari siswa?" description="Data wali tidak dihapus, hanya hubungan dengan siswa ini yang dilepas." triggerLabel="Lepaskan" confirmLabel="Ya, lepaskan"><input type="hidden" name="relationId" value={item.id} /></ConfirmAction></article>)}</div>}
          <form className="filter-toolbar" method="get"><label className="search-field"><span aria-hidden="true">⌕</span><input name="guardianQ" defaultValue={guardianQ} placeholder="Cari wali..." /></label><button className="secondary-button" type="submit">Cari wali</button>{guardianQ ? <Link href={`/school/students/${student.id}`} className="text-button">Reset</Link> : null}</form>
          {guardianQ ? <div className="management-grid">{guardianResults.length === 0 ? <div className="empty-state compact-empty"><strong>Tidak ditemukan</strong><p>Buat wali baru bila data belum ada.</p></div> : guardianResults.map((guardian) => <article className="management-card" key={guardian.id}><strong>{guardian.name}</strong><p>{guardian.phone ?? "Tanpa telepon"}{guardian.email ? ` · ${guardian.email}` : ""}</p><small>{guardian._count.students} siswa tertaut</small>{linkedGuardianIds.has(guardian.id) ? <span className="status-badge status-active">Sudah tertaut</span> : <ModalForm triggerLabel="Tautkan" title={`Tautkan ${guardian.name}`} description={`Hubungkan wali ini dengan ${student.name}.`}><form action={linkStudentGuardian} className="admin-form"><input type="hidden" name="studentId" value={student.id} /><input type="hidden" name="guardianId" value={guardian.id} /><label>Hubungan<select name="relationship" defaultValue=""><option value="" disabled>Pilih hubungan</option><option value="Ayah">Ayah</option><option value="Ibu">Ibu</option><option value="Kakak">Kakak</option><option value="Wali">Wali</option><option value="Lainnya">Lainnya</option></select></label><label className="checkbox-field"><input type="checkbox" name="isPrimary" /> Jadikan wali utama</label><div className="form-actions"><button className="primary-button" type="submit">Tautkan wali</button></div></form></ModalForm>}</article>)}</div> : null}
        </section>

        <section className="panel section-panel">
          <div className="section-heading"><div><h2>Enrollment</h2><p>Penempatan kelas aktif dan riwayat siswa.</p></div>{!activeEnrollment && student.status === "ACTIVE" ? <ModalForm triggerLabel="Tempatkan ke Kelas" title="Buat enrollment" description="Pilih rombel yang masih memiliki kapasitas."><form action={enrollStudent} className="admin-form"><input type="hidden" name="studentId" value={student.id} /><label>Rombongan belajar<select name="classGroupId" required defaultValue=""><option value="" disabled>Pilih rombel</option>{classGroups.map((group) => <option key={group.id} value={group.id} disabled={group._count.enrollments >= group.capacity}>{group.academicYear.name} · {group.gradeLevel.name} · {group.name} · {group._count.enrollments}/{group.capacity}</option>)}</select></label><div className="form-actions"><button className="primary-button" type="submit">Simpan enrollment</button></div></form></ModalForm> : null}</div>
          {activeEnrollment ? <article className="management-card"><div className="management-card-head"><div><strong>{activeEnrollment.classGroup.gradeLevel.name} · {activeEnrollment.classGroup.name}</strong><p>{activeEnrollment.academicYear.name}</p></div><span className="status-badge status-active">ACTIVE</span></div><div className="button-row"><ModalForm triggerLabel="Pindah Rombel" title="Pindahkan siswa" description="Perpindahan hanya dapat dilakukan dalam tahun ajaran yang sama."><form action={transferEnrollment} className="admin-form"><input type="hidden" name="enrollmentId" value={activeEnrollment.id} /><label>Rombel tujuan<select name="classGroupId" required defaultValue=""><option value="" disabled>Pilih rombel</option>{classGroups.filter((group) => group.academicYearId === activeEnrollment.academicYearId && group.id !== activeEnrollment.classGroupId).map((group) => <option key={group.id} value={group.id} disabled={group._count.enrollments >= group.capacity}>{group.gradeLevel.name} · {group.name} · {group._count.enrollments}/{group.capacity}</option>)}</select></label><label>Alasan<textarea name="reason" required minLength={5} /></label><div className="form-actions"><button className="primary-button" type="submit">Pindahkan</button></div></form></ModalForm><ConfirmAction action={endEnrollment} title="Akhiri enrollment aktif?" description="Siswa tidak lagi tercatat aktif di rombel ini. Riwayat tetap disimpan." triggerLabel="Akhiri" confirmLabel="Akhiri enrollment"><input type="hidden" name="enrollmentId" value={activeEnrollment.id} /><label>Alasan<input name="reason" required minLength={5} /></label></ConfirmAction><ConfirmAction action={cancelEnrollment} title="Batalkan enrollment?" description="Gunakan ini bila enrollment dibuat karena salah input." triggerLabel="Batalkan" confirmLabel="Batalkan enrollment"><input type="hidden" name="enrollmentId" value={activeEnrollment.id} /></ConfirmAction></div></article> : <div className="empty-state compact-empty"><strong>Belum ada enrollment aktif</strong><p>Tempatkan siswa ke rombel aktif saat data kelas sudah siap.</p></div>}
          {student.enrollments.length > 0 ? <div className="timeline-list">{student.enrollments.map((item) => <div className="timeline-item" key={item.id}><div><strong>{item.academicYear.name} · {item.classGroup.gradeLevel.name} · {item.classGroup.name}</strong><p>{item.status}</p></div><time>{item.startedAt.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</time></div>)}</div> : null}
        </section>
      </section>

      <section className="panel section-panel" id="lifecycle">
        <div className="section-heading"><div><h2>Status siswa</h2><p>Perubahan status memengaruhi operasional siswa dan harus disertai alasan.</p></div><ModalForm triggerLabel="Ubah Status" title="Ubah status siswa" description={`Status saat ini: ${student.status}.`}><form action={changeStudentStatus} className="admin-form"><input type="hidden" name="studentId" value={student.id} /><label>Status baru<select name="status" required defaultValue={student.status}><option value="ACTIVE">Aktif</option><option value="GRADUATED">Lulus</option><option value="TRANSFERRED">Pindah sekolah</option><option value="INACTIVE">Nonaktif</option></select></label><label>Alasan<textarea name="reason" rows={3} required minLength={5} /></label><div className="form-actions"><button className="primary-button" type="submit">Simpan status</button></div></form></ModalForm></div>
        <p className="muted-text">Gunakan status Lulus atau Pindah Sekolah untuk kejadian permanen. Gunakan Nonaktif untuk penghentian sementara.</p>
      </section>
    </div>
  );
}
