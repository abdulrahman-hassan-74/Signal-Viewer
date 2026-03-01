# 📊 Signal Viewer Hub - Complete Documentation

<img width="1070" height="340" alt="Signal Viewer Hub Banner" src="https://github.com/user-attachments/assets/5baca750-7592-45e3-8866-5d974080b69b">

---

## 📋 Table of Contents

### 1.0 Project Overview
- 1.1 Introduction
- 1.2 Key Features
- 1.3 Target Domains

### 2.0 System Architecture
- 2.1 High-Level Architecture
- 2.2 Technology Stack
- 2.3 Data Flow

### 3.0 Project Structure
- 3.1 Directory Layout
- 3.2 Backend Modules
- 3.3 Frontend Components

### 4.0 Installation Guide
- 4.1 Prerequisites
- 4.2 Dependencies Installation
- 4.3 Running the Application
- 4.4 Configuration

### 5.0 Medical Signal Analysis (ECG/EEG)
- 5.1 ECG Module
  - 5.1.1 Abnormality Types
  - 5.1.2 AI Model Specifications
  - 5.1.3 Feature Extraction
- 5.2 EEG Module
  - 5.2.1 Abnormality Types
  - 5.2.2 AI Model Specifications
  - 5.2.3 Frequency Bands
- 5.3 Medical Module Interface

### 6.0 Visualization Modules
- 6.1 Continuous-Time Viewer
- 6.2 XOR Graph
- 6.3 Polar Graph
- 6.4 Recurrence Plot
- 6.5 FFT Spectrum Analyzer

### 7.0 AI Models & Inference
- 7.1 ECG Deep Learning Model
- 7.2 EEG Classification Model
- 7.3 Inference Pipeline
- 7.4 Fallback Mechanisms

### 8.0 Classic ML Comparison
- 8.1 ECG Traditional Methods
- 8.2 EEG Traditional Methods
- 8.3 Comparison Framework

### 9.0 Financial Analysis Module
- 9.1 Supported Instruments
- 9.2 XGBoost Prediction Models
- 9.3 Feature Engineering
- 9.4 API Endpoints
- 9.5 Charting & Visualization
- 9.6 Technical Indicators Panel

### 10.0 Acoustic Signal Processing
- 10.1 Doppler Effect Simulation
- 10.2 Velocity Estimation
- 10.3 Drone Detection
- 10.4 Mathematical Foundations

### 11.0 Microbiome Analysis
- 11.1 Disease Profiles
- 11.2 Diversity Metrics
- 11.3 Risk Assessment
- 11.4 Personalized Recommendations
- 11.5 Analysis Interface

### 12.0 User Interface & Controls
- 12.1 Channel Controls
- 12.2 Playback Controls
- 12.3 Graph-Specific Controls
- 12.4 Keyboard Shortcuts

### 13.0 File Handling
- 13.1 Supported Formats
- 13.2 Parsers Implementation
- 13.3 Upload Limitations

### 14.0 API Reference
- 14.1 Medical Endpoints
- 14.2 Financial Endpoints
- 14.3 Acoustic Endpoints
- 14.4 Microbiome Endpoints

### 15.0 Video Demonstrations
- 15.1 ECG Viewer Demo
- 15.2 EEG Viewer Demo

### 16.0 Troubleshooting
- 16.1 Common Issues
- 16.2 Solutions & Workarounds

### 17.0 Support & Contact

---

## 1.0 Project Overview

### 1.1 Introduction
Signal Viewer Hub is a comprehensive multi-domain signal analysis platform developed as a team project for the Digital Signal Processing (DSP) course at the Faculty of Engineering Cairo University, Systems and Biomedical Engineering Department.

The platform provides real-time visualization and AI-powered diagnosis across multiple signal domains, integrating trained deep learning models with interactive visualization tools.

### 1.2 Key Features
- Real-time signal visualization with multiple viewing modes
- AI-powered abnormality detection using trained models
- Multi-channel signal support (up to 19 channels for EEG, 12 leads for ECG)
- Interactive playback controls with adjustable speed and window size
- Multiple visualization types (XOR, Polar, Recurrence, FFT)
- Side-by-side comparison between AI and classic ML methods
- Support for multiple file formats (CSV, EDF, MAT, WAV, etc.)

