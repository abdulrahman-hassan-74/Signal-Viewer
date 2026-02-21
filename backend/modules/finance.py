"""
Finance Signal Analysis Module
Stock market, currencies, minerals prediction using trained XGBoost models
"""

import numpy as np
import pandas as pd
import logging
import joblib
import os
import requests
from datetime import datetime, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

# ── paths ──────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).resolve().parent.parent   # backend/
MODELS_DIR = BASE_DIR / "models"

# ── ticker config ──────────────────────────────────────────────────────────
TICKER_MAP = {
    # Stocks
    "AAPL":   {"key": "AAPL",   "category": "stock",    "label": "Apple"},
    "TSLA":   {"key": "TSLA",   "category": "stock",    "label": "Tesla"},
    # Forex
    "EURUSD": {"key": "EURUSD", "category": "forex",    "label": "EUR/USD", "yf": "EURUSD=X"},
    "GBPUSD": {"key": "GBPUSD", "category": "forex",    "label": "GBP/USD", "yf": "GBPUSD=X"},
    # Minerals
    "GOLD":   {"key": "GOLD",   "category": "mineral",  "label": "Gold",    "yf": "GC=F"},
    "SILVER": {"key": "SILVER", "category": "mineral",  "label": "Silver",  "yf": "SI=F"},
}


