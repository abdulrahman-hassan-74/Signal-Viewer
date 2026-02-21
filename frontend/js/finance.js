/**
 * finance.js — Market Pulse Frontend
 * Connects to Flask backend at http://127.0.0.1:5000
 */

const API = 'http://127.0.0.1:5000';

// ── Ticker definitions per market type ────────────────────────────────────
const MARKETS = {
    stocks: [
        { ticker: 'AAPL',  label: 'Apple Inc.' },
        { ticker: 'TSLA',  label: 'Tesla Inc.' },
    ],
    currencies: [
        { ticker: 'EURUSD', label: 'EUR / USD' },
        { ticker: 'GBPUSD', label: 'GBP / USD' },
    ],
    minerals: [
        { ticker: 'GOLD',   label: 'Gold (GC=F)' },
        { ticker: 'SILVER', label: 'Silver (SI=F)' },
    ]
};

// ── State ──────────────────────────────────────────────────────────────────
let currentTicker = 'AAPL';
let currentPeriod = '3mo';
let priceChart    = null;
let predChart     = null;

// ── DOM refs ───────────────────────────────────────────────────────────────
const marketTypeEl   = document.getElementById('marketType');
const symbolSelectEl = document.getElementById('symbolSelect');
const fetchBtn       = document.getElementById('fetchDataBtn');
const predictBtn     = document.getElementById('predictBtn');
const currentPriceEl = document.getElementById('currentPrice');
const marketCardsEl  = document.getElementById('marketCards');
const predSection    = document.getElementById('predictionSection');
const predDetails    = document.getElementById('predictionDetails');
const indSection     = document.getElementById('indicatorsSection');
const indGrid        = document.getElementById('indicatorGrid');

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    populateSymbols();
    attachEvents();
    fetchHistory();   // load default on open
});

// ── Populate symbol dropdown based on market type ─────────────────────────
function populateSymbols() {
    const type    = marketTypeEl.value;
    const options = MARKETS[type] || [];
    symbolSelectEl.innerHTML = options
        .map(o => `<option value="${o.ticker}">${o.label}</option>`)
        .join('');
    currentTicker = options[0]?.ticker || 'AAPL';
}

// ── Event listeners ────────────────────────────────────────────────────────
function attachEvents() {
    marketTypeEl.addEventListener('change', () => {
        populateSymbols();
        clearCharts();
    });

    symbolSelectEl.addEventListener('change', () => {
        currentTicker = symbolSelectEl.value;
    });

    fetchBtn.addEventListener('click', fetchHistory);
    predictBtn.addEventListener('click', fetchPrediction);

    document.querySelectorAll('.timeframe-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPeriod = btn.dataset.period;
            fetchHistory();
        });
    });
}

// ── Helper: show loading state ─────────────────────────────────────────────
function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.style.opacity = loading ? '0.6' : '1';
}

// ── Helper: show error ─────────────────────────────────────────────────────
function showError(msg) {
    Plotly.purge('priceChart');
    document.getElementById('priceChart').innerHTML =
        `<div style="color:#ff6b6b;padding:40px;text-align:center;font-size:1.1rem;">
            ⚠️ ${msg}
         </div>`;
}

// ── Clear all charts ───────────────────────────────────────────────────────
function clearCharts() {
    Plotly.purge('priceChart');
    predSection.style.display = 'none';
    indSection.style.display  = 'none';
    marketCardsEl.innerHTML   = '';
    currentPriceEl.textContent = '';
}

// ══════════════════════════════════════════════════════════════════════════
//  FETCH HISTORY  →  GET /api/finance/history?ticker=AAPL&period=3mo
// ══════════════════════════════════════════════════════════════════════════
async function fetchHistory() {
    currentTicker = symbolSelectEl.value;
    setLoading(fetchBtn, true);
    clearCharts();

    try {
        const res  = await fetch(`${API}/api/finance/history?ticker=${currentTicker}&period=${currentPeriod}`);
        const data = await res.json();

        if (data.error) { showError(data.error); return; }

        renderPriceChart(data);
        renderMarketCards(data);
        fetchIndicators();     // auto-load indicators too

    } catch (err) {
        showError(`Cannot reach backend. Is the server running? (${err.message})`);
    } finally {
        setLoading(fetchBtn, false);
    }
}