### 1.3 Target Domains
- **Medical Signals**: ECG (6 abnormality types) and EEG (4 abnormality types)
- **Acoustic Signals**: Doppler effect simulation and drone detection
- **Financial Signals**: Stocks, currencies, and commodities analysis
- **Microbiome Signals**: Bacterial abundance and disease profiling

---

## 2.0 System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│                 │     │                  │     │                 │
│   Frontend      │────▶│    Backend       │────▶│   AI Models     │
│   (HTML/CSS/JS  │     │    (Flask)       │     │   (HDF5/PKL)    │
│   + Plotly)     │◀────│                  │◀────│                 │
│                 │     │                  │     │                 │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                  │
                                  ▼
                        ┌─────────────────┐
                        │                 │
                        │  File Parsers   │
                        │  (CSV, EDF,     │
                        │   MAT, WAV)     │
                        │                 │
                        └─────────────────┘
```

### 2.2 Technology Stack

| Component | Technologies |
|-----------|-------------|
| Frontend | HTML5, CSS3, JavaScript, Plotly.js |
| Backend | Python 3.8+, Flask, Flask-CORS |
| AI/ML | TensorFlow/Keras, Scikit-learn, XGBoost |
| Signal Processing | NumPy, SciPy, Librosa |
| File Parsing | PyEDFlib, H5Py, WFDB, SoundFile |
| Financial Data | yFinance |

### 2.3 Data Flow
1. User uploads signal file through frontend interface
2. Backend receives file and routes to appropriate parser
3. File parser extracts multi-channel data based on format
4. Processed data returned to frontend for visualization
5. User selects viewer type and configures display parameters
6. Optional: Request AI analysis for abnormality detection
7. Results displayed with confidence scores and recommendations

---

## 3.0 Project Structure

### 3.1 Directory Layout

```
task01-signal-viewer-sbeg205_spring26_team06/
├── backend/
│   ├── modules/
│   │   ├── ecg/
│   │   │   ├── models/
│   │   │   │   └── ecg_model.hdf5
│   │   │   ├── ecg_inference.py
│   │   │   └── ecg_processor.py
│   │   ├── eeg/
│   │   │   ├── models/
│   │   │   │   └── EEG_MODEL.pkl
│   │   │   ├── eeg_inference.py
│   │   │   └── eeg_processor.py
│   │   ├── acoustic.py
│   │   ├── finance.py
│   │   ├── medical.py
│   │   └── microbiome.py
│   ├── uploads/
│   ├── file_parsers.py
│   ├── signal_analysis.py
│   └── main.py
├── frontend/
│   ├── css/
│   │   ├── dashboard.css
│   │   └── style.css
│   ├── js/
│   │   ├── app.js
│   │   ├── acoustic.js
│   │   ├── ecg.js
│   │   ├── eeg.js
│   │   ├── finance.js
│   │   ├── medical.js
│   │   ├── microbiome.js
│   │   ├── signalParser.js
│   │   ├── ui.js
│   │   └── visualizations.js
│   ├── dashboard.html
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

### 3.2 Backend Modules

| Module | File | Description |
|--------|------|-------------|
| ECG Processing | `ecg/` | ECG signal preprocessing and AI inference |
| EEG Processing | `eeg/` | EEG signal preprocessing and AI inference |
| Acoustic | `acoustic.py` | Doppler simulation and drone detection |
| Financial | `finance.py` | Stock/currency/commodity analysis |
| Microbiome | `microbiome.py` | Bacterial abundance analysis |
| File Parsers | `file_parsers.py` | Multi-format file parsing utilities |
| Signal Analysis | `signal_analysis.py` | FFT, filtering, wavelet transforms |
| Main Server | `main.py` | Flask server with all API endpoints |

### 3.3 Frontend Components

| Component | File | Description |
|-----------|------|-------------|
| Main App Logic | `app.js` | Core application controller |
| UI Management | `ui.js` | User interface interactions |
| Visualizations | `visualizations.js` | Plotly chart rendering |
| Signal Parsing | `signalParser.js` | Client-side signal parsing |
| Module Scripts | `ecg.js`, `eeg.js`, etc. | Domain-specific functionality |

---

## 4.0 Installation Guide

