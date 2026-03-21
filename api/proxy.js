export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type, tenderName, companyName, startDate, endDate, pageIndex, pageSize } = req.query;

  // Try the actual official PCC API endpoint and params
  // Based on network inspection of web.pcc.gov.tw
  const params = new URLSearchParams();

  if (type === 'award') {
    // 決標公告
    params.set('searchMethod', 'AWARD_DECLARATION');
  } else {
    // 招標公告
    params.set('searchMethod', 'TENDER_DECLARATION');
  }

  params.set('searchTarget', 'ATM');
  if (tenderName)  params.set('tenderName', tenderName);
  if (companyName) params.set('companyName', companyName);
  if (startDate)   params.set('tenderStartDate', startDate);
  if (endDate)     params.set('tenderEndDate', endDate);
  params.set('pageIndex', pageIndex || '1');
  params.set('pageSize',  pageSize  || '20');
  params.set('isSpdt', 'N');

  const targetUrl = `https://web.pcc.gov.tw/prkms/tender/common/bulletion/readBulletion?${params.toString()}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9',
        'Referer': 'https://web.pcc.gov.tw/prkms/tender/common/bulletion/indexBulletion',
        'Origin': 'https://web.pcc.gov.tw',
        'Cookie': '',
      },
      signal: AbortSignal.timeout(15000),
    });

    const text = await response.text();

    // Always return debug info so we can see what's happening
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      _debug: {
        targetUrl,
        httpStatus: response.status,
        contentType: response.headers.get('content-type'),
        bodyPreview: text.slice(0, 500),
      },
      // Try to parse as JSON
      ...((() => { try { return JSON.parse(text); } catch { return { _rawText: text.slice(0, 2000) }; } })())
    });

  } catch (error) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      _debug: { error: error.message, targetUrl }
    });
  }
}
