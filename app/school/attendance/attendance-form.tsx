"use client";

import { useState } from "react";

import { saveAttendance } from "./actions";

type Row = {
  studentId: string;
  nis: string;
  name: string;
  status: "PRESENT" | "SICK" | "EXCUSED" | "ABSENT" | "LATE";
  note: string;
};

const labels = {
  PRESENT: "Hadir",
  SICK: "Sakit",
  EXCUSED: "Izin",
  ABSENT: "Alpa",
  LATE: "Terlambat",
};

export function AttendanceForm({
  classGroupId,
  date,
  initialRows,
  isCorrection,
}: {
  classGroupId: string;
  date: string;
  initialRows: Row[];
  isCorrection: boolean;
}) {
  const [rows, setRows] = useState(initialRows);

  function markAllPresent() {
    setRows((current) => current.map((row) => ({ ...row, status: "PRESENT" })));
  }

  return (
    <form action={saveAttendance} className="admin-form">
      <input type="hidden" name="classGroupId" value={classGroupId} />
      <input type="hidden" name="date" value={date} />

      <div>
        <button type="button" className="secondary-button" onClick={markAllPresent}>Tandai Semua Hadir</button>
      </div>

      <div className="panel section-panel">
        {rows.map((row, index) => (
          <article key={row.studentId} style={{ padding: "1rem 0", borderBottom: "1px solid var(--border, #ddd)" }}>
            <strong>{row.name}</strong>
            <p>{row.nis}</p>
            <div className="admin-form">
              <label>Status
                <select
                  name={`status:${row.studentId}`}
                  value={row.status}
                  onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, status: event.target.value as Row["status"] } : item))}
                >
                  {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Catatan
                <input
                  name={`note:${row.studentId}`}
                  value={row.note}
                  maxLength={300}
                  placeholder="Opsional"
                  onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, note: event.target.value } : item))}
                />
              </label>
            </div>
          </article>
        ))}
      </div>

      {isCorrection ? (
        <label>Alasan koreksi
          <textarea name="correctionReason" rows={3} maxLength={500} required placeholder="Jelaskan alasan perubahan data absensi." />
        </label>
      ) : null}

      <button type="submit" className="primary-button">{isCorrection ? "Simpan Koreksi" : "Simpan Absensi"}</button>
    </form>
  );
}