class FinanceAnalyzer:
    """Financial data analysis and ML-based prediction"""

    def __init__(self):
        self.models  = {}
        self.scalers = {}
        self.cache   = {}
        self._load_models()

    # ── model loading ──────────────────────────────────────────────────────
    def _load_models(self):
        """Load all trained XGBoost models (JSON) and scalers (pkl) from disk"""
        import xgboost as xgb
        for name in TICKER_MAP:
            json_path   = MODELS_DIR / f"model_{name}.json"
            scaler_path = MODELS_DIR / f"scaler_{name}.pkl"
            if json_path.exists() and scaler_path.exists():
                # Load XGBoost model from native JSON format (version-independent)
                booster = xgb.Booster()
                booster.load_model(str(json_path))
                self.models[name]  = booster
                self.scalers[name] = joblib.load(scaler_path)
                logger.info(f"✅ Loaded model for {name}")
            else:
                logger.warning(f"⚠️ Model files not found for {name} — looked for {json_path}")

    # ── feature engineering (must match training exactly) ─────────────────
    def _compute_rsi(self, series, period=14):
        delta = series.diff()
        gain  = delta.clip(lower=0).rolling(period).mean()
        loss  = -delta.clip(upper=0).rolling(period).mean()
        rs    = gain / loss
        return 100 - (100 / (1 + rs))

    def _compute_macd(self, series):
        ema12 = series.ewm(span=12, adjust=False).mean()
        ema26 = series.ewm(span=26, adjust=False).mean()
        return ema12 - ema26

    def _compute_bollinger(self, series, period=20):
        ma    = series.rolling(period).mean()
        std   = series.rolling(period).std()
        upper = ma + 2 * std
        lower = ma - 2 * std
        return (series - lower) / (upper - lower + 1e-9)

    def _build_features(self, df):
        """Build exactly the same features used during training"""
        df = df.copy()
        df['Volume'] = pd.to_numeric(df['Volume'], errors='coerce')
        df['Volume'] = df['Volume'].replace(0, np.nan).fillna(df['Volume'].median())

        df['MA_7']   = df['Close'].rolling(7).mean()
        df['MA_30']  = df['Close'].rolling(30).mean()
        df['EMA_12'] = df['Close'].ewm(span=12, adjust=False).mean()
        df['EMA_26'] = df['Close'].ewm(span=26, adjust=False).mean()

        df['RSI']       = self._compute_rsi(df['Close'])
        df['MACD']      = self._compute_macd(df['Close'])
        df['Return_1d'] = df['Close'].pct_change(1)
        df['Return_7d'] = df['Close'].pct_change(7)
        df['Volatility']= df['Close'].rolling(7).std()
        df['Bollinger'] = self._compute_bollinger(df['Close'])

        df['Lag_1'] = df['Close'].shift(1)
        df['Lag_2'] = df['Close'].shift(2)
        df['Lag_3'] = df['Close'].shift(3)
        df['Lag_5'] = df['Close'].shift(5)
        df['Lag_7'] = df['Close'].shift(7)

        df['Volume_MA7']   = df['Volume'].rolling(7).mean()
        df['Volume_Ratio'] = df['Volume'] / (df['Volume_MA7'] + 1e-9)

        df.dropna(inplace=True)
        return df

    FEATURES = [
        'MA_7', 'MA_30', 'EMA_12', 'EMA_26',
        'RSI', 'MACD', 'Return_1d', 'Return_7d',
        'Volatility', 'Bollinger',
        'Lag_1', 'Lag_2', 'Lag_3', 'Lag_5', 'Lag_7',
        'Volume_Ratio'
    ]

    # ── data fetching ──────────────────────────────────────────────────────
    def _fetch_yahoo(self, yf_symbol, period='1y', interval='1d'):
        """Fetch OHLCV data from Yahoo Finance"""
        try:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yf_symbol}"
            params = {'range': period, 'interval': interval, 'includePrePost': 'false'}
            headers = {'User-Agent': 'Mozilla/5.0'}
            r = requests.get(url, params=params, headers=headers, timeout=10)
            if r.status_code != 200:
                return None
            data   = r.json()['chart']['result'][0]
            quotes = data['indicators']['quote'][0]
            dates  = [datetime.fromtimestamp(ts).strftime('%Y-%m-%d')
                      for ts in data['timestamp']]
            df = pd.DataFrame({
                'Date':   dates,
                'Open':   quotes.get('open',   []),
                'High':   quotes.get('high',   []),
                'Low':    quotes.get('low',    []),
                'Close':  quotes.get('close',  []),
                'Volume': quotes.get('volume', []),
            })
            df.set_index('Date', inplace=True)
            df = df.apply(pd.to_numeric, errors='coerce').dropna()
            return df
        except Exception as e:
            logger.error(f"Yahoo fetch error: {e}")
            return None

    def _get_df(self, ticker_key):
        """Get DataFrame for a ticker, with caching"""
        if ticker_key in self.cache:
            cached_time, df = self.cache[ticker_key]
            if (datetime.now() - cached_time).seconds < 3600:   # 1 hour cache
                return df

        info = TICKER_MAP[ticker_key]
        yf_symbol = info.get("yf", ticker_key)
        df = self._fetch_yahoo(yf_symbol, period='1y', interval='1d')

        if df is None or len(df) < 40:
            logger.warning(f"Using fallback CSV for {ticker_key}")
            # Try loading from the original CSV files you downloaded
            csv_map = {
                'AAPL': 'stock_AAPL.csv', 'TSLA': 'stock_TSLA.csv',
                'EURUSD': 'forex_EURUSD.csv', 'GBPUSD': 'forex_GBPUSD.csv',
                'GOLD': 'mineral_Gold.csv', 'SILVER': 'mineral_Silver.csv',
            }
            csv_path = BASE_DIR.parent / "data" / csv_map.get(ticker_key, '')
            if csv_path.exists():
                df = pd.read_csv(csv_path, index_col=0, parse_dates=True, skiprows=[1, 2])
                df.columns = ['Close', 'High', 'Low', 'Open', 'Volume']
                df = df.apply(pd.to_numeric, errors='coerce').dropna()
                # Use only the last year
                df = df.tail(365)

        self.cache[ticker_key] = (datetime.now(), df)
        return df

    # ── public API methods ─────────────────────────────────────────────────
    def get_history(self, ticker: str, period: str = '6mo'):
        """Return OHLCV history for charts"""
        try:
            ticker = ticker.upper()
            if ticker not in TICKER_MAP:
                return {'error': f'Unknown ticker: {ticker}'}

            df = self._get_df(ticker)
            if df is None:
                return {'error': 'Could not fetch data'}

            # Filter by period
            period_days = {
                '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730
            }
            days = period_days.get(period, 180)
            df   = df.tail(days)

            info = TICKER_MAP[ticker]
            return {
                'ticker':   ticker,
                'label':    info['label'],
                'category': info['category'],
                'dates':    df.index.astype(str).tolist(),
                'open':     df['Open'].round(4).tolist(),
                'high':     df['High'].round(4).tolist(),
                'low':      df['Low'].round(4).tolist(),
                'close':    df['Close'].round(4).tolist(),
                'volume':   df['Volume'].tolist(),
            }
        except Exception as e:
            logger.error(f"History error: {e}")
            return {'error': str(e)}

    def get_prediction(self, ticker: str):
        """Predict next day price using trained XGBoost model"""
        try:
            ticker = ticker.upper()
            if ticker not in TICKER_MAP:
                return {'error': f'Unknown ticker: {ticker}'}

            if ticker not in self.models:
                return {'error': f'Model not loaded for {ticker}. Check models/ folder.'}

            df = self._get_df(ticker)
            if df is None or len(df) < 40:
                return {'error': 'Insufficient data'}

            # Build features
            df_feat = self._build_features(df)
            if len(df_feat) == 0:
                return {'error': 'Feature engineering failed'}

            # Use last row = most recent data point
            latest   = df_feat[self.FEATURES].iloc[[-1]]
            scaled   = self.scalers[ticker].transform(latest)
            import xgboost as xgb
            dmatrix  = xgb.DMatrix(scaled)
            pred     = float(self.models[ticker].predict(dmatrix)[0])

            current  = float(df['Close'].iloc[-1])
            change   = ((pred - current) / current) * 100

            # Also generate 7-day rolling forecast
            forecast = self._rolling_forecast(df_feat, ticker, days=7)

            return {
                'ticker':          ticker,
                'label':           TICKER_MAP[ticker]['label'],
                'current_price':   round(current, 4),
                'predicted_price': round(pred, 4),
                'change_pct':      round(change, 2),
                'direction':       'up' if change > 0 else 'down',
                'forecast_7d':     forecast,
                'model':           'XGBoost',
                'last_updated':    datetime.now().strftime('%Y-%m-%d %H:%M'),
            }
        except Exception as e:
            logger.error(f"Prediction error: {e}")
            return {'error': str(e)}

    def _rolling_forecast(self, df_feat, ticker, days=7):
        """Generate multi-day forecast by feeding predictions back"""
        import xgboost as xgb
        try:
            df_sim = df_feat.copy()
            forecasts = []
            for i in range(days):
                latest = df_sim[self.FEATURES].iloc[[-1]]
                scaled = self.scalers[ticker].transform(latest)
                dmatrix = xgb.DMatrix(scaled)
                pred   = float(self.models[ticker].predict(dmatrix)[0])
                forecasts.append(round(pred, 4))

                # Feed prediction as next Close (simple simulation)
                new_row             = df_sim.iloc[[-1]].copy()
                new_row['Close']    = pred
                new_row['Lag_7']    = new_row['Lag_5']
                new_row['Lag_5']    = new_row['Lag_3']
                new_row['Lag_3']    = new_row['Lag_2']
                new_row['Lag_2']    = new_row['Lag_1']
                new_row['Lag_1']    = pred
                df_sim = pd.concat([df_sim, new_row])

            future_dates = [(datetime.now() + timedelta(days=i+1)).strftime('%Y-%m-%d')
                            for i in range(days)]
            return {'dates': future_dates, 'prices': forecasts}
        except Exception as e:
            logger.error(f"Rolling forecast error: {e}")
            return {'dates': [], 'prices': []}

    def get_technical_indicators(self, ticker: str):
        """Return technical indicators for the ticker"""
        try:
            ticker = ticker.upper()
            df     = self._get_df(ticker)
            if df is None:
                return {'error': 'No data'}

            prices = df['Close'].values
            df_feat= self._build_features(df)

            if len(df_feat) == 0:
                return {'error': 'Not enough data'}

            last = df_feat.iloc[-1]

            # Bollinger band position
            boll  = float(last['Bollinger'])
            sma20 = float(df['Close'].rolling(20).mean().iloc[-1])
            std20 = float(df['Close'].rolling(20).std().iloc[-1])

            return {
                'ticker':    ticker,
                'rsi':       round(float(last['RSI']), 2),
                'macd':      round(float(last['MACD']), 4),
                'ma_7':      round(float(last['MA_7']), 4),
                'ma_30':     round(float(last['MA_30']), 4),
                'volatility':round(float(last['Volatility']), 4),
                'bollinger': {
                    'upper':  round(sma20 + 2 * std20, 4),
                    'middle': round(sma20, 4),
                    'lower':  round(sma20 - 2 * std20, 4),
                    'position': round(boll, 4),
                },
                'return_1d': round(float(last['Return_1d']) * 100, 2),
                'return_7d': round(float(last['Return_7d']) * 100, 2),
            }
        except Exception as e:
            logger.error(f"Indicators error: {e}")
            return {'error': str(e)}

    def get_all_tickers(self):
        """Return list of all supported tickers"""
        return [
            {
                'ticker':   k,
                'label':    v['label'],
                'category': v['category'],
                'model_loaded': k in self.models,
            }
            for k, v in TICKER_MAP.items()
        ]