"""
ECG Inference Module
Loads and uses real .hdf5 model for ECG classification
"""

import numpy as np
from scipy import signal
import logging
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

logger = logging.getLogger(__name__)

class ECGClassifier:
    def __init__(self, model_path='modules/ecg/models/ecg_model.hdf5'):
        self.model_path = model_path
        self.model = None
        self.model_loaded = False
        self.num_classes = 6

        self.abnormality_types = {
            0: {
                'name': 'Normal Sinus Rhythm',
                'code': 'normal',
                'description': 'Regular rhythm with normal rate (60-100 BPM). Normal P waves and QRS complexes.',
                'risk': 'None',
                'treatment': 'No treatment needed'
            },
            1: {
                'name': 'Atrial Fibrillation',
                'code': 'afib',
                'description': 'Irregularly irregular rhythm, no distinct P waves. Chaotic atrial activity.',
                'risk': 'Moderate-High',
                'treatment': 'Anticoagulation therapy, rate control medications'
            },
            2: {
                'name': 'Ventricular Tachycardia',
                'code': 'vtach',
                'description': 'Wide QRS complexes (>120ms), rate >100 BPM. Life-threatening arrhythmia.',
                'risk': 'High - Emergency',
                'treatment': 'Immediate cardioversion, antiarrhythmic drugs'
            },
            3: {
                'name': 'Premature Ventricular Contractions',
                'code': 'pvc',
                'description': 'Early, wide QRS complexes with compensatory pause. Common benign arrhythmia.',
                'risk': 'Low-Moderate',
                'treatment': 'Beta-blockers if symptomatic, otherwise observation'
            },
            4: {
                'name': 'Sinus Bradycardia',
                'code': 'brady',
                'description': 'Regular rhythm with slow rate (<60 BPM). Normal morphology.',
                'risk': 'Low',
                'treatment': 'Pacemaker if symptomatic'
            },
            5: {
                'name': 'Sinus Tachycardia',
                'code': 'tachy',
                'description': 'Regular rhythm with fast rate (>100 BPM). Normal morphology.',
                'risk': 'Low-Moderate',
                'treatment': 'Treat underlying cause'
            }
        }

        self.load_model()

    def load_model(self):
        """Load the Keras HDF5 model"""
        try:
            try:
                import tensorflow as tf
                HAS_TF = True
            except ImportError:
                HAS_TF = False
                logger.error("TensorFlow not installed")
                self.model_loaded = False
                return

            if os.path.exists(self.model_path):
                logger.info(f"Loading ECG model from {self.model_path}")

                # Load the model
                self.model = tf.keras.models.load_model(self.model_path)
                self.model_loaded = True
                logger.info(f"✅ ECG model loaded successfully from {self.model_path}")

                # Get model input shape
                if hasattr(self.model, 'input_shape'):
                    logger.info(f"Model input shape: {self.model.input_shape}")

            else:
                logger.warning(f"⚠️ ECG model not found at {self.model_path}")
                self.model_loaded = False

        except Exception as e:
            logger.error(f"❌ ECG model load error: {str(e)}")
            self.model_loaded = False

    def preprocess_signal(self, signal_data):
        """
        Preprocess multi-channel ECG signal for model input
        Model expects shape: (batch, 4096, 12)
        """
        try:
            data = np.array(signal_data['data'], dtype=np.float32)
            fs = float(signal_data.get('sampling_rate', 250))

            # Target shape: 4096 samples, 12 leads
            target_samples = 4096
            target_leads = 12

            logger.info(f"Input data shape: {data.shape}, fs: {fs}")

            # Handle channels (leads)
            n_channels = min(len(data), target_leads)
            processed_leads = []

            for i in range(n_channels):
                lead_data = data[i]

                # Remove DC offset
                lead_data = lead_data - np.mean(lead_data)

                # Normalize
                if np.std(lead_data) > 0:
                    lead_data = lead_data / np.std(lead_data)

                # Resample to target_samples
                if len(lead_data) != target_samples:
                    # Use interpolation
                    x_old = np.linspace(0, 1, len(lead_data))
                    x_new = np.linspace(0, 1, target_samples)
                    lead_data = np.interp(x_new, x_old, lead_data)

                processed_leads.append(lead_data)

            # Pad with zeros if we have fewer leads
            while len(processed_leads) < target_leads:
                processed_leads.append(np.zeros(target_samples))

            # Stack leads: shape (leads, samples) -> transpose to (samples, leads)
            processed = np.array(processed_leads).T  # Shape: (4096, 12)

            # Add batch dimension: (1, 4096, 12)
            model_input = processed[np.newaxis, :, :]

            logger.info(f"Final input shape: {model_input.shape}")
            return model_input

        except Exception as e:
            logger.error(f"Preprocessing error: {str(e)}")
            return None

    def predict(self, signal_data):
        """
        Predict ECG abnormality using the loaded model
        """
        try:
            if not self.model_loaded or self.model is None:
                logger.warning("Model not loaded, using rule-based fallback")
                return self._rule_based_detection(signal_data)

            # Preprocess the signal
            model_input = self.preprocess_signal(signal_data)
            if model_input is None:
                return self._rule_based_detection(signal_data)

            # Run inference
            predictions = self.model.predict(model_input, verbose=0)
            logger.info(f"Predictions shape: {predictions.shape}")

            # Get predicted class and confidence
            if len(predictions.shape) == 2:
                predicted_class = int(np.argmax(predictions[0]))
                confidence = float(predictions[0][predicted_class])
            else:
                predicted_class = 0
                confidence = 0.5

            # Ensure class is within range
            if predicted_class >= self.num_classes:
                predicted_class = 0

            info = self.abnormality_types[predicted_class]

            # Extract features for classic ML comparison
            features = self._extract_features(signal_data)

            return {
                'classification': info['name'],
                'code': info['code'],
                'confidence': confidence,
                'is_abnormal': predicted_class != 0,
                'model': 'ECGNet (Multi-channel CNN)',
                'model_loaded': True,
                'description': info['description'],
                'risk': info['risk'],
                'treatment': info['treatment'],
                'features': features,
                'predicted_class': predicted_class
            }

        except Exception as e:
            logger.error(f"ECG prediction error: {str(e)}")
            return self._rule_based_detection(signal_data)

    def _extract_features(self, signal_data):
        """Extract features for classic ML comparison"""
        try:
            data = np.array(signal_data['data'])
            fs = signal_data.get('sampling_rate', 250)

            # Use first channel for feature extraction
            ch = data[0]

            # Basic statistics
            mean_val = float(np.mean(ch))
            std_val = float(np.std(ch))

            # Heart rate detection
            peaks, _ = signal.find_peaks(ch, distance=fs//2, height=std_val*0.5)

            if len(peaks) > 1:
                rr_intervals = np.diff(peaks) / fs
                hr = 60.0 / np.mean(rr_intervals)
                hr_std = float(np.std(60.0 / rr_intervals))
                rr_std = float(np.std(rr_intervals) * 1000)
            else:
                hr = 70.0
                hr_std = 5.0
                rr_std = 40.0

            # Autocorrelation
            corr = np.correlate(ch - mean_val, ch - mean_val, mode='full')
            corr = corr[len(corr)//2:]
            corr = corr / (corr[0] + 1e-10)

            peaks_ac, _ = signal.find_peaks(corr[:len(corr)//2], height=0.3)
            regularity = len(peaks_ac) / (len(corr)//2) if len(peaks_ac) > 0 else 0.5

            return {
                'heart_rate': float(hr),
                'hr_std': float(hr_std),
                'sdnn_ms': float(rr_std),
                'regularity': float(regularity),
                'mean_amplitude': float(mean_val),
                'std_amplitude': float(std_val)
            }

        except Exception as e:
            logger.error(f"Feature extraction error: {str(e)}")
            return {}

    def _rule_based_detection(self, signal_data):
        """Rule-based detection as fallback"""
        try:
            features = self._extract_features(signal_data)

            hr = features.get('heart_rate', 70)
            hr_std = features.get('hr_std', 5)
            regularity = features.get('regularity', 0.5)

            if hr < 50:
                class_idx = 4
                confidence = 0.7
            elif hr > 120 and regularity > 0.4:
                class_idx = 5
                confidence = 0.7
            elif hr > 140:
                class_idx = 2
                confidence = 0.65
            elif hr_std > 20 or regularity < 0.3:
                class_idx = 1
                confidence = 0.7
            elif hr_std > 10:
                class_idx = 3
                confidence = 0.65
            else:
                class_idx = 0
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
            logger.error(f"Rule-based error: {str(e)}")
            return {
                'classification': 'Normal Sinus Rhythm',
                'code': 'normal',
                'confidence': 0.5,
                'is_abnormal': False,
                'model_loaded': False
            }

    def classic_ml_detection(self, signal_data):
        """
        Classic ML using HRV, autocorrelation, and statistics
        """
        try:
            data = np.array(signal_data['data'])
            fs = signal_data.get('sampling_rate', 250)

            ch = data[0]

            # Autocorrelation
            ch_centered = ch - np.mean(ch)
            autocorr = np.correlate(ch_centered, ch_centered, mode='full')
            autocorr = autocorr[len(autocorr)//2:] / (autocorr[len(autocorr)//2] + 1e-10)

            ac_peaks, ac_props = signal.find_peaks(
                autocorr[:len(autocorr)//2],
                height=0.3,
                distance=int(fs * 0.25)
            )

            if len(ac_peaks) > 0:
                rr_samples = ac_peaks[0]
                hr_autocorr = 60.0 * fs / rr_samples if rr_samples > 0 else 0
                ac_regularity = float(ac_props['peak_heights'][0]) if 'peak_heights' in ac_props else 0.5
            else:
                hr_autocorr = 0
                ac_regularity = 0

            # R-peak detection
            nyquist = fs / 2
            low = 5 / nyquist
            high = 15 / nyquist
            b, a = signal.butter(2, [low, high], btype='band')
            filtered = signal.filtfilt(b, a, ch)

            derivative = np.diff(filtered)
            derivative = np.append(derivative, derivative[-1])
            squared = derivative ** 2

            window_size = int(0.12 * fs)
            integrated = np.convolve(squared, np.ones(window_size)/window_size, mode='same')

            r_peaks, _ = signal.find_peaks(
                integrated,
                distance=int(fs * 0.3),
                height=np.mean(integrated) * 0.5
            )

            # HRV metrics
            if len(r_peaks) > 2:
                rr_intervals = np.diff(r_peaks) / fs
                rr_ms = rr_intervals * 1000

                sdnn = float(np.std(rr_ms))
                successive_diffs = np.diff(rr_ms)
                rmssd = float(np.sqrt(np.mean(successive_diffs ** 2)))
                hr_peaks = 60.0 / np.mean(rr_intervals)
                hr_std = float(np.std(60.0 / rr_intervals))
                cv_rr = float(np.std(rr_intervals) / np.mean(rr_intervals)) if np.mean(rr_intervals) > 0 else 0
                regularity = 1.0 - min(cv_rr, 1.0)
            else:
                sdnn = 0
                rmssd = 0
                hr_peaks = hr_autocorr
                hr_std = 5.0
                regularity = ac_regularity

            hr = hr_peaks if hr_peaks > 0 else hr_autocorr

            # Classification
            if hr < 50:
                classification = "Bradycardia"
                confidence = 0.8
                code = "brady"
            elif hr > 120 and regularity > 0.4:
                classification = "Tachycardia"
                confidence = 0.8
                code = "tachy"
            elif hr > 140:
                classification = "Ventricular Tachycardia"
                confidence = 0.75
                code = "vtach"
            elif hr_std > 20 or regularity < 0.3:
                classification = "Atrial Fibrillation"
                confidence = 0.75
                code = "afib"
            elif hr_std > 15:
                classification = "Premature Ventricular Contractions"
                confidence = 0.7
                code = "pvc"
            else:
                classification = "Normal Sinus Rhythm"
                confidence = 0.85
                code = "normal"

            return {
                'classification': classification,
                'code': code,
                'confidence': confidence,
                'heart_rate': round(hr, 1),
                'hr_std': round(hr_std, 2),
                'regularity': round(regularity, 4),
                'sdnn_ms': round(sdnn, 2),
                'rmssd_ms': round(rmssd, 2),
                'method': 'HRV + Autocorrelation'
            }

        except Exception as e:
            logger.error(f"Classic ML error: {str(e)}")
            return {
                'error': str(e),
                'classification': 'Analysis Failed'
            }

    def get_abnormality_types(self):
        """Get list of ECG abnormality types"""
        return [self.abnormality_types[i] for i in range(self.num_classes)]