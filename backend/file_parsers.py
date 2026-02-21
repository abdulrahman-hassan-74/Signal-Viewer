"""
File Parser Module
Handles various signal file formats: EDF, MAT, CSV, WFDB, etc.
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

try:
    import h5py
    HAS_H5 = True
except ImportError:
    HAS_H5 = False

logger = logging.getLogger(__name__)

class FileParser:
    """Parse various signal file formats"""

    def __init__(self):
        self.default_sampling_rate = 250

    def parse_file(self, filepath, ext):
        """Main parsing dispatcher"""
        try:
            if ext == 'csv' or ext == 'txt':
                return self.parse_csv(filepath)
            elif ext == 'edf':
                return self.parse_edf(filepath)
            elif ext == 'bdf':
                return self.parse_bdf(filepath)
            elif ext == 'mat':
                return self.parse_mat(filepath)
            elif ext in ['hea', 'dat']:
                return self.parse_wfdb(filepath)
            else:
                return self.parse_generic_binary(filepath)

        except Exception as e:
            logger.error(f"Parse error: {str(e)}")
            return None

    def parse_csv(self, filepath):
        """Parse CSV/TXT file"""
        try:
            # Try with pandas first
            df = pd.read_csv(filepath, nrows=100000)

            # Detect if first column is time
            first_col = df.iloc[:, 0]
            try:
                is_time = all(first_col.iloc[i] <= first_col.iloc[i+1]
                            for i in range(min(len(first_col)-1, 100)))
            except:
                is_time = False

            if is_time:
                time = first_col.values.tolist()
                data = df.iloc[:, 1:].values.T
                channels = df.columns[1:].tolist()
                sampling_rate = self._estimate_sampling_rate(time)
            else:
                time = list(np.arange(len(df)) / self.default_sampling_rate)
                data = df.values.T
                channels = [f"CH{i+1}" for i in range(df.shape[1])]
                sampling_rate = self.default_sampling_rate

            # Convert to list of lists
            data = [row.tolist() for row in data]

            return {
                'channels': channels,
                'data': data,
                'time': time,
                'num_channels': len(channels),
                'num_samples': len(time),
                'sampling_rate': sampling_rate,
                'file_type': 'csv'
            }

        except Exception as e:
            logger.error(f"CSV parse error: {str(e)}")
            return self._parse_csv_simple(filepath)

    def _parse_csv_simple(self, filepath):
        """Fallback CSV parser"""
        try:
            import csv
            data = []
            channels = []
            time = []

            with open(filepath, 'r', encoding='utf-8') as f:
                reader = csv.reader(f)
                headers = next(reader)

                # Check if first column is time or channel name
                try:
                    float(headers[0])
                    is_time_header = False
                except:
                    is_time_header = True

                if is_time_header:
                    channels = headers[1:]
                    data = [[] for _ in range(len(channels))]

                    for row in reader:
                        if len(row) > 1:
                            try:
                                time.append(float(row[0]))
                                for i, val in enumerate(row[1:]):
                                    data[i].append(float(val))
                            except ValueError:
                                continue
                else:
                    channels = [f"CH{i + 1}" for i in range(len(headers))]
                    data = [[] for _ in range(len(headers))]

                    for idx, row in enumerate(reader):
                        time.append(idx / 250.0)
                        for i, val in enumerate(row):
                            try:
                                data[i].append(float(val))
                            except ValueError:
                                data[i].append(0.0)

            return {
                'channels': channels,
                'data': data,
                'time': time,
                'num_channels': len(channels),
                'num_samples': len(time),
                'sampling_rate': 250
            }

        except Exception as e:
            logger.error(f"Simple CSV parse error: {e}")
            return None

    def _extract_numeric_array(self, obj, max_depth=5):
        """Recursively extract numeric data from nested structures"""
        if max_depth <= 0:
            return None

        if isinstance(obj, np.ndarray):
            if obj.dtype == object:
                # Object array - try to extract from elements
                if obj.size > 0:
                    # Try first element
                    return self._extract_numeric_array(obj.flat[0], max_depth - 1)
            else:
                # Numeric array
                return obj.astype(float)

        if isinstance(obj, (list, tuple)):
            if len(obj) > 0:
                return self._extract_numeric_array(obj[0], max_depth - 1)

        return None

    def parse_mat(self, filepath):
        """Parse MATLAB .mat file"""
        try:
            logger.info(f"Attempting to parse MAT file: {filepath}")

            # Try to load with scipy
            try:
                mat_data = sio.loadmat(filepath, squeeze_me=True)
            except Exception as e:
                logger.warning(f"scipy.io.loadmat failed: {str(e)}")

                # Try h5py for newer MAT files
                if HAS_H5:
                    logger.info("Trying h5py...")
                    mat_file = h5py.File(filepath, 'r')
                    mat_data = {}

                    def extract_h5_data(name, obj):
                        if isinstance(obj, h5py.Dataset):
                            mat_data[name] = np.array(obj)

                    mat_file.visititems(extract_h5_data)
                    mat_file.close()
                else:
                    raise Exception("Cannot read MAT file - both scipy and h5py failed")

            # Find the best signal data
            signal_key = None
            max_size = 0
            signal_array = None

            for key in mat_data.keys():
                # Skip MATLAB metadata
                if key.startswith('_') or key.startswith('__'):
                    continue

                val = mat_data[key]

                try:
                    if isinstance(val, np.ndarray):
                        arr = val
                    else:
                        arr = np.array(val)

                    # Extract numeric data if it's object array
                    if arr.dtype == object:
                        numeric_arr = self._extract_numeric_array(arr)
                        if numeric_arr is not None:
                            arr = numeric_arr

                    # Convert to float if possible
                    if arr.dtype != object:
                        arr = arr.astype(float)

                    # Look for 2D or 3D arrays with reasonable size
                    if len(arr.shape) >= 2:
                        size = np.prod(arr.shape)
                        if size > max_size:
                            max_size = size
                            signal_key = key
                            signal_array = arr

                except Exception:
                    continue

            if signal_array is None:
                logger.error("No suitable signal data found in MAT file")
                return None

            # Handle different data shapes
            if len(signal_array.shape) == 3:
                # Shape: (samples, channels, features)
                if signal_array.shape[2] > 1:
                    # Average across features
                    signal_array = np.mean(signal_array, axis=2)
                else:
                    signal_array = signal_array[:, :, 0]

            # Ensure channels x samples format
            if signal_array.shape[0] < signal_array.shape[1]:
                signal_array = signal_array.T

            # Limit to reasonable size
            max_samples = 100000
            if signal_array.shape[1] > max_samples:
                signal_array = signal_array[:, :max_samples]

            num_channels, num_samples = signal_array.shape

            # Create channel names
            channels = [f"CH{i + 1}" for i in range(num_channels)]

            # Create time array
            time = [i / self.default_sampling_rate for i in range(num_samples)]

            # Convert to list
            data = []
            for row in signal_array:
                data.append([float(x) for x in row])

            return {
                'channels': channels,
                'data': data,
                'time': time,
                'num_channels': num_channels,
                'num_samples': num_samples,
                'sampling_rate': self.default_sampling_rate,
                'file_type': 'mat'
            }

        except Exception as e:
            logger.error(f"MAT parse error: {str(e)}", exc_info=True)
            return None

    def parse_edf(self, filepath):
        """Parse EDF (European Data Format) file"""
        if not HAS_EDF:
            logger.error("pyedflib not installed")
            return None

        try:
            f = pyedflib.EdfReader(filepath)

            n_channels = f.signals_in_file
            channels = f.getSignalLabels()

            try:
                sampling_rate = int(f.getSampleFrequency(0))
            except:
                sampling_rate = self.default_sampling_rate

            data = []
            num_samples = 0

            for i in range(n_channels):
                try:
                    signal = f.readSignal(i)
                    data.append([float(x) for x in signal])
                    num_samples = len(signal)
                except Exception as e:
                    logger.warning(f"Error reading EDF channel {i}: {str(e)}")
                    continue

            f.close()

            time = [i / sampling_rate for i in range(num_samples)]

            return {
                'channels': channels,
                'data': data,
                'time': time,
                'num_channels': len(data),
                'num_samples': num_samples,
                'sampling_rate': sampling_rate,
                'file_type': 'edf'
            }

        except Exception as e:
            logger.error(f"EDF parse error: {str(e)}", exc_info=True)
            return None

    def parse_bdf(self, filepath):
        """Parse BDF (BioSemi Data Format) file"""
        if not HAS_EDF:
            return None

        try:
            f = pyedflib.EdfReader(filepath)

            n_channels = f.signals_in_file
            channels = f.getSignalLabels()

            try:
                sampling_rate = int(f.getSampleFrequency(0))
            except:
                sampling_rate = self.default_sampling_rate

            data = []
            num_samples = 0

            for i in range(n_channels):
                try:
                    signal = f.readSignal(i)
                    data.append([float(x) for x in signal])
                    num_samples = len(signal)
                except Exception as e:
                    logger.warning(f"Error reading BDF channel {i}: {str(e)}")
                    continue

            f.close()

            time = [i / sampling_rate for i in range(num_samples)]

            return {
                'channels': channels,
                'data': data,
                'time': time,
                'num_channels': len(data),
                'num_samples': num_samples,
                'sampling_rate': sampling_rate,
                'file_type': 'bdf'
            }

        except Exception as e:
            logger.error(f"BDF parse error: {str(e)}", exc_info=True)
            return None

    def parse_wfdb(self, filepath):
        """Parse WFDB format (.hea + .dat pair)"""
        try:
            base_path = filepath.rsplit('.', 1)[0]
            header_file = base_path + '.hea'
            data_file = base_path + '.dat'

            if not os.path.exists(header_file):
                raise Exception("Missing .hea header file")

            # Parse header
            with open(header_file, 'r') as f:
                lines = f.readlines()

            record_line = lines[0].split()
            num_channels = int(record_line[1])
            sampling_rate = int(record_line[2])

            channels = []
            for i in range(1, num_channels + 1):
                if i < len(lines):
                    parts = lines[i].split()
                    if len(parts) > 5:
                        channels.append(parts[5])
                    else:
                        channels.append(f"CH{i}")

            # Read binary data
            if not os.path.exists(data_file):
                raise Exception("Missing .dat data file")

            with open(data_file, 'rb') as f:
                raw_data = np.fromfile(f, dtype=np.int16)

            if len(raw_data) % num_channels == 0:
                num_samples = len(raw_data) // num_channels
                raw_data = raw_data.reshape(num_channels, num_samples)
            else:
                raise Exception("Data size doesn't match number of channels")

            data = []
            for row in raw_data:
                data.append([float(x) for x in row])

            time = [i / sampling_rate for i in range(num_samples)]

            return {
                'channels': channels,
                'data': data,
                'time': time,
                'num_channels': num_channels,
                'num_samples': num_samples,
                'sampling_rate': sampling_rate,
                'file_type': 'wfdb'
            }

        except Exception as e:
            logger.error(f"WFDB parse error: {str(e)}", exc_info=True)
            return None

    def parse_generic_binary(self, filepath):
        """Parse generic binary .dat file"""
        try:
            with open(filepath, 'rb') as f:
                data_bytes = np.fromfile(f, dtype=np.int16)

            # Try different channel counts
            for num_channels in [8, 4, 16, 12, 1]:
                if len(data_bytes) % num_channels == 0:
                    num_samples = len(data_bytes) // num_channels
                    data_array = data_bytes.reshape(num_channels, num_samples)
                    break
            else:
                # If nothing divides evenly, treat as single channel
                data_array = data_bytes.reshape(1, -1)
                num_channels = 1

            channels = [f"CH{i + 1}" for i in range(data_array.shape[0])]
            sampling_rate = 250
            time = [i / sampling_rate for i in range(data_array.shape[1])]

            data = []
            for row in data_array:
                data.append([float(x) for x in row])

            return {
                'channels': channels,
                'data': data,
                'time': time,
                'num_channels': data_array.shape[0],
                'num_samples': data_array.shape[1],
                'sampling_rate': sampling_rate,
                'file_type': 'binary'
            }

        except Exception as e:
            logger.error(f"Binary parse error: {str(e)}", exc_info=True)
            return None

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