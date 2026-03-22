export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { mode, keyword, company, year, pageIndex = '1' } = req.query;

  const H = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9',
    'Referer': 'https://web.pcc.gov.tw/prkms/tender/common/bulletion/indexBulletion',
  };

  // Build querySentence: combine keyword and company
  const queryParts = [keyword, company].filter(Boolean);
  const querySentence = queryParts.join(' ');

  // Date range based on year
  let dateFrom = '', dateTo = '';
  if (year) {
    dateFrom = `${year}/01/01`;
    dateTo   = `${year}/12/31`;
  }

  const results = { awarded: [], tender: [] };

  // ── Fetch awarded (決標) ────────────────────────────────────────────────────
  if (mode !== 'tender_only') {
    try {
      const params = new URLSearchParams({
        querySentence,
        tenderStatusType: '決標',
        sortCol: 'TENDER_NOTICE_DATE',
        pageSize: '50',
        pageIndex,
        isSpdt: 'N',
      });
      if (dateFrom) params.set('tenderStartDate', dateFrom);
      if (dateTo)   params.set('tenderEndDate', dateTo);

      const url = `https://web.pcc.gov.tw/prkms/tender/common/bulletion/readBulletion?${params}`;
      const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(15000) });
      const html = await r.text();

      const parsed = parseBulletionHTML(html, 'awarded', keyword, company);
      results.awarded = parsed;
    } catch(e) {
      console.error('Award fetch error:', e.message);
    }
  }

  // ── Fetch tender (招標) ─────────────────────────────────────────────────────
  if (mode !== 'award_only') {
    try {
      const params = new URLSearchParams({
        querySentence,
        tenderStatusType: '招標',
        sortCol: 'TENDER_NOTICE_DATE',
        pageSize: '50',
        pageIndex,
        isSpdt: 'N',
      });
      if (dateFrom) params.set('tenderStartDate', dateFrom);
      if (dateTo)   params.set('tenderEndDate', dateTo);

      const url = `https://web.pcc.gov.tw/prkms/tender/common/bulletion/readBulletion?${params}`;
      const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(15000) });
      const html = await r.text();

      const parsed = parseBulletionHTML(html, 'tender', keyword, company);
      results.tender = parsed;
    } catch(e) {
      console.error('Tender fetch error:', e.message);
    }
  }

  const records = [...results.awarded, ...results.tender];

  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    total: records.length,
    awardedCount: results.awarded.length,
    tenderCount: results.tender.length,
    records,
    // Debug info
    _debug: {
      querySentence,
      awardedCount: results.awarded.length,
      tenderCount: results.tender.length,
    }
  });
}

// ── Parse the HTML table from readBulletion response ──────────────────────────
// The official PCC site returns an HTML page with a results table
function parseBulletionHTML(html, type, keyword, company) {
  const records = [];

  // Check if we got actual results (not just the search form)
  if (!html.includes('決標日期') && !html.includes('招標日期') && !html.includes('標案名稱')) {
    // The page returned search form only - no results or need session
    // Try to extract any data from JSON embedded in the page
    const jsonMatch = html.match(/var\s+\w+\s*=\s*(\[[\s\S]*?\]);/) ||
                      html.match(/JSON\.parse\('([\s\S]*?)'\)/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        if (Array.isArray(data)) return data.map(item => normalizeItem(item, type));
      } catch {}
    }
    return records;
  }

  // Extract table rows
  const rows = extractRows(html);

  for (const cells of rows) {
    if (cells.length < 4) continue;

    let rec;
    if (type === 'awarded') {
      // Expected columns for 決標: 序 | 機關名稱 | 標案名稱 | 決標日期 | 決標金額 | 得標廠商
      rec = {
        type: 'awarded',
        unit:      cells[1]?.text || '',
        title:     cells[2]?.text || cells[1]?.text || '',
        date:      cells[3]?.text || '',
        amount:    parseNum(cells[4]?.text || '0'),
        companies: cells[5] ? extractNames(cells[5].raw) : [],
        method:    '',
        link:      extractOfficialLink(cells),
      };
    } else {
      // Expected columns for 招標: 序 | 機關名稱 | 標案名稱 | 招標方式 | 公告日期 | 預算金額
      rec = {
        type: 'tender',
        unit:      cells[1]?.text || '',
        title:     cells[2]?.text || cells[1]?.text || '',
        method:    cells[3]?.text || '',
        date:      cells[4]?.text || '',
        amount:    parseNum(cells[5]?.text || '0'),
        companies: [],
        link:      extractOfficialLink(cells),
      };
    }

    if (!rec.title || rec.title.length < 2) continue;

    // Fuzzy filter: check keyword appears in title or unit
    if (keyword && !fuzzyMatch(rec.title + rec.unit, keyword)) continue;
    if (company && !fuzzyMatch(rec.title + rec.unit + rec.companies.join(''), company)) continue;

    records.push(rec);
  }

  return records;
}

function fuzzyMatch(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function extractRows(html) {
  const rows = [];
  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trPattern.exec(html)) !== null) {
    const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let tdMatch;
    while ((tdMatch = tdPattern.exec(trMatch[1])) !== null) {
      cells.push({
        raw: tdMatch[0],
        text: cleanText(tdMatch[1]),
        link: extractHref(tdMatch[0]),
      });
    }
    if (cells.length >= 2) rows.push(cells);
  }
  return rows;
}

function cleanText(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#160;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function extractHref(html) {
  const m = html.match(/href="([^"]+)"/);
  if (!m) return '';
  const h = m[1];
  return h.startsWith('http') ? h : 'https://web.pcc.gov.tw' + h;
}

function extractOfficialLink(cells) {
  for (const cell of cells) {
    if (cell.link && cell.link.includes('pcc.gov.tw')) return cell.link;
  }
  // Try to find any link
  for (const cell of cells) {
    if (cell.link) return cell.link;
  }
  return '#';
}

function extractNames(html) {
  const names = [];
  const matches = html.match(/>([^<]{2,50})</g) || [];
  for (const m of matches) {
    const name = m.replace(/^>|<$/g, '').trim();
    if (name && !name.match(/^\s*$/) && !name.match(/^https?:/)) names.push(name);
  }
  return [...new Set(names)].slice(0, 5);
}

function parseNum(str) {
  const n = parseFloat(String(str).replace(/[,，\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

function normalizeItem(item, type) {
  return {
    type,
    title: item.tenderName || item.標案名稱 || item.name || '',
    unit: item.orgName || item.機關名稱 || '',
    date: item.tenderAwardDate || item.publishDate || item.date || '',
    amount: parseNum(item.tenderAwardPrice || item.budget || 0),
    companies: item.companies || [],
    method: item.tenderWay || '',
    link: item.link || '#',
  };
}
