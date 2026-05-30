# Ontario Speed Skating Analytics Dashboard

A modern, full-featured analytics dashboard for exploring Ontario Speed Skating rankings.

---

## Features

- **Live Data** — Fetches from results.ontariospeedskating.ca via a Node.js proxy (bypasses CORS)
- **Smart Fallback** — Shows representative demo data if the live site is unavailable
- **Filter Panel** — Age category, gender, season
- **Rankings Table** — Searchable, sortable, paginated (10 per page)
- **Player Comparison** — Select up to 4 athletes
- **KPI Cards** — Rank, best time, avg time, consistency, gap from leader, trend
- **3 Charts** — Line (trend), bar (time comparison), radar (skill profile)
- **Head-to-Head Table** — Side-by-side stats with winner highlights
- **Dark/Light Mode** — Toggle with persistence
- **PDF Export** — Download rankings as PDF
- **Saved Athletes** — Star/bookmark athletes (persists in localStorage)

---

## Quick Start (Local)

### Prerequisites
- Node.js 16+ and npm

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open in browser
http://localhost:3000
```

For development with auto-restart:
```bash
npm run dev    # requires nodemon (installed as devDependency)
```

---

## File Structure

```
oss-dashboard/
├── server.js          # Node.js/Express proxy server
├── package.json
├── README.md
└── public/
    ├── index.html     # Dashboard HTML
    ├── styles.css     # All styles (CSS variables, dark/light)
    └── script.js      # All frontend logic + Chart.js
```

---

## How It Works

1. **Browser** → sends filter selections to `/api/rankings`
2. **server.js** → fetches from `results.ontariospeedskating.ca` server-side (no CORS)
3. **Scraper** → parses HTML tables using Cheerio
4. **Fallback** → if live data unavailable, returns realistic demo data
5. **Browser** → renders table, KPIs, charts

---

## Free Deployment Options

### Option A: Render.com (Recommended — Free Tier)
1. Push to GitHub
2. Go to render.com → New → Web Service
3. Connect your repo
4. Build command: `npm install`
5. Start command: `node server.js`
6. Done — free HTTPS URL

### Option B: Railway.app
1. Push to GitHub
2. Connect at railway.app
3. Auto-detects Node.js
4. Deploys automatically

### Option C: Fly.io
```bash
npm install -g flyctl
fly auth login
fly launch
fly deploy
```

### GitHub Pages Note
GitHub Pages only serves static files — you need one of the above for the Node.js proxy. For a static-only version, the dashboard will use demo data mode automatically if run without the server.

---

## Customization

### Change default filters
Edit the `state` object in `script.js`:
```js
const state = {
  age: 'youth',      // club-u8 | pre-youth | youth | junior | senior | masters
  gender: 'male',    // male | female
  season: '2025-2026',
  ...
};
```

### Add more seasons
In `index.html`, add to the seasonFilter pills:
```html
<button class="filter-pill" data-value="2023-2024">2023 – 2024</button>
```

And update `generateDemoData()` in `server.js` accordingly.

---

## Browser Support
Chrome 90+, Firefox 90+, Safari 14+, Edge 90+

---

## License
MIT — built for Ontario Speed Skating community (coaches, athletes, parents).
