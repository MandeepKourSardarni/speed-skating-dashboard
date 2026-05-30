/**
 * Ontario Speed Skating Analytics - Proxy Server
 * ================================================
 * Fetches ranking data from results.ontariospeedskating.ca
 * and serves it to the frontend, bypassing CORS restrictions.
 *
 * HOW TO RUN:
 *   npm install
 *   node server.js
 *   Then open: http://localhost:3000
 *
 * HOW TO DEPLOY FREE:
 *   - Render.com: connect GitHub repo, set start command to "node server.js"
 *   - Railway.app: connect GitHub, auto-detects Node.js
 *   - Fly.io: free tier available with flyctl deploy
 */

const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Age category mappings (matches the Ontario SSO site) ──────────────────
const AGE_MAP = {
  'club-u8':    'Club (Under 8)',
  'pre-youth':  'Pre-Youth (9-10)',
  'youth':      'Youth (11-13)',
  'junior':     'Junior (13-18)',
  'senior':     'Senior (19-29)',
  'masters':    'Masters (30+)',
};

const GENDER_MAP = {
  'male':   'Male',
  'female': 'Female',
};

// ─── Proxy endpoint: /api/rankings ─────────────────────────────────────────
// Query params: age, gender, track, season
app.get('/api/rankings', async (req, res) => {
  const { age = 'youth', gender = 'male', track = '100m', season = '2025-2026' } = req.query;

  const BASE_URL = 'https://results.ontariospeedskating.ca';

  // Build the URL that the Next.js site uses internally for data
  // The site uses Next.js API routes for its ranking data
  const apiUrl = `${BASE_URL}/api/rankings?age=${encodeURIComponent(age)}&gender=${encodeURIComponent(gender)}&track=${encodeURIComponent(track)}&season=${encodeURIComponent(season)}`;

  try {
    // First try the internal API endpoint
    const apiResponse = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/html, */*',
        'Referer': `${BASE_URL}/rank`,
      },
      timeout: 10000,
    });

    if (apiResponse.ok) {
      const contentType = apiResponse.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await apiResponse.json();
        return res.json({ success: true, source: 'api', data });
      }
    }

    // Fallback: scrape the HTML rankings page
    const pageUrl = `${BASE_URL}/rank?age=${age}&gender=${gender}&track=${track}&season=${season}`;
    const htmlResponse = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': BASE_URL,
      },
      timeout: 15000,
    });

    const html = await htmlResponse.text();
    const $ = cheerio.load(html);
    const rankings = [];

    // Parse any table found on the page
    $('table').each((tableIdx, table) => {
      $(table).find('tr').each((rowIdx, row) => {
        if (rowIdx === 0) return; // skip header
        const cells = $(row).find('td');
        if (cells.length >= 3) {
          const rank = $(cells[0]).text().trim();
          const name = $(cells[1]).text().trim();
          const club = $(cells[2]).text().trim();
          const bestTime = $(cells[3])?.text().trim() || '';
          const avgTime = $(cells[4])?.text().trim() || '';

          if (name && rank) {
            rankings.push({ rank: parseInt(rank) || rowIdx, name, club, bestTime, avgTime });
          }
        }
      });
    });

    // If nothing was found via scraping, return demo data
    if (rankings.length === 0) {
      return res.json({
        success: true,
        source: 'demo',
        message: 'Live data unavailable — showing representative demo data for dashboard preview.',
        data: generateDemoData(age, gender, season),
      });
    }

    return res.json({ success: true, source: 'scraped', data: rankings });

  } catch (err) {
    console.error('Fetch error:', err.message);
    // Always return demo data as graceful fallback
    return res.json({
      success: true,
      source: 'demo',
      message: 'Live data unavailable — showing representative demo data for dashboard preview.',
      data: generateDemoData(age, gender, season),
    });
  }
});

// ─── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ─── Serve index.html for all non-API routes ─────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Demo data generator ────────────────────────────────────────────────────
function generateDemoData(age, gender, season) {
  const ontarioClubs = [
    'Brantford SC', 'Burlington SC', 'Cambridge SC', 'Georgian Bay SC',
    'Guelph SC', 'Hamilton SC', 'Kingston SC', 'Kitchener-Waterloo SC',
    'London SC', 'Mississauga SC', 'Newmarket SC', 'Niagara SC',
    'North York SC', 'Oakville SC', 'Oshawa SC', 'Ottawa SC',
    'Peterborough SC', 'Richmond Hill SC', 'Sault Ste. Marie SC',
    'Sudbury SC', 'Thunder Bay SC', 'Toronto SC', 'Waterloo SC',
    'Windsor SC',
  ];

  const maleNames = [
    'Liam Chen', 'Noah Patel', 'Ethan Kowalski', 'Lucas Tremblay',
    'Mason Okafor', 'Aiden Leblanc', 'Jackson Nguyen', 'Oliver Schmidt',
    'Elijah Morrison', 'James Andersen', 'Sebastian Park', 'Logan Virtanen',
    'Benjamin Osei', 'Henry MacDonald', 'Alexander Korhonen', 'Daniel Ricci',
    'Matthew Petrov', 'Samuel Bouchard', 'David Yamamoto', 'Joseph Ferreira',
  ];

  const femaleNames = [
    'Emma Larsson', 'Olivia Kowalczyk', 'Ava Tremblay', 'Isabella Chen',
    'Sophia Patel', 'Mia Dubois', 'Charlotte Nguyen', 'Amelia Park',
    'Harper Morrison', 'Evelyn Schmidt', 'Abigail Virtanen', 'Emily Andersen',
    'Elizabeth Osei', 'Sofia MacDonald', 'Avery Korhonen', 'Ella Ricci',
    'Scarlett Petrov', 'Grace Bouchard', 'Chloe Yamamoto', 'Victoria Ferreira',
  ];

  // Base times vary by age category
  const baseTimeSec = {
    'club-u8': 28.0, 'pre-youth': 24.0, 'youth': 20.0,
    'junior': 17.5, 'senior': 15.5, 'masters': 18.0,
  }[age] || 20.0;

  const names = gender === 'female' ? femaleNames : maleNames;
  const count = 18 + Math.floor(Math.random() * 5);

  // Generate consistent mock performance histories
  return names.slice(0, count).map((name, i) => {
    const spread = i * 0.25 + Math.random() * 0.15;
    const best = +(baseTimeSec + spread).toFixed(2);
    const avg = +(best + 0.3 + Math.random() * 0.4).toFixed(2);
    const times = Array.from({ length: 6 }, (_, t) => {
      const noise = (Math.random() - 0.5) * 0.6;
      return +(avg + noise + (5 - t) * 0.08).toFixed(2); // improving trend
    }).reverse();

    return {
      rank: i + 1,
      name,
      club: ontarioClubs[i % ontarioClubs.length],
      bestTime: formatTime(best),
      avgTime: formatTime(avg),
      rawBest: best,
      rawAvg: avg,
      times: times.map(formatTime),
      rawTimes: times,
      age: getAgeRange(age),
      season,
      gender,
    };
  });
}

function formatTime(secs) {
  if (secs >= 60) {
    const m = Math.floor(secs / 60);
    const s = (secs % 60).toFixed(2).padStart(5, '0');
    return `${m}:${s}`;
  }
  return secs.toFixed(2);
}

function getAgeRange(age) {
  return { 'club-u8': '6-8', 'pre-youth': '9-10', 'youth': '11-13',
           'junior': '13-18', 'senior': '19-29', 'masters': '30+' }[age] || '';
}

app.listen(PORT, () => {
  console.log(`\n🏒 Ontario Speed Skating Dashboard`);
  console.log(`   Server: http://localhost:${PORT}`);
  console.log(`   Press Ctrl+C to stop\n`);
});
