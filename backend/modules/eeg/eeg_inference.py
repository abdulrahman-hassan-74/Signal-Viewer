"""
EEG Inference Module
Loads and uses real EEG model (supports .h5, .hdf5, .pkl)
"""

import numpy as np
from scipy import signal
import logging
import os
import sys
import pickle

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

logger = logging.getLogger(__name__)

class EEGClassifier:
    def __init__(self, model_path='modules/eeg/models/EEG_MODEL.h5'):
        self.model_path = model_path
        self.model = None
        self.model_loaded = False
        self.num_classes = 4

        # EEG Abnormality Types
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

        # Try to find any model file if the specified one doesn't exist
        self._find_model_file()
        self.load_model()

    def _find_model_file(self):
        """Try to find any model file in the models directory"""
        if os.path.exists(self.model_path):
            return

        # Check if directory exists
        model_dir = os.path.dirname(self.model_path)
        if not os.path.exists(model_dir):
            logger.warning(f"Models directory not found: {model_dir}")
            return

        # Look for any model file
        for file in os.listdir(model_dir):
            if file.endswith(('.h5', '.hdf5', '.pkl')):
                self.model_path = os.path.join(model_dir, file)
                logger.info(f"Found alternative model file: {self.model_path}")
                return

    def load_model(self):
        """Load the EEG model (supports .h5, .hdf5, .pkl)"""
        try:
            if not os.path.exists(self.model_path):
                logger.warning(f"⚠️ EEG model not found at {self.model_path}")
                self.model_loaded = False
                return

            logger.info(f"Loading EEG model from {self.model_path}")
            file_ext = os.path.splitext(self.model_path)[1].lower()

            if file_ext in ['.h5', '.hdf5']:
                # Load as Keras model
                try:
                    import tensorflow as tf
                    self.model = tf.keras.models.load_model(self.model_path, compile=False)
                    self.model_loaded = True
                    logger.info(f"✅ EEG Keras model loaded successfully")

                    # Log model info
                    if hasattr(self.model, 'input_shape'):
                        logger.info(f"Model input shape: {self.model.input_shape}")

                except ImportError:
                    try:
                        import keras
                        self.model = keras.models.load_model(self.model_path, compile=False)
                        self.model_loaded = True
                        logger.info(f"✅ EEG Keras model loaded successfully")
                    except Exception as e:
                        logger.error(f"Failed to load Keras model: {str(e)}")
                        self.model_loaded = False

            elif file_ext == '.pkl':
                # Load as pickle model (sklearn)
                try:
                    with open(self.model_path, 'rb') as f:
                        self.model = pickle.load(f)
                    self.model_loaded = True
                    logger.info(f"✅ EEG pickle model loaded successfully")
                except Exception as e:
                    logger.error(f"Failed to load pickle model: {str(e)}")
                    self.model_loaded = False
            else:
                logger.warning(f"Unknown model format: {file_ext}")
                self.model_loaded = False

        except Exception as e:
            logger.error(f"❌ EEG model load error: {str(e)}")
            self.model_loaded = False

    def preprocess_signal(self, signal_data):
        """
        Preprocess multi-channel EEG signal for model input
        Handles various input shapes
        """
        try:
            data = np.array(signal_data['data'], dtype=np.float32)
            fs = float(signal_data.get('sampling_rate', 250))

            # If no model is loaded, return None (will use rule-based)
            if not self.model_loaded:
                return None

            # Determine expected input shape from model
            expected_samples = 256  # Default
            expected_channels = 19  # Default (10-20 system)

            if hasattr(self.model, 'input_shape'):
                input_shape = self.model.input_shape
                logger.info(f"Model input shape: {input_shape}")

                if len(input_shape) == 3:
                    # Could be (batch, time, channels) or (batch, channels, time)
                    if input_shape[1] > input_shape[2]:  # (batch, time, channels)
                        expected_samples = input_shape[1]
                        expected_channels = input_shape[2]
                    else:  # (batch, channels, time)
                        expected_channels = input_shape[1]
                        expected_samples = input_shape[2]
                elif len(input_shape) == 2:
                    # (batch, features)
                    expected_samples = input_shape[1]
                    expected_channels = 1

            logger.info(f"Preprocessing for shape: samples={expected_samples}, channels={expected_channels}")

            # Handle channels
            n_channels = min(len(data), expected_channels)
            processed_channels = []

            for i in range(n_channels):
                ch_data = data[i]

                # Remove DC offset
                ch_data = ch_data - np.mean(ch_data)

                # Normalize
                if np.std(ch_data) > 0:
                    ch_data = ch_data / np.std(ch_data)

                # Resample if needed
                if len(ch_data) != expected_samples:
                    # Use interpolation
                    x_old = np.linspace(0, 1, len(ch_data))
                    x_new = np.linspace(0, 1, expected_samples)
                    ch_data = np.interp(x_new, x_old, ch_data)

                processed_channels.append(ch_data)

            # Pad with zeros if we have fewer channels
            while len(processed_channels) < expected_channels:
                processed_channels.append(np.zeros(expected_samples))

            # Stack channels
            processed = np.array(processed_channels)  # Shape: (channels, samples)

            # Reshape based on model expectations
            if hasattr(self.model, 'input_shape'):
                input_shape = self.model.input_shape
                if len(input_shape) == 3:
                    if input_shape[1] == expected_channels:  # (batch, channels, time)
                        model_input = processed[np.newaxis, :, :]
                    else:  # (batch, time, channels)
                        model_input = processed.T[np.newaxis, :, :]
                elif len(input_shape) == 2:
                    # Flatten features
                    model_input = processed.flatten()[np.newaxis, :expected_samples]
                else:
                    model_input = processed.T[np.newaxis, :, :]
            else:
                # Default: (batch, time, channels)
                model_input = processed.T[np.newaxis, :, :]

            logger.info(f"Final input shape: {model_input.shape}")
            return model_input

        except Exception as e:
            logger.error(f"EEG preprocessing error: {str(e)}")
            return None

    def predict(self, signal_data):
        """
        Predict EEG abnormality using the loaded model
        """
        try:
            if not self.model_loaded or self.model is None:
                logger.warning("Model not loaded, using rule-based fallback")
                return self._rule_based_detection(signal_data)

            # Preprocess the signal
            model_input = self.preprocess_signal(signal_data)
            if model_input is None:
                return self._rule_based_detection(signal_data)

            # Run inference based on model type
            try:
                if hasattr(self.model, 'predict_proba'):
                    # sklearn model
                    predictions = self.model.predict_proba(model_input)
                    logger.info(f"Sklearn predictions shape: {predictions.shape if hasattr(predictions, 'shape') else 'unknown'}")

                    if len(predictions.shape) == 2:
                        predicted_class = int(np.argmax(predictions[0]))
                        confidence = float(predictions[0][predicted_class])
                    else:
                        predicted_class = 0
                        confidence = 0.5

                elif hasattr(self.model, 'predict'):
                    # Keras model
                    predictions = self.model.predict(model_input, verbose=0)
                    logger.info(f"Keras predictions shape: {predictions.shape}")

                    if len(predictions.shape) == 2 and predictions.shape[1] > 1:
                        predicted_class = int(np.argmax(predictions[0]))
                        confidence = float(predictions[0][predicted_class])
                    elif len(predictions.shape) == 2:
                        predicted_class = 0 if predictions[0][0] < 0.5 else 1
                        confidence = float(predictions[0][0]) if predictions[0][0] > 0.5 else 1 - float(predictions[0][0])
                    else:
                        predicted_class = 0
                        confidence = 0.5
                else:
                    # Unknown model type
                    logger.warning("Unknown model type, using fallback")
                    return self._rule_based_detection(signal_data)

            except Exception as e:
                logger.error(f"Model prediction error: {str(e)}")
                return self._rule_based_detection(signal_data)

            # Ensure class is within range
            if predicted_class >= self.num_classes:
                predicted_class = 0

            info = self.abnormality_types[predicted_class]

            # Extract features for display
            features = self._extract_features(signal_data)

            return {
                'classification': info['name'],
                'code': info['code'],
                'confidence': min(confidence, 0.95),  # Cap at 0.95
                'is_abnormal': predicted_class != 0,
                'model': 'EEG Classifier (Multi-channel)',
                'model_loaded': True,
                'description': info['description'],
                'risk': info['risk'],
                'treatment': info['treatment'],
                'features': features,
                'predicted_class': predicted_class
            }

        except Exception as e:
            logger.error(f"EEG prediction error: {str(e)}")
            return self._rule_based_detection(signal_data)

    def _extract_features(self, signal_data):
        """Extract EEG features for display"""
        try:
            data = np.array(signal_data['data'])
            fs = signal_data.get('sampling_rate', 250)

            bands = {
                'delta': (0.5, 4),
                'theta': (4, 8),
                'alpha': (8, 13),
                'beta': (13, 30)
            }

            band_powers = {band: [] for band in bands}

            for ch in range(min(len(data), 8)):
                ch_data = data[ch]
                if len(ch_data) < fs:
                    continue

                freqs, psd = signal.welch(ch_data, fs, nperseg=min(256, len(ch_data)))

                for band_name, (low, high) in bands.items():
                    idx = np.where((freqs >= low) & (freqs < high))[0]
                    if len(idx) > 0:
                        band_powers[band_name].append(np.sum(psd[idx]))

            result = {}
            for band_name, powers in band_powers.items():
                result[f'{band_name}_power'] = float(np.mean(powers)) if powers else 0

            # Calculate ratios
            delta = result.get('delta_power', 0)
            theta = result.get('theta_power', 0)
            alpha = result.get('alpha_power', 0)
            beta = result.get('beta_power', 0)

            result['delta_theta_ratio'] = delta / (theta + 1e-10)
            result['alpha_beta_ratio'] = alpha / (beta + 1e-10)
            result['theta_beta_ratio'] = theta / (beta + 1e-10)

            # Asymmetry
            if len(data) >= 2:
                left_power = 0
                right_power = 0
                left_count = 0
                right_count = 0

                for i in range(0, min(8, len(data)), 2):
                    left_power += float(np.std(data[i]))
                    left_count += 1

                for i in range(1, min(8, len(data)), 2):
                    right_power += float(np.std(data[i]))
                    right_count += 1

                if left_count > 0:
                    left_power /= left_count
                if right_count > 0:
                    right_power /= right_count

                if left_power + right_power > 0:
                    result['asymmetry'] = abs(left_power - right_power) / (left_power + right_power)
                else:
                    result['asymmetry'] = 0

            return result

        except Exception as e:
            logger.error(f"Feature extraction error: {str(e)}")
            return {}

    def _rule_based_detection(self, signal_data):
        """Rule-based detection as fallback"""
        try:
            features = self._extract_features(signal_data)

            delta = features.get('delta_power', 0)
            theta = features.get('theta_power', 0)
            asymmetry = features.get('asymmetry', 0)

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
            logger.error(f"Rule-based error: {str(e)}")
            return {
                'classification': 'Normal EEG',
                'code': 'normal',
                'confidence': 0.5,
                'is_abnormal': False,
                'model_loaded': False
            }

    def classic_ml_detection(self, signal_data):
        """
        Classic ML for EEG using spectral analysis
        """
        try:
            features = self._extract_features(signal_data)

            delta = features.get('delta_power', 0)
            theta = features.get('theta_power', 0)
            alpha = features.get('alpha_power', 0)
            beta = features.get('beta_power', 0)
            asymmetry = features.get('asymmetry', 0)

            delta_theta_ratio = delta / (theta + 1e-10)
            alpha_beta_ratio = alpha / (beta + 1e-10)

            if asymmetry > 0.25:
                classification = "Asymmetric Activity"
                confidence = 0.75
            elif delta_theta_ratio > 2.0:
                classification = "Slow Wave Activity"
                confidence = 0.8
            elif alpha_beta_ratio < 0.5:
                classification = "Desynchronization"
                confidence = 0.7
            else:
                classification = "Normal Background"
                confidence = 0.85

            return {
                'classification': classification,
                'confidence': confidence,
                'delta_theta_ratio': round(delta_theta_ratio, 3),
                'asymmetry': round(asymmetry, 3),
                'alpha_beta_ratio': round(alpha_beta_ratio, 3),
                'method': 'Spectral Analysis'
            }

        except Exception as e:
            logger.error(f"Classic ML error: {str(e)}")
            return {
                'error': str(e),
                'classification': 'Analysis Failed'
            }

    def get_abnormality_types(self):
        """Get list of EEG abnormality types"""
        return [self.abnormality_types[i] for i in range(self.num_classes)]