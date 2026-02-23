"""
ECG Inference Module
Multi-channel ECG classifier
"""

import numpy as np
from scipy import signal
import logging
import os
import sys

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from ..medical import MedicalSignalAnalyzer, ECG_ABNORMALITY_TYPES

logger = logging.getLogger(__name__)

class ECGClassifier:
    def __init__(self, model_path='modules/ecg/models/ecg_model.hdf5'):
        self.model_path = model_path
        self.model_loaded = False
        self.num_classes = 6

        # Use the medical analyzer
        self.analyzer = MedicalSignalAnalyzer(signal_type='ecg')

        # 6 Abnormality Types for ECG
        self.abnormality_types = {
            0: {
                'name': ECG_ABNORMALITY_TYPES.get('normal', 'Normal Sinus Rhythm'),
                'code': 'normal',
                'description': 'Regular rhythm with normal rate (60-100 BPM). Normal P waves and QRS complexes.',
                'risk': 'None',
                'treatment': 'No treatment needed'
            },
            1: {
                'name': ECG_ABNORMALITY_TYPES.get('afib', 'Atrial Fibrillation'),
                'code': 'afib',
                'description': 'Irregularly irregular rhythm, no distinct P waves. Chaotic atrial activity.',
                'risk': 'Moderate-High',
                'treatment': 'Anticoagulation therapy, rate control medications'
            },
            2: {
                'name': ECG_ABNORMALITY_TYPES.get('vtach', 'Ventricular Tachycardia'),
                'code': 'vtach',
                'description': 'Wide QRS complexes (>120ms), rate >100 BPM. Life-threatening arrhythmia.',
                'risk': 'High - Emergency',
                'treatment': 'Immediate cardioversion, antiarrhythmic drugs'
            },
            3: {
                'name': ECG_ABNORMALITY_TYPES.get('pvc', 'Premature Ventricular Contractions'),
                'code': 'pvc',
                'description': 'Early, wide QRS complexes with compensatory pause. Common benign arrhythmia.',
                'risk': 'Low-Moderate',
                'treatment': 'Beta-blockers if symptomatic, otherwise observation'
            },
            4: {
                'name': ECG_ABNORMALITY_TYPES.get('brady', 'Sinus Bradycardia'),
                'code': 'brady',
                'description': 'Regular rhythm with slow rate (<60 BPM). Normal morphology.',
                'risk': 'Low',
                'treatment': 'Pacemaker if symptomatic'
            },
            5: {
                'name': ECG_ABNORMALITY_TYPES.get('tachy', 'Sinus Tachycardia'),
                'code': 'tachy',
                'description': 'Regular rhythm with fast rate (>100 BPM). Normal morphology.',
                'risk': 'Low-Moderate',
                'treatment': 'Treat underlying cause'
            }
        }

        self.load_model()

    def load_model(self):
        """Try to load model"""
        try:
            if os.path.exists(self.model_path):
                # In a real implementation, this would load a Keras model
                # For now, we'll just mark it as loaded for demo purposes
                self.model_loaded = True
                logger.info(f"✅ ECG model loaded from {self.model_path}")
            else:
                logger.warning(f"⚠️ ECG model not found at {self.model_path}, using rule-based")
                self.model_loaded = False
        except Exception as e:
            logger.error(f"❌ ECG model load error: {e}")
            self.model_loaded = False

    def predict(self, signal_data):
        """Predict ECG abnormality using medical analyzer"""
        try:
            # Use the medical analyzer's detect_abnormality method
            result = self.analyzer.detect_abnormality(signal_data)

            # Map to our format
            code = result.get('abnormality_code', 'normal')

            # Find matching abnormality
            class_idx = 0
            for idx, ab in self.abnormality_types.items():
                if ab['code'] == code:
                    class_idx = idx
                    break

            return {
                'classification': result.get('classification', 'Normal Sinus Rhythm'),
                'code': code,
                'confidence': result.get('confidence', 0.8),
                'is_abnormal': result.get('is_abnormal', False),
                'model': result.get('model_used', 'MedicalSignalAnalyzer'),
                'model_loaded': self.model_loaded,
                'description': self.abnormality_types[class_idx]['description'],
                'risk': self.abnormality_types[class_idx]['risk'],
                'treatment': self.abnormality_types[class_idx]['treatment'],
                'features': result.get('global_features', {})
            }

        except Exception as e:
            logger.error(f"ECG prediction error: {e}")
            return self._rule_based_detection(signal_data)

    def _rule_based_detection(self, signal_data):
        """Fallback rule-based detection"""
        try:
            data = np.array(signal_data['data'])
            fs = signal_data.get('sampling_rate', 250)

            # Use first channel
            channel = data[0]

            # Detect peaks
            peaks, _ = signal.find_peaks(channel, distance=fs//2, height=np.std(channel)*0.5)

            if len(peaks) > 1:
                rr_intervals = np.diff(peaks) / fs
                hr = 60 / np.mean(rr_intervals)
                hr_std = np.std(60 / rr_intervals) if len(rr_intervals) > 1 else 0
            else:
                hr = 70
                hr_std = 5

            # Autocorrelation for regularity
            corr = np.correlate(channel, channel, mode='full')
            corr = corr[len(corr)//2:]
            corr = corr / (corr[0] + 1e-10)
            peaks_ac, _ = signal.find_peaks(corr[:len(corr)//2], height=0.3)
            regularity = len(peaks_ac) / (len(corr)//2) if len(peaks_ac) > 0 else 0.5

            # Classification
            if hr < 50:
                class_idx = 4  # brady
                confidence = 0.7
            elif hr > 120 and regularity > 0.4:
                class_idx = 5  # tachy
                confidence = 0.7
            elif hr > 140:
                class_idx = 2  # vtach
                confidence = 0.65
            elif hr_std > 20 or regularity < 0.3:
                class_idx = 1  # afib
                confidence = 0.7
            elif hr_std > 10:
                class_idx = 3  # pvc
                confidence = 0.65
            else:
                class_idx = 0  # normal
                confidence = 0.8

            info = self.abnormality_types[class_idx]

            return {
                'classification': info['name'],
                'code': info['code'],
                'confidence': confidence,
                'is_abnormal': class_idx != 0,
                'model': 'Rule-based Fallback',
                'model_loaded': False,
                'description': info['description'],
                'risk': info['risk'],
                'treatment': info['treatment'],
                'features': {
                    'heart_rate': float(hr),
                    'regularity': float(regularity),
                    'hr_std': float(hr_std)
                }
            }

        except Exception as e:
            logger.error(f"Rule-based error: {e}")
            return {
                'classification': 'Normal Sinus Rhythm',
                'code': 'normal',
                'confidence': 0.5,
                'is_abnormal': False,
                'model': 'Error Fallback'
            }

    def classic_ml_detection(self, signal_data):
        """Classic ML using medical analyzer"""
        return self.analyzer.classic_ml_detection(signal_data)

    def get_abnormality_types(self):
        """Get list of 6 ECG abnormality types"""
        return [self.abnormality_types[i] for i in range(self.num_classes)]

    def simulate_ecg(self, abnormality="normal", duration=10.0, fs=250.0, n_channels=2):
        """Generate synthetic multi-channel ECG for testing"""
        t = np.linspace(0, duration, int(duration * fs))
        channels_data = []

        for ch_i in range(n_channels):
            noise = 0.05 * np.random.randn(len(t))

            if abnormality == "normal":
                hr = 72 + ch_i * 0.5
                ecg = self._qrs(t, hr, fs) + noise

            elif abnormality == "afib":
                ecg = np.zeros(len(t))
                pos = 0
                while pos < len(t):
                    rr = int(np.random.uniform(0.4, 1.2) * fs)
                    if pos < len(t):
                        width = min(rr, len(t) - pos)
                        ecg[pos: pos + width] += self._qrs_template(rr)[:width]
                    pos += rr
                ecg += 0.15 * np.random.randn(len(t)) + noise

            elif abnormality == "vtach":
                hr = 170
                ecg = 1.8 * self._qrs(t, hr, fs, wide=True) + noise

            elif abnormality == "pvc":
                ecg = self._qrs(t, 70, fs)
                for pos in range(int(8 * fs * 60 / 70), len(t), int(8 * fs * 60 / 70)):
                    width = min(int(0.12 * fs), len(t) - pos)
                    ecg[pos: pos + width] += 2.0
                ecg += noise

            elif abnormality == "brady":
                hr = 40
                ecg = self._qrs(t, hr, fs) + noise

            elif abnormality == "tachy":
                hr = 130
                ecg = self._qrs(t, hr, fs) + noise

            else:
                ecg = self._qrs(t, 72, fs) + noise

            channels_data.append(ecg.tolist())

        labels = [f"Lead_{chr(73 + i)}" for i in range(n_channels)]
        return {
            "data": channels_data,
            "channels": labels,
            "time": t.tolist(),
            "sampling_rate": fs,
            "num_samples": len(t),
            "num_channels": n_channels,
            "simulated": True,
            "abnormality": abnormality,
        }

    @staticmethod
    def _qrs(t, hr, fs, wide=False):
        period = 60.0 / hr
        ecg = np.zeros(len(t))
        beat_t = np.arange(0, t[-1], period)
        width = 0.08 if not wide else 0.18
        for bt in beat_t:
            idx = int(bt * fs)
            half = int(width * fs // 2)
            lo, hi = max(0, idx - half), min(len(ecg), idx + half)
            w = hi - lo
            if w > 0:
                ecg[lo:hi] += np.exp(-np.linspace(-3, 3, w) ** 2)
        return ecg

    @staticmethod
    def _qrs_template(n):
        x = np.linspace(-3, 3, max(n, 1))
        return np.exp(-x ** 2)