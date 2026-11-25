/**
 * Master-data enrichment v5. Only fills values that can be proven:
 * - assetScope from the source workbook's lineage (sha256 prefix of the uploaded file),
 * - Odoo location codes on warehouses whose name matches exactly one location in the
 *   Manual Guide (ABJ-SOP-001.24.06.26, p. 29),
 * - the KBAHO warehouse (Head Office) that does not exist yet, as PENDING.
 * Ambiguous matches are reported, not written.
 */
export const ASSET_SOURCES: Record<string, "HEAD_OFFICE" | "PROJECT"> = {
  // Master Data Aset Head Office - KBA.xlsx
  "upload-c9b709319fd67744bfe5b4e5": "HEAD_OFFICE",
  // Master Data Asset - Project.xlsx
  "upload-c25e09142c3b0dc361f2a743": "PROJECT",
};

/** The 12 KBA warehouses in Odoo (Manual Guide p. 29) with name patterns for matching. */
export const ODOO_LOCATIONS: { code: string; name: string; match: RegExp }[] = [
  { code: "KBAHO", name: "PT Kunci Berkah Abadi - HO", match: /^(gudang|lokasi)?\s*(kantor pusat|head office|ho)$/i },
  { code: "KLHP", name: "KLH - Plaza Kuningan", match: /plaza kuningan/i },
  { code: "KLHB", name: "KLH - Bonas", match: /bonas/i },
  { code: "KBAR", name: "Retail", match: /retail/i },
  { code: "KBAGC", name: "GOR - CSO", match: /gor.*cso/i },
  { code: "KBAHG", name: "Halim - Gardener", match: /halim.*gardener/i },
  { code: "KBAHP", name: "Halim - Pandawa", match: /halim.*pandawa/i },
  { code: "KBAHS", name: "Halim - SKD17", match: /skd\s*17/i },
  { code: "KBAGT", name: "GOR - Teknisi", match: /gor.*teknisi/i },
  { code: "KBAGS", name: "GOR - Stadion", match: /gor.*stadion/i },
  { code: "KBAGG", name: "GOR - Gardener", match: /gor.*gardener/i },
  { code: "KBAGA", name: "GOR - Admin", match: /gor.*admin/i },
];

type Row = { id: string; code: string; name: string; data: Record<string, unknown> };

export function planAssetScopes(assets: Row[]) {
  const updates: { id: string; scope: "HEAD_OFFICE" | "PROJECT"; file: string }[] = [];
  let unknown = 0;
  for (const a of assets) {
    if (a.data.assetScope) continue;
    const refs = Array.isArray(a.data.sourceReferences)
      ? (a.data.sourceReferences as Record<string, unknown>[])
      : [];
    const scopes = new Set(
      refs.map((r) => ASSET_SOURCES[String(r.file)]).filter(Boolean),
    );
    if (scopes.size === 1) {
      const scope = [...scopes][0];
      const file = String(refs.find((r) => ASSET_SOURCES[String(r.file)])?.file);
      updates.push({ id: a.id, scope, file });
    } else unknown++;
  }
  return { updates, unknown };
}

export function planWarehouseCodes(warehouses: Row[]) {
  const assign: { id: string; code: string }[] = [],
    ambiguous: { code: string; candidates: string[] }[] = [],
    missing: { code: string; name: string }[] = [];
  const taken = new Set(warehouses.map((w) => String(w.data.odooCode ?? "")).filter(Boolean));
  for (const loc of ODOO_LOCATIONS) {
    if (taken.has(loc.code)) continue;
    const hits = warehouses.filter((w) => loc.match.test(w.name.replace(/^(gudang|lokasi)\s+/i, "")) || loc.match.test(w.name));
    if (hits.length === 1 && !hits[0].data.odooCode) assign.push({ id: hits[0].id, code: loc.code });
    else if (hits.length > 1) ambiguous.push({ code: loc.code, candidates: hits.map((h) => `${h.code} ${h.name}`) });
    else if (!hits.length) missing.push({ code: loc.code, name: loc.name });
  }
  return { assign, ambiguous, missing };
}
