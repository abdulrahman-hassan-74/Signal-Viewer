"""
ECG Signal Processing Utilities
Preprocessing, filtering, feature extraction for ECG signals

"""

import numpy as np
from scipy import signal
import logging

logger = logging.getLogger(__name__)


class ECGProcessor:
    """ECG signal processing utilities for preprocessing and feature extraction"""

    def __init__(self):
        self.default_fs = 250  # Default sampling rate in Hz
        self.qrs_detector = QRSDetector()

    def filter_ecg(self, data, fs=None, lowcut=0.5, highcut=50, order=4):
        """
        Apply bandpass filter to ECG data
        Removes baseline wander (lowcut) and high-frequency noise (highcut)

        Args:
            data: ECG signal (1D array or list of channels)
            fs: Sampling rate in Hz
            lowcut: Low cutoff frequency (Hz) - typically 0.5 Hz for ECG
            highcut: High cutoff frequency (Hz) - typically 40-50 Hz
            order: Filter order

        Returns:
            Filtered ECG signal
        """
        if fs is None:
            fs = self.default_fs

        nyquist = 0.5 * fs
        low = lowcut / nyquist
        high = highcut / nyquist

        # Design Butterworth bandpass filter
        b, a = signal.butter(order, [low, high], btype='band')

        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
            # Multi-channel data
            filtered = []
            for ch in data:
                try:
                    ch_filtered = signal.filtfilt(b, a, ch)
                    filtered.append(ch_filtered.tolist())
                except Exception as e:
                    logger.warning(f"Error filtering channel: {e}")
                    filtered.append(ch)
            return filtered
        else:
            # Single channel data
            try:
                filtered = signal.filtfilt(b, a, data)
                return filtered.tolist() if isinstance(data, list) else filtered
            except Exception as e:
                logger.warning(f"Error filtering signal: {e}")
                return data

    def remove_baseline_wander(self, data, fs=None, cutoff=0.5):
        """
        Remove baseline wander using high-pass filter

        Args:
            data: ECG signal
            fs: Sampling rate
            cutoff: Cutoff frequency for baseline removal

        Returns:
            Signal with baseline removed
        """
        if fs is None:
            fs = self.default_fs

        nyquist = 0.5 * fs
        normalized_cutoff = cutoff / nyquist

        # Design high-pass filter
        b, a = signal.butter(2, normalized_cutoff, btype='high')

        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
            # Multi-channel
            filtered = []
            for ch in data:
                ch_filtered = signal.filtfilt(b, a, ch)
                filtered.append(ch_filtered.tolist())
            return filtered
        else:
            filtered = signal.filtfilt(b, a, data)
            return filtered.tolist() if isinstance(data, list) else filtered

    def notch_filter(self, data, fs=None, freq=50, quality=30):
        """
        Apply notch filter to remove power line interference (50/60 Hz)

        Args:
            data: ECG signal
            fs: Sampling rate
            freq: Frequency to remove (50 Hz or 60 Hz)
            quality: Quality factor

        Returns:
            Filtered signal
        """
        if fs is None:
            fs = self.default_fs

        # Design notch filter
        b, a = signal.iirnotch(freq, quality, fs)

        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
            # Multi-channel
            filtered = []
            for ch in data:
                ch_filtered = signal.filtfilt(b, a, ch)
                filtered.append(ch_filtered.tolist())
            return filtered
        else:
            filtered = signal.filtfilt(b, a, data)
            return filtered.tolist() if isinstance(data, list) else filtered

    def detect_r_peaks(self, ecg_signal, fs=None):
        """
        Detect R-peaks in ECG signal using Pan-Tompkins algorithm

        Args:
            ecg_signal: Single-channel ECG signal
            fs: Sampling rate

        Returns:
            Array of R-peak indices
        """
        if fs is None:
            fs = self.default_fs

        return self.qrs_detector.pan_tompkins(ecg_signal, fs)

    def compute_heart_rate(self, r_peaks, fs=None):
        """
        Compute heart rate from R-peaks

        Args:
            r_peaks: Array of R-peak indices
            fs: Sampling rate

        Returns:
            Heart rate in BPM, average RR interval
        """
        if fs is None:
            fs = self.default_fs

        if len(r_peaks) < 2:
            return 0, 0

        # Calculate RR intervals in seconds
        rr_intervals = np.diff(r_peaks) / fs

        # Remove outliers (intervals < 0.4s or > 1.5s)
        valid_rr = rr_intervals[(rr_intervals >= 0.4) & (rr_intervals <= 1.5)]

        if len(valid_rr) == 0:
            return 0, 0

        avg_rr = np.mean(valid_rr)
        hr = 60 / avg_rr

        return hr, avg_rr

    def compute_hrv(self, r_peaks, fs=None):
        """
        Compute Heart Rate Variability metrics

        Args:
            r_peaks: Array of R-peak indices
            fs: Sampling rate

        Returns:
            Dictionary of HRV metrics
        """
        if fs is None:
            fs = self.default_fs

        if len(r_peaks) < 3:
            return {
                'sdnn': 0,
                'rmssd': 0,
                'pnn50': 0
            }

        # RR intervals in seconds
        rr_intervals = np.diff(r_peaks) / fs * 1000  # Convert to ms

        # SDNN - Standard deviation of RR intervals
        sdnn = np.std(rr_intervals)

        # RMSSD - Root mean square of successive differences
        successive_diffs = np.diff(rr_intervals)
        rmssd = np.sqrt(np.mean(successive_diffs ** 2))

        # pNN50 - Percentage of successive RR intervals differing by >50 ms
        nn50 = np.sum(np.abs(successive_diffs) > 50)
        pnn50 = (nn50 / len(successive_diffs)) * 100 if len(successive_diffs) > 0 else 0

        return {
            'sdnn': float(sdnn),
            'rmssd': float(rmssd),
            'pnn50': float(pnn50),
            'num_beats': len(r_peaks)
        }

    def extract_features(self, ecg_signal, fs=None):
        """
        Extract comprehensive features from ECG signal

        Args:
            ecg_signal: Single-channel ECG signal
            fs: Sampling rate

        Returns:
            Dictionary of extracted features
        """
        if fs is None:
            fs = self.default_fs

        features = {}

        # Detect R-peaks
        r_peaks = self.detect_r_peaks(ecg_signal, fs)
        features['num_r_peaks'] = len(r_peaks)

        # Heart rate and HRV
        if len(r_peaks) >= 2:
            hr, avg_rr = self.compute_heart_rate(r_peaks, fs)
            features['heart_rate'] = hr
            features['avg_rr_interval'] = avg_rr

            hrv = self.compute_hrv(r_peaks, fs)
            features.update(hrv)
        else:
            features['heart_rate'] = 0
            features['avg_rr_interval'] = 0

        # Statistical features
        features['mean'] = float(np.mean(ecg_signal))
        features['std'] = float(np.std(ecg_signal))
        features['variance'] = float(np.var(ecg_signal))
        features['min'] = float(np.min(ecg_signal))
        features['max'] = float(np.max(ecg_signal))
        features['peak_to_peak'] = features['max'] - features['min']

        # Signal energy
        features['energy'] = float(np.sum(np.square(ecg_signal)))

        # Zero crossing rate
        zero_crossings = np.where(np.diff(np.signbit(ecg_signal)))[0]
        features['zero_crossing_rate'] = float(len(zero_crossings) / len(ecg_signal))

        # Spectral features
        freqs, psd = signal.welch(ecg_signal, fs, nperseg=min(256, len(ecg_signal)))

        # Power in different bands
        # VLF: 0.003-0.04 Hz, LF: 0.04-0.15 Hz, HF: 0.15-0.4 Hz
        vlf_band = (freqs >= 0.003) & (freqs < 0.04)
        lf_band = (freqs >= 0.04) & (freqs < 0.15)
        hf_band = (freqs >= 0.15) & (freqs < 0.4)

        features['vlf_power'] = float(np.sum(psd[vlf_band])) if np.any(vlf_band) else 0
        features['lf_power'] = float(np.sum(psd[lf_band])) if np.any(lf_band) else 0
        features['hf_power'] = float(np.sum(psd[hf_band])) if np.any(hf_band) else 0
        features['lf_hf_ratio'] = features['lf_power'] / (features['hf_power'] + 1e-10)

        # Peak frequency
        peak_idx = np.argmax(psd)
        features['peak_frequency'] = float(freqs[peak_idx])

        # Spectral entropy
        psd_norm = psd / (np.sum(psd) + 1e-10)
        spectral_entropy = -np.sum(psd_norm * np.log(psd_norm + 1e-10))
        features['spectral_entropy'] = float(spectral_entropy)

        return features

    def normalize_signal(self, data, method='zscore'):
        """
        Normalize ECG signal

        Args:
            data: ECG signal
            method: 'zscore' or 'minmax'

        Returns:
            Normalized signal
        """
        data = np.array(data)

        if method == 'zscore':
            mean = np.mean(data)
            std = np.std(data)
            if std > 0:
                normalized = (data - mean) / std
            else:
                normalized = data - mean
        elif method == 'minmax':
            min_val = np.min(data)
            max_val = np.max(data)
            if max_val > min_val:
                normalized = (data - min_val) / (max_val - min_val)
            else:
                normalized = data - min_val
        else:
            normalized = data

        return normalized.tolist() if isinstance(data, list) else normalized

    def segment_heartbeats(self, ecg_signal, r_peaks, fs=None, window_before=0.2, window_after=0.4):
        """
        Extract individual heartbeats centered on R-peaks

        Args:
            ecg_signal: ECG signal
            r_peaks: R-peak indices
            fs: Sampling rate
            window_before: Seconds before R-peak
            window_after: Seconds after R-peak

        Returns:
            List of heartbeat segments
        """
        if fs is None:
            fs = self.default_fs

        samples_before = int(window_before * fs)
        samples_after = int(window_after * fs)

        beats = []

        for peak in r_peaks:
            start = peak - samples_before
            end = peak + samples_after

            if start >= 0 and end < len(ecg_signal):
                beat = ecg_signal[start:end]
                beats.append(beat)

        return beats

    def detect_arrhythmia(self, features):
        """
        Simple rule-based arrhythmia detection

        Args:
            features: Dictionary of extracted features

        Returns:
            Classification result
        """
        hr = features.get('heart_rate', 70)
        sdnn = features.get('sdnn', 0)
        lf_hf = features.get('lf_hf_ratio', 1)

        if hr < 50:
            return 'Bradycardia'
        elif hr > 120:
            return 'Tachycardia'
        elif sdnn < 20:
            return 'Low HRV'
        elif lf_hf > 2:
            return 'Sympathetic Dominance'
        elif lf_hf < 0.5:
            return 'Parasympathetic Dominance'
        else:
            return 'Normal'


