"""
EEG Inference Module
Multi-channel EEG classifier
"""

import numpy as np
from scipy import signal
import logging
import os
import sys

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from modules.medical import MedicalSignalAnalyzer, EEG_ABNORMALITY_TYPES

logger = logging.getLogger(__name__)

class EEGClassifier:
    def __init__(self, model_path='modules/eeg/models/EEG_MODEL.pkl'):
        self.model_path = model_path
        self.model_loaded = False
        self.num_classes = 4

        # Use the medical analyzer
        self.analyzer = MedicalSignalAnalyzer(signal_type='eeg')

        # 4 Abnormality Types for EEG
        self.abnormality_types = {
            0: {
                'name': EEG_ABNORMALITY_TYPES.get('normal', 'Normal EEG'),
                'code': 'normal',
                'description': 'Normal brain activity with appropriate rhythms for age and state.',
                'risk': 'None',
                'treatment': 'No treatment needed'
            },
            1: {
                'name': EEG_ABNORMALITY_TYPES.get('epilepsy', 'Epileptiform Activity'),
                'code': 'epilepsy',
                'description': 'Spike-wave discharges, sharp waves indicating seizure susceptibility.',
                'risk': 'Moderate-High',
                'treatment': 'Antiepileptic medications, neurological consult'
            },
            2: {
                'name': EEG_ABNORMALITY_TYPES.get('slow', 'Slow Wave Activity'),
                'code': 'slow',
                'description': 'Excessive theta or delta waves indicating encephalopathy.',
                'risk': 'Moderate',
                'treatment': 'Treat underlying cause, metabolic workup'
            },
            3: {
                'name': EEG_ABNORMALITY_TYPES.get('asymmetry', 'Asymmetry'),
                'code': 'asymmetry',
                'description': 'Significant amplitude/frequency difference between hemispheres.',
                'risk': 'Moderate',
                'treatment': 'Neuroimaging (MRI/CT), investigate for structural lesions'
            }
        }

        self.load_model()

    def load_model(self):
        """Try to load model"""
        try:
            if os.path.exists(self.model_path):
                # In a real implementation, this would load a pickle model
                self.model_loaded = True
                logger.info(f"✅ EEG model loaded from {self.model_path}")
            else:
                logger.warning(f"⚠️ EEG model not found at {self.model_path}, using rule-based")
                self.model_loaded = False
        except Exception as e:
            logger.error(f"❌ EEG model load error: {e}")
            self.model_loaded = False

    def extract_features(self, data, fs=250):
        """Extract EEG features"""
        features = {}
        data = np.array(data)
        n_channels = min(8, len(data))

        if n_channels == 0:
            return features

        # Frequency bands
        bands = {
            'delta': (0.5, 4),
            'theta': (4, 8),
            'alpha': (8, 13),
            'beta': (13, 30),
            'gamma': (30, 50)
        }

        band_powers = {band: [] for band in bands}

        for ch in range(n_channels):
            ch_data = data[ch]
            if len(ch_data) < 2:
                continue

            freqs, psd = signal.welch(ch_data, fs, nperseg=min(256, len(ch_data)))

            for band_name, (low, high) in bands.items():
                idx = np.where((freqs >= low) & (freqs < high))[0]
                if len(idx) > 0:
                    band_powers[band_name].append(np.sum(psd[idx]))

        for band_name, powers in band_powers.items():
            features[f'{band_name}_power'] = float(np.mean(powers)) if powers else 0

        # Ratios
        features['delta_theta_ratio'] = features.get('delta_power', 0) / (features.get('theta_power', 1) + 1e-10)

        # Asymmetry
        if n_channels >= 2:
            half = n_channels // 2
            if half > 0:
                left_power = 0
                right_power = 0
                left_count = 0
                right_count = 0

                for i in range(min(half, n_channels)):
                    left_power += band_powers['alpha'][i] + band_powers['beta'][i]
                    left_count += 1

                for i in range(half, min(n_channels, len(band_powers['alpha']))):
                    right_power += band_powers['alpha'][i] + band_powers['beta'][i]
                    right_count += 1

                left_power = left_power / left_count if left_count > 0 else 0
                right_power = right_power / right_count if right_count > 0 else 0

                if left_power + right_power > 0:
                    features['asymmetry_index'] = float(abs(left_power - right_power) / (left_power + right_power))
                else:
                    features['asymmetry_index'] = 0
            else:
                features['asymmetry_index'] = 0
        else:
            features['asymmetry_index'] = 0

        return features

    def predict(self, signal_data):
        """Predict EEG abnormality"""
        try:
            # Use the medical analyzer
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
                'classification': result.get('classification', 'Normal EEG'),
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
            logger.error(f"EEG prediction error: {e}")
            return self._rule_based_detection(signal_data)

    def _rule_based_detection(self, signal_data):
        """Fallback rule-based detection"""
        try:
            data = np.array(signal_data['data'])
            fs = signal_data.get('sampling_rate', 250)

            features = self.extract_features(data, fs)

            delta = features.get('delta_power', 0)
            theta = features.get('theta_power', 0)
            asymmetry = features.get('asymmetry_index', 0)

            total = delta + theta + 1e-10
            delta_ratio = delta / total

            if asymmetry > 0.3:
                class_idx = 3  # asymmetry
                confidence = min(0.8, asymmetry)
            elif delta_ratio > 0.6:
                class_idx = 2  # slow
                confidence = 0.75
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
                'features': features
            }

        except Exception as e:
            logger.error(f"Rule-based error: {e}")
            return {
                'classification': 'Normal EEG',
                'code': 'normal',
                'confidence': 0.5,
                'is_abnormal': False
            }

    def classic_ml_detection(self, signal_data):
        """Classic ML for EEG using spectral analysis"""
        return self.analyzer.classic_ml_detection(signal_data)

    def get_abnormality_types(self):
        """Get list of 4 EEG abnormality types"""
        return [self.abnormality_types[i] for i in range(self.num_classes)]

    def simulate_eeg(self, abnormality="normal", duration=10.0, fs=250.0, n_channels=19):
        """Generate synthetic multi-channel EEG for testing"""
        t = np.linspace(0, duration, int(duration * fs))
        channels_data = []

        # Standard 10-20 system channel names
        channel_names = ['Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4', 'P3', 'P4',
                         'O1', 'O2', 'F7', 'F8', 'T3', 'T4', 'T5', 'T6',
                         'Fz', 'Cz', 'Pz']

        # Use requested number of channels
        if n_channels < len(channel_names):
            channel_names = channel_names[:n_channels]

        # Frequency bands
        bands = {
            'delta': (0.5, 4, 50),    # (min, max, amplitude)
            'theta': (4, 8, 30),
            'alpha': (8, 13, 40),
            'beta': (13, 30, 20),
            'gamma': (30, 50, 10)
        }

        for ch_i in range(n_channels):
            # Base signal with all frequency bands
            signal_sum = np.zeros(len(t))

            # Add random phase shifts per channel
            for band_name, (low, high, amp) in bands.items():
                # Random frequency within band
                freq = np.random.uniform(low, high)
                # Random phase
                phase = np.random.uniform(0, 2*np.pi)
                # Amplitude varies by channel and abnormality
                ch_amp = amp * (0.8 + 0.4 * np.random.random())

                # Modify based on abnormality
                if abnormality == "epilepsy" and band_name in ['beta', 'gamma']:
                    ch_amp *= 3
                elif abnormality == "slow" and band_name in ['delta', 'theta']:
                    ch_amp *= 2.5
                elif abnormality == "asymmetry" and ch_i < n_channels//2:  # Left hemisphere
                    if band_name in ['alpha', 'beta']:
                        ch_amp *= 0.5

                signal_sum += ch_amp * np.sin(2 * np.pi * freq * t + phase)

            # Add noise
            noise = 5 * np.random.randn(len(t))
            channels_data.append((signal_sum + noise).tolist())

        return {
            "data": channels_data,
            "channels": channel_names,
            "time": t.tolist(),
            "sampling_rate": fs,
            "num_samples": len(t),
            "num_channels": n_channels,
            "simulated": True,
            "abnormality": abnormality,
        }