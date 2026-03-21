export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type, tenderName, companyName, startDate, endDate, pageIndex, pageSize } = req.query;

  const results = {};

  // ── Try 1: pcc.gov.tw open data XML ──────────────────────────────────────
  try {
    const xmlUrl = `https://web.pcc.gov.tw/tpsreport/transfer/dataTransfer.do?method=getOkfnOpenDataXml&type=${type === 'award' ? 'AWARD' : 'TENDER'}`;
    const r = await fetch(xmlUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
      signal: AbortSignal.timeout(8000),
    });
    results.xml = { status: r.status, preview: (await r.text()).slice(0, 300) };
  } catch(e) { results.xml = { error: e.message }; }

  // ── Try 2: pms.sme.gov.tw API ─────────────────────────────────────────────
  try {
    const params = new URLSearchParams();
    if (tenderName)  params.set('tenderName', tenderName);
    if (companyName) params.set('companyName', companyName);
    params.set('pageSize', pageSize || '20');
    params.set('pageIndex', pageIndex || '1');
    const smeUrl = `https://pms.sme.gov.tw/PMSApi/v2/ODT/OPN?${params}`;
    const r = await fetch(smeUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    results.sme = { status: r.status, contentType: r.headers.get('content-type'), preview: text.slice(0, 500) };
  } catch(e) { results.sme = { error: e.message }; }

  // ── Try 3: pcc.gov.tw tender search JSON endpoint (another path) ──────────
  try {
    const params = new URLSearchParams({
      method: 'search',
      tenderName: tenderName || '',
      companyName: companyName || '',
      startDate: startDate || '',
      endDate: endDate || '',
    });
    const url3 = `https://web.pcc.gov.tw/tps/QueryTender/query/queryTenderDetail?${params}`;
    const r = await fetch(url3, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json, */*' },
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    results.query = { status: r.status, contentType: r.headers.get('content-type'), preview: text.slice(0, 500) };
  } catch(e) { results.query = { error: e.message }; }

  // ── Try 4: pcc.mlwmlw.org direct (test if CORS allows from Vercel) ────────
  try {
    const url4 = `https://pcc.mlwmlw.org/api/keyword/${encodeURIComponent(tenderName || companyName || 'test')}`;
    const r = await fetch(url4, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Referer': 'https://pcc.mlwmlw.org/',
      },
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    results.mlwmlw = { status: r.status, contentType: r.headers.get('content-type'), preview: text.slice(0, 500) };
  } catch(e) { results.mlwmlw = { error: e.message }; }

  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(results);
}