class QRSDetector:
    """QRS complex detector using Pan-Tompkins algorithm"""

    def pan_tompkins(self, ecg_signal, fs=250):
        """
        Pan-Tompkins QRS detection algorithm

        Args:
            ecg_signal: ECG signal
            fs: Sampling rate

        Returns:
            Array of R-peak indices
        """
        signal = np.array(ecg_signal)

        # Step 1: Bandpass filter (5-15 Hz)
        nyquist = fs / 2
        low = 5 / nyquist
        high = 15 / nyquist
        b, a = signal.butter(2, [low, high], btype='band')
        filtered = signal.filtfilt(b, a, signal)

        # Step 2: Derivative
        derivative = np.diff(filtered)
        derivative = np.append(derivative, derivative[-1])

        # Step 3: Squaring
        squared = derivative ** 2

        # Step 4: Moving window integration
        window_size = int(0.12 * fs)  # 120 ms window
        integrated = np.convolve(squared, np.ones(window_size) / window_size, mode='same')

        # Step 5: Adaptive thresholding
        signal_peak = np.max(integrated) * 0.5
        noise_peak = np.mean(integrated[:int(fs)])  # First second as noise estimate

        threshold = signal_peak + 0.25 * (noise_peak - signal_peak)

        # Find peaks
        peaks = []
        refractory = int(0.2 * fs)  # 200 ms refractory period

        i = 0
        while i < len(integrated):
            if integrated[i] > threshold:
                # Search for local maximum
                peak_start = i
                while i < len(integrated) and integrated[i] > threshold:
                    i += 1
                peak_end = i

                # Find exact peak in this region
                if peak_end > peak_start:
                    peak_idx = peak_start + np.argmax(integrated[peak_start:peak_end])

                    # Check refractory period
                    if len(peaks) == 0 or (peak_idx - peaks[-1]) > refractory:
                        peaks.append(peak_idx)
            i += 1

        # If no peaks found, use simple peak detection as fallback
        if len(peaks) < 2:
            peaks, _ = signal.find_peaks(integrated, distance=fs // 2, height=np.mean(integrated))
            peaks = peaks.tolist()

        return peaks