### 4.1 Prerequisites
- Python 3.8 or higher
- pip package manager
- Modern web browser (Chrome, Firefox, Edge)
- 4GB RAM minimum (8GB recommended for AI models)

### 4.2 Dependencies Installation

```bash
# Core dependencies
pip install flask flask-cors numpy scipy scikit-learn

# AI/ML frameworks
pip install tensorflow keras xgboost joblib

# File format support
pip install pyedflib h5py wfdb soundfile

# Financial data
pip install yfinance

# Audio processing
pip install librosa

# Install all at once
pip install flask flask-cors numpy scipy scikit-learn tensorflow keras \
            pyedflib h5py wfdb soundfile yfinance xgboost joblib librosa
```

### 4.3 Running the Application

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/signal-viewer-hub.git
cd signal-viewer-hub

# 2. (Optional) Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start backend server
cd backend
python main.py

# 5. Open frontend
# Navigate to frontend/dashboard.html in your browser
# Backend runs at: http://127.0.0.1:5000
```

### 4.4 Configuration
- Default server port: 5000 (configurable in `main.py`)
- Upload directory: `backend/uploads/` (auto-created)
- Max file size: 500MB (configurable)
- Model paths: `backend/modules/[ecg|eeg]/models/`

---

## 5.0 Medical Signal Analysis (ECG/EEG)

<div align="center">
  <img width="1776" height="811" alt="Medical Module Interface" src="https://github.com/user-attachments/assets/dd30b388-cefa-452e-a99a-4487f637055e">
  <p><em>Figure 1: Medical Signal Analysis Module Interface</em></p>
</div>

### 5.1 ECG Module

#### 5.1.1 Abnormality Types

| Type | Risk Level | Clinical Description | ECG Characteristics |
|------|------------|---------------------|---------------------|
| Normal Sinus Rhythm | None | Regular heart rhythm | Rate 60-100 BPM, normal P waves, regular RR intervals |
| Atrial Fibrillation | Moderate-High | Irregular atrial activity | Irregularly irregular rhythm, absent P waves |
| Ventricular Tachycardia | High - Emergency | Rapid ventricular rhythm | Wide QRS >120ms, rate >100 BPM, AV dissociation |
| Premature Ventricular Contractions | Low-Moderate | Early ventricular beats | Premature wide QRS, compensatory pause |
| Sinus Bradycardia | Low | Slow heart rate | Rate <60 BPM, normal morphology |
| Sinus Tachycardia | Low-Moderate | Fast heart rate | Rate >100 BPM, normal morphology |

#### 5.1.2 AI Model Specifications
- **Model File**: `ecg_model.hdf5`
- **Input Shape**: 4096 samples × 12 leads
- **Sampling Rate**: 250 Hz (16 seconds of data)
- **Architecture**: Multi-channel Convolutional Neural Network
- **Output**: 6-class softmax probabilities
- **Training Data**: 10,000+ annotated ECG recordings

#### 5.1.3 Feature Extraction
- Heart rate variability metrics (SDNN, RMSSD, pNN50)
- RR interval statistics
- QRS morphology parameters
- ST segment elevation/depression
- T wave amplitude and polarity
- P wave presence and morphology

### 5.2 EEG Module

#### 5.2.1 Abnormality Types

| Type | Risk Level | Description | Clinical Significance |
|------|------------|-------------|----------------------|
| Normal EEG | None | Age-appropriate rhythms | No epileptiform activity, normal background |
| Epileptiform Activity | Moderate-High | Spike-wave discharges | Indicates seizure susceptibility |
| Slow Wave Activity | Moderate | Excessive delta/theta | Suggests encephalopathy or structural lesion |
| Asymmetry | Moderate | Hemisphere difference >30% | Indicates focal pathology |

#### 5.2.2 AI Model Specifications
- **Model File**: `EEG_MODEL.pkl`
- **Input Options**: 256 samples × 19 channels OR feature vector
- **Architecture**: Random Forest / CNN ensemble
- **Output**: 4-class classification with confidence scores

#### 5.2.3 Frequency Bands

| Band | Frequency Range | Physiological Significance |
|------|----------------|---------------------------|
| Delta | 0.5 - 4 Hz | Deep sleep, pathology in awake adults |
| Theta | 4 - 8 Hz | Drowsiness, meditation, memory encoding |
| Alpha | 8 - 13 Hz | Relaxed wakefulness, eyes closed |
| Beta | 13 - 30 Hz | Active thinking, concentration, anxiety |
| Gamma | 30 - 50 Hz | Higher cognitive processing |

---

## 6.0 Visualization Modules

### 6.1 Continuous-Time Viewer
**Purpose**: Real-time display of multi-channel signals with playback controls

**Features**:
- Combined mode: All channels overlaid on single plot
- Separate mode: Individual subplots for each channel
- Synchronized zooming and panning across channels
- Playback controls with adjustable speed (0.2x - 5x)
- Window size adjustment (2s - 20s)
- Manual position slider for navigation

### 6.2 XOR Graph
**Purpose**: Visualize differences between consecutive signal segments

**Algorithm**:
1. Divide signal into equal time chunks
2. Compute absolute difference between consecutive chunks
3. Generate heatmap visualization of differences

**Applications**:
- Detecting transient events
- Identifying stationary vs. changing signal regions
- Visualizing signal stationarity

### 6.3 Polar Graph
**Purpose**: Circular representation of periodic signals

**Operating Modes**:

| Mode | Description | Use Case |
|------|-------------|----------|
| Sliding | Moving circular pulse with fading trace | Real-time monitoring |
| Cumulative | Overlapping patterns with average overlay | Periodicity analysis |

**Parameters**:
- Period length (samples or seconds)
- Animation speed
- Trace persistence (sliding mode only)

### 6.4 Recurrence Plot
**Purpose**: Visualize temporal correlations and patterns

**Interpretation**:
- Diagonal lines: Periodic/deterministic behavior
- Clusters: Recurring states
- Scattered points: Random/stochastic activity
- Distance from diagonal: Dissimilarity between channels

### 6.5 FFT Spectrum Analyzer
**Purpose**: Frequency domain analysis of signals

**Features**:
- Real-time FFT computation
- Frequency band highlighting (EEG bands)
- Peak detection
- Power spectral density estimation

---

## 7.0 AI Models & Inference

### 7.1 ECG Deep Learning Model

**Architecture Details**:
```
Input (4096, 12)
    ↓
