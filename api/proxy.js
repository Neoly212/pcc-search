export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { mode, keyword, company, year, page = '1' } = req.query;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9',
    'Referer': 'https://pcc.mlwmlw.org/',
  };

  try {
    let records = [];
    let total = 0;

    // ── Mode 1: keyword search (標案名稱) ────────────────────────────────────
    if (mode === 'keyword' && keyword) {
      const url = `https://pcc.mlwmlw.org/search/${encodeURIComponent(keyword)}`;
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
      const html = await r.text();
      const parsed = parseSearchResults(html, keyword, company, year);
      records = parsed.records;
      total = parsed.total;
    }

    // ── Mode 2: company search (廠商名稱) ────────────────────────────────────
    else if (mode === 'company' && company) {
      // First, search for the company to find their merchant ID
      const searchUrl = `https://pcc.mlwmlw.org/search/${encodeURIComponent(company)}`;
      const r = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(12000) });
      const html = await r.text();
      
      // Also try searching merchant directly
      const merchantUrl = `https://pcc.mlwmlw.org/merchants/${encodeURIComponent(company)}`;
      const r2 = await fetch(merchantUrl, { headers, signal: AbortSignal.timeout(12000) });
      const html2 = await r2.text();

      // Parse both results
      const p1 = parseSearchResults(html, '', company, year);
      const p2 = parseMerchantPage(html2, company, year);
      
      // Merge and deduplicate
      const seen = new Set();
      for (const rec of [...p2.records, ...p1.records]) {
        const key = rec.title + rec.date;
        if (!seen.has(key)) { seen.add(key); records.push(rec); }
      }
      total = records.length;
    }

    // ── Mode 3: both keyword and company ─────────────────────────────────────
    else if (mode === 'both' && keyword && company) {
      const url = `https://pcc.mlwmlw.org/search/${encodeURIComponent(keyword)}`;
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
      const html = await r.text();
      const parsed = parseSearchResults(html, keyword, company, year);
      records = parsed.records;
      total = parsed.total;
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({ total, records });

  } catch(e) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ error: e.message, records: [], total: 0 });
  }
}

// ── Parse /search/:keyword results ──────────────────────────────────────────
function parseSearchResults(html, keyword, company, year) {
  const records = [];
  
  // Extract table rows from search results
  // pcc.mlwmlw.org uses a table with specific structure
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi) || [];
  
  for (const table of tableMatch) {
    const rows = table.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      if (cells.length < 4) continue;
      
      const getText = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').trim();
      const getLink = s => { const m = s.match(/href="([^"]+)"/); return m ? (m[1].startsWith('http') ? m[1] : 'https://pcc.mlwmlw.org' + m[1]) : ''; };
      
      const unit     = getText(cells[0] || '');
      const titleCell = cells[1] || '';
      const title    = getText(titleCell);
      const typeCell = cells[2] || '';
      const type_str = getText(typeCell);
      const amount   = parseFloat((getText(cells[3] || '')).replace(/,/g, '')) || 0;
      const dateCell = cells[4] || '';
      const recDate  = getText(dateCell);
      const awardDate = getText(cells[5] || '');
      const companies = extractCompanies(cells[6] || '');
      const link     = getLink(titleCell) || getLink(row);

      if (!title || title.length < 2) continue;

      // Fuzzy filter: company name substring match
      if (company) {
        const blob = (title + unit + companies.join('') + type_str).toLowerCase();
        if (!blob.includes(company.toLowerCase())) continue;
      }

      // Year filter
      if (year) {
        const dateStr = awardDate || recDate || '';
        if (!dateStr.includes(year)) continue;
      }

      const isAwarded = type_str.includes('決標') || !!awardDate;
      records.push({
        type: isAwarded ? 'awarded' : 'tender',
        title,
        unit,
        date: awardDate || recDate,
        amount,
        companies,
        method: isAwarded ? '' : type_str,
        link,
      });
    }
  }

  return { records, total: records.length };
}

// ── Parse /merchants/:id page ────────────────────────────────────────────────
function parseMerchantPage(html, company, year) {
  const records = [];

  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi) || [];
  
  for (const table of tableMatch) {
    const rows = table.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      if (cells.length < 6) continue;

      const getText = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').trim();
      const getLink = s => { const m = s.match(/href="([^"]+)"/); return m ? (m[1].startsWith('http') ? m[1] : 'https://pcc.mlwmlw.org' + m[1]) : ''; };

      const unit      = getText(cells[0] || '');
      const titleCell = cells[1] || '';
      const title     = getText(titleCell);
      const type_str  = getText(cells[2] || '');
      const amount    = parseFloat((getText(cells[3] || '')).replace(/,/g,'')) || 0;
      const recDate   = getText(cells[4] || '');
      const awardDate = getText(cells[5] || '');
      const companies = extractCompanies(cells[6] || '');
      const link      = getLink(titleCell) || '';

      if (!title || title.length < 2) continue;

      // Year filter
      if (year) {
        const dateStr = awardDate || recDate || '';
        if (!dateStr.includes(year)) continue;
      }

      records.push({
        type: 'awarded',
        title,
        unit,
        date: awardDate || recDate,
        amount,
        companies,
        link,
      });
    }
  }

  return { records, total: records.length };
}

function extractCompanies(cellHtml) {
  const names = [];
  const matches = cellHtml.match(/<a[^>]*>([^<]+)<\/a>/g) || [];
  for (const m of matches) {
    const name = m.replace(/<[^>]+>/g,'').trim();
    if (name && name.length > 1 && !name.startsWith('http')) names.push(name);
  }
  if (!names.length) {
    const text = cellHtml.replace(/<[^>]+>/g,'').trim();
    if (text) names.push(text);
  }
  return names;
}
