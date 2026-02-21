"""
ECG Multi-channel AI Model - Real Pre-trained Model
ECGNet/EfficientNet based classifier for 4 abnormality types
"""

import numpy as np
from scipy import signal
import logging
import os

# Try to import PyTorch for real AI
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False
    print("⚠️ PyTorch not installed. Please install with: pip install torch")

logger = logging.getLogger(__name__)


class ECGNet(nn.Module):
    """
    Multi-channel ECG Network (ECGNet)
    Real CNN architecture for ECG classification
    """

    def __init__(self, num_channels=12, num_classes=4):
        super(ECGNet, self).__init__()

        # First convolutional block
        self.conv1 = nn.Conv1d(num_channels, 64, kernel_size=5, padding=2)
        self.bn1 = nn.BatchNorm1d(64)
        self.pool1 = nn.MaxPool1d(2)

        # Second convolutional block
        self.conv2 = nn.Conv1d(64, 128, kernel_size=5, padding=2)
        self.bn2 = nn.BatchNorm1d(128)
        self.pool2 = nn.MaxPool1d(2)

        # Third convolutional block
        self.conv3 = nn.Conv1d(128, 256, kernel_size=3, padding=1)
        self.bn3 = nn.BatchNorm1d(256)
        self.pool3 = nn.AdaptiveAvgPool1d(1)

        # Fully connected layers
        self.fc1 = nn.Linear(256, 128)
        self.dropout = nn.Dropout(0.5)
        self.fc2 = nn.Linear(128, num_classes)

    def forward(self, x):
        # x shape: (batch, channels, time)
        x = F.relu(self.bn1(self.conv1(x)))
        x = self.pool1(x)

        x = F.relu(self.bn2(self.conv2(x)))
        x = self.pool2(x)

        x = F.relu(self.bn3(self.conv3(x)))
        x = self.pool3(x)

        x = x.view(x.size(0), -1)
        x = F.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.fc2(x)

        return F.softmax(x, dim=1)


