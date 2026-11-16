// Lettura automatica di bollette e CTE con l'IA (API Anthropic).
//   POST /api/estrai   header x-gede-key
//   body: { tipo: "bolletta" | "cte", file: <base64>, media_type: "application/pdf" | "image/jpeg" | "image/png" }
// Variabili d'ambiente: ANTHROPIC_API_KEY (obbligatoria), ANTHROPIC_MODEL (facoltativa).

import { isAdmin, isCollaboratore } from "./_auth.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

const REGOLE_COMUNI = `
Regole:
- Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo e senza blocchi di codice.
- Numeri con il punto decimale (0.0275, non "0,0275"). Prezzi unitari in €/kWh per la luce e €/Smc per il gas.
- Se un dato non è presente o non sei sicuro, metti null. Non inventare valori.
- Escludi sempre l'energia verde / opzioni green dai prezzi.
`;

const PROMPT_BOLLETTA = `Sei un consulente energia italiano. Leggi questa bolletta luce o gas e restituisci questo JSON:
{
  "tipo_fornitura": "luce" | "gas",
  "uso": "domestico" | "business",
  "cliente": { "nome": string, "cf_piva": string|null, "indirizzo_fornitura": string|null },
  "fornitore_attuale": string,
  "nome_offerta_attuale": string|null,
  "codice_pod_pdr": string|null,
  "tensione": "BT" | "MT" | null,
  "potenza_impegnata_kw": number|null,
  "periodo": { "dal": "GG/MM/AAAA"|null, "al": "GG/MM/AAAA"|null, "mesi": number|null },
  "consumo_periodo": number|null,
  "consumo_annuo": number|null,
  "consumo_annuo_fonte": "bolletta" | "stimato" | null,
  "fasce": { "f1": number|null, "f2": number|null, "f3": number|null },
  "tipo_prezzo_attuale": "FISSO" | "VAR" | null,
  "indice_riferimento": "PUN" | "PSV" | null,
  "spread_unit": number|null,
  "prezzo_energia_unit": number|null,
  "valore_indice_periodo": number|null,
  "quota_fissa_vendita_mese": number|null,
  "spesa_vendita_periodo": number|null,
  "totale_bolletta": number|null,
  "note": string
}
Indicazioni:
- "consumo_annuo": usa il consumo annuo/ultimi 12 mesi riportato in bolletta (fonte "bolletta"). Se manca, stima da consumo del periodo e mesi (fonte "stimato") e spiegalo nelle note.
- "spread_unit": lo spread/maggiorazione sopra PUN o PSV come scritto nelle condizioni (valore nominale, senza correzione PCS).
- "prezzo_energia_unit": per offerta a prezzo fisso, il prezzo fisso della componente energia/gas; per variabile il prezzo medio unitario della materia applicato nel periodo, se indicato.
- "valore_indice_periodo": il valore del PUN o PSV applicato nel periodo, se è stampato.
- "quota_fissa_vendita_mese": la quota fissa di commercializzazione/vendita del fornitore in €/mese (non le quote fisse di rete o oneri). Se è annua dividila per 12.
- "spesa_vendita_periodo": totale della spesa per la materia energia / vendita del periodo, imposte e IVA escluse.
- "uso": "business" se intestata a società/partita IVA o uso non domestico.
- "tensione": solo per la luce.
- In "note" segnala in italiano, brevemente, dubbi o dati ricavati per calcolo.
${REGOLE_COMUNI}`;

const PROMPT_CTE = `Sei un consulente energia italiano. Leggi queste Condizioni Tecnico Economiche (CTE) di un fornitore e restituisci questo JSON:
{
  "fornitore": string,
  "valida_dal": "GG/MM/AAAA"|null,
  "valida_fino": "GG/MM/AAAA"|null,
  "offerte": [
    {
      "nome_offerta": string,
      "canale": "Domestico Luce" | "Domestico Gas" | "Business Luce" | "Business Gas",
      "fascia": "" | "PMI" | "MICRO",
      "tipo_prezzo": "VAR" | "FISSO",
      "indice": "PUN" | "PSV",
      "spread_unit": number,
      "prezzo_fisso_unit": number,
      "quota_fissa_mese": number,
      "sconto_mese": number,
      "valida_fino": "GG/MM/AAAA"|null,
      "note": string
    }
  ]
}
Indicazioni:
- Una voce per ogni offerta/variante (se lo spread o la quota fissa cambiano per fascia di consumo o tipo cliente, una voce per variante, spiegando nelle note e nel nome).
- "spread_unit": spread nominale sopra PUN/PSV, senza correzione PCS e senza perdite di rete. 0 per le offerte a prezzo fisso.
- "prezzo_fisso_unit": prezzo fisso della componente energia/gas; 0 per le variabili.
- "quota_fissa_mese": quota fissa di commercializzazione/vendita in €/mese (se annua dividi per 12). Escludi quote di rete e oneri di sistema.
- "sconto_mese": sconti fissi mensili (es. domiciliazione SDD), 0 se assenti; descrivi la condizione nelle note.
- Nelle note indica in breve durata del prezzo, vincoli e condizioni particolari.
${REGOLE_COMUNI}`;

