<img width="1070" height="340" alt="Image" src="https://github.com/user-attachments/assets/5baca750-7592-45e3-8866-5d974080b69b" />

# Signal Viewer Hub - Complete Documentation

## 📋 Table of Contents
1. [Project Overview](#project-overview)
2. [Project Structure](#project-structure)
3. [System Architecture](#system-architecture)
4. [Installation Guide](#installation-guide)
5. [Medical Signals (ECG/EEG)](#medical-signals-ecgeeg)
6. [Viewer Types](#viewer-types)
7. [AI Models](#ai-models)
8. [Classic ML Comparison](#classic-ml-comparison)
9. [User Controls](#user-controls)
10. [Video Demonstrations](#-📹-Video-Demonstrations)

---

## Project Overview

Signal Viewer Hub is a comprehensive multi-domain signal analysis platform that provides real-time visualization and AI-powered diagnosis for:

- **Medical Signals**: ECG (6 abnormality types) and EEG (4 abnormality types)
- **Acoustic Signals**: Doppler effect simulation and drone detection
- **Financial Signals**: Stocks, currencies, and commodities analysis
- **Microbiome Signals**: Bacterial abundance and disease profiling

The platform features multiple viewer types with interactive controls and integrates real AI models for accurate abnormality detection. Built as a team project for the Digital Signal Processing (DSP) course — Faculty of Engineering Cairo University,Systems and Biomedical Engineering Department.
.

---

## Project Structure

```
task01-signal-viewer-sbeg205_spring26_team06/
├── backend/
│   ├── modules/
│   │   ├── ecg/
│   │   │   ├── models/
│   │   │   │   └── ecg_model.hdf5        ← Pre-trained ECG AI model
│   │   │   ├── ecg_inference.py          ← ECG AI classifier
│   │   │   └── ecg_processor.py          ← ECG signal preprocessing
│   │   ├── eeg/
│   │   │   ├── models/
│   │   │   │   └── EEG_MODEL.pkl         ← Pre-trained EEG AI model
│   │   │   ├── eeg_inference.py          ← EEG AI classifier
│   │   │   └── eeg_processor.py          ← EEG signal preprocessing
│   │   ├── acoustic.py                   ← Doppler & drone detection
│   │   ├── finance.py                    ← Stock/currency/commodity analysis
│   │   ├── medical.py                    ← General medical utilities
│   │   └── microbiome.py                 ← Microbiome dataset analysis
│   ├── uploads/                          ← Temporary file upload storage
│   ├── file_parsers.py                   ← Shared file parsing utilities
│   ├── signal_analysis.py                ← FFT, filter, wavelet, XOR, polar
│   └── main.py                           ← Flask server — ALL API endpoints
├── frontend/
│   ├── css/
│   │   ├── dashboard.css
│   │   └── style.css
│   ├── js/
│   │   ├── app.js                        ← Main app logic
│   │   ├── acoustic.js
│   │   ├── ecg.js
│   │   ├── eeg.js
│   │   ├── finance.js
│   │   ├── medical.js
│   │   ├── microbiome.js
│   │   ├── signalParser.js
│   │   ├── ui.js
│   │   └── visualizations.js
│   ├── dashboard.html                    ← Main entry point
│   ├── acoustic.html
│   ├── ecg.html
│   ├── eeg.html
│   ├── finance.html
│   ├── index.html
│   ├── medical.html
│   ├── medical_choice.html
│   └── microbiome.html
└── README.md
```

---

## Setup & Installation

### 1. Prerequisites

- Python 3.8+
- pip

### 2. Install Python Dependencies

```bash
pip install flask flask-cors numpy scipy scikit-learn
pip install tensorflow keras          # for ECG model (.hdf5)
pip install pyedflib                  # for EDF/BDF files
pip install h5py                      # for MAT v7.3 files
pip install wfdb                      # for WFDB/PhysioBank files
pip install soundfile                 # for WAV/MP3 audio files
pip install yfinance xgboost          # for Finance module
pip install joblib                    # for EEG model (.pkl)
```

Or install all at once:

```bash
pip install flask flask-cors numpy scipy scikit-learn tensorflow keras \
            pyedflib h5py wfdb soundfile yfinance xgboost joblib
```

### 3. Run the Backend

```bash
cd backend
python main.py
```

Server starts at: **http://127.0.0.1:5000**

### 4. Open the Frontend

Open `frontend/dashboard.html` directly in your browser — **no separate frontend server needed**.

> Make sure the backend is running before opening any page.

---

## Medical Module — ECG & EEG
<img width="1776" height="811" alt="Image" src="https://github.com/user-attachments/assets/dd30b388-cefa-452e-a99a-4487f637055e" />

### System Architecture

```
Frontend (HTML/CSS/JS + Plotly) ←→ Backend (Flask Python) ←→ AI Models (HDF5/PKL)
                                           │
                                           ↓
                                    File Parsers
                              (CSV, EDF, MAT, WAV, etc.)
```

### How It Works:
1. User uploads a signal file
2. Backend parses the file and extracts multi-channel data
3. Frontend displays the signal in the selected viewer
4. AI model analyzes the signal and predicts abnormalities
5. Classic ML comparison runs alongside for validation
6. Results are displayed side-by-side for comparison

---

### Installation Guide

### Quick Start
```bash
# 1. Clone and setup
git clone https://github.com/yourusername/signal-viewer-hub.git
cd signal-viewer-hub
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Place AI models
# ECG: backend/modules/ecg/models/ecg_model.hdf5
# EEG: backend/modules/eeg/models/EEG_MODEL.h5

# 4. Start server
cd backend
python main.py

# 5. Open browser
# Navigate to frontend/index.html
```

Server runs at `http://127.0.0.1:5000`

---

### Medical Signals (ECG/EEG)

#### ECG - 6 Abnormality Types
| Type | Risk Level | Description |
|------|------------|-------------|
| Normal Sinus Rhythm | None | Regular rhythm 60-100 BPM |
| Atrial Fibrillation | Moderate-High | Irregular, no P waves |
| Ventricular Tachycardia | High - Emergency | Wide QRS, rate >100 |
| Premature Ventricular Contractions | Low-Moderate | Early wide QRS |
| Sinus Bradycardia | Low | Slow rate <60 BPM |
| Sinus Tachycardia | Low-Moderate | Fast rate >100 BPM |

#### EEG - 4 Abnormality Types
| Type | Risk Level | Description |
|------|------------|-------------|
| Normal EEG | None | Age-appropriate rhythms |
| Epileptiform Activity | Moderate-High | Spike-wave discharges |
| Slow Wave Activity | Moderate | Excessive delta/theta |
| Asymmetry | Moderate | Hemisphere difference >30% |

---

### Viewer Types

#### 1. Continuous-Time Viewer
**Two viewing modes:**

| Mode | Description | Controls |
|------|-------------|----------|
| **Combined** | All channels in one plot | Show/hide channels, change colors, adjust thickness |
| **Separate** | Grid of individual plots | Synchronized zoom/pan across all channels |

**Playback Controls:**
- ▶ Play / ⏸ Pause / ⏹ Stop
- Speed slider (0.2x - 5x)
- Window slider (2s - 20s)
- Position slider for manual navigation
- ↺ Reset to beginning

#### 2. XOR Graph
**What it shows:** Differences between consecutive time chunks

**How it works:**
- Divides signal into equal time chunks
- Computes XOR (absolute difference) between consecutive chunks
- If chunks are identical → result is zero → chunks are erased
- Heatmap visualization with customizable color maps

**User Controls:**
- Channel selection
- Chunk size (time period)
- Color map selection (Hot, Viridis, Plasma, etc.)

#### 3. Polar Graph
**What it shows:** Signal magnitude (r) vs time angle (θ)

**Two modes:**

| Mode | Visual Effect | Best For |
|------|---------------|----------|
| **Sliding** | Moving circular pulse (old points fade) | Real-time monitoring |
| **Cumulative** | Overlapping patterns with average trace | Periodicity analysis |

**Animation Controls:**
- ▶ Play - Cycles through each period
- ⏸ Pause - Stops animation
- ↺ Reset - Returns to first cycle
- Cycle counter shows progress

#### 4. Recurrence Graph
**What it shows:** Comparison between two channels as cumulative scatter plot

**Pattern Interpretation:**
| Pattern | Meaning |
|---------|---------|
| Points near diagonal | Channels behave similarly |
| Diagonal lines | Periodic patterns (heartbeat, brain waves) |
| Clusters | Recurring states |
| Scattered points | Random noise |

**User Controls:**
- Channel X and Y selection
- Similarity threshold (lower = stricter)
- Color map selection

#### 5. FFT (Frequency Spectrum)
**What it shows:** Frequency content of the signal

**EEG Bands:**
| Band | Frequency | Significance |
|------|-----------|--------------|
| Delta | 0.5-4 Hz | Deep sleep |
| Theta | 4-8 Hz | Drowsiness |
| Alpha | 8-13 Hz | Relaxed wakefulness |
| Beta | 13-30 Hz | Active thinking |
| Gamma | 30-50 Hz | Higher cognition |

---

### AI Models

#### ECG Model (`ecg_model.hdf5`)
- **Input**: 4096 samples × 12 leads (16 seconds at 250Hz)
- **Architecture**: Multi-channel CNN
- **Output**: 6 classes (normal + 5 abnormalities)
- **Features extracted**: Heart rate, RR intervals, QRS morphology, ST segment, T wave, P wave

#### EEG Model (`EEG_MODEL.h5`)
- **Input**: 256 samples × 19 channels or feature vector
- **Architecture**: CNN or Random Forest
- **Output**: 4 classes (normal + 3 abnormalities)
- **Features extracted**: Band powers, ratios, asymmetry index, spike rate, Hjorth parameters

#### How Prediction Works
1. Signal is preprocessed (filtering, normalization)
2. Clinical features are extracted (30+ for ECG, 40+ for EEG)
3. Features are fed to the AI model
4. Model returns class probabilities and confidence score
5. Results are displayed with risk assessment and treatment recommendations

#### Fallback Mechanism
If AI model is not loaded, rule-based detection activates:
- **ECG**: Based on heart rate, regularity, and variability
- **EEG**: Based on band power ratios and asymmetry

---

### Classic ML Comparison

### ECG Classic ML Methods
| Method | What it Measures | Clinical Use |
|--------|------------------|--------------|
| HRV Analysis | SDNN, RMSSD, pNN50 | Autonomic function |
| Autocorrelation | Periodicity | Heart rate estimation |
| Statistical Features | Mean, std, zero crossings | Signal quality |
| Spectral Analysis | LF/HF ratio | Sympathetic/parasympathetic balance |

#### EEG Classic ML Methods
| Method | What it Measures | Clinical Use |
|--------|------------------|--------------|
| Spectral Analysis | Band powers, ratios | Background activity |
| Asymmetry Detection | Left-right difference | Structural lesions |
| Spike Detection | Epileptiform discharges | Seizure activity |
| Hjorth Parameters | Activity, mobility, complexity | Signal characteristics |

#### Comparison Display
Both predictions appear side-by-side:
- **Left panel**: AI diagnosis with confidence and risk
- **Right panel**: Classic ML results with method description
- **Bottom**: Agreement indicator (✅ agree / ⚠️ differ)

---

### User Controls Summary

### Channel Controls
| Control | Function | Range |
|---------|----------|-------|
| Checkbox | Show/hide channel | On/Off |
| Color Picker | Change channel color | Any color |
| Thickness | Adjust line width | 0.5 - 3.0 |

#### Graph-Specific Controls

| Graph | Controls |
|-------|----------|
| **XOR** | Channel, Chunk Size, Color Map |
| **Polar** | Channel, Period, Mode (Sliding/Cumulative), Play/Pause |
| **Recurrence** | Channel X, Channel Y, Threshold, Color Map |
| **FFT** | Channel |

#### Filter Controls
| Filter | Cutoff | Use |
|--------|--------|-----|
| Lowpass | 50 Hz | Remove high-frequency noise |
| Highpass | 0.5 Hz | Remove baseline wander |
| Bandpass | 0.5-50 Hz | Keep clinical frequencies |

---

### 📹 Video Demonstrations

#### ECG Signal Viewer Demo
<video src="https://github.com/user-attachments/assets/2246c0b1-c6ab-4f3c-bc84-9623197aa19c" controls width="100%">
  Your browser does not support the video tag.
</video>

*This video demonstrates:*
- *File upload and channel display*
- *Combined vs Separate viewing modes*
- *Playback controls and speed adjustment*
- *XOR Graph, Polar Graph, and Recurrence Plot*
- *AI Diagnosis with real ECG model*
- *Classic ML comparison*

#### EEG Signal Viewer Demo
<video src="https://github.com/user-attachments/assets/5d56951c-5727-40fa-aee6-92c360ed2725" controls width="100%">
  Your browser does not support the video tag.
</video>

*This video demonstrates:*
- *Loading 19-channel EEG files*
- *Frequency band analysis (delta, theta, alpha, beta)*
- *Polar Graph animation of brain waves*
- *Recurrence Plot for hemisphere comparison*
- *AI model prediction with clinical features*
- *Spectral analysis comparison*

---

### Quick Reference

### Default Settings
| Parameter | Default |
|-----------|---------|
| Viewport Duration | 10 seconds |
| Playback Speed | 1x |
| XOR Chunk Size | 250 samples |
| Polar Period | 100 samples |
| Recurrence Threshold | 0.3 |
| Color Map (XOR) | Hot |
| Color Map (Recurrence) | Viridis |

#### Supported File Formats
| Format | Max Size |
|--------|----------|
| CSV, TXT, EDF, BDF, MAT, WAV, MP3 | 500 MB |

#### Keyboard Shortcuts
| Key | Function |
|-----|----------|
| Space | Play/Pause |
| ← → | Navigate |
| + / - | Zoom |
| R | Reset |
| C | Toggle view mode |

---

## Finance Module — Stocks, Currencies & Commodities
---

### Overview

The Finance module provides **real-time market data visualization** and **AI-powered next-day price prediction** for 6 financial instruments across 3 asset classes, powered by trained **XGBoost models**.

> 📌 Access via: `frontend/finance.html`  
> 📌 Backend module: `backend/modules/finance.py`  
> 📌 API prefix: `/api/finance/`

---

### Supported Instruments

| Ticker | Label | Type | Yahoo Finance Symbol |
|--------|-------|------|---------------------|
| `GOOGL` | Google Inc. | Stock | `GOOGL` |
| `TSLA` | Tesla Inc. | Stock | `TSLA` |
| `EURUSD` | Euro / US Dollar | Forex | `EURUSD=X` |
| `GBPUSD` | British Pound / US Dollar | Forex | `GBPUSD=X` |
| `GOLD` | Gold Futures | Mineral | `GC=F` |
| `SILVER` | Silver Futures | Mineral | `SI=F` |

---

### System Architecture

```
User Browser (finance.html + finance.js)
        │
        │  REST API calls
        ▼
Flask Backend (main.py → finance.py)
        │
        ├── Yahoo Finance API  ←  Live OHLCV price data
        │
        └── XGBoost Models (models/)
                ├── model_GOOGL.json  +  scaler_GOOGL.pkl
                ├── model_TSLA.json   +  scaler_TSLA.pkl
                ├── model_EURUSD.json +  scaler_EURUSD.pkl
                ├── model_GBPUSD.json +  scaler_GBPUSD.pkl
                ├── model_GOLD.json   +  scaler_GOLD.pkl
                └── model_SILVER.json +  scaler_SILVER.pkl
```

---

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/finance/history?ticker=GOOGL&period=3mo` | Historical OHLCV data for candlestick chart |
| `GET` | `/api/finance/predict?ticker=GOOGL` | Next-day price prediction + 7-day forecast |
| `GET` | `/api/finance/indicators?ticker=GOOGL` | Technical indicators (RSI, MACD, Bollinger, etc.) |
| `GET` | `/api/finance/tickers` | List all supported tickers and model status |

#### Supported Time Periods (`period`)

| Period | Data Returned |
|--------|--------------|
| `1d` | Intraday — hourly candles |
| `5d` | Last 5 trading days |
| `1mo` | Last 30 days |
| `3mo` | Last 90 days (default) |
| `6mo` | Last 180 days |
| `1y` | Last 365 days |

---

### AI Prediction Model

#### How It Works

The prediction engine uses a **return-based approach** — the model predicts the **percentage change** for the next day, then converts it to a price. This is the standard approach in financial ML.

```
❌ Old approach — predict absolute price:
   Training: Gold at $1,800–$2,500
   Testing:  Gold at $3,500–$4,370  ← model never saw these prices
   Result:   R² = -6.05  (fails completely)

✅ New approach — predict % return:
   Training: Daily returns = -3% to +3%
   Testing:  Daily returns = -3% to +3%  ← always same range
   Result:   R² = 0.93  (excellent)

Formula: predicted_price = current_price × (1 + predicted_return)
Example: 313.38 × (1 + 0.0007) = $313.60
```

#### Model Performance

| Ticker | R² Score | MAPE | Status |
|--------|----------|------|--------|
| GOOGL  | 0.959 | 1.50% | ✅ Excellent |
| Silver | 0.932 | 2.45% | ✅ Excellent |
| GBP/USD | 0.874 | 0.25% | ✅ Excellent |
| EUR/USD | 0.842 | 0.21% | ✅ Excellent |
| Gold   | 0.786 | 1.14% | ✅ Good |
| TSLA   | 0.697 | 2.40% | ✅ Acceptable |

> **R² = 1.0** → perfect prediction | **R² = 0.0** → no better than guessing the average | **R² < 0** → worse than average

#### XGBoost Hyperparameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `n_estimators` | 500 | Number of decision trees |
| `max_depth` | 5 | Max depth per tree — prevents overfitting |
| `learning_rate` | 0.02 | Small steps → more accurate |
| `subsample` | 0.8 | Each tree sees 80% of data — adds diversity |
| `colsample_bytree` | 0.8 | Each tree sees 80% of features |
| `reg_alpha` | 0.1 | L1 regularization |
| `reg_lambda` | 1.0 | L2 regularization |

---

### Feature Engineering — 28 Technical Indicators

The model is trained on 28 features computed from raw OHLCV data:

#### Trend Features
| Feature | Formula | What It Captures |
|---------|---------|-----------------|
| `MA_7` | 7-day simple moving average | Short-term trend |
| `MA_21` | 21-day simple moving average | Medium-term trend |
| `MA_50` | 50-day simple moving average | Long-term trend |
| `EMA_12` | 12-day exponential moving average | Fast momentum |
| `EMA_26` | 26-day exponential moving average | Slow momentum |
| `Close_vs_MA7` | `Close / MA_7 - 1` | % above/below short MA |
| `Close_vs_MA21` | `Close / MA_21 - 1` | % above/below medium MA |
| `MA7_vs_MA21` | `MA_7 / MA_21 - 1` | MA crossover signal |

#### Momentum Features
| Feature | Formula | What It Captures |
|---------|---------|-----------------|
| `RSI` | RSI over 14 days | Overbought/oversold (0–100) |
| `RSI_7` | RSI over 7 days | Faster overbought signal |
| `MACD` | `EMA_12 - EMA_26` | Momentum direction |
| `Return_1d` | 1-day % change | Yesterday's move |
| `Return_3d` | 3-day % change | 3-day momentum |
| `Return_7d` | 7-day % change | Weekly momentum |
| `Return_14d` | 14-day % change | Bi-weekly momentum |

#### Volatility Features
| Feature | Formula | What It Captures |
|---------|---------|-----------------|
| `Volatility_7` | Std dev of returns (7d) | Short-term risk |
| `Volatility_21` | Std dev of returns (21d) | Medium-term risk |
| `Bollinger` | Position in Bollinger Band | `0` = lower band, `1` = upper band |
| `ATR` | Average True Range (14d) | Daily price movement range |

#### Lag Features (most predictive)
| Feature | Description |
|---------|-------------|
| `Lag_1` | Yesterday's closing price |
| `Lag_2` | 2 days ago closing price |
| `Lag_3` | 3 days ago closing price |
| `Lag_5` | 5 days ago closing price |
| `Lag_7` | 1 week ago closing price |
| `Lag_ret_1` | Yesterday's return |
| `Lag_ret_2` | 2 days ago return |
| `Lag_ret_3` | 3 days ago return |

#### Volume Feature
| Feature | Formula | What It Captures |
|---------|---------|-----------------|
| `Volume_Ratio` | `Volume / MA_7(Volume)` | Unusual trading activity |

---

### Training Methodology

#### Data
- **Source:** Yahoo Finance historical data (downloaded via `yfinance`)
- **Range:** 2018-01-01 to 2025-12-30 (~2,000 rows per ticker)
- **Format:** Daily OHLCV for all instruments

#### Train / Test Split
```
❌ Random shuffle — NEVER used for time series (causes data leakage)

✅ Chronological split:
   Train: 2018 → Dec 2025 (all except last 60 days)
   Test:  Last 60 trading days only

Final deployment model: trained on 100% of data
→ captures most recent price patterns
```

#### Scaler
Each ticker has its own `MinMaxScaler` saved as `.pkl`. The scaler normalizes all 28 features to `[0, 1]` range. **The exact same scaler used in training must be used during prediction.**

```python
# Training (Kaggle)
scaler = MinMaxScaler()
X_scaled = scaler.fit_transform(X)
joblib.dump(scaler, "scaler_GOOGL.pkl")

# Prediction (backend)
scaler  = joblib.load("scaler_GOOGL.pkl")
scaled  = scaler.transform(latest_features)   # same scale!
```

---

### Chart — MetaTrader Style
<img width="1768" height="671" alt="Image" src="https://github.com/user-attachments/assets/b3f21bc2-fbdd-4f14-99a9-e8edb8f16a7b" />
The price chart is styled to match professional trading platforms (MT4/MT5):

| Property | Value |
|----------|-------|
| Background | Light grey-blue `#f0f3fa` |
| Up candles | Blue `#2962ff` |
| Down candles | Red `#f23645` |
| MA-20 line | Thin solid orange `#ff6d00` |
| Price axis | Right side (trading standard) |
| Wick width | Thin (`whiskerwidth: 0.3`) |
| Grid | Subtle light lines |
| Margins | Compact (minimal dead space) |

#### 7-Day Forecast Chart
<img width="1800" height="597" alt="Image" src="https://github.com/user-attachments/assets/8ab421dd-6db6-4131-b976-1b51c9e5fe13" />
After clicking **"Predict Future"**, a rolling 7-day forecast is shown:
- Each day's prediction feeds back as input for the next day
- Lag features (`Lag_1`, `Lag_ret_1`, etc.) update each step
- Confidence band shown at ±0.5% around forecast line

---

### Technical Indicators Panel
<img width="1797" height="437" alt="Image" src="https://github.com/user-attachments/assets/ce3b060a-baea-4902-81e8-0c4b9c7c8c5c" />
Displayed automatically after loading any ticker:

| Indicator | Description | Signal |
|-----------|-------------|--------|
| RSI (14) | 0–100 momentum index | >70 overbought, <30 oversold |
| MACD | EMA_12 - EMA_26 | Positive = bullish momentum |
| MA 7 | 7-day moving average | Short-term support/resistance |
| MA 30 | 30-day moving average | Medium-term trend |
| 1D Return | Today's % change | Immediate direction |
| 7D Return | Weekly % change | Weekly trend |
| Volatility | Std dev of daily returns | Risk level |
| BB Upper | Bollinger upper band | Resistance level |
| BB Lower | Bollinger lower band | Support level |

---

### File Structure

```
backend/modules/
└── finance.py               ← Core module

backend/models/              ← AI model files (you must place these here)
├── model_GOOGL.json         ← XGBoost model (JSON — version-independent)
├── scaler_GOOGL.pkl         ← MinMaxScaler (must match training exactly)
├── model_TSLA.json
├── scaler_TSLA.pkl
├── model_EURUSD.json
├── scaler_EURUSD.pkl
├── model_GBPUSD.json
├── scaler_GBPUSD.pkl
├── model_GOLD.json
├── scaler_GOLD.pkl
├── model_SILVER.json
└── scaler_SILVER.pkl

frontend/
├── finance.html             ← Finance viewer page
└── js/finance.js            ← Chart rendering + API calls
```

> **Note:** Model files are not included in the repository due to size. Train them using the Kaggle notebook, then place the 12 files (6 `.json` + 6 `.pkl`) in `backend/models/`.

---

### Data Flow — End to End

```
1. User selects ticker + time period in browser
        ↓
2. finance.js calls GET /api/finance/history
        ↓
3. finance.py checks cache (1-hour TTL)
   → if fresh: return cached data
   → if stale: fetch from Yahoo Finance API
        ↓
4. finance.js renders MetaTrader-style candlestick chart
        ↓
5. User clicks "Predict Future"
        ↓
6. finance.js calls GET /api/finance/predict
        ↓
7. finance.py:
   a. Fetch last 1 year of OHLCV data
   b. Compute 28 features for every day
   c. Take last row (today's features)
   d. Normalize with saved MinMaxScaler
   e. Run XGBoost model → predicted return
   f. Convert: price = current × (1 + return)
   g. Rolling forecast: repeat 7 times, feeding each prediction back
        ↓
8. finance.js renders 7-day forecast chart + detail panel
        ↓
9. finance.js also fetches /api/finance/indicators
        ↓
10. Technical indicators panel updates automatically
```

---

### Quick Reference

### Default Settings

| Parameter | Default |
|-----------|---------|
| Default Ticker | `GOOGL` |
| Default Period | `3mo` |
| Forecast Length | 7 days |
| Data Cache TTL | 1 hour |
| Fallback | CSV files in `backend/data/` |

#### RSI Interpretation

| RSI Value | Signal | Action |
|-----------|--------|--------|
| > 70 | Overbought | Potential sell signal |
| 50–70 | Bullish | Upward momentum |
| 30–50 | Bearish | Downward momentum |
| < 30 | Oversold | Potential buy signal |

#### Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "Model not loaded" error | `.json` or `.pkl` file missing | Place model files in `backend/models/` |
| All predictions identical | Wrong scaler loaded | Ensure `.pkl` matches the trained model |
| "Insufficient data" error | Fewer than 60 rows returned | Yahoo Finance rate limit — wait and retry |
| Yahoo Finance fails | Network / rate limit | App falls back to CSV files in `backend/data/` |
| Chart not rendering | Backend not running | Start with `python main.py` on port 5000 |

---
# 🔊 Acoustic Signal Analysis Module

A Python module for real-time acoustic signal processing, featuring Doppler effect simulation, vehicle velocity estimation, and AI-powered drone detection.

---

## Features

- **Doppler Effect Simulation** — Generates realistic audio of a vehicle passing an observer, with physically accurate frequency shifts and distance-based amplitude decay.
- **Velocity Estimation** — Analyzes a recorded audio file and estimates vehicle speed using spectrogram-based Doppler analysis, no prior knowledge of the emitted frequency required.
- **Drone Detection** — Identifies drone audio signatures using a trained TensorFlow/Keras neural network model via FFT-based feature extraction.
- **Test Signal Generation** — Produces synthetic drone and car-pass signals for debugging and benchmarking.
- **Acoustic Feature Extraction** — Extracts RMS, zero-crossing rate, spectral centroid, spectral spread, and band energies from any audio signal.

---

## Requirements

Install dependencies via pip:

```bash
pip install numpy scipy tensorflow librosa soundfile
```

| Package | Purpose |
|---|---|
| `numpy` | Array math and signal processing |
| `scipy` | Spectrogram computation, WAV I/O |
| `tensorflow` | Drone detection neural network |
| `librosa` | Audio loading and resampling |
| `soundfile` | High-quality WAV encoding *(optional but recommended)* |

> If `soundfile` is not installed, WAV export in `generate_doppler_sound` will be disabled (`audio_base64` returns `None`).

---

## Setup

1. Clone or copy `acoustic.py` into your project.
2. Place your trained drone detection model at:
   ```
   backend/models/drone_model.h5
   ```
   The module also checks for `drone_model.h5` in the same directory as `acoustic.py` on initialization.

3. Instantiate the analyzer:
   ```python
   from acoustic import AcousticAnalyzer
   analyzer = AcousticAnalyzer()
   ```

---

## Usage

### Generate a Doppler Sound

Simulates a vehicle passing the observer at a given speed.

```python
result = analyzer.generate_doppler_sound(frequency=440, velocity=30, duration=5)

# result keys:
# audio_base64      — WAV file encoded as base64 string (if soundfile is available)
# sample_rate       — Audio sample rate (44100 Hz)
# duration          — Duration in seconds
# sound_array       — Raw audio samples as a list (fallback if soundfile unavailable)
# frequency_range   — {'min': ..., 'max': ..., 'original': ...}
# velocity_used     — Velocity passed in (m/s)
# doppler_shift     — Frequency difference between approaching and receding (Hz)
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `frequency` | int/float | 440 | Emitted sound frequency in Hz |
| `velocity` | float | 30 | Vehicle speed in m/s (must be < 343 m/s) |
| `duration` | float | 5 | Duration of audio clip in seconds |

---

### Estimate Vehicle Velocity from Audio File

Analyzes a recorded audio file and estimates the vehicle's speed using Doppler frequency analysis.

```python
result = analyzer.estimate_velocity_from_file('path/to/audio.wav')

# result keys:
# estimated_velocity_ms   — Speed in meters per second
# estimated_velocity_kmh  — Speed in kilometers per hour
# estimated_emitted_freq  — Self-calibrated emitted frequency (Hz)
# freq_approaching_avg    — Average frequency in first half of recording
# freq_receding_avg       — Average frequency in second half
# f_high_percentile       — 90th percentile frequency (approaching peak)
# f_low_percentile        — 10th percentile frequency (receding trough)
# direction               — 'approaching then receding' or 'receding (partial pass?)'
# method                  — Analysis method used
# confidence              — Confidence score (0.0 – 0.95)
```

The method is **self-calibrating** — it estimates the original emitted frequency from the audio itself (at the moment of closest approach), so no prior knowledge of the vehicle's sound is needed.

---

### Detect Drone from Audio File

Runs the audio through the trained neural network and returns a detection result.

```python
result = analyzer.detect_drone_from_file('path/to/audio.wav')

# result keys:
# detected    — True / False
# confidence  — Confidence percentage (0–100)
```

The model processes audio at **16,000 Hz**, fixes input length to **16,000 samples (1 second)**, and uses an **FFT magnitude spectrum** as the input feature vector.

> Make sure `backend/models/drone_model.h5` exists and matches the expected input shape before calling this method.

---

### Extract Acoustic Features

```python
import numpy as np
audio_data = np.random.randn(44100)  # example: 1 second of noise
features = analyzer.extract_features(audio_data, fs=44100)

# features keys:
# rms, zero_crossing_rate, spectral_centroid,
# spectral_spread, band_0_energy, band_1_energy,
# band_2_energy, band_3_energy
```

| Feature | Description |
|---|---|
| `rms` | Root mean square energy |
| `zero_crossing_rate` | Rate of sign changes per sample |
| `spectral_centroid` | Weighted mean frequency (Hz) |
| `spectral_spread` | Variance around spectral centroid |
| `band_N_energy` | Energy in frequency bands: 0–300, 300–800, 800–2000, 2000–4000 Hz |

---

### Generate Test Signals

```python
signals = analyzer.generate_test_signals()
# signals['drone']    — synthetic drone audio (list)
# signals['car_pass'] — Doppler car-pass audio (list)
```

---

## Physics Reference

The Doppler effect formula used:

$$f_{observed} = f_0 \cdot \frac{v_{sound}}{v_{sound} - v_{radial}}$$

Where $v_{radial}$ is the component of the vehicle's velocity directed toward the observer, computed continuously along the vehicle's trajectory.

Velocity is estimated inversely from observed high/low frequencies:

$$v = \frac{v_{high} + v_{low}}{2}, \quad v_{high} = c\left(1 - \frac{f_0}{f_{high}}\right), \quad v_{low} = c\left(\frac{f_0}{f_{low}} - 1\right)$$

---

## Notes

- Sound speed is fixed at **343 m/s** (dry air at ~20°C).
- The observer is placed **2 meters** perpendicular to the vehicle's path in Doppler simulations.
- The module logs errors via Python's standard `logging` library — configure a handler to capture them.
- The commented-out `detect_drone_from_file` variant in the source uses hand-crafted features instead of FFT; it can be re-enabled if a compatible model is available.



## Support
- **Email**: alaaessam446@gmail.com
- **Email**: abdullahgamil285@gmail.com
- **Email**: 
- **Email**: 

---

