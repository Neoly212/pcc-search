export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { tenderName, companyName } = req.query;
  const results = {};

  // ── Explore sme.gov.tw API with different params ───────────────────────────

  // Test 1: Basic call - see all available fields
  try {
    const r = await fetch('https://pms.sme.gov.tw/PMSApi/v2/ODT/OPN?pageSize=3&pageIndex=1', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    results.basic = { status: r.status, preview: text.slice(0, 800) };
  } catch(e) { results.basic = { error: e.message }; }

  // Test 2: Search by 計畫名稱 (plan name - closest to tender name)
  if (tenderName) {
    try {
      const r = await fetch(`https://pms.sme.gov.tw/PMSApi/v2/ODT/OPN?計畫名稱=${encodeURIComponent(tenderName)}&pageSize=5`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      const text = await r.text();
      results.byPlanName = { status: r.status, preview: text.slice(0, 500) };
    } catch(e) { results.byPlanName = { error: e.message }; }
  }

  // Test 3: Try award endpoint (決標)
  try {
    const r = await fetch('https://pms.sme.gov.tw/PMSApi/v2/ODT/AWD?pageSize=3&pageIndex=1', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    results.award = { status: r.status, preview: text.slice(0, 800) };
  } catch(e) { results.award = { error: e.message }; }

  // Test 4: Try pcc.gov.tw open data API (different path)
  try {
    const r = await fetch('https://web.pcc.gov.tw/tpsreport/transfer/dataTransfer.do?method=getOpenDataJson&type=AWARD&pageSize=3', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json, */*' },
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    results.pccOpenData = { status: r.status, ct: r.headers.get('content-type'), preview: text.slice(0, 500) };
  } catch(e) { results.pccOpenData = { error: e.message }; }

  // Test 5: Try OpenAPI from data.gov.tw
  try {
    const r = await fetch('https://data.gov.tw/api/v2/rest/datastore/355000000A-000084-001?limit=3&offset=0', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    results.dataGov = { status: r.status, ct: r.headers.get('content-type'), preview: text.slice(0, 500) };
  } catch(e) { results.dataGov = { error: e.message }; }

  // Test 6: pcc.gov.tw new API path
  try {
    const r = await fetch('https://web.pcc.gov.tw/prkms/prms-core/common/downloadFile?type=awardDeclarationQry', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json, */*' },
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    results.pccNew = { status: r.status, ct: r.headers.get('content-type'), preview: text.slice(0, 300) };
  } catch(e) { results.pccNew = { error: e.message }; }

  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(results);
}