// ── Render candlestick + volume chart ─────────────────────────────────────
function renderPriceChart(data) {
    const lastClose = data.close[data.close.length - 1];
    const firstClose = data.close[0];
    const change     = ((lastClose - firstClose) / firstClose * 100).toFixed(2);
    const isUp       = change >= 0;

    currentPriceEl.textContent = `${lastClose?.toFixed(4)}  ${isUp ? '▲' : '▼'} ${Math.abs(change)}%`;
    currentPriceEl.style.color = isUp ? '#51cf66' : '#ff6b6b';

    const candlestick = {
        type:        'candlestick',
        x:           data.dates,
        open:        data.open,
        high:        data.high,
        low:         data.low,
        close:       data.close,
        name:        data.label,
        increasing:  { line: { color: '#51cf66' }, fillcolor: '#51cf66' },
        decreasing:  { line: { color: '#ff6b6b' }, fillcolor: '#ff6b6b' },
    };

    // MA-20 overlay
    const ma20 = computeMA(data.close, 20);
    const maTrace = {
        type:  'scatter',
        mode:  'lines',
        x:     data.dates.slice(19),
        y:     ma20,
        name:  'MA 20',
        line:  { color: '#f59f00', width: 1.5, dash: 'dot' },
    };

    const layout = {
        paper_bgcolor: '#0f1422',
        plot_bgcolor:  '#0f1422',
        font:          { color: '#e0e0e0', family: 'monospace' },
        xaxis: {
            rangeslider: { visible: false },
            color:       '#8a9ab0',
            gridcolor:   '#1a2035',
        },
        yaxis: {
            color:     '#8a9ab0',
            gridcolor: '#1a2035',
            title:     'Price',
        },
        legend:  { x: 0, y: 1, bgcolor: 'transparent' },
        margin:  { l: 60, r: 20, t: 20, b: 40 },
        hovermode: 'x unified',
    };

    Plotly.newPlot('priceChart', [candlestick, maTrace], layout, { responsive: true, displayModeBar: false });
}

// ── Small summary cards ────────────────────────────────────────────────────
function renderMarketCards(data) {
    const last    = data.close[data.close.length - 1];
    const prev    = data.close[data.close.length - 2] || last;
    const chg     = ((last - prev) / prev * 100).toFixed(2);
    const high52  = Math.max(...data.high).toFixed(4);
    const low52   = Math.min(...data.low).toFixed(4);
    const vol     = data.volume[data.volume.length - 1];
    const isUp    = chg >= 0;

    marketCardsEl.innerHTML = `
        <div class="market-card">
            <div class="market-header">
                <span class="market-title">${data.label}</span>
                <span style="color:#8a9ab0;font-size:0.85rem;">${data.category.toUpperCase()}</span>
            </div>
            <div class="market-price ${isUp ? 'price-up' : 'price-down'}">${last?.toFixed(4)}</div>
            <div style="color:${isUp ? '#51cf66' : '#ff6b6b'};margin:8px 0;">${isUp ? '▲' : '▼'} ${Math.abs(chg)}% today</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;">
                <div style="background:#0f1422;padding:8px;border-radius:6px;">
                    <div style="color:#8a9ab0;font-size:0.75rem;">Period High</div>
                    <div style="color:#51cf66;font-weight:bold;">${high52}</div>
                </div>
                <div style="background:#0f1422;padding:8px;border-radius:6px;">
                    <div style="color:#8a9ab0;font-size:0.75rem;">Period Low</div>
                    <div style="color:#ff6b6b;font-weight:bold;">${low52}</div>
                </div>
            </div>
            ${vol ? `<div style="color:#8a9ab0;margin-top:10px;font-size:0.85rem;">Volume: ${formatVolume(vol)}</div>` : ''}
        </div>
    `;
}

// ══════════════════════════════════════════════════════════════════════════
//  FETCH PREDICTION  →  GET /api/finance/predict?ticker=AAPL
// ══════════════════════════════════════════════════════════════════════════
async function fetchPrediction() {
    currentTicker = symbolSelectEl.value;
    setLoading(predictBtn, true);
    predSection.style.display = 'none';

    try {
        const res  = await fetch(`${API}/api/finance/predict?ticker=${currentTicker}`);
        const data = await res.json();

        if (data.error) { alert('Prediction error: ' + data.error); return; }

        renderPredictionChart(data);
        renderPredictionDetails(data);
        predSection.style.display = 'block';
        predSection.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        alert('Prediction failed: ' + err.message);
    } finally {
        setLoading(predictBtn, false);
    }
}

// ── 7-day forecast chart ───────────────────────────────────────────────────
function renderPredictionChart(data) {
    const forecast = data.forecast_7d;
    const isUp     = data.change_pct >= 0;

    const trace = {
        type:  'scatter',
        mode:  'lines+markers',
        x:     forecast.dates,
        y:     forecast.prices,
        name:  '7-Day Forecast',
        line:  { color: isUp ? '#51cf66' : '#ff6b6b', width: 2 },
        marker:{ size: 6 },
        fill:  'tozeroy',
        fillcolor: isUp ? 'rgba(81,207,102,0.08)' : 'rgba(255,107,107,0.08)',
    };

    const layout = {
        paper_bgcolor: '#0f1422',
        plot_bgcolor:  '#0f1422',
        font:  { color: '#e0e0e0', family: 'monospace' },
        xaxis: { color: '#8a9ab0', gridcolor: '#1a2035' },
        yaxis: { color: '#8a9ab0', gridcolor: '#1a2035' },
        margin:{ l: 60, r: 20, t: 10, b: 40 },
        showlegend: false,
    };

    Plotly.newPlot('predictionChart', [trace], layout, { responsive: true, displayModeBar: false });
}

