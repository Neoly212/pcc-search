export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type } = req.query;
  const PCC_BASE = 'https://web.pcc.gov.tw/prkms/tender/common';

  // Endpoint routing:
  // type=tender → 招標公告查詢
  // type=award  → 決標公告查詢
  const endpointMap = {
    tender: `${PCC_BASE}/bulletion/readBulletion`,
    award:  `${PCC_BASE}/bulletion/readBulletion`,
  };

  // Build query params from request
  const params = new URLSearchParams();

  // Common params
  if (req.query.tenderName)    params.set('tenderName', req.query.tenderName);
  if (req.query.companyName)   params.set('companyName', req.query.companyName);
  if (req.query.startDate)     params.set('tenderStartDate', req.query.startDate);
  if (req.query.endDate)       params.set('tenderEndDate', req.query.endDate);
  if (req.query.pageIndex)     params.set('pageIndex', req.query.pageIndex);
  if (req.query.pageSize)      params.set('pageSize', req.query.pageSize || '20');

  // searchType determines tender vs award
  if (type === 'award') {
    params.set('searchMethod', 'AWARD_DECLARATION');
    params.set('searchTarget', 'ATM');
  } else {
    params.set('searchMethod', 'TENDER_DECLARATION');
    params.set('searchTarget', 'ATM');
  }

  const targetUrl = `${PCC_BASE}/bulletion/readBulletion?${params.toString()}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        'Referer': 'https://web.pcc.gov.tw/prkms/tender/common/bulletion/indexBulletion',
        'Origin': 'https://web.pcc.gov.tw',
      },
      signal: AbortSignal.timeout(15000),
    });

    const text = await response.text();
    const ct = response.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', ct.includes('json') ? 'application/json' : ct);
    return res.status(response.status).send(text);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
