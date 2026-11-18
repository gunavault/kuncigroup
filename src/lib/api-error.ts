import { NextResponse } from "next/server";
import { z } from "zod";
import { AccessError } from "./auth";
export function apiFail(error: unknown) {
  if (error instanceof AccessError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof z.ZodError)
    return NextResponse.json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  const message = error instanceof Error ? error.message : "Permintaan gagal.";
  console.error(message);
  return NextResponse.json(
    {
      error:
        message.includes("Invalid `") || message.includes("Raw query")
          ? "Operasi ditolak oleh validasi database. Periksa referensi, saldo, atau periode."
          : message.includes("Unique constraint")
            ? "Kode, barcode, atau sumber sudah terdaftar."
            : message,
    },
    { status: 400 },
  );
}
