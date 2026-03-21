export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type, tenderName, companyName, startDate, endDate, pageIndex } = req.query;

  // Step 1: Get session cookie
  let cookies = '';
  try {
    const indexPage = await fetch('https://web.pcc.gov.tw/prkms/tender/common/bulletion/indexBulletion', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });
    const setCookie = indexPage.headers.get('set-cookie');
    if (setCookie) cookies = setCookie.split(';')[0];
  } catch(e) {}

  // Step 2: POST search
  const isAward = type === 'award';
  const formData = new URLSearchParams();
  formData.set('searchMethod', isAward ? 'AWARD_DECLARATION' : 'TENDER_DECLARATION');
  formData.set('searchTarget', 'ATM');
  formData.set('isSpdt', 'N');
  formData.set('pageIndex', pageIndex || '1');
  formData.set('pageSize', '20');
  if (tenderName)  formData.set('tenderName', tenderName);
  if (companyName) formData.set('companyName', companyName);
  if (startDate)   formData.set('tenderStartDate', startDate);
  if (endDate)     formData.set('tenderEndDate', endDate);

  try {
    const response = await fetch('https://web.pcc.gov.tw/prkms/tender/common/bulletion/readBulletion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9',
        'Referer': 'https://web.pcc.gov.tw/prkms/tender/common/bulletion/indexBulletion',
        'Origin': 'https://web.pcc.gov.tw',
        ...(cookies ? { 'Cookie': cookies } : {}),
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(15000),
    });

    const html = await response.text();

    // Return a section of the HTML around where results should be
    // Look for keywords that indicate results table
    const markers = ['決標日期', '標案名稱', '得標廠商', '招標方式', '共', '筆', 'tenderList', 'resultList', 'tbody'];
    const findings = {};
    for (const m of markers) {
      const idx = html.indexOf(m);
      findings[m] = idx === -1 ? 'NOT FOUND' : `found at ${idx}: ...${html.slice(Math.max(0,idx-50), idx+100)}...`;
    }

    // Extract 2000 chars around first result indicator
    const resultIdx = html.indexOf('決標日期');
    const resultSection = resultIdx > -1 ? html.slice(Math.max(0, resultIdx-200), resultIdx+2000) : 'NOT FOUND';

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      httpStatus: response.status,
      htmlLength: html.length,
      markers: findings,
      resultSection,
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