// Simulatore v3 (bolletta rifatta sullo stesso periodo): più pagine in immagine.
const PROMPT_BOLLETTA3 = "Sei un consulente energia italiano esperto di bollette. Le immagini sono le pagine di UNA bolletta luce o gas, in ordine. Leggila con attenzione e restituisci SOLO questo JSON (numeri con il punto decimale, null se il dato non c'è):\n{\n  \"tipo\": \"luce\" | \"gas\",\n  \"uso\": \"domestico\" | \"altri_usi\",\n  \"residente\": true | false | null,\n  \"cliente\": { \"nome\": string, \"cf_piva\": string|null, \"indirizzo_fornitura\": string },\n  \"pod_pdr\": string,\n  \"fornitore_attuale\": string,\n  \"offerta_attuale\": string,\n  \"potenza_impegnata_kw\": number|null,\n  \"tensione_v\": number|null,\n  \"periodo_dal\": \"AAAA-MM-GG\",\n  \"periodo_al\": \"AAAA-MM-GG\",\n  \"mesi_fatturati\": number,\n  \"consumi_periodo\": { \"F1\": number|null, \"F2\": number|null, \"F3\": number|null, \"totale\": number },\n  \"consumo_annuo\": { \"F1\": number|null, \"F2\": number|null, \"F3\": number|null, \"totale\": number|null },\n  \"pun_periodo\": { \"F1\": number|null, \"F2\": number|null, \"F3\": number|null },\n  \"psv_periodo\": number|null,\n  \"importi\": {\n    \"vendita_consumi\": number,\n    \"vendita_quota_fissa\": number,\n    \"rete_oneri_consumi\": number,\n    \"rete_oneri_quota_fissa\": number,\n    \"rete_oneri_quota_potenza\": number,\n    \"accise\": number,\n    \"iva_percentuale\": number,\n    \"iva_importo\": number,\n    \"altre_partite\": number,\n    \"totale_bolletta\": number\n  },\n  \"note\": string\n}\nRegole:\n- Prendi gli importi dal riepilogo/\"scontrino\" della bolletta: \"spesa per la vendita\" (quota consumi e quota fissa), \"spesa per la rete e oneri generali di sistema\" (quota consumi, quota fissa, quota potenza), \"imposte\"/accise, IVA.\n- \"uso\": \"altri_usi\" se la bolletta dice altri usi, usi diversi, business, partita IVA, condominio; altrimenti \"domestico\".\n- Consumi: luce in kWh, gas in Smc. Per la luce riporta i kWh per fascia F1/F2/F3 del periodo fatturato (se ci sono più righe per la stessa fascia, sommale). Se la bolletta è monoraria metti tutto in \"totale\" e F1/F2/F3 null.\n- Consumo annuo: il valore \"consumo annuo\" indicato in bolletta (con le fasce se presenti).\n- pun_periodo / psv_periodo: solo se la bolletta li stampa per il periodo (in €/kWh o €/Smc), altrimenti null.\n- mesi_fatturati: numero di mesi del periodo (es. 1 per un mese, 2 per un bimestre).\n- Accise: se il riepilogo riporta solo \"Accise e IVA\" insieme, cerca il \"Subtotale Accise\" nel dettaglio imposte; se non c'è, accise = (Accise e IVA) − importo IVA.\n- \"altre_partite\": tutto ciò che sta fuori dall'imponibile delle voci sopra (canone RAI, bonus sociale, conguagli, interessi, arrotondamenti, bollo). 0 se non ce ne sono.\n- \"totale_bolletta\": il totale da pagare di QUESTA bolletta, comprese le altre partite (canone RAI ecc.); se la bolletta mostra \"Totale bolletta\" e sotto aggiunge il canone RAI, usa il \"Totale da pagare\". Escludi solo rate o insoluti di altre bollette.\n- Controlla che (vendita + rete/oneri + accise) × (1 + IVA%) + altre_partite ≈ totale; se non torna, metti la differenza in \"altre_partite\" e spiegalo in \"note\".\n- \"note\": max 2 frasi in italiano su dati dubbi o mancanti, altrimenti \"\".\n\nRispondi SOLO con il JSON, senza testo prima o dopo e senza blocchi di codice.";

function estraiJSON(testo) {
  const t = String(testo || "").replace(/```(?:json)?/gi, "").trim();
  const inizio = t.indexOf("{");
  const fine = t.lastIndexOf("}");
  if (inizio < 0 || fine <= inizio) throw new Error("Risposta IA non in formato JSON");
  return JSON.parse(t.slice(inizio, fine + 1));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo non consentito" });
  }
  const { tipo, file, media_type, files } = req.body || {};

  if (tipo === "cte" ? !isAdmin(req) : !isCollaboratore(req)) {
    return res.status(401).json({ error: "Password non valida" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "Chiave IA non configurata (ANTHROPIC_API_KEY su Vercel)" });
  }
  const multi = tipo === "bolletta3" && Array.isArray(files) && files.length > 0 && files.length <= 20 && files.every((f) => f && typeof f.data === "string" && /^image\/(jpeg|png|webp)$/.test(f.media_type || ""));
  if (!multi && (!["bolletta", "cte"].includes(tipo) || typeof file !== "string" || !file)) {
    return res.status(400).json({ error: "Richiesta non valida: serve tipo e file" });
  }

  const mt = media_type || "application/pdf";
  const blocco = mt === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: mt, data: file } }
    : { type: "image", source: { type: "base64", media_type: mt, data: file } };
  const contenuto = multi
    ? [...files.map((f) => ({ type: "image", source: { type: "base64", media_type: f.media_type, data: f.data } })), { type: "text", text: PROMPT_BOLLETTA3 }]
    : [blocco, { type: "text", text: tipo === "cte" ? PROMPT_CTE : PROMPT_BOLLETTA }];

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: contenuto,
        }],
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = data && data.error && data.error.message ? data.error.message : `HTTP ${r.status}`;
      return res.status(502).json({ error: `Errore del servizio IA: ${msg}` });
    }
    const testo = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    return res.status(200).json({ ok: true, dati: estraiJSON(testo) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: `Lettura non riuscita: ${e.message}` });
  }
}
