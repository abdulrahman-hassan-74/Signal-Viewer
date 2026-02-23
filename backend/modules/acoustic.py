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
import tensorflow as tf
import librosa

try:
    import soundfile as sf

    HAS_SOUNDFILE = True
except ImportError:
    HAS_SOUNDFILE = False

logger = logging.getLogger(__name__)


class AcousticAnalyzer:
    """Acoustic signal processing for Doppler and vehicle detection"""

    def __init__(self):
        self.sound_speed = 343
        self.fs = 44100

        model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "drone_model.h5")
        print(f"Looking for model at: {model_path}")
        print(f"File exists: {os.path.exists(model_path)}")
        
        try:
            self.model = tf.keras.models.load_model(model_path)
            print("Model loaded successfully!")
        except Exception as e:
            self.model = None
            print(f"Model failed to load: {e}")
            

    def generate_doppler_sound(self, frequency=440, velocity=30, duration=5):
        """
        Generate realistic Doppler effect sound using continuous radial velocity.
        """
        try:
            fs = self.fs
            v = self.sound_speed

            if abs(velocity) >= v:
                raise ValueError("Velocity must be less than sound speed.")

            # Time centered at zero (car passes at t = 0)
            t = np.linspace(-duration/2, duration/2, int(fs * duration))

            # Car horizontal motion
            x = velocity * t

            # Closest perpendicular distance to observer
            d = 2.0  # meters (small value = stronger Doppler effect)

            # Distance from observer
            r = np.sqrt(x**2 + d**2)

            # Radial velocity (smooth transition from negative to positive)
            v_r = velocity * (x / r)

            # Continuous Doppler formula
            instantaneous_freq = frequency * (v / (v - v_r))

            # Integrate frequency to phase
            phase = 2 * np.pi * np.cumsum(instantaneous_freq) / fs
            sound = np.sin(phase)

            # Amplitude decay with distance (realistic loudness)
            amplitude = 1 / r
            amplitude /= np.max(amplitude)
            sound *= amplitude

            # Fade in/out to prevent click
            fade = int(fs * 0.05)
            envelope = np.ones_like(sound)
            envelope[:fade] = np.linspace(0, 1, fade)
            envelope[-fade:] = np.linspace(1, 0, fade)
            sound *= envelope

            # Normalize
            sound /= np.max(np.abs(sound))

            # Convert to WAV base64
            if HAS_SOUNDFILE:
                buffer = io.BytesIO()
                sf.write(buffer, sound, fs, format='WAV')
                audio_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
            else:
                audio_base64 = None

            # Theoretical min/max observed frequencies
            f_min = frequency * (v / (v + abs(velocity)))
            f_max = frequency * (v / (v - abs(velocity)))

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

    # def detect_drone_from_file(self, filepath):
    #     """
    #     Detect drone sound using the loaded H5 model
    #     """
    #     try:
    #         if self.model is None:
    #             return {'detected': False, 'error': 'Model not initialized'}

    #         # Read audio file
    #         if HAS_SOUNDFILE:
    #             audio_data, fs = sf.read(filepath)
    #         else:
    #             fs, audio_data = wavfile.read(filepath)

    #         # Convert to mono and normalize
    #         if len(audio_data.shape) > 1:
    #             audio_data = np.mean(audio_data, axis=1)
            
    #         if audio_data.dtype == np.int16:
    #             audio_data = audio_data / 32768.0

    #         # 1. Extract Features
    #         # We use your existing extract_features method to get numerical data
    #         feat = self.extract_features(audio_data, fs)
            
    #         # 2. Prepare Input Vector
    #         # NOTE: The order of these keys MUST match how your model was trained
    #         input_data = np.array([[
    #             feat['rms'], 
    #             feat['zero_crossing_rate'], 
    #             feat['spectral_centroid'], 
    #             feat['spectral_spread'],
    #             feat['band_0_energy'],
    #             feat['band_1_energy'],
    #             feat['band_2_energy'],
    #             feat['band_3_energy']
    #         ]])

    #         # 3. Predict
    #         prediction = self.model.predict(input_data)
    #         confidence = float(prediction[0][0])
    #         is_drone = confidence > 0.5 # Threshold

    #         return {
    #             'detected': bool(is_drone),
    #             'confidence': float(confidence * 100),
    #             'drone_type': "Model Identified Drone" if is_drone else "Not a drone",
    #             'spectral_centroid': feat['spectral_centroid'],
    #             'spectral_signature': 'Neural Network Analysis'
    #         }

    #     except Exception as e:
    #         logger.error(f"Drone detection error: {e}")
    #         return None
# import tensorflow as tf



    def detect_drone_from_file(self, path):

        MAX_LEN = 16000
        TARGET_SR = 16000

        model = tf.keras.models.load_model('backend/modules/drone_model.h5')

        # Load audio (auto converts to mono + resamples)
        audio, sr = librosa.load(path, sr=TARGET_SR, mono=True)

        # Fix length
        if len(audio) > MAX_LEN:
            audio = audio[:MAX_LEN]
        else:
            padding = MAX_LEN - len(audio)
            audio = np.pad(audio, (0, padding))

        # Convert to tensor
        audio = tf.convert_to_tensor(audio, dtype=tf.float32)

        # FFT
        fft = tf.signal.rfft(audio)
        fft = tf.abs(fft)

        # Add batch dimension
        fft = tf.expand_dims(fft, axis=0)

        # Predict
        confidence = model.predict(fft, verbose=0)[0][0]

        is_drone = confidence >= 0.5

        return {
            'detected': bool(is_drone),
            'confidence': float(confidence * 100),
            # 'drone_type': "None",
            # 'spectral_centroid': "None",
            # 'spectral_signature': "None"
        }

            # return prob
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