// ── Prediction detail panel ────────────────────────────────────────────────
function renderPredictionDetails(data) {
    const isUp = data.change_pct >= 0;
    predDetails.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="background:#1a1f2e;padding:16px;border-radius:10px;border:1px solid #2a2f3e;">
                <div style="color:#8a9ab0;font-size:0.8rem;margin-bottom:4px;">CURRENT PRICE</div>
                <div style="font-size:1.6rem;font-weight:bold;color:#e0e0e0;">${data.current_price}</div>
            </div>
            <div style="background:#1a1f2e;padding:16px;border-radius:10px;border:1px solid ${isUp ? '#51cf66' : '#ff6b6b'};">
                <div style="color:#8a9ab0;font-size:0.8rem;margin-bottom:4px;">NEXT DAY PREDICTION</div>
                <div style="font-size:1.6rem;font-weight:bold;color:${isUp ? '#51cf66' : '#ff6b6b'};">
                    ${data.predicted_price}
                </div>
                <div style="color:${isUp ? '#51cf66' : '#ff6b6b'};margin-top:6px;font-size:1rem;">
                    ${isUp ? '▲' : '▼'} ${Math.abs(data.change_pct)}%
                </div>
            </div>
            <div style="background:#1a1f2e;padding:16px;border-radius:10px;">
                <div style="color:#8a9ab0;font-size:0.8rem;margin-bottom:4px;">MODEL</div>
                <span class="method-badge">${data.model}</span>
                <div style="color:#8a9ab0;font-size:0.75rem;margin-top:8px;">Updated: ${data.last_updated}</div>
            </div>
        </div>
    `;
}

// ══════════════════════════════════════════════════════════════════════════
//  FETCH INDICATORS  →  GET /api/finance/indicators?ticker=AAPL
// ══════════════════════════════════════════════════════════════════════════
async function fetchIndicators() {
    try {
        const res  = await fetch(`${API}/api/finance/indicators?ticker=${currentTicker}`);
        const data = await res.json();

        if (data.error) return;
        renderIndicators(data);
        indSection.style.display = 'block';

    } catch (err) {
        console.warn('Indicators fetch failed:', err);
    }
}

function renderIndicators(d) {
    const rsiColor = d.rsi > 70 ? '#ff6b6b' : d.rsi < 30 ? '#51cf66' : '#f59f00';
    const r1Color  = d.return_1d >= 0 ? '#51cf66' : '#ff6b6b';
    const r7Color  = d.return_7d >= 0 ? '#51cf66' : '#ff6b6b';

    indGrid.innerHTML = `
        ${indicator('RSI (14)', d.rsi?.toFixed(1), rsiColor)}
        ${indicator('MACD',     d.macd?.toFixed(4), d.macd >= 0 ? '#51cf66' : '#ff6b6b')}
        ${indicator('MA 7',     d.ma_7?.toFixed(4),  '#4a9eff')}
        ${indicator('MA 30',    d.ma_30?.toFixed(4), '#4a9eff')}
        ${indicator('1D Return',  (d.return_1d >= 0 ? '+' : '') + d.return_1d?.toFixed(2) + '%', r1Color)}
        ${indicator('7D Return',  (d.return_7d >= 0 ? '+' : '') + d.return_7d?.toFixed(2) + '%', r7Color)}
        ${indicator('Volatility', d.volatility?.toFixed(4), '#a78bfa')}
        ${indicator('BB Upper',   d.bollinger?.upper?.toFixed(4), '#8a9ab0')}
        ${indicator('BB Lower',   d.bollinger?.lower?.toFixed(4), '#8a9ab0')}
    `;
}

function indicator(label, value, color) {
    return `
        <div class="indicator-item">
            <div class="indicator-label">${label}</div>
            <div class="indicator-value" style="color:${color}">${value ?? 'N/A'}</div>
        </div>
    `;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function computeMA(prices, window) {
    const result = [];
    for (let i = window - 1; i < prices.length; i++) {
        const slice = prices.slice(i - window + 1, i + 1);
        result.push(slice.reduce((a, b) => a + b, 0) / window);
    }
    return result;
}

function formatVolume(v) {
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
    return v.toString();
}