export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { company = '正茂生物', year = '2024' } = req.query;

  const H = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9',
    'Referer': 'https://web.pcc.gov.tw/prkms/tender/common/bulletion/indexBulletion',
  };

  const results = {};

  // Test 1: GET with querySentence
  try {
    const params = new URLSearchParams({
      querySentence: company,
      tenderStatusType: '決標',
      pageSize: '10',
      pageIndex: '1',
      isSpdt: 'N',
      tenderStartDate: `${year}/01/01`,
      tenderEndDate: `${year}/12/31`,
    });
    const url = `https://web.pcc.gov.tw/prkms/tender/common/bulletion/readBulletion?${params}`;
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(12000) });
    const html = await r.text();
    results.get_querySentence = {
      status: r.status,
      url,
      htmlLen: html.length,
      has決標日期: html.includes('決標日期'),
      has標案名稱: html.includes('標案名稱'),
      hasTd: html.includes('<td'),
      hasTbody: html.includes('<tbody'),
      // Show section around any result
      preview: html.slice(0, 300),
      midSection: findResultSection(html),
    };
  } catch(e) { results.get_querySentence = { error: e.message }; }

  // Test 2: POST with form data  
  try {
    const body = new URLSearchParams({
      querySentence: company,
      tenderStatusType: '決標',
      pageSize: '10',
      pageIndex: '1',
      isSpdt: 'N',
      tenderStartDate: `${year}/01/01`,
      tenderEndDate: `${year}/12/31`,
    });
    const url = 'https://web.pcc.gov.tw/prkms/tender/common/bulletion/readBulletion';
    const r = await fetch(url, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(12000),
    });
    const html = await r.text();
    results.post_form = {
      status: r.status,
      htmlLen: html.length,
      has決標日期: html.includes('決標日期'),
      hasTd: html.includes('<td'),
      preview: html.slice(0, 300),
      midSection: findResultSection(html),
    };
  } catch(e) { results.post_form = { error: e.message }; }

  // Test 3: Try different endpoint - tenderSearch
  try {
    const params = new URLSearchParams({
      tenderName: company,
      tenderStatus: 'AWARD',
      pageSize: '10',
      pageIndex: '1',
    });
    const url = `https://web.pcc.gov.tw/prkms/tender/common/basicSearch/readTenderBasic?${params}`;
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(12000) });
    const text = await r.text();
    results.basicSearch = {
      status: r.status,
      ct: r.headers.get('content-type'),
      len: text.length,
      preview: text.slice(0, 400),
    };
  } catch(e) { results.basicSearch = { error: e.message }; }

  // Test 4: Try the ATM search with companyName param
  try {
    const params = new URLSearchParams({
      companyName: company,
      searchMethod: 'AWARD_DECLARATION',
      searchTarget: 'ATM',
      pageSize: '10',
      pageIndex: '1',
    });
    const url = `https://web.pcc.gov.tw/prkms/tender/common/bulletion/readBulletion?${params}`;
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(12000) });
    const html = await r.text();
    results.companyName_param = {
      status: r.status,
      htmlLen: html.length,
      has決標: html.includes('決標'),
      has正茂: html.includes('正茂'),
      hasTd: html.includes('<td'),
      midSection: findResultSection(html),
    };
  } catch(e) { results.companyName_param = { error: e.message }; }

  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(results);
}

function findResultSection(html) {
  // Find area with actual data
  const markers = ['正茂', '決標日期', 'tenderName', 'award', 'tbody', '<tr'];
  for (const m of markers) {
    const idx = html.indexOf(m);
    if (idx > 0) {
      return `[${m} at ${idx}]: ...${html.slice(Math.max(0, idx-100), idx+300)}...`;
    }
  }
  return 'no markers found';
}
