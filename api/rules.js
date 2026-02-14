export default async function handler(req, res) {
  try {
    const url = process.env.SHEET_RULES_CSV_URL;
    if (!url) return res.status(500).json({ error: "Missing SHEET_RULES_CSV_URL" });

    const csv = await (await fetch(url)).text();
    const rows = csvToJson(csv);

    const rules = rows
      .filter(r => r.canale)
      .map(r => ({
        canale: r.canale,
        soglia_annua: toNum(r.soglia_annua),
        unita: r.unita,
        fascia_sotto: r.fascia_sotto,
        fascia_sopra: r.fascia_sopra
      }));

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ rules });
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
