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
from ..medical import MedicalSignalAnalyzer

logger = logging.getLogger(__name__)

class EEGClassifier:
    def __init__(self, model_path='modules/eeg/models/EEG_MODEL.pkl'):
        self.model_path = model_path
        self.model_loaded = False
        self.num_classes = 4

        # 4 Abnormality Types for EEG
        self.abnormality_types = {
            0: {
                'name': 'Normal EEG',
                'code': 'normal',
                'description': 'Normal brain activity with appropriate rhythms for age and state.',
                'risk': 'None',
                'treatment': 'No treatment needed'
            },
            1: {
                'name': 'Epileptiform Activity',
                'code': 'epilepsy',
                'description': 'Spike-wave discharges, sharp waves indicating seizure susceptibility.',
                'risk': 'Moderate-High',
                'treatment': 'Antiepileptic medications, neurological consult'
            },
            2: {
                'name': 'Slow Wave Activity',
                'code': 'slow',
                'description': 'Excessive theta or delta waves indicating encephalopathy.',
                'risk': 'Moderate',
                'treatment': 'Treat underlying cause, metabolic workup'
            },
            3: {
                'name': 'Asymmetry',
                'code': 'asymmetry',
                'description': 'Significant amplitude/frequency difference between hemispheres.',
                'risk': 'Moderate',
                'treatment': 'Neuroimaging (MRI/CT), investigate for structural lesions'
            }
        }

        self.load_model()

    def load_model(self):
        """Try to load pickle model if available"""
        try:
            if os.path.exists(self.model_path):
                import pickle
                with open(self.model_path, 'rb') as f:
                    self.model = pickle.load(f)
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

                for i in range(min(half, len(band_powers['alpha']))):
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
            if self.model_loaded and hasattr(self, 'model'):
                return self._predict_with_model(signal_data)
            else:
                return self._rule_based_detection(signal_data)
        except Exception as e:
            logger.error(f"EEG prediction error: {e}")
            return self._rule_based_detection(signal_data)

    def _predict_with_model(self, signal_data):
        """Use real pickle model"""
        try:
            data = np.array(signal_data['data'])
            fs = signal_data.get('sampling_rate', 250)

            features = self.extract_features(data, fs)

            # Convert to feature vector
            feature_vector = [
                features.get('delta_power', 0),
                features.get('theta_power', 0),
                features.get('alpha_power', 0),
                features.get('beta_power', 0),
                features.get('gamma_power', 0),
                features.get('delta_theta_ratio', 0),
                features.get('asymmetry_index', 0)
            ]

            # Predict
            if hasattr(self.model, 'predict_proba'):
                probs = self.model.predict_proba([feature_vector])[0]
                class_idx = int(np.argmax(probs))
                confidence = float(probs[class_idx])
            else:
                class_idx = int(self.model.predict([feature_vector])[0])
                confidence = 0.8

            info = self.abnormality_types[class_idx]

            return {
                'classification': info['name'],
                'code': info['code'],
                'confidence': confidence,
                'is_abnormal': class_idx != 0,
                'model': 'EEG Classifier',
                'model_loaded': True,
                'description': info['description'],
                'risk': info['risk'],
                'treatment': info['treatment'],
                'features': features
            }

        except Exception as e:
            logger.error(f"Model prediction error: {e}")
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
            elif features.get('spike_rate', 0) > 5:
                class_idx = 1  # epilepsy
                confidence = 0.7
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
        try:
            data = np.array(signal_data['data'])
            fs = signal_data.get('sampling_rate', 250)

            features = self.extract_features(data, fs)

            delta_theta = features.get('delta_power', 0) / (features.get('theta_power', 1) + 1e-10)

            if features.get('asymmetry_index', 0) > 0.25:
                classification = "Asymmetric Activity"
            elif delta_theta > 2:
                classification = "Slow Wave Activity"
            else:
                classification = "Normal Background"

            return {
                'classification': classification,
                'delta_theta_ratio': float(delta_theta),
                'asymmetry': float(features.get('asymmetry_index', 0)),
                'method': 'Spectral Analysis',
                'confidence': 0.7
            }

        except Exception as e:
            logger.error(f"Classic ML error: {e}")
            return None

    def get_abnormality_types(self):
        """Get list of 4 EEG abnormality types"""
        return [self.abnormality_types[i] for i in range(self.num_classes)]