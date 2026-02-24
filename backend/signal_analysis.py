"""
Signal Analysis Module
Advanced signal processing for all graph types
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

            # Use a subset for performance
            max_samples = min(5000, data.shape[1])
            data_subset = data[:, :max_samples]

            # Remove mean
            data_centered = data_subset - np.mean(data_subset, axis=1, keepdims=True)

            # Compute correlation matrix
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

    def compute_xor_graph(self, signal_data, chunk_size=250, channel_idx=0, colormap='Hot'):
        """
        XOR graph where signal is divided into time chunks.
        Shows XOR (absolute difference) between consecutive chunks.
        If chunks are identical, the result is zero (erased).
        """
        try:
            data = np.array(signal_data['data'])

            # Check if channel_idx is valid
            if channel_idx >= len(data):
                channel_idx = 0

            channel = data[channel_idx]
            fs = signal_data.get('sampling_rate', 250)

            # Ensure chunk_size is valid
            if chunk_size <= 0:
                chunk_size = 250

            # Ensure we have enough data
            if len(channel) < chunk_size * 2:
                return {
                    'error': f'Signal too short for XOR graph. Need at least {chunk_size*2} samples, got {len(channel)}',
                    'xor_matrix': [],
                    'time_axis': [],
                    'chunk_labels': [],
                    'avg_xor': [],
                    'n_chunks': 0,
                    'channel': signal_data['channels'][channel_idx] if channel_idx < len(signal_data['channels']) else f'CH{channel_idx+1}',
                    'chunk_size': chunk_size,
                    'chunk_duration': chunk_size / fs,
                    'colormap': colormap
                }

            # Calculate number of complete chunks
            n_chunks = len(channel) // chunk_size
            if n_chunks < 2:
                return {
                    'error': f'Need at least 2 chunks, got {n_chunks}',
                    'xor_matrix': [],
                    'time_axis': [],
                    'chunk_labels': [],
                    'avg_xor': [],
                    'n_chunks': n_chunks,
                    'channel': signal_data['channels'][channel_idx] if channel_idx < len(signal_data['channels']) else f'CH{channel_idx+1}',
                    'chunk_size': chunk_size,
                    'chunk_duration': chunk_size / fs,
                    'colormap': colormap
                }

            # Extract chunks
            chunks = channel[:n_chunks * chunk_size].reshape(n_chunks, chunk_size)

            # Create time axis for a single chunk
            time_axis = np.arange(chunk_size) / fs

            # Compute XOR between consecutive chunks
            xor_matrix = []  # For heatmap: rows = chunk pairs, columns = time samples
            avg_xor = []
            identical_pairs = []

            for i in range(n_chunks - 1):
                # XOR between current chunk and next chunk
                xor_result = np.abs(chunks[i] - chunks[i+1])

                # Check if chunks are identical (all zeros after XOR)
                if np.all(xor_result < 1e-6):
                    identical_pairs.append({
                        'chunk1': i,
                        'chunk2': i+1,
                        'time': (i * chunk_size + chunk_size/2) / fs
                    })

                xor_matrix.append(xor_result.tolist())
                avg_xor.append(float(np.mean(xor_result)))

            # Create chunk labels for y-axis
            chunk_labels = [f'Chunk {i+1} vs {i}' for i in range(n_chunks - 1)]

            return {
                'xor_matrix': xor_matrix,
                'time_axis': time_axis.tolist(),
                'chunk_labels': chunk_labels,
                'avg_xor': avg_xor,
                'identical_pairs': identical_pairs,
                'n_chunks': len(xor_matrix),
                'channel': signal_data['channels'][channel_idx] if channel_idx < len(signal_data['channels']) else f'CH{channel_idx+1}',
                'chunk_size': chunk_size,
                'chunk_duration': chunk_size / fs,
                'colormap': colormap,
                'interpretation': 'XOR shows differences between consecutive chunks. Zero (dark) = identical chunks (erased)',
                'fs': fs
            }

        except Exception as e:
            logger.error(f"XOR error: {e}")
            return {
                'error': str(e),
                'xor_matrix': [],
                'time_axis': [],
                'chunk_labels': [],
                'avg_xor': [],
                'n_chunks': 0
            }

    def compute_polar_plot(self, signal_data, channel_idx=0, period=100, mode='cumulative', max_points=2000):
        """
        Polar graph where r = signal magnitude, θ = time
        Two modes:
        - sliding: Latest fixed time (old parts disappear) - looks like moving circular pulse
        - cumulative: All history remains - traces overlapping circular patterns showing periodicity
        """
        try:
            data = np.array(signal_data['data'])

            if channel_idx >= len(data):
                channel_idx = 0

            channel = data[channel_idx]
            fs = signal_data.get('sampling_rate', 250)

            # Limit points for performance but keep enough for smooth animation
            if len(channel) > max_points:
                step = len(channel) // max_points
                channel = channel[::step]

            if mode == 'sliding':
                # Latest fixed time - keep only last 'period * 10' samples (10 cycles)
                # This creates a moving circular pulse effect
                channel = channel[-period*10:]

            # Normalize magnitude to range [0, 10] for better visualization
            min_val = np.min(channel)
            max_val = np.max(channel)
            if max_val > min_val:
                # Normalize to [0, 10]
                r_vals = 10 * (channel - min_val) / (max_val - min_val)
            else:
                r_vals = np.ones_like(channel) * 5

            # For cumulative mode, we want to see overlapping patterns
            # For sliding mode, we want a clean circular pulse
            if mode == 'sliding':
                # For sliding mode, make points more visible
                r_vals = r_vals + 1  # Offset from center

            # Compute theta (angle) based on sample index (time)
            # This maps time to angle around the circle
            theta_deg = []  # Store in degrees for frontend

            for i in range(len(channel)):
                # Map sample index to angle (0 to 360 degrees)
                # This creates a spiral effect where time progresses around the circle
                angle_deg = (360 * (i % period)) / period
                theta_deg.append(angle_deg)

            # Calculate periodicity score using autocorrelation
            periodicity = self._calculate_periodicity(channel, period)

            # For cumulative mode, we'll also create a trace of the average pattern
            avg_pattern = None
            if mode == 'cumulative' and len(channel) > period * 2:
                # Calculate average pattern over all cycles
                n_cycles = len(channel) // period
                avg_r = np.zeros(period)
                count = np.zeros(period)

                for cycle in range(n_cycles):
                    start = cycle * period
                    end = min(start + period, len(channel))
                    for j in range(start, end):
                        idx_in_cycle = j % period
                        avg_r[idx_in_cycle] += r_vals[j]
                        count[idx_in_cycle] += 1

                # Average where we have data
                for j in range(period):
                    if count[j] > 0:
                        avg_r[j] /= count[j]

                avg_theta = [(360 * j) / period for j in range(period)]
                avg_pattern = {
                    'theta': avg_theta,
                    'r': avg_r.tolist()
                }

            return {
                'theta': theta_deg,
                'r': r_vals.tolist(),
                'avg_pattern': avg_pattern,
                'channel': signal_data['channels'][channel_idx] if channel_idx < len(signal_data['channels']) else f'CH{channel_idx+1}',
                'period': period,
                'period_seconds': period / fs,
                'mode': mode,
                'n_points': len(theta_deg),
                'periodicity': float(periodicity),
                'interpretation': 'Sliding mode: moving circular pulse. Cumulative mode: overlapping patterns show periodicity',
                'fs': fs
            }

        except Exception as e:
            logger.error(f"Polar error: {e}")
            return {'error': str(e)}

    def compute_recurrence_plot(self, signal_data, ch_x=0, ch_y=1, threshold=0.3, max_points=300):
        """
        Recurrence graph - Cumulative scatter plot comparing two channels.
        Points are plotted when values from chX and chY are similar.
        Diagonal lines indicate periodic patterns (like regular heartbeat).
        """
        try:
            data = np.array(signal_data['data'])

            if ch_x >= len(data) or ch_y >= len(data):
                ch_x = 0
                ch_y = min(1, len(data)-1)

            sig_x = data[ch_x]
            sig_y = data[ch_y]

            # Normalize both signals to [0, 1] for comparison
            min_x, max_x = np.min(sig_x), np.max(sig_x)
            min_y, max_y = np.min(sig_y), np.max(sig_y)

            if max_x > min_x:
                norm_x = (sig_x - min_x) / (max_x - min_x)
            else:
                norm_x = np.zeros_like(sig_x)

            if max_y > min_y:
                norm_y = (sig_y - min_y) / (max_y - min_y)
            else:
                norm_y = np.zeros_like(sig_y)

            # Downsample for performance but keep enough for pattern detection
            if len(norm_x) > max_points:
                step = len(norm_x) // max_points
                norm_x = norm_x[::step]
                norm_y = norm_y[::step]

            # Create recurrence scatter plot (cumulative)
            # For each pair of points (i,j), plot if |x[i] - y[j]| < threshold
            x_points = []
            y_points = []
            colors = []  # Color by time (i+j)/2n - shows temporal progression

            n = len(norm_x)

            # For better performance, we can sample pairs
            # But for accurate recurrence plot, we need all pairs
            for i in range(n):
                for j in range(n):
                    if np.abs(norm_x[i] - norm_y[j]) < threshold:
                        x_points.append(norm_x[i])
                        y_points.append(norm_y[j])
                        # Color by average time index - shows when in the signal these points occur
                        colors.append((i + j) / (2 * n))

            # Calculate recurrence rate
            recurrence_rate = len(x_points) / (n * n) if n > 0 else 0

            # Create diagonal line (perfect correlation reference)
            diag_x = np.linspace(0, 1, 100)
            diag_y = diag_x

            # Create anti-diagonal for comparison
            anti_diag_x = np.linspace(0, 1, 100)
            anti_diag_y = 1 - anti_diag_x

            # Detect diagonal lines (indicators of periodicity)
            # This is simplified - in real recurrence plots, diagonal lines indicate periodic patterns
            diagonal_lines = []
            if len(x_points) > 100:
                # Look for concentrations along the diagonal
                diagonal_density = 0
                for k in range(len(x_points)):
                    if abs(x_points[k] - y_points[k % len(y_points)]) < 0.1:
                        diagonal_density += 1
                diagonal_density = diagonal_density / len(x_points) if len(x_points) > 0 else 0
            else:
                diagonal_density = 0

            return {
                'recurrence_scatter': {
                    'x': x_points,
                    'y': y_points,
                    'colors': colors
                },
                'diagonal': {
                    'x': diag_x.tolist(),
                    'y': diag_y.tolist()
                },
                'anti_diagonal': {
                    'x': anti_diag_x.tolist(),
                    'y': anti_diag_y.tolist()
                },
                'x_channel': signal_data['channels'][ch_x] if ch_x < len(signal_data['channels']) else f'CH{ch_x+1}',
                'y_channel': signal_data['channels'][ch_y] if ch_y < len(signal_data['channels']) else f'CH{ch_y+1}',
                'recurrence_rate': float(recurrence_rate),
                'diagonal_density': float(diagonal_density),
                'threshold_used': threshold,
                'n_points': len(x_points),
                'matrix_size': n,
                'interpretation': 'Points cluster where channels are similar. Diagonal lines indicate periodic patterns (e.g., regular heartbeat).'
            }

        except Exception as e:
            logger.error(f"Recurrence error: {e}")
            return {'error': str(e)}

    def _calculate_periodicity(self, signal, period):
        """Calculate periodicity score (0-1)"""
        if len(signal) < period * 2:
            return 0.5

        # Compute autocorrelation at the given period
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
            # Normalize to [0, 1]
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