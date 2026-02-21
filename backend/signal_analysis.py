"""
Signal Analysis Module
Provides advanced signal processing capabilities
"""

import numpy as np
from scipy import signal, stats
from scipy.fft import fft, fftfreq
import logging

logger = logging.getLogger(__name__)

class SignalAnalysis:
    """Advanced signal analysis class"""

    def __init__(self):
        self.sampling_rate = 250  # Default

    def analyze(self, signal_data):
        """Comprehensive analysis of multi-channel signal"""
        try:
            results = {
                'correlation_matrix': self.compute_correlation_matrix(signal_data),
                'statistics': self.compute_statistics(signal_data),
                'frequency_info': self.get_frequency_info(signal_data),
                'fft': self.compute_fft(signal_data)
            }
            return results
        except Exception as e:
            logger.error(f"Analysis error: {str(e)}")
            return {}

    def compute_correlation_matrix(self, signal_data):
        """Compute correlation/synchronization matrix between channels"""
        try:
            data = np.array(signal_data['data'])
            n_channels = data.shape[0]

            # Limit samples for performance
            data = data[:, :min(5000, data.shape[1])]

            if n_channels == 1:
                return [[1.0]]

            corr_matrix = np.corrcoef(data)
            corr_matrix = np.nan_to_num(corr_matrix, nan=0.0)

            return corr_matrix.tolist()

        except Exception as e:
            logger.error(f"Correlation error: {str(e)}")
            return []

    def compute_statistics(self, signal_data):
        """Compute statistics for each channel"""
        try:
            data = np.array(signal_data['data'])
            channels = signal_data['channels']

            stats_list = []
            for i, ch in enumerate(channels):
                ch_data = data[i]
                stats_list.append({
                    'channel': ch,
                    'mean': float(np.mean(ch_data)),
                    'std': float(np.std(ch_data)),
                    'min': float(np.min(ch_data)),
                    'max': float(np.max(ch_data)),
                    'rms': float(np.sqrt(np.mean(ch_data ** 2)))
                })

            return stats_list

        except Exception as e:
            logger.error(f"Statistics error: {str(e)}")
            return []

    def compute_fft(self, signal_data):
        """Compute FFT for all channels"""
        try:
            data = np.array(signal_data['data'])
            fs = signal_data.get('sampling_rate', 250)

            fft_results = []
            for i, ch in enumerate(signal_data['channels']):
                # Limit to 5000 samples
                ch_data = data[i][:5000]

                # Compute FFT
                fft_vals = np.abs(fft(ch_data))
                freqs = fftfreq(len(ch_data), 1 / fs)

                # Keep only positive frequencies
                idx = freqs > 0
                freqs = freqs[idx].tolist()
                fft_vals = fft_vals[idx].tolist()

                fft_results.append({
                    'channel': ch,
                    'frequencies': freqs[:500],  # Limit output
                    'magnitudes': fft_vals[:500]
                })

            return fft_results

        except Exception as e:
            logger.error(f"FFT error: {str(e)}")
            return []

    def compute_recurrence(self, signal1, signal2, threshold=0.5):
        """Compute recurrence plot between two signals"""
        try:
            sig1 = np.array(signal1)
            sig2 = np.array(signal2)

            # Downsample to 200x200 for performance
            n = 200
            step1 = max(1, len(sig1) // n)
            step2 = max(1, len(sig2) // n)

            sig1_ds = sig1[::step1][:n]
            sig2_ds = sig2[::step2][:n]

            recurrence = np.zeros((len(sig1_ds), len(sig2_ds)))

            for i in range(len(sig1_ds)):
                for j in range(len(sig2_ds)):
                    if abs(sig1_ds[i] - sig2_ds[j]) < threshold:
                        recurrence[i][j] = 1

            return recurrence.tolist()

        except Exception as e:
            logger.error(f"Recurrence error: {str(e)}")
            return []

    def compute_wavelet(self, signal_data):
        """Compute wavelet transform"""
        try:
            data = np.array(signal_data['data'])

            wavelet_results = []
            for i, ch in enumerate(signal_data['channels']):
                ch_data = data[i][:2000]

                # Simple continuous wavelet transform simulation
                scales = np.arange(1, 128)
                coefficients = []

                for scale in scales:
                    # Convolve with scaled wavelet
                    wavelet = signal.morlet2(M=min(len(ch_data), 256), w=6, s=scale)
                    coef = np.abs(np.convolve(ch_data, wavelet, mode='same'))
                    coefficients.append(float(np.max(coef)))

                wavelet_results.append({
                    'channel': ch,
                    'scales': scales.tolist(),
                    'coefficients': coefficients
                })

            return wavelet_results

        except Exception as e:
            logger.error(f"Wavelet error: {str(e)}")
            return []

    def apply_filter(self, signal_data, filter_type='lowpass', cutoff=50, order=4):
        """Apply digital filter"""
        try:
            if isinstance(signal_data, dict):
                # Multi-channel
                sig = np.array(signal_data['data'])
                fs = signal_data.get('sampling_rate', 250)
            else:
                # Single signal
                sig = np.array(signal_data)
                fs = 250

            nyquist = fs / 2
            normalized_cutoff = cutoff / nyquist

            if filter_type == 'lowpass':
                b, a = signal.butter(order, normalized_cutoff, btype='low')
            elif filter_type == 'highpass':
                b, a = signal.butter(order, normalized_cutoff, btype='high')
            elif filter_type == 'bandpass':
                # For bandpass, cutoff should be [low, high]
                b, a = signal.butter(order, [0.05, normalized_cutoff], btype='band')
            else:
                return signal_data

            filtered = signal.filtfilt(b, a, sig)

            return filtered.tolist()

        except Exception as e:
            logger.error(f"Filter error: {str(e)}")
            return signal_data

    def get_frequency_info(self, signal_data):
        """Get frequency domain information"""
        try:
            fs = signal_data.get('sampling_rate', 250)
            num_samples = signal_data.get('num_samples', 1000)

            return {
                'nyquist_frequency': fs / 2,
                'frequency_resolution': fs / num_samples,
                'max_frequency_detectable': fs / 2
            }

        except Exception as e:
            logger.error(f"Frequency info error: {str(e)}")
            return {}