Conv1D (64 filters, kernel 16, ReLU)
    ↓
MaxPooling (4)
    ↓
Conv1D (128 filters, kernel 8, ReLU)
    ↓
MaxPooling (4)
    ↓
Conv1D (256 filters, kernel 4, ReLU)
    ↓
GlobalAveragePooling1D
    ↓
Dense (128, ReLU, Dropout 0.5)
    ↓
Dense (64, ReLU, Dropout 0.3)
    ↓
Dense (6, Softmax)
```

### 7.2 EEG Classification Model

**Feature Engineering Pipeline**:
1. Band power extraction (delta, theta, alpha, beta, gamma)
2. Asymmetry indices between homologous channels
3. Hjorth parameters (activity, mobility, complexity)
4. Spike detection metrics
5. Statistical features (mean, variance, skewness, kurtosis)

### 7.3 Inference Pipeline

```python
# Simplified inference flow
def predict_abnormality(signal_data, model_type):
    # 1. Preprocessing
    filtered = apply_filters(signal_data)
    normalized = normalize_signal(filtered)
    
    # 2. Feature extraction
    features = extract_clinical_features(normalized)
    
    # 3. Model inference
    if model_available(model_type):
        predictions = ai_model.predict(features)
        confidence = calculate_confidence(predictions)
    else:
        predictions = rule_based_detection(features)
        confidence = 0.7  # Default confidence for rule-based
    
    # 4. Post-processing
    result = format_diagnosis(predictions, confidence)
    return result
