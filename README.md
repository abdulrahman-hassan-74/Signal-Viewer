<img width="1070" height="340" alt="Image" src="https://github.com/user-attachments/assets/5baca750-7592-45e3-8866-5d974080b69b" />

# Signal Viewer Hub - Complete Documentation

## 📋 Table of Contents
1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Installation Guide](#installation-guide)
4. [Medical Signals (ECG/EEG)](#medical-signals-ecgeeg)
5. [Viewer Types](#viewer-types)
6. [AI Models](#ai-models)
7. [Classic ML Comparison](#classic-ml-comparison)
8. [User Controls](#user-controls)
9. [Video Demonstrations](#-📹-Video-Demonstrations)

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

## System Architecture

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

## Installation Guide

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

## Medical Signals (ECG/EEG)

### ECG - 6 Abnormality Types
| Type | Risk Level | Description |
|------|------------|-------------|
| Normal Sinus Rhythm | None | Regular rhythm 60-100 BPM |
| Atrial Fibrillation | Moderate-High | Irregular, no P waves |
| Ventricular Tachycardia | High - Emergency | Wide QRS, rate >100 |
| Premature Ventricular Contractions | Low-Moderate | Early wide QRS |
| Sinus Bradycardia | Low | Slow rate <60 BPM |
| Sinus Tachycardia | Low-Moderate | Fast rate >100 BPM |

### EEG - 4 Abnormality Types
| Type | Risk Level | Description |
|------|------------|-------------|
| Normal EEG | None | Age-appropriate rhythms |
| Epileptiform Activity | Moderate-High | Spike-wave discharges |
| Slow Wave Activity | Moderate | Excessive delta/theta |
| Asymmetry | Moderate | Hemisphere difference >30% |

---

## Viewer Types

### 1. Continuous-Time Viewer
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

### 2. XOR Graph
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

### 3. Polar Graph
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

### 4. Recurrence Graph
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

### 5. FFT (Frequency Spectrum)
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

## AI Models

### ECG Model (`ecg_model.hdf5`)
- **Input**: 4096 samples × 12 leads (16 seconds at 250Hz)
- **Architecture**: Multi-channel CNN
- **Output**: 6 classes (normal + 5 abnormalities)
- **Features extracted**: Heart rate, RR intervals, QRS morphology, ST segment, T wave, P wave

### EEG Model (`EEG_MODEL.h5`)
- **Input**: 256 samples × 19 channels or feature vector
- **Architecture**: CNN or Random Forest
- **Output**: 4 classes (normal + 3 abnormalities)
- **Features extracted**: Band powers, ratios, asymmetry index, spike rate, Hjorth parameters

### How Prediction Works
1. Signal is preprocessed (filtering, normalization)
2. Clinical features are extracted (30+ for ECG, 40+ for EEG)
3. Features are fed to the AI model
4. Model returns class probabilities and confidence score
5. Results are displayed with risk assessment and treatment recommendations

### Fallback Mechanism
If AI model is not loaded, rule-based detection activates:
- **ECG**: Based on heart rate, regularity, and variability
- **EEG**: Based on band power ratios and asymmetry

---

## Classic ML Comparison

### ECG Classic ML Methods
| Method | What it Measures | Clinical Use |
|--------|------------------|--------------|
| HRV Analysis | SDNN, RMSSD, pNN50 | Autonomic function |
| Autocorrelation | Periodicity | Heart rate estimation |
| Statistical Features | Mean, std, zero crossings | Signal quality |
| Spectral Analysis | LF/HF ratio | Sympathetic/parasympathetic balance |

### EEG Classic ML Methods
| Method | What it Measures | Clinical Use |
|--------|------------------|--------------|
| Spectral Analysis | Band powers, ratios | Background activity |
| Asymmetry Detection | Left-right difference | Structural lesions |
| Spike Detection | Epileptiform discharges | Seizure activity |
| Hjorth Parameters | Activity, mobility, complexity | Signal characteristics |

### Comparison Display
Both predictions appear side-by-side:
- **Left panel**: AI diagnosis with confidence and risk
- **Right panel**: Classic ML results with method description
- **Bottom**: Agreement indicator (✅ agree / ⚠️ differ)

---

## User Controls Summary

### Channel Controls
| Control | Function | Range |
|---------|----------|-------|
| Checkbox | Show/hide channel | On/Off |
| Color Picker | Change channel color | Any color |
| Thickness | Adjust line width | 0.5 - 3.0 |

### Graph-Specific Controls

| Graph | Controls |
|-------|----------|
| **XOR** | Channel, Chunk Size, Color Map |
| **Polar** | Channel, Period, Mode (Sliding/Cumulative), Play/Pause |
| **Recurrence** | Channel X, Channel Y, Threshold, Color Map |
| **FFT** | Channel |

### Filter Controls
| Filter | Cutoff | Use |
|--------|--------|-----|
| Lowpass | 50 Hz | Remove high-frequency noise |
| Highpass | 0.5 Hz | Remove baseline wander |
| Bandpass | 0.5-50 Hz | Keep clinical frequencies |

---

## 📹 Video Demonstrations

### ECG Signal Viewer Demo
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

### EEG Signal Viewer Demo
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

## Quick Reference

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

### Supported File Formats
| Format | Max Size |
|--------|----------|
| CSV, TXT, EDF, BDF, MAT, WAV, MP3 | 500 MB |

### Keyboard Shortcuts
| Key | Function |
|-----|----------|
| Space | Play/Pause |
| ← → | Navigate |
| + / - | Zoom |
| R | Reset |
| C | Toggle view mode |

---

## Support
- **Email**: alaaessam446@gmail.com
- **Email**: 
- **Email**: 
- **Email**: 

---

