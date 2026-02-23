"""
Finance Signal Analysis Module
Stock market, currencies, minerals prediction using trained XGBoost models
Predicts % return then converts back to price — handles large price swings correctly
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

BASE_DIR   = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"

TICKER_MAP = {
    "GOOGL":  {"key": "GOOGL",  "category": "stock",   "label": "Google",  "yf": "GOOGL"},
    "TSLA":   {"key": "TSLA",   "category": "stock",   "label": "Tesla",   "yf": "TSLA"},
    "EURUSD": {"key": "EURUSD", "category": "forex",   "label": "EUR/USD", "yf": "EURUSD=X"},
    "GBPUSD": {"key": "GBPUSD", "category": "forex",   "label": "GBP/USD", "yf": "GBPUSD=X"},
    "GOLD":   {"key": "GOLD",   "category": "mineral", "label": "Gold",    "yf": "GC=F"},
    "SILVER": {"key": "SILVER", "category": "mineral", "label": "Silver",  "yf": "SI=F"},
}


class FinanceAnalyzer:

    def __init__(self):
        self.models  = {}
        self.scalers = {}
        self.cache   = {}
        self._load_models()

    def _load_models(self):
        import xgboost as xgb
        for name in TICKER_MAP:
            json_path   = MODELS_DIR / f"model_{name}.json"
            scaler_path = MODELS_DIR / f"scaler_{name}.pkl"
            if json_path.exists() and scaler_path.exists():
                booster = xgb.Booster()
                booster.load_model(str(json_path))
                self.models[name]  = booster
                self.scalers[name] = joblib.load(scaler_path)
                logger.info(f"✅ Loaded model for {name}")
            else:
                logger.warning(f"⚠️ Model files not found for {name} — looked for {json_path}")

    def _compute_rsi(self, series, period=14):
        delta = series.diff()
        gain  = delta.clip(lower=0).rolling(period).mean()
        loss  = -delta.clip(upper=0).rolling(period).mean()
        rs    = gain / (loss + 1e-9)
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

    def _compute_atr(self, df, period=14):
        high_low   = df['High'] - df['Low']
        high_close = (df['High'] - df['Close'].shift()).abs()
        low_close  = (df['Low']  - df['Close'].shift()).abs()
        tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
        return tr.rolling(period).mean()

    def _build_features(self, df):
        """28 features — must match Kaggle training exactly"""
        df = df.copy()
        df['Volume'] = pd.to_numeric(df['Volume'], errors='coerce')
        df['Volume'] = df['Volume'].replace(0, np.nan).fillna(df['Volume'].median())

        df['MA_7']   = df['Close'].rolling(7).mean()
        df['MA_21']  = df['Close'].rolling(21).mean()
        df['MA_50']  = df['Close'].rolling(50).mean()
        df['EMA_12'] = df['Close'].ewm(span=12, adjust=False).mean()
        df['EMA_26'] = df['Close'].ewm(span=26, adjust=False).mean()

        df['Close_vs_MA7']  = df['Close'] / df['MA_7']  - 1
        df['Close_vs_MA21'] = df['Close'] / df['MA_21'] - 1
        df['MA7_vs_MA21']   = df['MA_7']  / df['MA_21'] - 1

        df['RSI']        = self._compute_rsi(df['Close'], period=14)
        df['RSI_7']      = self._compute_rsi(df['Close'], period=7)
        df['MACD']       = self._compute_macd(df['Close'])
        df['Return_1d']  = df['Close'].pct_change(1)
        df['Return_3d']  = df['Close'].pct_change(3)
        df['Return_7d']  = df['Close'].pct_change(7)
        df['Return_14d'] = df['Close'].pct_change(14)

        df['Volatility_7']  = df['Return_1d'].rolling(7).std()
        df['Volatility_21'] = df['Return_1d'].rolling(21).std()
        df['Bollinger']     = self._compute_bollinger(df['Close'])
        df['ATR']           = self._compute_atr(df)

        df['Lag_1'] = df['Close'].shift(1)
        df['Lag_2'] = df['Close'].shift(2)
        df['Lag_3'] = df['Close'].shift(3)
        df['Lag_5'] = df['Close'].shift(5)
        df['Lag_7'] = df['Close'].shift(7)

        df['Lag_ret_1'] = df['Return_1d'].shift(1)
        df['Lag_ret_2'] = df['Return_1d'].shift(2)
        df['Lag_ret_3'] = df['Return_1d'].shift(3)

        df['Volume_MA7']   = df['Volume'].rolling(7).mean()
        df['Volume_Ratio'] = df['Volume'] / (df['Volume_MA7'] + 1e-9)

        df.dropna(inplace=True)
        return df

    FEATURES = [
        'MA_7', 'MA_21', 'MA_50', 'EMA_12', 'EMA_26',
        'Close_vs_MA7', 'Close_vs_MA21', 'MA7_vs_MA21',
        'RSI', 'RSI_7', 'MACD',
        'Return_1d', 'Return_3d', 'Return_7d', 'Return_14d',
        'Volatility_7', 'Volatility_21', 'Bollinger', 'ATR',
        'Lag_1', 'Lag_2', 'Lag_3', 'Lag_5', 'Lag_7',
        'Lag_ret_1', 'Lag_ret_2', 'Lag_ret_3',
        'Volume_Ratio'
    ]

    def _fetch_yahoo(self, yf_symbol, period='1y', interval='1d'):
        # For 1d period, use 1h interval to get intraday candles
        if period == '1d' and interval == '1d':
            interval = '1h'
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

    def _get_df(self, ticker_key, period='1y', interval='1d'):
        cache_key = f"{ticker_key}_{period}_{interval}"
        if cache_key in self.cache:
            cached_time, df = self.cache[cache_key]
            if (datetime.now() - cached_time).seconds < 3600:
                return df

        info      = TICKER_MAP[ticker_key]
        yf_symbol = info.get("yf", ticker_key)
        df        = self._fetch_yahoo(yf_symbol, period=period, interval=interval)

        if df is None or len(df) < 60:
            logger.warning(f"Using fallback CSV for {ticker_key}")
            csv_map = {
                'GOOGL':  'stock_GOOGL.csv',
                'TSLA':   'stock_TSLA.csv',
                'EURUSD': 'forex_EURUSD.csv',
                'GBPUSD': 'forex_GBPUSD.csv',
                'GOLD':   'mineral_Gold.csv',
                'SILVER': 'mineral_Silver.csv',
            }
            csv_path = BASE_DIR / "data" / csv_map.get(ticker_key, '')
            if csv_path.exists():
                df = pd.read_csv(csv_path, index_col=0, parse_dates=True, skiprows=[1, 2])
                df.columns = ['Close', 'High', 'Low', 'Open', 'Volume']
                df = df.apply(pd.to_numeric, errors='coerce').dropna()
                df = df.tail(365)

        self.cache[cache_key] = (datetime.now(), df)
        return df

    def get_history(self, ticker: str, period: str = '6mo', interval: str = '1d'):
        try:
            ticker = ticker.upper()
            if ticker not in TICKER_MAP:
                return {'error': f'Unknown ticker: {ticker}'}
            df = self._get_df(ticker, period=period, interval=interval)
            if df is None:
                return {'error': 'Could not fetch data'}
            # For daily data, slice by days; for intraday, just return all
            if interval == '1d':
                period_days = {'1d': 5, '5d': 5, '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365}
                days = period_days.get(period, 180)
                df   = df.tail(days)
            # intraday: use all returned data (Yahoo already filtered by range)
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
        """
        Model predicts % return → multiply by current price → get next-day price.
        This avoids the absolute-price drift problem completely.
        """
        try:
            ticker = ticker.upper()
            if ticker not in TICKER_MAP:
                return {'error': f'Unknown ticker: {ticker}'}
            if ticker not in self.models:
                return {'error': f'Model not loaded for {ticker}. Check models/ folder.'}

            df = self._get_df(ticker)
            if df is None or len(df) < 60:
                return {'error': 'Insufficient data'}

            df_feat = self._build_features(df)
            if len(df_feat) == 0:
                return {'error': 'Feature engineering failed'}

            import xgboost as xgb
            latest      = df_feat[self.FEATURES].iloc[[-1]]
            scaled      = self.scalers[ticker].transform(latest)
            dmatrix     = xgb.DMatrix(scaled)
            pred_return = float(self.models[ticker].predict(dmatrix)[0])

            current     = float(df['Close'].iloc[-1])
            pred_price  = current * (1 + pred_return)
            change_pct  = pred_return * 100

            forecast = self._rolling_forecast(df_feat, ticker, current_price=current, days=7)

            return {
                'ticker':          ticker,
                'label':           TICKER_MAP[ticker]['label'],
                'current_price':   round(current, 4),
                'predicted_price': round(pred_price, 4),
                'change_pct':      round(change_pct, 2),
                'direction':       'up' if change_pct > 0 else 'down',
                'forecast_7d':     forecast,
                'model':           'XGBoost',
                'last_updated':    datetime.now().strftime('%Y-%m-%d %H:%M'),
            }
        except Exception as e:
            logger.error(f"Prediction error: {e}")
            return {'error': str(e)}

    def _rolling_forecast(self, df_feat, ticker, current_price, days=7):
        """Predict return each day → convert to price → update features → repeat"""
        import xgboost as xgb
        try:
            forecasts  = []
            last_close = current_price
            last_feat  = df_feat[self.FEATURES].iloc[-1].copy()

            for i in range(days):
                scaled      = self.scalers[ticker].transform([last_feat.values])
                dmatrix     = xgb.DMatrix(scaled)
                pred_return = float(self.models[ticker].predict(dmatrix)[0])
                pred_price  = last_close * (1 + pred_return)
                forecasts.append(round(pred_price, 4))

                last_feat['Lag_7']     = last_feat['Lag_5']
                last_feat['Lag_5']     = last_feat['Lag_3']
                last_feat['Lag_3']     = last_feat['Lag_2']
                last_feat['Lag_2']     = last_feat['Lag_1']
                last_feat['Lag_1']     = pred_price
                last_feat['Lag_ret_3'] = last_feat['Lag_ret_2']
                last_feat['Lag_ret_2'] = last_feat['Lag_ret_1']
                last_feat['Lag_ret_1'] = pred_return
                last_feat['Return_1d'] = pred_return
                last_feat['Close_vs_MA7']  = pred_price / (last_feat['MA_7']  + 1e-9) - 1
                last_feat['Close_vs_MA21'] = pred_price / (last_feat['MA_21'] + 1e-9) - 1
                last_close = pred_price

            future_dates = [(datetime.now() + timedelta(days=i+1)).strftime('%Y-%m-%d')
                            for i in range(days)]
            return {'dates': future_dates, 'prices': forecasts}
        except Exception as e:
            logger.error(f"Rolling forecast error: {e}")
            return {'dates': [], 'prices': []}

    def get_technical_indicators(self, ticker: str):
        try:
            ticker  = ticker.upper()
            df      = self._get_df(ticker)
            if df is None:
                return {'error': 'No data'}
            df_feat = self._build_features(df)
            if len(df_feat) == 0:
                return {'error': 'Not enough data'}
            last  = df_feat.iloc[-1]
            sma20 = float(df['Close'].rolling(20).mean().iloc[-1])
            std20 = float(df['Close'].rolling(20).std().iloc[-1])
            return {
                'ticker':     ticker,
                'rsi':        round(float(last['RSI']), 2),
                'macd':       round(float(last['MACD']), 4),
                'ma_7':       round(float(last['MA_7']), 4),
                'ma_30':      round(float(last['MA_21']), 4),
                'volatility': round(float(last['Volatility_7']), 4),
                'bollinger':  {
                    'upper':    round(sma20 + 2 * std20, 4),
                    'middle':   round(sma20, 4),
                    'lower':    round(sma20 - 2 * std20, 4),
                    'position': round(float(last['Bollinger']), 4),
                },
                'return_1d':  round(float(last['Return_1d']) * 100, 2),
                'return_7d':  round(float(last['Return_7d']) * 100, 2),
            }
        except Exception as e:
            logger.error(f"Indicators error: {e}")
            return {'error': str(e)}

    def get_all_tickers(self):
        return [
            {
                'ticker':       k,
                'label':        v['label'],
                'category':     v['category'],
                'model_loaded': k in self.models,
            }
            for k, v in TICKER_MAP.items()
        ]