```

### 7.4 Fallback Mechanisms

When AI models are unavailable:
- **ECG**: Rule-based detection using heart rate, rhythm regularity, and waveform morphology
- **EEG**: Threshold-based detection using band power ratios and asymmetry indices

---

## 8.0 Classic ML Comparison

### 8.1 ECG Traditional Methods

| Method | Features Extracted | Clinical Application |
|--------|-------------------|---------------------|
| HRV Analysis | SDNN, RMSSD, pNN50, LF/HF ratio | Autonomic nervous system assessment |
| Autocorrelation | Periodicity peaks, correlation length | Heart rate estimation, rhythm regularity |
| Statistical Analysis | Mean, standard deviation, zero crossings | Signal quality assessment, basic characterization |
| Template Matching | Cross-correlation with normal beats | PVC detection, beat classification |

### 8.2 EEG Traditional Methods

| Method | Features Extracted | Clinical Application |
|--------|-------------------|---------------------|
| Spectral Analysis | Absolute/relative band powers | Background activity assessment |
| Asymmetry Detection | Left-right power differences | Focal lesion detection |
| Spike Detection | Sharp transient detection | Epileptiform activity identification |
| Hjorth Parameters | Activity, mobility, complexity | Signal characterization |

### 8.3 Comparison Framework

The interface displays side-by-side comparison:
- **Left Panel**: AI diagnosis with confidence score and risk assessment
- **Right Panel**: Classic ML results with methodology description
- **Bottom Panel**: Agreement indicator (✅ match / ⚠️ discrepancy)

---

## 9.0 Financial Analysis Module

### 9.1 Supported Instruments

| Ticker | Instrument | Type | Yahoo Finance Symbol |
|--------|-----------|------|---------------------|
| GOOGL | Google Inc. | Stock | GOOGL |
| TSLA | Tesla Inc. | Stock | TSLA |
| EURUSD | Euro/US Dollar | Forex | EURUSD=X |
| GBPUSD | British Pound/US Dollar | Forex | GBPUSD=X |
| GOLD | Gold Futures | Commodity | GC=F |
| SILVER | Silver Futures | Commodity | SI=F |

### 9.2 XGBoost Prediction Models

**Model Performance**:

| Ticker | R² Score | MAPE | Status |
|--------|----------|------|--------|
| GOOGL | 0.959 | 1.50% | Excellent |
| Silver | 0.932 | 2.45% | Excellent |
| GBP/USD | 0.874 | 0.25% | Excellent |
| EUR/USD | 0.842 | 0.21% | Excellent |
| Gold | 0.786 | 1.14% | Good |
| TSLA | 0.697 | 2.40% | Acceptable |

**Hyperparameters**:
- n_estimators: 500
- max_depth: 5
- learning_rate: 0.02
- subsample: 0.8
- colsample_bytree: 0.8
- reg_alpha: 0.1
- reg_lambda: 1.0

### 9.3 Feature Engineering

**28 Technical Indicators**:

| Category | Features |
|----------|----------|
| Trend | MA_7, MA_21, MA_50, EMA_12, EMA_26, Close_vs_MA7, Close_vs_MA21, MA7_vs_MA21 |
| Momentum | RSI, RSI_7, MACD, Return_1d, Return_3d, Return_7d, Return_14d |
| Volatility | Volatility_7, Volatility_21, Bollinger, ATR |
| Lag | Lag_1, Lag_2, Lag_3, Lag_5, Lag_7, Lag_ret_1, Lag_ret_2, Lag_ret_3 |
| Volume | Volume_Ratio |

### 9.4 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/finance/history?ticker=GOOGL&period=3mo` | Historical OHLCV data |
| GET | `/api/finance/predict?ticker=GOOGL` | Next-day price prediction |
| GET | `/api/finance/indicators?ticker=GOOGL` | Technical indicators |
| GET | `/api/finance/tickers` | List supported tickers |

### 9.5 Charting & Visualization

<div align="center">
  <img width="1768" height="671" alt="Financial Chart - MetaTrader Style" src="https://github.com/user-attachments/assets/b3f21bc2-fbdd-4f14-99a9-e8edb8f16a7b">
  <p><em>Figure 2: MetaTrader-Style Candlestick Chart</em></p>
</div>

**Candlestick Chart Style**:
- Background: Light grey-blue `#f0f3fa`
- Up candles: Blue `#2962ff`
- Down candles: Red `#f23645`
- MA-20: Orange line `#ff6d00`
- Price axis: Right side

<div align="center">
  <img width="1800" height="597" alt="7-Day Forecast Chart" src="https://github.com/user-attachments/assets/8ab421dd-6db6-4131-b976-1b51c9e5fe13">
  <p><em>Figure 3: 7-Day Price Forecast with Confidence Band</em></p>
</div>

