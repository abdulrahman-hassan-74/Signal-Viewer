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

        model_path = r"D:\SBE\Semester_4\DSP\Projects\task 1 - Copy\backend\models\drone_model.h5"
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


    def estimate_velocity_from_file(self, filepath):
        """
        Estimate vehicle velocity from recorded Doppler sound.
        The emitted frequency is estimated from the audio itself
        (peak of spectrogram at moment of closest approach).
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

            # Find dominant frequency at each time step
            max_freq_idx = np.argmax(Sxx, axis=0)
            max_freq = frequencies[max_freq_idx]

            # Filter out zero/near-zero frequencies (silence/noise)
            valid_mask = max_freq > 50  # Hz threshold to ignore noise floor
            max_freq = max_freq[valid_mask]
            times = times[valid_mask]

            if len(max_freq) < 10:
                return {'error': 'Insufficient data for estimation'}

            # -------------------------------------------------------
            # Detect frequency trend: rising = approaching, falling = receding
            # We split the timeline into first half and second half
            # The crossover point (min slope) = moment of closest approach
            # -------------------------------------------------------
            mid = len(max_freq) // 2
            first_half = max_freq[:mid]
            second_half = max_freq[mid:]

            freq_approaching = np.mean(first_half)
            freq_receding = np.mean(second_half)

            # Determine direction of pass
            approaching = freq_approaching > freq_receding

            # The emitted frequency is estimated at the transition point
            # (where Doppler shift is ~0), approximated as the median
            # of frequencies near the midpoint
            quarter = len(max_freq) // 4
            mid_slice = max_freq[mid - quarter // 2: mid + quarter // 2]
            if len(mid_slice) == 0:
                mid_slice = max_freq
            estimated_emitted_freq = float(np.median(mid_slice))

            # Observed max (approaching) and min (receding) frequencies
            f_high = float(np.percentile(max_freq, 90))  # approaching peak
            f_low  = float(np.percentile(max_freq, 10))  # receding trough

            # Guard against division issues
            if estimated_emitted_freq <= 0 or f_low <= 0:
                return {'error': 'Could not extract valid frequency data'}

            # -------------------------------------------------------
            # Doppler equations:
            #   f_high = f0 * v_sound / (v_sound - v)  →  v = v_sound * (1 - f0/f_high)
            #   f_low  = f0 * v_sound / (v_sound + v)  →  v = v_sound * (f0/f_low  - 1)
            # -------------------------------------------------------
            v_from_high = self.sound_speed * (1 - estimated_emitted_freq / f_high) if f_high > estimated_emitted_freq else 0
            v_from_low  = self.sound_speed * (estimated_emitted_freq / f_low - 1)  if f_low  < estimated_emitted_freq else 0

            estimated_velocity = (abs(v_from_high) + abs(v_from_low)) / 2

            # Confidence: higher if both halves show clear trend
            freq_drop = freq_approaching - freq_receding
            confidence = float(min(0.95, 0.4 + abs(freq_drop) / (estimated_emitted_freq + 1e-6)))

            return {
                'estimated_velocity_ms':  float(estimated_velocity),
                'estimated_velocity_kmh': float(estimated_velocity * 3.6),
                'estimated_emitted_freq': estimated_emitted_freq,
                'freq_approaching_avg':   float(freq_approaching),
                'freq_receding_avg':      float(freq_receding),
                'f_high_percentile':      f_high,
                'f_low_percentile':       f_low,
                'direction':              'approaching then receding' if approaching else 'receding (partial pass?)',
                'method':                 'Doppler Spectrogram — Self-Calibrated',
                'confidence':             confidence
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
        """Fixed version - uses self.model (loaded once) + full error handling"""
        try:
            if self.model is None:
                return {
                    'detected': False,
                    'confidence': 0.0,
                    'drone_type': 'Unknown',
                    'error': 'Drone model failed to load at startup'
                }

            MAX_LEN = 16000
            TARGET_SR = 16000

            # Load audio with librosa (already imported)
            audio, sr = librosa.load(path, sr=TARGET_SR, mono=True)

            # Fix length
            if len(audio) > MAX_LEN:
                audio = audio[:MAX_LEN]
            else:
                audio = np.pad(audio, (0, MAX_LEN - len(audio)))

            # FFT + prediction
            audio_t = tf.convert_to_tensor(audio, dtype=tf.float32)
            fft = tf.abs(tf.signal.rfft(audio_t))
            fft = tf.expand_dims(fft, axis=0)

            confidence = float(self.model.predict(fft, verbose=0)[0][0])
            is_drone = confidence >= 0.5

            return {
                'detected': bool(is_drone),
                'confidence': round(confidence * 100, 2),
                'drone_type': 'AI-Detected Drone' if is_drone else 'No Drone Detected',
                'method': 'Neural Network (FFT input)'
            }

        except Exception as e:
            logger.error(f"Drone detection error: {e}", exc_info=True)
            return {
                'detected': False,
                'confidence': 0.0,
                'drone_type': 'Unknown',
                'error': str(e)
            }
