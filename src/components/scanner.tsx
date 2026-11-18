"use client";
import { useRef, useState, useEffect } from "react";
import {
  Camera,
  ScanLine,
  Printer,
  ArrowRight,
  X,
  AlertCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import type { AppState } from "./operation-workspace";
export function BarcodeWorkspace({
  state,
  onHandover,
}: {
  state: AppState;
  onHandover: (assetId: string) => void;
}) {
  const [code, setCode] = useState(""),
    [scanned, setScanned] = useState(""),
    [error, setError] = useState(""),
    [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      stop.current?.();
    },
    [],
  );
  const result = state.masters.find(
    (m) =>
      m.id === scanned ||
      m.code === scanned ||
      String(m.data.barcode ?? "") === scanned,
  );
  const lot = state.stock.find(
    (l) => l.id === scanned || l.lotCode === scanned,
  );
  const product = result ?? state.masters.find((m) => m.id === lot?.productId);
  const lots = state.stock
    .filter((l) => l.productId === product?.id && Number(l.quantity) > 0)
    .toSorted((a, b) =>
      (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999"),
    );
  async function start() {
    setError("");
    setCamera(true);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      if (!video.current)
        throw new Error("Video belum tersedia. Coba kembali.");
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        video.current,
        (result) => {
          if (result) {
            setScanned(result.getText());
            setCode(result.getText());
            stop.current?.();
            setCamera(false);
          }
        },
      );
      stop.current = () => controls.stop();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Kamera tidak tersedia. Gunakan input manual.",
      );
      setCamera(false);
    }
  }
  return (
    <div className="scanner-layout">
      <section className="panel scanner-panel">
        <div className="panel-heading">
          <div>
            <h2>Pindai barang, lot, atau aset</h2>
            <p>Kamera membutuhkan HTTPS dan izin perangkat.</p>
          </div>
          <ScanLine size={22} />
        </div>
        <div className="camera-view">
          <video
            ref={video}
            muted
            playsInline
            className={camera ? "" : "camera-hidden"}
          />
          {!camera && (
            <div className="camera-placeholder">
              <ScanLine size={58} />
              <p>Tempatkan label barcode di depan kamera</p>
              <Button onClick={() => void start()}>
                <Camera size={16} /> Aktifkan kamera
              </Button>
            </div>
          )}
          {camera && (
            <button
              className="button button-outline"
              onClick={() => {
                stop.current?.();
                setCamera(false);
              }}
            >
              Hentikan kamera
            </button>
          )}
        </div>
        <form
          className="barcode-search"
          onSubmit={(e) => {
            e.preventDefault();
            setScanned(code.trim());
          }}
        >
          <input
            aria-label="Kode barcode"
            placeholder="Atau ketik / pindai dengan scanner USB…"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
          />
          <Button>
            Cari <ArrowRight size={15} />
          </Button>
        </form>
        {error && (
          <div className="alert error">
            <AlertCircle size={15} />
            {error}
          </div>
        )}
      </section>
      <section className="panel scanner-result">
        <h2>Hasil pemindaian</h2>
        {product ? (
          <>
            <span className="badge green">{product.kind}</span>
            <h3>{product.name}</h3>
            <p>{product.code}</p>
            <dl className="detail-fields">
              {Object.entries(product.data).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
            </dl>
            <div className="label-preview">
              <img
                alt={`Label barcode ${product.code}`}
                src={`/api/barcode?company=${state.company.id}&text=${encodeURIComponent(String(product.data.barcode || product.code))}`}
              />
              <strong>{product.name}</strong>
              <small>{product.code}</small>
            </div>
            <div className="actions">
              <Button variant="outline" onClick={() => window.print()}>
                <Printer size={15} /> Cetak label
              </Button>
              {product.kind === "ASSET" && (
                <Button onClick={() => onHandover(product.id)}>
                  Serah terima aset
                </Button>
              )}
            </div>
            {lots.length > 0 && (
              <>
                <h3 className="fefo-title">Urutan FEFO</h3>
                {lots.map((l, i) => (
                  <div className="fefo-item" key={l.id}>
                    <span>{i + 1}</span>
                    <div>
                      <strong>{l.lotCode}</strong>
                      <small>
                        {l.expiresAt?.slice(0, 10) ?? "Tanpa kedaluwarsa"} ·{" "}
                        {l.quantity} tersedia
                      </small>
                    </div>
                    <span
                      className={`badge ${l.quarantined ? "red" : "green"}`}
                    >
                      {l.quarantined ? "Karantina" : "Lot"}
                    </span>
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <div className="empty">
            {scanned
              ? "Kode tidak ditemukan pada perusahaan/cabang ini."
              : "Hasil pemindaian akan tampil di sini."}
          </div>
        )}
      </section>
    </div>
  );
}