**7-Day Forecast**:
- Rolling prediction with feedback
- Confidence band at ±0.5%
- Visual comparison with historical data

### 9.6 Technical Indicators Panel

<div align="center">
  <img width="1797" height="437" alt="Technical Indicators Panel" src="https://github.com/user-attachments/assets/ce3b060a-baea-4902-81e8-0c4b9c7c8c5c">
  <p><em>Figure 4: Technical Indicators Dashboard</em></p>
</div>

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

## 10.0 Acoustic Signal Processing

### 10.1 Doppler Effect Simulation

<div align="center">
  <img width="1518" height="597" alt="Doppler Effect Simulation" src="https://github.com/user-attachments/assets/68158d50-2d4c-4ef4-a2a7-2eff0d90cf6b">
  <p><em>Figure 5: Doppler Effect Simulation Interface</em></p>
</div>

**Function**: `generate_doppler_sound(frequency=440, velocity=30, duration=5)`

**Physics Model**:
- Observer positioned 2m perpendicular to vehicle path
- Continuous radial velocity calculation
- Distance-based amplitude decay

**Output Parameters**:
- `audio_base64`: Base64-encoded WAV file
- `sample_rate`: 44100 Hz
- `frequency_range`: Min/max observed frequencies
- `doppler_shift`: Frequency difference (Hz)

### 10.2 Velocity Estimation

<div align="center">
  <img width="1523" height="750" alt="Vehicle Velocity Estimation" src="https://github.com/user-attachments/assets/1aeb757b-14bd-4361-8c62-3a70916bf915">
  <p><em>Figure 6: Vehicle Velocity Estimation from Audio</em></p>
</div>

**Function**: `estimate_velocity_from_file(file_path)`

**Self-Calibrating Algorithm**:
1. Extract spectrogram from audio
2. Identify approaching and receding frequency segments
3. Estimate emitted frequency at closest approach
4. Calculate velocity using Doppler formula

**Output**:
- Estimated velocity (m/s and km/h)
- Emitted frequency estimate
- Confidence score (0.0 - 0.95)
- Direction analysis

### 10.3 Drone Detection

<div align="center">
  <img width="1515" height="525" alt="Drone Detection" src="https://github.com/user-attachments/assets/0add31aa-bce9-4efa-a841-95a69864ac8d">
  <p><em>Figure 7: AI-Powered Drone Detection</em></p>
</div>

**Function**: `detect_drone_from_file(file_path)`

**Model Specifications**:
- Input: 16,000 samples (1 second at 16kHz)
- Features: FFT magnitude spectrum
- Architecture: TensorFlow/Keras neural network
- Output: Binary classification with confidence

### 10.4 Mathematical Foundations

**Doppler Effect Formula**:

$$f_{observed} = f_0 \cdot \frac{v_{sound}}{v_{sound} - v_{radial}}$$

**Velocity Estimation**:

$$v = \frac{v_{high} + v_{low}}{2}$$

$$v_{high} = c\left(1 - \frac{f_0}{f_{high}}\right)$$

$$v_{low} = c\left(\frac{f_0}{f_{low}} - 1\right)$$

Where:
- c = 343 m/s (speed of sound at 20°C)
- f₀ = emitted frequency
- f_high = observed frequency during approach
- f_low = observed frequency during recession

---

## 11.0 Microbiome Analysis

<div align="center">
  <img width="1841" height="882" alt="Microbiome Analysis Main Interface" src="https://github.com/user-attachments/assets/5e3cb51f-0a71-4cdf-806c-a6a911e846e6">
  <p><em>Figure 8: Microbiome Analysis Module - Main Interface</em></p>
</div>

### 11.1 Disease Profiles

| Condition | Key Microbial Markers |
|-----------|----------------------|
| Healthy | Balanced Firmicutes/Bacteroidetes, high diversity |
| Inflammatory Bowel Disease | Reduced Faecalibacterium, increased Proteobacteria |
| Type 2 Diabetes | Increased Lactobacillus, reduced butyrate producers |
| Obesity | Increased Firmicutes/Bacteroidetes ratio |
| COVID-19 Dysbiosis | Reduced diversity, opportunistic pathogens |
| Colorectal Cancer | Increased Fusobacterium, Bacteroides fragilis |

