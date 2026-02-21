"""
Acoustic Signal Analysis Module
Doppler effect, vehicle detection, drone identification
"""

import numpy as np
from scipy import signal
from scipy.io import wavfile
import base64
import io
import logging
import os

try:
    import soundfile as sf

    HAS_SOUNDFILE = True
except ImportError:
    HAS_SOUNDFILE = False

logger = logging.getLogger(__name__)


class AcousticAnalyzer:
    """Acoustic signal processing for Doppler and vehicle detection"""

    def __init__(self):
        self.sound_speed = 343  # m/s at 20°C
        self.fs = 44100  # Default sample rate

    def generate_doppler_sound(self, frequency=440, velocity=30, duration=5):
        """
        Generate Doppler effect sound
        f_observed = f_source * (v_sound / (v_sound ± v_source))
        """
        try:
            fs = self.fs
            t = np.linspace(0, duration, int(fs * duration))

            # Car position: moving from -50m to +50m
            car_position = velocity * (t - duration / 2)

            # Distance from observer at origin
            distance = np.abs(car_position)

            # Time delay (not used in generation, but for reference)
            time_delay = distance / self.sound_speed

            # Doppler shift factor
            # Approaching: f_obs = f * (v_sound / (v_sound - v_source))
            # Receding: f_obs = f * (v_sound / (v_sound + v_source))
            doppler_factor = np.ones_like(t)

            # Approaching phase (car_position < 0)
            approaching = car_position < 0
            doppler_factor[approaching] = self.sound_speed / (self.sound_speed - velocity)

            # Receding phase (car_position > 0)
            receding = car_position > 0
            doppler_factor[receding] = self.sound_speed / (self.sound_speed + velocity)

            # Generate sound with varying frequency
            instantaneous_freq = frequency * doppler_factor

            # Integrate frequency to get phase
            phase = 2 * np.pi * np.cumsum(instantaneous_freq) / fs
            sound = 0.5 * np.sin(phase)

            # Apply amplitude envelope (fade in/out)
            envelope = np.ones_like(t)
            envelope[:int(fs * 0.1)] = np.linspace(0, 1, int(fs * 0.1))
            envelope[-int(fs * 0.1):] = np.linspace(1, 0, int(fs * 0.1))
            sound *= envelope

            # Add some noise for realism
            sound += 0.01 * np.random.randn(len(sound))

            # Normalize
            sound = sound / np.max(np.abs(sound))

            # Convert to WAV base64
            if HAS_SOUNDFILE:
                buffer = io.BytesIO()
                sf.write(buffer, sound, fs, format='WAV')
                audio_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
            else:
                # Fallback: return numpy array
                audio_base64 = None

            # Calculate frequency range
            f_min = frequency * self.sound_speed / (self.sound_speed + velocity)
            f_max = frequency * self.sound_speed / (self.sound_speed - velocity)

            return {
                'audio_base64': audio_base64,
                'sample_rate': fs,
                'duration': duration,
                'sound_array': sound.tolist() if not HAS_SOUNDFILE else [],
                'frequency_range': {
                    'min': float(f_min),
                    'max': float(f_max),
                    'original': frequency
                },
                'velocity_used': velocity,
                'doppler_shift': float(f_max - f_min)
            }

        except Exception as e:
            logger.error(f"Doppler generation error: {e}")
            return None

    def estimate_velocity_from_file(self, filepath, original_freq=440):
        """
        Estimate vehicle velocity from recorded Doppler sound
        Using spectrogram analysis
        """
        try:
            # Read audio file
            if HAS_SOUNDFILE:
                audio_data, fs = sf.read(filepath)
            else:
                fs, audio_data = wavfile.read(filepath)

            # Convert to mono if stereo
            if len(audio_data.shape) > 1:
                audio_data = np.mean(audio_data, axis=1)

            # Convert to float if needed
            if audio_data.dtype == np.int16:
                audio_data = audio_data / 32768.0

            # Compute spectrogram
            frequencies, times, Sxx = signal.spectrogram(
                audio_data, fs,
                nperseg=min(2048, len(audio_data) // 10),
                noverlap=min(1024, len(audio_data) // 20)
            )

            # Find max frequency at each time
            max_freq_idx = np.argmax(Sxx, axis=0)
            max_freq = frequencies[max_freq_idx]

            # Filter outliers
            max_freq = max_freq[max_freq > 0]

            if len(max_freq) < 10:
                return {
                    'error': 'Insufficient data for estimation'
                }

            # Find where frequency changes
            freq_ratio = max_freq / original_freq

            # Estimate velocity from max frequency shift
            max_shift = np.max(freq_ratio)
            min_shift = np.min(freq_ratio)

            # Solve for velocity
            # f_max/f = v_sound/(v_sound - v) for approaching
            # f_min/f = v_sound/(v_sound + v) for receding

            v_approach = self.sound_speed * (1 - 1 / max_shift) if max_shift > 1 else 0
            v_recede = self.sound_speed * (1 / min_shift - 1) if min_shift < 1 else 0

            estimated_velocity = (np.abs(v_approach) + np.abs(v_recede)) / 2

            return {
                'estimated_velocity': float(estimated_velocity),
                'velocity_approach': float(v_approach),
                'velocity_recede': float(v_recede),
                'max_frequency_ratio': float(max_shift),
                'min_frequency_ratio': float(min_shift),
                'method': 'Spectrogram Peak Tracking',
                'confidence': float(0.8 if estimated_velocity > 0 else 0.3)
            }

        except Exception as e:
            logger.error(f"Velocity estimation error: {e}")
            return None

    def detect_drone_from_file(self, filepath):
        """
        Detect drone sound vs other sounds
        Based on spectral signature
        """
        try:
            # Read audio file
            if HAS_SOUNDFILE:
                audio_data, fs = sf.read(filepath)
            else:
                fs, audio_data = wavfile.read(filepath)

            # Convert to mono if stereo
            if len(audio_data.shape) > 1:
                audio_data = np.mean(audio_data, axis=1)

            # Convert to float if needed
            if audio_data.dtype == np.int16:
                audio_data = audio_data / 32768.0

            # Use middle portion of audio
            mid_point = len(audio_data) // 2
            segment = audio_data[mid_point:mid_point + min(5 * fs, len(audio_data) - mid_point)]

            # Compute FFT
            fft_vals = np.abs(np.fft.fft(segment))
            freqs = np.fft.fftfreq(len(segment), 1 / fs)

            # Positive frequencies only
            pos_mask = freqs > 0
            freqs = freqs[pos_mask]
            fft_vals = fft_vals[pos_mask]

            # Drone signature: strong harmonics at specific frequencies
            # Typical drone props: 80-400 Hz fundamental
            fundamental_range = (freqs > 80) & (freqs < 400)
            harmonic1_range = (freqs > 160) & (freqs < 800)
            harmonic2_range = (freqs > 240) & (freqs < 1200)
            harmonic3_range = (freqs > 320) & (freqs < 1600)

            # Calculate energy in each band
            fundamental_energy = np.sum(fft_vals[fundamental_range]) if np.any(fundamental_range) else 0
            harmonic1_energy = np.sum(fft_vals[harmonic1_range]) if np.any(harmonic1_range) else 0
            harmonic2_energy = np.sum(fft_vals[harmonic2_range]) if np.any(harmonic2_range) else 0
            harmonic3_energy = np.sum(fft_vals[harmonic3_range]) if np.any(harmonic3_range) else 0

            total_energy = np.sum(fft_vals)

            if total_energy == 0:
                return {
                    'detected': False,
                    'confidence': 0,
                    'error': 'No signal energy'
                }

            # Calculate harmonic ratios
            harmonic_ratio = (harmonic1_energy + harmonic2_energy + harmonic3_energy) / total_energy
            fundamental_ratio = fundamental_energy / total_energy

            # Calculate spectral centroid
            spectral_centroid = np.sum(freqs * fft_vals) / total_energy

            # Calculate spectral rolloff
            cumulative_energy = np.cumsum(fft_vals)
            rolloff_point = np.where(cumulative_energy >= 0.85 * total_energy)[0]
            spectral_rolloff = freqs[rolloff_point[0]] if len(rolloff_point) > 0 else 0

            # Decision logic for drone
            # Drones typically have strong fundamental + harmonics
            is_drone = (harmonic_ratio > 0.25 and
                        fundamental_ratio > 0.08 and
                        80 < spectral_centroid < 800)

            # Confidence calculation
            confidence = min(1.0, harmonic_ratio * 2 + fundamental_ratio)

            # Determine drone type based on fundamental frequency
            drone_type = "Unknown"
            if is_drone:
                if 80 <= spectral_centroid < 150:
                    drone_type = "Large Drone (Slow props)"
                elif 150 <= spectral_centroid < 250:
                    drone_type = "Medium Drone"
                elif 250 <= spectral_centroid < 400:
                    drone_type = "Small Drone (Fast props)"
                elif 400 <= spectral_centroid < 800:
                    drone_type = "Very Small Drone / Toy"

            return {
                'detected': bool(is_drone),
                'confidence': float(confidence * 100),
                'drone_type': drone_type if is_drone else "Not a drone",
                'fundamental_freq': float(freqs[np.argmax(fft_vals[fundamental_range])]) if np.any(
                    fundamental_range) else 0,
                'spectral_centroid': float(spectral_centroid),
                'spectral_rolloff': float(spectral_rolloff),
                'harmonic_ratio': float(harmonic_ratio),
                'fundamental_ratio': float(fundamental_ratio),
                'spectral_signature': 'Drone' if is_drone else 'Ambient/Other'
            }

        except Exception as e:
            logger.error(f"Drone detection error: {e}")
            return None

    def generate_test_signals(self):
        """Generate test signals for debugging"""
        signals = {}

        # Drone-like signal
        fs = 44100
        t = np.linspace(0, 2, 2 * fs)

        # Fundamental at 150 Hz
        drone = 0.5 * np.sin(2 * np.pi * 150 * t)
        # Harmonics
        drone += 0.3 * np.sin(2 * np.pi * 300 * t)
        drone += 0.2 * np.sin(2 * np.pi * 450 * t)
        drone += 0.1 * np.sin(2 * np.pi * 600 * t)

        # Add noise
        drone += 0.05 * np.random.randn(len(drone))

        signals['drone'] = drone.tolist()

        # Car pass signal (Doppler)
        car = self.generate_doppler_sound(440, 20, 2)
        if car and 'sound_array' in car:
            signals['car_pass'] = car['sound_array']

        return signals

    def extract_features(self, audio_data, fs):
        """Extract acoustic features for classification"""
        try:
            features = {}

            # Time domain features
            features['rms'] = float(np.sqrt(np.mean(audio_data ** 2)))
            features['zero_crossing_rate'] = float(np.sum(np.abs(np.diff(np.signbit(audio_data)))) / len(audio_data))

            # Frequency domain
            fft_vals = np.abs(np.fft.fft(audio_data))
            freqs = np.fft.fftfreq(len(audio_data), 1 / fs)
            pos_mask = freqs > 0
            freqs = freqs[pos_mask]
            fft_vals = fft_vals[pos_mask]

            features['spectral_centroid'] = float(np.sum(freqs * fft_vals) / np.sum(fft_vals))
            features['spectral_spread'] = float(
                np.sum(((freqs - features['spectral_centroid']) ** 2) * fft_vals) / np.sum(fft_vals))

            # Mel-frequency cepstral coefficients (simplified)
            # Just use band energies
            bands = [(0, 300), (300, 800), (800, 2000), (2000, 4000)]
            for i, (low, high) in enumerate(bands):
                band_mask = (freqs >= low) & (freqs < high)
                features[f'band_{i}_energy'] = float(np.sum(fft_vals[band_mask])) if np.any(band_mask) else 0

            return features

        except Exception as e:
            logger.error(f"Feature extraction error: {e}")
            return {}