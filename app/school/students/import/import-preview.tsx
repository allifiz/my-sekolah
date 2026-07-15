"use client";

import { ChangeEvent, useMemo, useState } from "react";

import { importStudents } from "./actions";

type ImportRow = {
  rowNumber: number;
  nis: string;
  nisn: string;
  name: string;
  gender: "" | "L" | "P";
  birthPlace: string;
  birthDate: string;
  errors: string[];
};

const expectedHeaders = ["nis", "nisn", "name", "gender", "birth_place", "birth_date"];

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function validateDate(value: string) {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

function buildRows(matrix: string[][]): ImportRow[] {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((value) => value.trim().toLowerCase().replace(/^\uFEFF/, ""));
  if (expectedHeaders.some((header, index) => headers[index] !== header)) return [];

  const nisValues = new Map<string, number>();
  const nisnValues = new Map<string, number>();

  return matrix.slice(1).map((values, index) => {
    const rowNumber = index + 2;
    const nis = String(values[0] ?? "").trim();
    const nisn = String(values[1] ?? "").trim();
    const name = String(values[2] ?? "").trim();
    const rawGender = String(values[3] ?? "").trim().toUpperCase();
    const gender: "" | "L" | "P" = rawGender === "L" || rawGender === "P" ? rawGender : "";
    const birthPlace = String(values[4] ?? "").trim();
    const birthDate = String(values[5] ?? "").trim();
    const errors: string[] = [];

    if (!nis) errors.push("NIS wajib diisi");
    if (!name || name.length < 2) errors.push("Nama minimal 2 karakter");
    if (rawGender && !gender) errors.push("Gender harus L atau P");
    if (!validateDate(birthDate)) errors.push("Tanggal lahir harus YYYY-MM-DD");

    if (nis) {
      const previous = nisValues.get(nis);
      if (previous) errors.push(`NIS duplikat dengan baris ${previous}`);
      else nisValues.set(nis, rowNumber);
    }
    if (nisn) {
      const previous = nisnValues.get(nisn);
      if (previous) errors.push(`NISN duplikat dengan baris ${previous}`);
      else nisnValues.set(nisn, rowNumber);
    }

    return { rowNumber, nis, nisn, name, gender, birthPlace, birthDate, errors };
  });
}

export function ImportPreview() {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileError, setFileError] = useState("");

  const validRows = useMemo(() => rows.filter((row) => row.errors.length === 0), [rows]);
  const invalidRows = rows.length - validRows.length;

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setRows([]);
    setFileError("");
    setFileName(file?.name ?? "");
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv") || file.size > 2 * 1024 * 1024) {
      setFileError("Gunakan file CSV maksimal 2 MB.");
      return;
    }

    const matrix = parseCsv(await file.text());
    const parsedRows = buildRows(matrix);
    if (parsedRows.length === 0) {
      setFileError(`Header harus persis: ${expectedHeaders.join(", ")}`);
      return;
    }
    setRows(parsedRows);
  }

  const payload = JSON.stringify(validRows.map(({ errors: _errors, ...row }) => row));

  return (
    <div>
      <label>
        File CSV
        <input type="file" accept=".csv,text/csv" onChange={handleFile} />
      </label>
      <p>Gunakan CSV UTF-8. File dapat dibuat atau disimpan melalui Microsoft Excel, LibreOffice, atau Google Sheets.</p>
      {fileName ? <p><strong>File:</strong> {fileName}</p> : null}
      {fileError ? <p><strong>Gagal:</strong> {fileError}</p> : null}

      {rows.length > 0 ? (
        <>
          <section className="stats-grid">
            <article><span>Total baris</span><strong>{rows.length}</strong></article>
            <article><span>Valid</span><strong>{validRows.length}</strong></article>
            <article><span>Bermasalah</span><strong>{invalidRows}</strong></article>
          </section>

          <div className="panel section-panel">
            <h3>Preview</h3>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr><th>Baris</th><th>NIS</th><th>NISN</th><th>Nama</th><th>Gender</th><th>Tempat lahir</th><th>Tanggal lahir</th><th>Validasi</th></tr></thead>
                <tbody>
                  {rows.slice(0, 100).map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td><td>{row.nis}</td><td>{row.nisn || "-"}</td><td>{row.name}</td><td>{row.gender || "-"}</td><td>{row.birthPlace || "-"}</td><td>{row.birthDate || "-"}</td>
                      <td>{row.errors.length === 0 ? "Valid" : row.errors.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 100 ? <p>Preview menampilkan 100 baris pertama.</p> : null}
          </div>

          <form action={importStudents}>
            <input type="hidden" name="payload" value={payload} />
            <button type="submit" className="primary-button" disabled={invalidRows > 0 || validRows.length === 0}>
              Import {validRows.length} Siswa
            </button>
            {invalidRows > 0 ? <p>Perbaiki semua baris bermasalah sebelum import.</p> : null}
          </form>
        </>
      ) : null}
    </div>
  );
}
