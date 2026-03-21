export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type, tenderName, companyName, startDate, endDate, pageIndex } = req.query;

  // Step 1: Get session cookie from the index page
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
    if (setCookie) {
      cookies = setCookie.split(';')[0];
    }
  } catch(e) {
    console.error('Session fetch error:', e.message);
  }

  // Step 2: POST search form
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

  const searchUrl = 'https://web.pcc.gov.tw/prkms/tender/common/bulletion/readBulletion';

  try {
    const response = await fetch(searchUrl, {
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

    // Step 3: Parse HTML table into JSON
    const records = parseHTMLTable(html, isAward);
    const totalMatch = html.match(/共\s*(\d+)\s*筆/);
    const total = totalMatch ? parseInt(totalMatch[1]) : records.length;

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      total,
      records,
      _debug: {
        httpStatus: response.status,
        recordCount: records.length,
        htmlLength: html.length,
        htmlPreview: html.slice(0, 200),
      }
    });

  } catch (error) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ error: error.message, records: [], total: 0 });
  }
}

function parseHTMLTable(html, isAward) {
  const records = [];

  // Extract table rows - look for <tr> elements with <td> children
  // PCC site typically has a results table with class or id
  const tableMatch = html.match(/<table[^>]*class="[^"]*list[^"]*"[^>]*>([\s\S]*?)<\/table>/i)
    || html.match(/<table[^>]*id="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/table>/i)
    || html.match(/<tbody>([\s\S]*?)<\/tbody>/i);

  if (!tableMatch) {
    // Try to find any table with multiple rows
    const allTables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
    for (const table of allTables) {
      const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
      if (rows.length > 2) {
        return parseRows(rows, isAward);
      }
    }
    return records;
  }

  const rows = tableMatch[1].match(/<tr[\s\S]*?<\/tr>/gi) || [];
  return parseRows(rows, isAward);
}

function parseRows(rows, isAward) {
  const records = [];
  // Skip header row (first row)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const cells = row.match(/<td[\s\S]*?<\/td>/gi) || [];
    if (cells.length < 3) continue;

    const getText = (cell) => cell.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
    const getLink = (cell) => {
      const m = cell.match(/href="([^"]+)"/);
      return m ? (m[1].startsWith('http') ? m[1] : 'https://web.pcc.gov.tw' + m[1]) : '';
    };

    if (isAward) {
      // Award columns: 序號, 機關名稱, 標案名稱, 決標日期, 決標金額, 得標廠商
      records.push({
        type: 'awarded',
        unit: getText(cells[1] || ''),
        title: getText(cells[2] || ''),
        date: getText(cells[3] || ''),
        amount: parseAmount(getText(cells[4] || '')),
        companies: [getText(cells[5] || '')].filter(Boolean),
        link: getLink(cells[2] || '') || getLink(row),
      });
    } else {
      // Tender columns: 序號, 機關名稱, 標案名稱, 招標方式, 公告日期, 預算金額
      records.push({
        type: 'tender',
        unit: getText(cells[1] || ''),
        title: getText(cells[2] || ''),
        method: getText(cells[3] || ''),
        date: getText(cells[4] || ''),
        amount: parseAmount(getText(cells[5] || '')),
        link: getLink(cells[2] || '') || getLink(row),
      });
    }
  }
  return records.filter(r => r.title && r.title.length > 1);
}

function parseAmount(str) {
  if (!str) return 0;
  const n = Number(str.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}