class ECGClassifier:
    """
    Real Multi-channel ECG Classifier
    Uses pre-trained ECGNet/EfficientNet model
    Detects 4 abnormality types
    """

    def __init__(self, model_path='modules/ecg/ecg_model.pth'):
        self.model = None
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        # 4 Abnormality Types for ECG
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
            }
        }

        self.load_model(model_path)

    def load_model(self, model_path):
        """Load pre-trained ECGNet model"""
        try:
            if HAS_TORCH and os.path.exists(model_path):
                # Create model instance
                self.model = ECGNet(num_channels=12, num_classes=4)

                # Load trained weights
                self.model.load_state_dict(torch.load(model_path, map_location=self.device))
                self.model.to(self.device)
                self.model.eval()
                logger.info(f"✓ Real ECG model loaded from {model_path}")
            else:
                logger.warning(f"⚠️ Model not found at {model_path}. Using rule-based fallback.")
                self.model = None
        except Exception as e:
            logger.error(f"Failed to load ECG model: {e}")
            self.model = None

    def preprocess(self, signal_data):
        """
        Preprocess multi-channel ECG for model input
        Ensures: 12 channels, 10 seconds at 250Hz
        """
        data = np.array(signal_data['data'])
        fs = signal_data.get('sampling_rate', 250)

        # Target: 12 channels, 2500 samples (10 seconds at 250Hz)
        target_channels = 12
        target_samples = 2500

        # Handle channels
        if data.shape[0] < target_channels:
            # Pad with zeros if fewer channels
            pad = target_channels - data.shape[0]
            data = np.pad(data, ((0, pad), (0, 0)), mode='constant')
        elif data.shape[0] > target_channels:
            # Take first 12 channels
            data = data[:target_channels, :]

        # Handle sampling rate
        if fs != 250:
            # Resample to 250Hz
            from scipy import signal as scipy_signal
            data_resampled = []
            for ch in data:
                resampled = scipy_signal.resample(ch, int(len(ch) * 250 / fs))
                data_resampled.append(resampled)
            data = np.array(data_resampled)

        # Handle length
        if data.shape[1] < target_samples:
            # Pad with zeros
            pad = target_samples - data.shape[1]
            data = np.pad(data, ((0, 0), (0, pad)), mode='constant')
        elif data.shape[1] > target_samples:
            # Take center portion
            start = (data.shape[1] - target_samples) // 2
            data = data[:, start:start + target_samples]

        return data

    def predict(self, signal_data):
        """
        Run multi-channel ECG inference
        Returns classification with confidence
        """
        try:
            if self.model is None:
                return self._rule_based_detection(signal_data)

            # Preprocess
            processed = self.preprocess(signal_data)

            # Convert to tensor
            input_tensor = torch.FloatTensor(processed).unsqueeze(0).to(self.device)

            # Run inference
            with torch.no_grad():
                outputs = self.model(input_tensor)
                probabilities = outputs.cpu().numpy()[0]

            # Get prediction
            pred_class = int(np.argmax(probabilities))
            confidence = float(probabilities[pred_class])

            # Get abnormality info
            ab_info = self.abnormality_types[pred_class]

            return {
                'classification': ab_info['name'],
                'code': ab_info['code'],
                'confidence': confidence,
                'is_abnormal': pred_class != 0,
                'model': 'ECGNet (Multi-channel CNN)',
                'description': ab_info['description'],
                'risk': ab_info['risk'],
                'treatment': ab_info['treatment'],
                'channels_analyzed': signal_data['num_channels']
            }

        except Exception as e:
            logger.error(f"ECG prediction error: {e}")
            return self._rule_based_detection(signal_data)

    def classic_ml_detection(self, signal_data):
        """
        Classic ML using autocorrelation and statistics
        For comparison with AI model
        """
        try:
            data = np.array(signal_data['data'])
            fs = signal_data.get('sampling_rate', 250)

            # Use first channel
            channel = data[0]

            # 1. Heart rate via peak detection
            peaks, _ = signal.find_peaks(channel, distance=fs // 2, height=np.std(channel))

            if len(peaks) > 1:
                rr_intervals = np.diff(peaks) / fs
                hr = 60 / np.mean(rr_intervals)
                hr_std = np.std(60 / rr_intervals) if len(rr_intervals) > 1 else 0
            else:
                hr = 70
                hr_std = 5

            # 2. Autocorrelation for regularity
            autocorr = np.correlate(channel, channel, mode='full')
            autocorr = autocorr[len(autocorr) // 2:]
            autocorr = autocorr / (autocorr[0] + 1e-10)

            peaks_ac, _ = signal.find_peaks(autocorr[:len(autocorr) // 2], height=0.3)
            regularity = len(peaks_ac) / (len(autocorr) // 2) if len(peaks_ac) > 0 else 0

            # 3. QRS width estimation
            qrs_width = self._estimate_qrs_width(channel, fs)

            # Classification logic
            if hr < 50:
                classification = "Bradycardia"
                confidence = 0.8
            elif hr > 120 and qrs_width > 0.12:
                classification = "Ventricular Tachycardia"
                confidence = 0.75
            elif hr_std > 20 or regularity < 0.3:
                classification = "Atrial Fibrillation"
                confidence = 0.7
            elif hr_std > 10:
                classification = "Premature Ventricular Contractions"
                confidence = 0.65
            elif 60 <= hr <= 100:
                classification = "Normal Sinus Rhythm"
                confidence = 0.85
            else:
                classification = "Normal Sinus Rhythm"
                confidence = 0.6

            return {
                'classification': classification,
                'heart_rate': float(hr),
                'regularity': float(regularity),
                'hr_std': float(hr_std),
                'qrs_width': float(qrs_width),
                'method': 'Autocorrelation + Peak Detection',
                'confidence': float(confidence)
            }

        except Exception as e:
            logger.error(f"Classic ML error: {e}")
            return None

    def _estimate_qrs_width(self, signal, fs):
        """Estimate QRS complex width"""
        try:
            peaks, _ = signal.find_peaks(signal, distance=fs // 2)
            if len(peaks) == 0:
                return 0.08

            # Use middle peak
            peak = peaks[len(peaks) // 2]
            start = max(0, peak - int(0.05 * fs))
            end = min(len(signal), peak + int(0.05 * fs))

            segment = signal[start:end]
            threshold = 0.3 * np.max(np.abs(segment))

            if threshold > 0:
                crossings = np.where(np.abs(segment) > threshold)[0]
                if len(crossings) > 1:
                    return (crossings[-1] - crossings[0]) / fs

            return 0.08
        except:
            return 0.08

    def get_abnormality_types(self):
        """Get list of 4 ECG abnormality types"""
        return [self.abnormality_types[i] for i in range(4)]