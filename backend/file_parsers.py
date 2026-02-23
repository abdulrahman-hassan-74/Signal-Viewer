"""
File Parser Module - Complete Version
Handles all signal file formats with proper column detection
Supports: CSV, TXT, EDF, BDF, MAT, WFDB, DAT, WAV, MP3
"""

import numpy as np
import pandas as pd
import scipy.io as sio
import logging
import os
import csv

# Optional imports
try:
    import pyedflib
    HAS_EDF = True
except ImportError:
    HAS_EDF = False
    print("⚠️ pyedflib not installed - EDF/BDF support disabled")

try:
    import h5py
    HAS_H5 = True
except ImportError:
    HAS_H5 = False
    print("⚠️ h5py not installed - MAT v7.3 support disabled")

try:
    import wfdb
    HAS_WFDB = True
except ImportError:
    HAS_WFDB = False
    print("⚠️ wfdb not installed - WFDB support disabled")

try:
    import soundfile as sf
    HAS_SOUNDFILE = True
except ImportError:
    HAS_SOUNDFILE = False
    print("⚠️ soundfile not installed - Audio support disabled")

logger = logging.getLogger(__name__)

class FileParser:
    """Parse various signal file formats with proper header detection"""

    def __init__(self):
        self.default_sampling_rate = 250

    def parse_file(self, filepath, ext):
        """Main parsing dispatcher"""
        try:
            ext = ext.lower()
            if ext in ['csv', 'txt']:
                return self.parse_csv(filepath)
            elif ext == 'edf':
                return self.parse_edf(filepath)
            elif ext == 'bdf':
                return self.parse_bdf(filepath)
            elif ext == 'mat':
                return self.parse_mat(filepath)
            elif ext in ['hea', 'dat']:
                return self.parse_wfdb(filepath)
            elif ext in ['wav', 'mp3']:
                return self.parse_audio(filepath)
            else:
                return self.parse_binary(filepath)
        except Exception as e:
            logger.error(f"Parse error: {str(e)}")
            return {'error': f'Parse failed: {str(e)}'}

    def _detect_delimiter(self, line):
        """Detect CSV delimiter"""
        for d in [',', ';', '\t', '|', ' ']:
            if d in line:
                return d
        return ','

    def _is_time_column(self, column):
        """Check if column could be time (numeric and increasing)"""
        try:
            values = column.dropna().values[:100]  # Check first 100 values
            if len(values) < 2:
                return False

            # Convert to float
            numeric_values = [float(v) for v in values]

            # Check if increasing
            is_increasing = all(numeric_values[i] <= numeric_values[i+1]
                               for i in range(len(numeric_values)-1))

            return is_increasing
        except:
            return False

    def _estimate_sampling_rate(self, time_array):
        """Estimate sampling rate from time array"""
        try:
            if len(time_array) < 2:
                return self.default_sampling_rate

            diffs = np.diff(time_array[:100])
            mean_diff = np.mean(diffs[diffs > 0])

            if mean_diff > 0:
                return int(1 / mean_diff)
            return self.default_sampling_rate
        except:
            return self.default_sampling_rate

    def _remove_zero_channels(self, data, channels):
        """Remove channels that are all zeros"""
        valid_data = []
        valid_channels = []

        for i, ch_data in enumerate(data):
            # Check first 1000 samples for non-zero values
            check_samples = min(1000, len(ch_data))
            if any(abs(v) > 1e-10 for v in ch_data[:check_samples]):
                valid_data.append(ch_data)
                valid_channels.append(channels[i] if i < len(channels) else f"CH{i+1}")

        if not valid_data:
            # If all channels are zero, keep them anyway with warning
            logger.warning("All channels are zero - keeping original data")
            return data, channels

        return valid_data, valid_channels

    def _parse_csv_manual(self, filepath, delimiter):
        """Manual CSV parser for when pandas fails"""
        try:
            data = []
            channels = []
            time = []

            with open(filepath, 'r', encoding='utf-8') as f:
                reader = csv.reader(f, delimiter=delimiter)

                # Read headers
                try:
                    headers = next(reader)
                except StopIteration:
                    return {'error': 'Empty file'}

                # Clean headers
                headers = [h.strip() for h in headers if h.strip()]

                # Check if headers are numeric (no headers)
                try:
                    float(headers[0])
                    has_headers = False
                    # Use generic channel names
                    channels = [f"CH{i+1}" for i in range(len(headers))]
                except:
                    has_headers = True
                    channels = headers[1:] if len(headers) > 1 else headers

                # Read all rows
                rows = list(reader)

                if not rows:
                    return {'error': 'No data rows'}

                # Check if first column is time
                try:
                    first_col = [float(row[0]) for row in rows[:10] if row]
                    is_time = len(first_col) > 1 and all(first_col[i] <= first_col[i+1]
                                                        for i in range(len(first_col)-1))
                except:
                    is_time = False

                if is_time and len(headers) > 1:
                    # First column is time
                    channels = headers[1:] if has_headers else [f"CH{i+1}" for i in range(1, len(headers))]
                    time = []
                    data = [[] for _ in range(len(channels))]

                    for row in rows:
                        if len(row) > len(channels):
                            try:
                                time.append(float(row[0]))
                                for i, val in enumerate(row[1:len(channels)+1]):
                                    try:
                                        data[i].append(float(val))
                                    except:
                                        data[i].append(0.0)
                            except:
                                continue
                else:
                    # No time column
                    channels = headers if has_headers else [f"CH{i+1}" for i in range(len(headers))]
                    time = [i / self.default_sampling_rate for i in range(len(rows))]
                    data = [[] for _ in range(len(channels))]

                    for row in rows:
                        for i, val in enumerate(row[:len(channels)]):
                            try:
                                data[i].append(float(val))
                            except:
                                data[i].append(0.0)

            return {
                'success': True,
                'channels': channels,
                'data': data,
                'time': time,
                'num_channels': len(channels),
                'num_samples': len(time),
                'sampling_rate': self.default_sampling_rate,
                'file_type': 'csv'
            }

        except Exception as e:
            logger.error(f"Manual CSV parse error: {e}")
            return {'error': str(e)}

    def parse_csv(self, filepath):
        """
        Parse CSV/TXT file with intelligent column detection
        - Detects if first column is time
        - Uses headers if present, otherwise generates CH1, CH2, etc.
        - Handles missing headers properly
        """
        try:
            logger.info(f"Parsing CSV file: {filepath}")

            # First, read the file to detect structure
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                # Read first few lines to analyze
                first_lines = [f.readline().strip() for _ in range(5)]
                f.seek(0)

                # Detect delimiter
                delimiter = self._detect_delimiter(first_lines[0])

                # Try pandas first for robust parsing
                try:
                    df = pd.read_csv(filepath, delimiter=delimiter, nrows=100000, on_bad_lines='skip')
                except Exception as e:
                    logger.warning(f"Pandas parsing failed: {e}, falling back to manual parsing")
                    return self._parse_csv_manual(filepath, delimiter)

                # Analyze headers
                headers = df.columns.tolist()

                # Check if headers are actually numeric (meaning no headers)
                try:
                    float(headers[0])
                    has_headers = False
                except (ValueError, TypeError):
                    has_headers = True

                # Check if first column is time (monotonic increasing)
                first_col = df.iloc[:, 0]
                is_time = self._is_time_column(first_col)

                if is_time and len(headers) > 1:
                    # First column is time, use it
                    time = first_col.values.tolist()
                    data = df.iloc[:, 1:].values.T

                    if has_headers:
                        channels = headers[1:]
                    else:
                        channels = [f"CH{i+1}" for i in range(data.shape[0])]

                    # Estimate sampling rate from time
                    sampling_rate = self._estimate_sampling_rate(time)

                else:
                    # No time column, generate time
                    time = list(np.arange(len(df)) / self.default_sampling_rate)
                    data = df.values.T

                    if has_headers:
                        channels = headers
                    else:
                        channels = [f"CH{i+1}" for i in range(data.shape[0])]

                    sampling_rate = self.default_sampling_rate

                # Convert to list of lists and clean NaN values
                data_clean = []
                for row in data:
                    clean_row = [float(x) if not pd.isna(x) else 0.0 for x in row]
                    data_clean.append(clean_row)

                # Validate data
                if not data_clean or len(data_clean[0]) == 0:
                    return {'error': 'No valid numeric data found'}

                # Remove all-zero channels
                valid_data, valid_channels = self._remove_zero_channels(data_clean, channels)

                logger.info(f"✓ CSV parsed: {len(valid_channels)} channels, {len(time)} samples")

                return {
                    'success': True,
                    'channels': valid_channels,
                    'data': valid_data,
                    'time': time,
                    'num_channels': len(valid_channels),
                    'num_samples': len(time),
                    'sampling_rate': sampling_rate,
                    'file_type': 'csv'
                }

        except Exception as e:
            logger.error(f"CSV parse error: {str(e)}")
            return {'error': f'CSV parsing failed: {str(e)}'}

    def parse_edf(self, filepath):
        """Parse EDF file with proper channel names"""
        if not HAS_EDF:
            return {'error': 'EDF support requires pyedflib. Install with: pip install pyedflib'}

        try:
            logger.info(f"Parsing EDF file: {filepath}")

            f = pyedflib.EdfReader(filepath)
            n_channels = f.signals_in_file

            if n_channels == 0:
                return {'error': 'EDF file has no signals'}

            channels = f.getSignalLabels()

            # Clean channel names
            channels = [ch.strip() if ch else f"CH{i+1}" for i, ch in enumerate(channels)]

            # Get sampling rate
            try:
                sampling_rate = int(f.getSampleFrequency(0))
                if sampling_rate <= 0:
                    sampling_rate = self.default_sampling_rate
            except:
                sampling_rate = self.default_sampling_rate

            # Read data
            data = []
            num_samples = 0

            for i in range(n_channels):
                try:
                    signal = f.readSignal(i)
                    if len(signal) > 0:
                        data.append([float(x) for x in signal])
                        num_samples = max(num_samples, len(signal))
                    else:
                        data.append([])
                except Exception as e:
                    logger.warning(f"Error reading channel {i}: {str(e)}")
                    data.append([])

            f.close()

            if num_samples == 0:
                return {'error': 'No data read from EDF file'}

            # Pad channels to same length
            for i in range(len(data)):
                if len(data[i]) < num_samples:
                    data[i] = data[i] + [0.0] * (num_samples - len(data[i]))

            time = [i / sampling_rate for i in range(num_samples)]

            logger.info(f"✓ EDF parsed: {len(channels)} channels, {num_samples} samples")

            return {
                'success': True,
                'channels': channels,
                'data': data,
                'time': time,
                'num_channels': len(data),
                'num_samples': num_samples,
                'sampling_rate': float(sampling_rate),
                'file_type': 'edf'
            }

        except Exception as e:
            logger.error(f"EDF parse error: {str(e)}")
            return {'error': str(e)}

    def parse_bdf(self, filepath):
        """Parse BDF file (same as EDF)"""
        return self.parse_edf(filepath)

    def parse_mat(self, filepath):
        """Parse MATLAB .mat file with variable name as channel names"""
        try:
            logger.info(f"Parsing MAT file: {filepath}")

            mat_data = None

            # Try scipy first
            try:
                mat_data = sio.loadmat(filepath, squeeze_me=True)
                logger.info(f"Loaded with scipy, keys: {list(mat_data.keys())}")
            except Exception as e:
                logger.warning(f"scipy load failed: {str(e)}")

                # Try h5py for v7.3
                if mat_data is None and HAS_H5:
                    try:
                        mat_data = {}
                        with h5py.File(filepath, 'r') as f:
                            def extract(name, obj):
                                if isinstance(obj, h5py.Dataset):
                                    mat_data[name] = np.array(obj)
                            f.visititems(extract)
                        logger.info(f"Loaded with h5py, keys: {list(mat_data.keys())}")
                    except Exception as e2:
                        logger.warning(f"h5py load failed: {str(e2)}")

            if mat_data is None:
                if not HAS_H5:
                    return {'error': 'Cannot read MAT file. Install h5py for v7.3 support: pip install h5py'}
                return {'error': 'MAT file format is incorrect - not a valid MATLAB file'}

            # Find the largest numeric array
            signal_data = None
            signal_name = None
            max_size = 0
            found_keys = []

            for key in mat_data.keys():
                if key.startswith('__'):
                    continue

                val = mat_data[key]
                found_keys.append(key)

                if isinstance(val, np.ndarray) and val.size > max_size:
                    if val.dtype in [np.float64, np.float32, np.int64, np.int32]:
                        max_size = val.size
                        signal_data = val
                        signal_name = key

            if signal_data is None:
                return {'error': f'No numeric array found. Available keys: {", ".join(found_keys[:10])}'}

            logger.info(f"Using key: {signal_name}, shape: {signal_data.shape}")

            # Ensure 2D and correct orientation
            if signal_data.ndim == 1:
                signal_data = signal_data.reshape(1, -1)
            elif signal_data.ndim > 2:
                signal_data = signal_data.reshape(signal_data.shape[0], -1)

            # Ensure channels x samples
            if signal_data.shape[0] > signal_data.shape[1]:
                signal_data = signal_data.T

            # Limit size for performance
            max_samples = 100000
            if signal_data.shape[1] > max_samples:
                signal_data = signal_data[:, :max_samples]
                logger.info(f"Limited to {max_samples} samples")

            num_channels, num_samples = signal_data.shape

            # Create channel names
            if num_channels == 1:
                channels = [signal_name]
            else:
                channels = [f"{signal_name}_{i+1}" for i in range(num_channels)]

            time = [i / self.default_sampling_rate for i in range(num_samples)]
            data = signal_data.astype(float).tolist()

            logger.info(f"✓ MAT parsed: {num_channels} channels, {num_samples} samples")

            return {
                'success': True,
                'channels': channels,
                'data': data,
                'time': time,
                'num_channels': num_channels,
                'num_samples': num_samples,
                'sampling_rate': self.default_sampling_rate,
                'file_type': 'mat'
            }

        except Exception as e:
            logger.error(f"MAT parse error: {e}")
            return {'error': str(e)}

    def parse_wfdb(self, filepath):
        """Parse WFDB format (.hea + .dat pair)"""
        if not HAS_WFDB:
            return {'error': 'WFDB support requires wfdb. Install with: pip install wfdb'}

        try:
            # Determine base path
            if filepath.endswith('.hea'):
                base_path = filepath[:-4]
            elif filepath.endswith('.dat'):
                base_path = filepath[:-4]
            else:
                base_path = filepath.rsplit('.', 1)[0]

            logger.info(f"Parsing WFDB files with base: {base_path}")

            # Check if header exists
            header_file = base_path + '.hea'
            if not os.path.exists(header_file):
                return {'error': f'Header file not found: {header_file}'}

            # Read header
            with open(header_file, 'r') as f:
                lines = f.readlines()

            if not lines:
                return {'error': 'Header file is empty'}

            # Parse header
            parts = lines[0].split()
            if len(parts) < 3:
                return {'error': 'Invalid WFDB header format'}

            num_channels = int(parts[1])
            sampling_rate = int(parts[2])

            # Get channel names
            channels = []
            for i in range(1, min(num_channels+1, len(lines))):
                line = lines[i].strip()
                if line:
                    line_parts = line.split()
                    if len(line_parts) > 5:
                        channels.append(line_parts[5])
                    else:
                        channels.append(f"CH{i}")

            # Pad channels list if needed
            while len(channels) < num_channels:
                channels.append(f"CH{len(channels)+1}")

            # Find data file
            data_file = base_path + '.dat'
            if not os.path.exists(data_file):
                return {'error': f'Data file not found: {data_file}'}

            # Read binary data
            with open(data_file, 'rb') as f:
                raw_data = np.fromfile(f, dtype=np.int16)

            if len(raw_data) == 0:
                return {'error': 'Data file is empty'}

            if len(raw_data) % num_channels != 0:
                return {'error': f'Data size {len(raw_data)} not divisible by {num_channels} channels'}

            num_samples = len(raw_data) // num_channels
            data_array = raw_data.reshape(num_channels, num_samples)

            data = data_array.astype(float).tolist()
            time = [i / sampling_rate for i in range(num_samples)]

            logger.info(f"✓ WFDB parsed: {num_channels} channels, {num_samples} samples")

            return {
                'success': True,
                'channels': channels,
                'data': data,
                'time': time,
                'num_channels': num_channels,
                'num_samples': num_samples,
                'sampling_rate': float(sampling_rate),
                'file_type': 'wfdb'
            }

        except Exception as e:
            logger.error(f"WFDB parse error: {e}")
            return {'error': str(e)}

    def parse_audio(self, filepath):
        """Parse audio file (WAV, MP3)"""
        if not HAS_SOUNDFILE:
            return {'error': 'Audio support requires soundfile. Install with: pip install soundfile'}

        try:
            logger.info(f"Parsing audio file: {filepath}")

            data, samplerate = sf.read(filepath)

            if len(data) == 0:
                return {'error': 'Audio file is empty'}

            # Convert to mono if stereo
            if len(data.shape) > 1:
                data = np.mean(data, axis=1)

            # Create single channel
            channels = ['Audio']
            data_list = [data.tolist()]
            time = list(np.arange(len(data)) / samplerate)

            logger.info(f"✓ Audio parsed: 1 channel, {len(data)} samples, {samplerate} Hz")

            return {
                'success': True,
                'channels': channels,
                'data': data_list,
                'time': time,
                'num_channels': 1,
                'num_samples': len(data),
                'sampling_rate': samplerate,
                'file_type': 'audio'
            }

        except Exception as e:
            logger.error(f"Audio parse error: {str(e)}")
            return {'error': str(e)}

    def parse_binary(self, filepath):
        """Parse generic binary file"""
        try:
            logger.info(f"Parsing binary file: {filepath}")

            with open(filepath, 'rb') as f:
                data_bytes = np.fromfile(f, dtype=np.int16)

            if len(data_bytes) == 0:
                return {'error': 'Binary file is empty'}

            # Try common channel counts
            channel_counts = [1, 2, 4, 8, 12, 16, 32, 64]
            best_channels = 1
            best_remainder = len(data_bytes)

            for nc in channel_counts:
                remainder = len(data_bytes) % nc
                if remainder < best_remainder:
                    best_remainder = remainder
                    best_channels = nc

            if best_remainder > 0:
                logger.warning(f"Data length {len(data_bytes)} not divisible by {best_channels}, truncating")
                data_bytes = data_bytes[:len(data_bytes) - best_remainder]

            if len(data_bytes) == 0:
                return {'error': 'No valid data after truncation'}

            num_samples = len(data_bytes) // best_channels
            data_array = data_bytes.reshape(best_channels, num_samples)

            channels = [f"CH{i+1}" for i in range(best_channels)]
            time = [i / self.default_sampling_rate for i in range(num_samples)]
            data = data_array.astype(float).tolist()

            logger.info(f"✓ Binary parsed: {best_channels} channels, {num_samples} samples")

            return {
                'success': True,
                'channels': channels,
                'data': data,
                'time': time,
                'num_channels': best_channels,
                'num_samples': num_samples,
                'sampling_rate': self.default_sampling_rate,
                'file_type': 'binary'
            }

        except Exception as e:
            logger.error(f"Binary parse error: {e}")
            return {'error': str(e)}