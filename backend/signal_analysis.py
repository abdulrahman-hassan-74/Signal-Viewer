"""
Signal Analysis Module
Advanced signal processing for all graph types
XOR Graph, Polar Plot, Recurrence Plot, FFT, Wavelet
"""

import numpy as np
from scipy import signal
import logging

logger = logging.getLogger(__name__)

class SignalAnalysis:
    """Signal analysis functions for all graph types"""

    def analyze(self, signal_data):
        """Comprehensive analysis"""
        try:
            results = {
                'correlation_matrix': self.compute_correlation_matrix(signal_data),
                'statistics': self.compute_statistics(signal_data),
                'frequency_info': self.get_frequency_info(signal_data)
            }
            return results
        except Exception as e:
            logger.error(f"Analysis error: {str(e)}")
            return {}

    def compute_correlation_matrix(self, signal_data):
        """Compute correlation matrix between channels"""
        try:
            data = np.array(signal_data['data'], dtype=float)
            n_channels = data.shape[0]

            if n_channels == 1:
                return [[1.0]]

            data_centered = data - np.mean(data, axis=1, keepdims=True)
            max_samples = min(5000, data.shape[1])
            data_centered = data_centered[:, :max_samples]

            corr_matrix = np.corrcoef(data_centered)
            corr_matrix = np.nan_to_num(corr_matrix, nan=0.0)
            corr_matrix = np.clip(corr_matrix, -1, 1)

            return corr_matrix.tolist()

        except Exception as e:
            logger.error(f"Correlation error: {str(e)}")
            n = len(signal_data.get('channels', []))
            return [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]

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

    def compute_xor_graph(self, signal_data, chunk_size=250, channel_idx=0):
        """
        XOR graph between consecutive chunks
        If chunks are identical, they are erased (XOR = 0)
        """
        try:
            data = np.array(signal_data['data'])
            channel = data[channel_idx]
            fs = signal_data.get('sampling_rate', 250)

            n_chunks = len(channel) // chunk_size
            if n_chunks < 2:
                return {'error': 'Need at least 2 chunks'}

            chunks = channel[:n_chunks * chunk_size].reshape(n_chunks, chunk_size)

            xor_results = []
            time_indices = []
            similarities = []

            for i in range(1, n_chunks):
                xor_diff = np.abs(chunks[i] - chunks[i-1])
                xor_results.append(xor_diff.tolist())
                time_indices.append(i * chunk_size / fs)

                max_val = np.max(np.abs(chunks[i])) + np.max(np.abs(chunks[i-1]))
                if max_val > 0:
                    similarity = 1 - (np.sum(xor_diff) / (chunk_size * max_val))
                else:
                    similarity = 1
                similarities.append(float(similarity))

            avg_xor = [np.mean(chunk) for chunk in xor_results] if xor_results else []

            # Find identical chunks (similarity > 0.95)
            identical_pairs = []
            for i, sim in enumerate(similarities):
                if sim > 0.95:
                    identical_pairs.append({
                        'chunk1': i,
                        'chunk2': i+1,
                        'time': time_indices[i],
                        'similarity': sim
                    })

            return {
                'xor_series': xor_results,
                'xor_data': xor_results,
                'time_indices': time_indices,
                'avg_xor': avg_xor,
                'similarities': similarities,
                'identical_pairs': identical_pairs,
                'chunk_size': chunk_size,
                'chunk_size_samp': chunk_size,
                'chunk_size_sec': chunk_size / fs,
                'chunk_duration': chunk_size / fs,
                'n_chunks': len(xor_results),
                'channel': signal_data['channels'][channel_idx] if channel_idx < len(signal_data['channels']) else f'CH{channel_idx+1}',
                'interpretation': 'Zero values = identical chunks (erased)',
                'time_axis': np.arange(chunk_size) / fs
            }

        except Exception as e:
            logger.error(f"XOR error: {e}")
            return {'error': str(e)}

    def compute_polar_plot(self, signal_data, channel_idx=0, period=100, mode='cumulative'):
        """
        Polar plot (r = magnitude, θ = time mod period)
        Two modes: cumulative (all history) or sliding (latest only)
        """
        try:
            data = np.array(signal_data['data'])
            channel = data[channel_idx]
            fs = signal_data.get('sampling_rate', 250)

            # Normalize to [0, 5] range for better visualization
            channel_min = np.min(channel)
            channel_max = np.max(channel)
            if channel_max > channel_min:
                channel_norm = (channel - channel_min) / (channel_max - channel_min) * 4 + 1
            else:
                channel_norm = np.ones_like(channel) * 3

            if mode == 'sliding':
                channel_norm = channel_norm[-period*5:]

            theta = []
            r_vals = []

            for i in range(len(channel_norm)):
                # Convert to degrees for Plotly
                angle = (360 * (i % period)) / period
                theta.append(angle)
                r_vals.append(channel_norm[i])

            # Calculate periodicity
            periodicity = self._calculate_periodicity(channel_norm, period)

            return {
                'theta': theta,
                'r': r_vals,
                'channel': signal_data['channels'][channel_idx] if channel_idx < len(signal_data['channels']) else f'CH{channel_idx+1}',
                'period': period,
                'period_seconds': period / fs,
                'mode': mode,
                'n_points': len(theta),
                'periodicity': float(periodicity),
                'interpretation': 'Concentric circles = perfect periodicity, Scatter = irregular'
            }

        except Exception as e:
            logger.error(f"Polar error: {e}")
            return {'error': str(e)}

    def compute_recurrence_plot(self, signal_data, ch_x=0, ch_y=1, threshold=0.5):
        """
        Recurrence plot between two channels (cumulative scatter plot)
        """
        try:
            data = np.array(signal_data['data'])

            if ch_x >= len(data) or ch_y >= len(data):
                return {'error': 'Channel index out of range'}

            sig_x = data[ch_x]
            sig_y = data[ch_y]

            # Normalize
            sig_x = (sig_x - np.mean(sig_x)) / (np.std(sig_x) + 1e-10)
            sig_y = (sig_y - np.mean(sig_y)) / (np.std(sig_y) + 1e-10)

            # Downsample for performance
            max_points = 150
            step_x = max(1, len(sig_x) // max_points)
            step_y = max(1, len(sig_y) // max_points)

            sig_x_ds = sig_x[::step_x][:max_points]
            sig_y_ds = sig_y[::step_y][:max_points]

            # Compute recurrence matrix
            n_x, n_y = len(sig_x_ds), len(sig_y_ds)
            recurrence = np.zeros((n_x, n_y))

            for i in range(n_x):
                for j in range(n_y):
                    if np.abs(sig_x_ds[i] - sig_y_ds[j]) < threshold:
                        recurrence[i, j] = 1

            recurrence_rate = np.sum(recurrence) / (n_x * n_y) if n_x * n_y > 0 else 0

            return {
                'recurrence_matrix': recurrence.tolist(),
                'matrix': recurrence.tolist(),
                'x_channel': signal_data['channels'][ch_x] if ch_x < len(signal_data['channels']) else f'CH{ch_x+1}',
                'y_channel': signal_data['channels'][ch_y] if ch_y < len(signal_data['channels']) else f'CH{ch_y+1}',
                'recurrence_rate': float(recurrence_rate),
                'threshold_used': threshold,
                'matrix_size': [n_x, n_y]
            }

        except Exception as e:
            logger.error(f"Recurrence error: {e}")
            return {'error': str(e)}

    def _calculate_periodicity(self, signal, period):
        """Calculate periodicity score (0-1)"""
        if len(signal) < period * 2:
            return 0.5

        corr = 0
        count = 0
        for i in range(len(signal) - period):
            corr += signal[i] * signal[i + period]
            count += 1

        if count == 0:
            return 0.5

        mean_corr = corr / count
        signal_energy = np.mean(signal ** 2)

        if signal_energy > 0:
            return float(min(1, max(0, (mean_corr / signal_energy + 1) / 2)))
        return 0.5

    def apply_filter(self, signal_data, filter_type='lowpass', cutoff=50, order=4):
        """Apply digital filter"""
        try:
            sig = np.array(signal_data)
            fs = 250

            nyquist = fs / 2
            normalized_cutoff = cutoff / nyquist

            if filter_type == 'lowpass':
                b, a = signal.butter(order, normalized_cutoff, btype='low')
            elif filter_type == 'highpass':
                b, a = signal.butter(order, normalized_cutoff, btype='high')
            elif filter_type == 'bandpass':
                b, a = signal.butter(order, [0.5/nyquist, normalized_cutoff], btype='band')
            else:
                return signal_data

            filtered = signal.filtfilt(b, a, sig)
            return filtered.tolist()

        except Exception as e:
            logger.error(f"Filter error: {str(e)}")
            return signal_data

    def compute_wavelet(self, signal_data):
        """Compute wavelet transform"""
        try:
            data = np.array(signal_data['data'])
            results = []

            for i, ch in enumerate(signal_data['channels']):
                ch_data = data[i][:2000]
                scales = np.arange(1, 128)
                coefficients = []

                for scale in scales:
                    try:
                        wavelet = signal.morlet2(M=min(len(ch_data), 256), w=6, s=scale)
                        coef = np.abs(np.convolve(ch_data, wavelet, mode='same'))
                        coefficients.append(float(np.max(coef)))
                    except:
                        coefficients.append(0)

                results.append({
                    'channel': ch,
                    'scales': scales.tolist(),
                    'coefficients': coefficients
                })

            return results

        except Exception as e:
            logger.error(f"Wavelet error: {str(e)}")
            return []