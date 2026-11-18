import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Kunci Group · Finance Workspace",
  description:
    "ERP Akuntansi & Keuangan Kunci Group — tujuh tahap siklus akuntansi.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
