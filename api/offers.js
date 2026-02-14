export default async function handler(req, res) {
  try {
    const url = process.env.SHEET_OFFERS_CSV_URL;
    if (!url) return res.status(500).json({ error: "Missing SHEET_OFFERS_CSV_URL" });

    const csv = await (await fetch(url)).text();
    const rows = csvToJson(csv);

    const offers = rows
      .filter(r => r.id)
      .map(r => ({
        id: r.id,
        fornitore: r.fornitore,
        nome_offerta: r.nome_offerta,
        canale: r.canale,
        fascia: r.fascia,
        tipo_prezzo: r.tipo_prezzo,
        indice: r.indice,

        spread_unit: toNum(r.spread_unit),
        prezzo_fisso_unit: toNum(r.prezzo_fisso_unit),
        quota_fissa_mese: toNum(r.quota_fissa_mese),
        variabili_unit: toNum(r.variabili_unit),
        sconto_mese: toNum(r.sconto_mese),

        // energia verde: la leggiamo ma NON la useremo nei calcoli
        verde_fee_mese: toNum(r.verde_fee_mese),
        verde_fee_unit: toNum(r.verde_fee_unit),

        perdite_applica: String(r.perdite_applica || "").toUpperCase() === "TRUE",
        ordine_visualizzazione: toNum(r.ordine_visualizzazione),
        note: r.note || ""
      }));

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ offers });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}

function toNum(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function csvToJson(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim()));
    return obj;
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
