import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.schoolId) redirect("/login");

  const rows = [
    ["nis", "nisn", "name", "gender", "birth_place", "birth_date"],
    ["S-001", "0012345678", "Contoh Siswa", "L", "Jakarta", "2012-01-15"],
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="template-import-siswa.csv"',
      "Cache-Control": "no-store",
    },
  });
}