<div align="center">
  <img width="1850" height="792" alt="Disease Profile Matching" src="https://github.com/user-attachments/assets/9e43dce1-c69e-4f53-a246-6eb68635a896">
  <p><em>Figure 9: Disease Profile Matching Results</em></p>
</div>

### 11.2 Diversity Metrics

**Shannon Diversity Index**:

$$H' = -\sum_{i=1}^{R} p_i \ln p_i$$

Where:
- R = number of bacterial taxa
- p_i = proportion of taxon i

**Interpretation**:
- H' > 3.5: High diversity (healthy)
- H' 2.5-3.5: Moderate diversity
- H' < 2.5: Low diversity (dysbiosis risk)

### 11.3 Risk Assessment

<div align="center">
  <img width="856" height="538" alt="Risk Detection System" src="https://github.com/user-attachments/assets/95d4f51a-2122-4d8d-9a4d-09ab7d73dfd7">
  <p><em>Figure 10: Microbiome Risk Detection System</em></p>
</div>

The system evaluates:
- Inflammation markers (Proteobacteria abundance)
- Diversity score
- Firmicutes/Bacteroidetes ratio
- Pathogen presence
- Butyrate-producing bacteria levels

### 11.4 Personalized Recommendations

<div align="center">
  <img width="1509" height="528" alt="Personalized Recommendations" src="https://github.com/user-attachments/assets/73aeff12-1803-45f9-8d54-a94d23506bcd">
  <p><em>Figure 11: Personalized Health Recommendations</em></p>
</div>

Based on risk assessment:
- **Dietary**: Fiber intake, probiotic foods, fermented products
- **Lifestyle**: Exercise, stress management, sleep hygiene
- **Medical**: Screening recommendations, specialist referrals

---

## 12.0 User Interface & Controls

### 12.1 Channel Controls

| Control | Function | Implementation |
|---------|----------|----------------|
| Checkbox | Show/hide channel | Toggle visibility in plot |
| Color Picker | Change channel color | RGB color selection |
| Thickness Slider | Adjust line width | 0.5 - 3.0 pixels |

### 12.2 Playback Controls

| Control | Function | Range |
|---------|----------|-------|
| Play/Pause | Start/stop animation | - |
| Speed Slider | Adjust playback rate | 0.2x - 5.0x |
| Window Slider | Change visible duration | 2s - 20s |
| Position Slider | Manual navigation | 0% - 100% |
| Reset | Return to start | - |

### 12.3 Graph-Specific Controls

| Graph Type | Controls Available |
|------------|-------------------|
| XOR | Channel selection, chunk size, color map |
| Polar | Channel, period, mode (sliding/cumulative) |
| Recurrence | Channel X, Channel Y, threshold, color map |
| FFT | Channel selection, frequency range |

### 12.4 Keyboard Shortcuts

| Key | Function |
|-----|----------|
| Space | Play/Pause |
| ← → | Navigate backward/forward |
| + | Zoom in |
| - | Zoom out |
| R | Reset view |
| C | Toggle combined/separate mode |
| F | Toggle fullscreen |

---

## 13.0 File Handling

### 13.1 Supported Formats

| Format | Extension | Library | Max Size |
|--------|-----------|---------|----------|
| CSV | .csv | Native | 500 MB |
| Text | .txt | Native | 500 MB |
| EDF | .edf | pyEDFlib | 500 MB |
| BDF | .bdf | pyEDFlib | 500 MB |
| MATLAB | .mat | h5py, scipy.io | 500 MB |
| WFDB | .dat/.hea | wfdb | 500 MB |
| WAV | .wav | soundfile | 500 MB |
| MP3 | .mp3 | librosa | 500 MB |

### 13.2 Parsers Implementation

**Common Interface**:
```python
def parse_file(file_path, file_type):
    if file_type == 'csv':
        return parse_csv(file_path)
    elif file_type == 'edf':
        return parse_edf(file_path)
    elif file_type == 'mat':
        return parse_mat(file_path)
    # ... etc.
```

### 13.3 Upload Limitations
- Maximum file size: 500 MB
- Maximum channels: Limited by system memory
- Temporary storage: Files deleted after processing
- Supported encodings: UTF-8, ASCII, binary

---

## 14.0 API Reference

### 14.1 Medical Endpoints

| Endpoint | Method | Parameters | Response |
|----------|--------|------------|----------|
| `/api/medical/ecg/predict` | POST | file | Diagnosis with confidence |
| `/api/medical/eeg/predict` | POST | file | Abnormality classification |
| `/api/medical/process` | POST | file, options | Processed signal data |

### 14.2 Financial Endpoints

| Endpoint | Method | Parameters | Response |
|----------|--------|------------|----------|
| `/api/finance/history` | GET | ticker, period | OHLCV data |
| `/api/finance/predict` | GET | ticker | Price prediction |
| `/api/finance/indicators` | GET | ticker | Technical indicators |
| `/api/finance/tickers` | GET | - | Supported tickers |

### 14.3 Acoustic Endpoints

| Endpoint | Method | Parameters | Response |
|----------|--------|------------|----------|
| `/api/acoustic/doppler/generate` | POST | frequency, velocity | Audio data |
| `/api/acoustic/doppler/estimate` | POST | file | Velocity estimate |
| `/api/acoustic/drone/detect` | POST | file | Detection result |

### 14.4 Microbiome Endpoints

| Endpoint | Method | Parameters | Response |
|----------|--------|------------|----------|
| `/api/microbiome/analyze` | POST | abundance_data | Disease profile |
| `/api/microbiome/recommendations` | POST | profile | Personalized advice |

---

## 15.0 Video Demonstrations

### 15.1 ECG Viewer Demo

<div align="center">
  <video src="https://github.com/user-attachments/assets/2246c0b1-c6ab-4f3c-bc84-9623197aa19c" controls width="100%">
    Your browser does not support the video tag.
  </video>
  <p><em>Video 1: ECG Signal Viewer - Complete Demonstration</em></p>
</div>

**Demonstrates**:
- File upload and channel display
- Combined vs Separate viewing modes
- Playback controls and speed adjustment
- XOR Graph, Polar Graph, and Recurrence Plot
- AI Diagnosis with real ECG model
- Classic ML comparison

### 15.2 EEG Viewer Demo

<div align="center">
  <video src="https://github.com/user-attachments/assets/5d56951c-5727-40fa-aee6-92c360ed2725" controls width="100%">
    Your browser does not support the video tag.
  </video>
  <p><em>Video 2: EEG Signal Viewer - Complete Demonstration</em></p>
</div>

**Demonstrates**:
- Loading 19-channel EEG files
- Frequency band analysis
- Polar Graph animation of brain waves
- Recurrence Plot for hemisphere comparison
- AI model prediction with clinical features
- Spectral analysis comparison

---

## 16.0 Troubleshooting

### 16.1 Common Issues

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| Model not loading | Missing model files | Place models in correct directory |
| File parse error | Unsupported format | Check file format and encoding |
| Backend connection refused | Server not running | Start Flask server on port 5000 |
| Slow performance | Large file size | Reduce file size or channels |
| No prediction output | Missing dependencies | Install required packages |

### 16.2 Solutions & Workarounds

**Model Loading Issues**:
```bash
# Verify model paths
ls backend/modules/ecg/models/
ls backend/modules/eeg/models/

# Expected files:
# - ecg_model.hdf5
# - EEG_MODEL.pkl
```

**File Format Problems**:
- Ensure CSV files have headers
- Check EDF files for corruption
- Verify MATLAB version compatibility

**Performance Optimization**:
- Reduce visible channels
- Decrease window size
- Lower sampling rate if applicable

---

## 17.0 Support & Contact

### Development Team

| Name | Email | Responsibility |
|------|-------|---------------|
| Alaa Essam | alaaessam446@gmail.com | ECG Module, AI Models |
| Abdullah Gamil | abdullahgamil285@gmail.com | EEG Module, Visualization |
| Saga Sadek | sagasadek164@gmail.com | Financial Module |
| Abdelrahman Aly | abdelrahman.aly04@eng-st.cu.edu.eg | Acoustic Module, Microbiome |

### Project Information
- **Course**: Digital Signal Processing (DSP)
- **Institution**: Faculty of Engineering Cairo University
- **Department**: Systems and Biomedical Engineering
- **Term**: Spring 2026
- **Team**: sbeg205_spring26_team06

### Reporting Issues
Please report issues through the GitHub repository or contact any team member directly via email.
