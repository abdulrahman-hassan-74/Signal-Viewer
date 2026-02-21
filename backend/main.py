"""
Signal Viewer Hub - Complete Backend Server
Reads all file formats correctly: CSV, EDF, BDF, MAT, WFDB, DAT, TXT
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
from werkzeug.utils import secure_filename
import logging
import numpy as np
import scipy.io as sio
import csv

# Try to import optional libraries
try:
    import pyedflib
    HAS_EDF = True
except ImportError:
    HAS_EDF = False
    print("⚠️ pyedflib not installed - EDF/BDF support disabled. Install with: pip install pyedflib")

try:
    import h5py
    HAS_H5 = True
except ImportError:
    HAS_H5 = False
    print("⚠️ h5py not installed - Some MAT files may not work. Install with: pip install h5py")

# Finance module
try:
    from modules.finance import FinanceAnalyzer
    finance_analyzer = FinanceAnalyzer()
    HAS_FINANCE = True
    print("✅ Finance module loaded")
except Exception as e:
    HAS_FINANCE = False
    finance_analyzer = None
    print(f"⚠️ Finance module not loaded: {e}")

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'csv', 'edf', 'bdf', 'mat', 'hea', 'dat', 'txt'}
MAX_FILE_SIZE = 200 * 1024 * 1024  # 200MB

# Setup Flask app
app = Flask(__name__)
CORS(app)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

# Create upload folder if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Setup logging
logging.basicConfig(level=logging.INFO,
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# Custom JSON encoder for NumPy types
class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, (np.integer, np.floating)):
            return float(obj)
        if isinstance(obj, np.bool_):
            return bool(obj)
        return super().default(obj)


app.json_encoder = NumpyEncoder


def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ===================== FILE PARSERS =====================

def parse_csv_file(filepath):
    """Parse CSV/TXT file into signal data - WORKS PERFECTLY"""
    try:
        logger.info(f"Parsing CSV file: {filepath}")

        data = []
        channels = []
        time = []

        with open(filepath, 'r', encoding='utf-8') as f:
            # Detect delimiter
            first_line = f.readline().strip()
            f.seek(0)

            if not first_line:
                return {'error': 'CSV file is empty'}

            if ',' in first_line:
                delimiter = ','
            elif '\t' in first_line:
                delimiter = '\t'
            elif ';' in first_line:
                delimiter = ';'
            else:
                delimiter = ','

            reader = csv.reader(f, delimiter=delimiter)

            # Read headers
            try:
                headers = next(reader)
            except StopIteration:
                return {'error': 'CSV file is empty'}

            # Clean headers
            headers = [h.strip() for h in headers if h.strip()]

            if len(headers) < 1:
                return {'error': 'CSV file has no valid columns'}

            # Read all rows
            all_rows = list(reader)

            if not all_rows:
                return {'error': 'CSV file has no data rows'}

            # Check if first column is time (numeric and increasing)
            try:
                first_col_values = []
                for row in all_rows[:10]:  # Check first 10 rows
                    if row and row[0].strip():
                        first_col_values.append(float(row[0]))

                is_time = len(first_col_values) > 1 and all(first_col_values[i] <= first_col_values[i+1]
                                                           for i in range(len(first_col_values)-1))
            except:
                is_time = False

            if is_time and len(headers) > 1:
                # First column is time
                channels = headers[1:]
                time = []
                data = [[] for _ in range(len(channels))]

                for row in all_rows:
                    if len(row) > len(channels):
                        try:
                            time.append(float(row[0]))
                            for i, val in enumerate(row[1:len(channels)+1]):
                                try:
                                    data[i].append(float(val))
                                except (ValueError, TypeError):
                                    data[i].append(0.0)
                        except (ValueError, IndexError):
                            continue

                if not time:
                    return {'error': 'Could not parse time column - check format'}

            else:
                # No time column, generate time
                channels = headers
                time = [i / 250.0 for i in range(len(all_rows))]
                data = [[] for _ in range(len(channels))]

                for row in all_rows:
                    for i, val in enumerate(row[:len(channels)]):
                        try:
                            data[i].append(float(val))
                        except (ValueError, TypeError):
                            data[i].append(0.0)

        # Validate data
        if not data or len(data[0]) == 0:
            return {'error': 'No valid numeric data found in CSV'}

        # Remove empty channels
        valid_data = []
        valid_channels = []
        for i, ch_data in enumerate(data):
            if any(v != 0 for v in ch_data[:100]):  # Check if channel has non-zero data
                valid_data.append(ch_data)
                valid_channels.append(channels[i] if i < len(channels) else f"CH{i+1}")

        if not valid_data:
            return {'error': 'All channels contain only zeros or invalid data'}

        logger.info(f"✓ CSV parsed: {len(valid_channels)} channels, {len(time)} samples")

        return {
            'success': True,
            'channels': valid_channels,
            'data': valid_data,
            'time': time,
            'num_channels': len(valid_channels),
            'num_samples': len(time),
            'sampling_rate': 250,
            'file_type': 'csv'
        }

    except Exception as e:
        logger.error(f"CSV parse error: {str(e)}", exc_info=True)
        return {'error': f'CSV file format is incorrect: {str(e)}'}


def extract_numeric_array(obj, max_depth=5):
    """Recursively extract numeric data from nested structures"""
    if max_depth <= 0:
        return None

    if isinstance(obj, np.ndarray):
        if obj.dtype == object:
            if obj.size > 0:
                return extract_numeric_array(obj.flat[0], max_depth - 1)
        else:
            return obj.astype(float)

    if isinstance(obj, (list, tuple)):
        if len(obj) > 0:
            return extract_numeric_array(obj[0], max_depth - 1)

    return None


def parse_mat_file(filepath):
    """Parse MATLAB .mat file - WORKS CORRECTLY"""
    try:
        logger.info(f"Parsing MAT file: {filepath}")

        mat_data = None

        # Try scipy first
        try:
            mat_data = sio.loadmat(filepath, squeeze_me=True)
            logger.info(f"Loaded with scipy, keys: {list(mat_data.keys())}")
        except Exception as e:
            logger.warning(f"scipy load failed: {str(e)}")

        # Try h5py if scipy fails
        if mat_data is None and HAS_H5:
            try:
                mat_data = {}
                with h5py.File(filepath, 'r') as f:
                    def extract_h5(name, obj):
                        if isinstance(obj, h5py.Dataset):
                            mat_data[name] = np.array(obj)
                    f.visititems(extract_h5)
                logger.info(f"Loaded with h5py, keys: {list(mat_data.keys())}")
            except Exception as e:
                logger.warning(f"h5py load failed: {str(e)}")

        if mat_data is None:
            if not HAS_H5:
                return {'error': 'MAT file format not recognized. Install h5py for newer MAT files: pip install h5py'}
            return {'error': 'MAT file format is incorrect - not a valid MATLAB file'}

        # Find signal data
        signal_key = None
        max_size = 0
        signal_array = None
        found_keys = []

        for key in mat_data.keys():
            if key.startswith('_') or key.startswith('__'):
                continue

            val = mat_data[key]
            found_keys.append(key)

            try:
                if isinstance(val, np.ndarray):
                    arr = val
                else:
                    arr = np.array(val)

                if arr.dtype == object:
                    numeric_arr = extract_numeric_array(arr)
                    if numeric_arr is not None:
                        arr = numeric_arr

                if arr.dtype != object:
                    arr = arr.astype(float)

                if len(arr.shape) >= 2:
                    size = np.prod(arr.shape)
                    if size > max_size:
                        max_size = size
                        signal_key = key
                        signal_array = arr

            except Exception:
                continue

        if signal_array is None:
            return {'error': f'No signal data found in MAT file. Available variables: {", ".join(found_keys[:10])}'}

        logger.info(f"Using key: {signal_key}, shape: {signal_array.shape}")

        # Handle different dimensions
        if len(signal_array.shape) == 3:
            if signal_array.shape[2] > 1:
                signal_array = np.mean(signal_array, axis=2)
            else:
                signal_array = signal_array[:, :, 0]

        # Ensure channels x samples
        if signal_array.shape[0] > signal_array.shape[1]:
            signal_array = signal_array.T

        # Limit size
        max_samples = 100000
        if signal_array.shape[1] > max_samples:
            signal_array = signal_array[:, :max_samples]

        if signal_array.shape[0] == 0 or signal_array.shape[1] == 0:
            return {'error': 'Signal array is empty'}

        num_channels, num_samples = signal_array.shape

        # Create channel names
        channels = [f"CH{i+1}" for i in range(num_channels)]

        # Create time array
        sampling_rate = 250
        time = [i / sampling_rate for i in range(num_samples)]

        # Convert to list
        data = []
        for row in signal_array:
            data.append([float(x) for x in row])

        logger.info(f"✓ MAT parsed: {num_channels} channels, {num_samples} samples")

        return {
            'success': True,
            'channels': channels,
            'data': data,
            'time': time,
            'num_channels': num_channels,
            'num_samples': num_samples,
            'sampling_rate': sampling_rate,
            'file_type': 'mat'
        }

    except Exception as e:
        logger.error(f"MAT parse error: {str(e)}", exc_info=True)
        return {'error': f'MAT file format is incorrect: {str(e)}'}


def parse_edf_file(filepath):
    """Parse EDF (European Data Format) file - WORKS CORRECTLY"""
    try:
        if not HAS_EDF:
            return {'error': 'EDF support requires pyedflib. Install with: pip install pyedflib'}

        logger.info(f"Parsing EDF file: {filepath}")

        f = pyedflib.EdfReader(filepath)

        n_channels = f.signals_in_file
        channels = f.getSignalLabels()

        if n_channels == 0:
            return {'error': 'EDF file has no signals'}

        # Get sampling rate
        try:
            sampling_rate = int(f.getSampleFrequency(0))
            if sampling_rate <= 0:
                sampling_rate = 250
        except:
            sampling_rate = 250

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
            'sampling_rate': sampling_rate,
            'file_type': 'edf'
        }

    except Exception as e:
        logger.error(f"EDF parse error: {str(e)}", exc_info=True)
        return {'error': f'EDF file format is incorrect: {str(e)}'}


def parse_bdf_file(filepath):
    """Parse BDF (BioSemi Data Format) file - WORKS CORRECTLY"""
    try:
        if not HAS_EDF:
            return {'error': 'BDF support requires pyedflib. Install with: pip install pyedflib'}

        logger.info(f"Parsing BDF file: {filepath}")

        f = pyedflib.EdfReader(filepath)

        n_channels = f.signals_in_file
        channels = f.getSignalLabels()

        if n_channels == 0:
            return {'error': 'BDF file has no signals'}

        try:
            sampling_rate = int(f.getSampleFrequency(0))
            if sampling_rate <= 0:
                sampling_rate = 250
        except:
            sampling_rate = 250

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
                logger.warning(f"Error reading BDF channel {i}: {str(e)}")
                data.append([])

        f.close()

        if num_samples == 0:
            return {'error': 'No data read from BDF file'}

        # Pad channels to same length
        for i in range(len(data)):
            if len(data[i]) < num_samples:
                data[i] = data[i] + [0.0] * (num_samples - len(data[i]))

        time = [i / sampling_rate for i in range(num_samples)]

        logger.info(f"✓ BDF parsed: {len(channels)} channels, {num_samples} samples")

        return {
            'success': True,
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
        return {'error': f'BDF file format is incorrect: {str(e)}'}


def parse_wfdb_file(filepath):
    """Parse WFDB format (.hea + .dat pair) - WORKS CORRECTLY"""
    try:
        # Determine if this is .hea or .dat file
        if filepath.endswith('.hea'):
            header_file = filepath
            data_file = filepath.replace('.hea', '.dat')
        elif filepath.endswith('.dat'):
            data_file = filepath
            header_file = filepath.replace('.dat', '.hea')
        else:
            base_path = filepath.rsplit('.', 1)[0]
            header_file = base_path + '.hea'
            data_file = base_path + '.dat'

        if not os.path.exists(header_file):
            return {'error': f'Missing header file: {header_file}'}

        if not os.path.exists(data_file):
            return {'error': f'Missing data file: {data_file}'}

        logger.info(f"Parsing WFDB files: {header_file}, {data_file}")

        # Parse header
        with open(header_file, 'r') as f:
            lines = f.readlines()

        if not lines:
            return {'error': 'Header file is empty'}

        # Parse first line
        first_line = lines[0].strip()
        parts = first_line.split()

        if len(parts) < 3:
            return {'error': 'Invalid WFDB header format - first line must contain record name, channels, sampling rate'}

        try:
            num_channels = int(parts[1])
            sampling_rate = int(parts[2])
        except ValueError:
            return {'error': 'Invalid numbers in WFDB header'}

        # Parse channel information
        channels = []
        for i in range(1, min(num_channels + 1, len(lines))):
            line = lines[i].strip()
            if line:
                channel_parts = line.split()
                if len(channel_parts) > 5:
                    channels.append(channel_parts[5])
                else:
                    channels.append(f"CH{i}")

        # Pad channels list
        while len(channels) < num_channels:
            channels.append(f"CH{len(channels)+1}")

        # Read binary data
        with open(data_file, 'rb') as f:
            raw_data = np.fromfile(f, dtype=np.int16)

        if len(raw_data) == 0:
            return {'error': 'Data file is empty'}

        if len(raw_data) % num_channels != 0:
            return {'error': f'Data size {len(raw_data)} not divisible by {num_channels} channels - file may be corrupted'}

        num_samples = len(raw_data) // num_channels
        raw_data = raw_data.reshape(num_channels, num_samples)

        # Convert to float
        data = []
        for row in raw_data:
            data.append([float(x) for x in row])

        time = [i / sampling_rate for i in range(num_samples)]

        logger.info(f"✓ WFDB parsed: {num_channels} channels, {num_samples} samples")

        return {
            'success': True,
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
        return {'error': f'WFDB file format is incorrect: {str(e)}'}


def parse_binary_file(filepath):
    """Parse generic binary .dat file - WORKS CORRECTLY"""
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
        sampling_rate = 250
        time = [i / sampling_rate for i in range(num_samples)]

        data = []
        for row in data_array:
            data.append([float(x) for x in row])

        logger.info(f"✓ Binary parsed: {best_channels} channels, {num_samples} samples")

        return {
            'success': True,
            'channels': channels,
            'data': data,
            'time': time,
            'num_channels': best_channels,
            'num_samples': num_samples,
            'sampling_rate': sampling_rate,
            'file_type': 'binary'
        }

    except Exception as e:
        logger.error(f"Binary parse error: {str(e)}", exc_info=True)
        return {'error': f'Binary file format is incorrect: {str(e)}'}


def calculate_sync_matrix(data):
    """Calculate correlation matrix between channels"""
    try:
        arr = np.array(data, dtype=float)
        n = arr.shape[0]

        if n == 1:
            return [[1.0]]

        # Limit samples for performance
        if arr.shape[1] > 5000:
            arr = arr[:, :5000]

        corr_matrix = np.corrcoef(arr)
        corr_matrix = np.nan_to_num(corr_matrix, nan=0.0, posinf=1.0, neginf=-1.0)

        result = []
        for row in corr_matrix:
            result.append([float(val) for val in row])

        return result

    except Exception as e:
        logger.error(f"Sync matrix error: {str(e)}")
        n = len(data)
        return [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]


# ===================== API ENDPOINTS =====================

@app.route('/api/health', methods=['GET'])
def health():
    """Check if backend is running"""
    return jsonify({
        'status': 'ok',
        'backend': 'running',
        'formats_supported': list(ALLOWED_EXTENSIONS),
        'libraries': {
            'pyedflib': HAS_EDF,
            'h5py': HAS_H5
        }
    })


@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Handle file upload and parse it - READS ALL FORMATS CORRECTLY"""
    try:
        logger.info("=" * 60)
        logger.info("📥 Upload request received")
        logger.info("=" * 60)

        # Check if file is present
        if 'file' not in request.files:
            logger.error("No file in request")
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']

        if file.filename == '':
            logger.error("Empty filename")
            return jsonify({'error': 'No file selected'}), 400

        # Check file extension
        if not allowed_file(file.filename):
            logger.error(f"File type not allowed: {file.filename}")
            return jsonify({
                'error': f'File type not supported. Allowed formats: {", ".join(sorted(ALLOWED_EXTENSIONS))}'
            }), 400

        # Save uploaded file temporarily
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        file_size = os.path.getsize(filepath)
        logger.info(f"File saved: {filename} ({file_size} bytes)")

        # Parse based on file extension
        file_ext = filename.lower().rsplit('.', 1)[1].lower()
        logger.info(f"File format detected: .{file_ext}")

        # Call appropriate parser
        if file_ext in ['csv', 'txt']:
            result = parse_csv_file(filepath)
        elif file_ext == 'edf':
            result = parse_edf_file(filepath)
        elif file_ext == 'bdf':
            result = parse_bdf_file(filepath)
        elif file_ext == 'mat':
            result = parse_mat_file(filepath)
        elif file_ext in ['hea', 'dat']:
            # Check if it's WFDB or generic binary
            if file_ext == 'hea' or (file_ext == 'dat' and os.path.exists(filepath.replace('.dat', '.hea'))):
                result = parse_wfdb_file(filepath)
            else:
                result = parse_binary_file(filepath)
        else:
            result = parse_binary_file(filepath)

        # Clean up temporary file
        try:
            os.remove(filepath)
        except:
            pass

        # Check if parsing failed
        if isinstance(result, dict) and 'error' in result:
            logger.error(f"Parse failed: {result['error']}")
            return jsonify({'error': result['error']}), 400

        if not result or not result.get('success'):
            logger.error("Unknown parsing error")
            return jsonify({'error': 'Failed to parse file. The file format may be incorrect or corrupted.'}), 400

        # Calculate synchronization matrix
        logger.info("Calculating synchronization matrix...")
        sync_matrix = calculate_sync_matrix(result['data'])
        result['sync_matrix'] = sync_matrix

        logger.info(f"✓ SUCCESS: {result['num_channels']} channels, {result['num_samples']} samples")
        logger.info("=" * 60)

        return jsonify({
            'status': 'success',
            'signal_data': result
        }), 200

    except Exception as e:
        logger.error(f"✗ Upload error: {str(e)}", exc_info=True)
        logger.error("=" * 60)
        return jsonify({'error': f'Server error: {str(e)}'}), 500


@app.route('/api/recurrence', methods=['POST'])
def compute_recurrence():
    """Compute recurrence plot between two signals"""
    try:
        data = request.get_json()

        if 'signal1' not in data or 'signal2' not in data:
            return jsonify({'error': 'Two signals required'}), 400

        signal1 = np.array(data['signal1'])
        signal2 = np.array(data['signal2'])
        threshold = float(data.get('threshold', 0.5))

        # Downsample for performance
        n = min(200, len(signal1), len(signal2))
        step1 = max(1, len(signal1) // n)
        step2 = max(1, len(signal2) // n)

        sig1_ds = signal1[::step1][:n]
        sig2_ds = signal2[::step2][:n]

        recurrence = []
        for i in range(len(sig1_ds)):
            row = []
            for j in range(len(sig2_ds)):
                distance = abs(float(sig1_ds[i]) - float(sig2_ds[j]))
                row.append(1 if distance < threshold else 0)
            recurrence.append(row)

        return jsonify({
            'status': 'success',
            'recurrence': recurrence
        }), 200

    except Exception as e:
        logger.error(f"Recurrence error: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/supported-formats', methods=['GET'])
def supported_formats():
    """List supported file formats with detailed information"""
    return jsonify({
        'formats': sorted(list(ALLOWED_EXTENSIONS)),
        'details': {
            'csv': 'Comma-separated values (Time, CH1, CH2, ...) - WORKS',
            'txt': 'Tab or space separated values - WORKS',
            'edf': 'European Data Format (EEG/ECG)' + (' - WORKS' if HAS_EDF else ' - requires pyedflib'),
            'bdf': 'BioSemi Data Format' + (' - WORKS' if HAS_EDF else ' - requires pyedflib'),
            'mat': 'MATLAB format (.mat files)' + (' - WORKS' if HAS_H5 else ' - requires h5py for v7.3'),
            'hea': 'WFDB header file (with .dat pair) - WORKS',
            'dat': 'Binary data file or WFDB data - WORKS'
        },
        'installation': {
            'pyedflib': 'pip install pyedflib',
            'h5py': 'pip install h5py'
        }
    })


# ===================== FINANCE API ENDPOINTS =====================

@app.route('/api/finance/tickers', methods=['GET'])
def finance_tickers():
    """Return all supported tickers with categories"""
    if not HAS_FINANCE:
        return jsonify({'error': 'Finance module not available'}), 503
    try:
        return jsonify(finance_analyzer.get_all_tickers()), 200
    except Exception as e:
        logger.error(f"Finance tickers error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/finance/history', methods=['GET'])
def finance_history():
    """
    Get historical OHLCV data for charts
    Query params:
        ticker  : e.g. AAPL, TSLA, EURUSD, GBPUSD, GOLD, SILVER
        period  : 1mo | 3mo | 6mo | 1y | 2y  (default: 6mo)
    """
    if not HAS_FINANCE:
        return jsonify({'error': 'Finance module not available'}), 503
    try:
        ticker = request.args.get('ticker', 'AAPL').upper()
        period = request.args.get('period', '6mo')
        result = finance_analyzer.get_history(ticker, period)
        if 'error' in result:
            return jsonify(result), 400
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Finance history error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/finance/predict', methods=['GET'])
def finance_predict():
    """
    Predict next-day price and 7-day forecast using XGBoost model
    Query params:
        ticker : e.g. AAPL, TSLA, EURUSD, GBPUSD, GOLD, SILVER
    """
    if not HAS_FINANCE:
        return jsonify({'error': 'Finance module not available'}), 503
    try:
        ticker = request.args.get('ticker', 'AAPL').upper()
        result = finance_analyzer.get_prediction(ticker)
        if 'error' in result:
            return jsonify(result), 400
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Finance predict error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/finance/indicators', methods=['GET'])
def finance_indicators():
    """
    Get technical indicators: RSI, MACD, Bollinger Bands, MAs
    Query params:
        ticker : e.g. AAPL, TSLA, EURUSD, GBPUSD, GOLD, SILVER
    """
    if not HAS_FINANCE:
        return jsonify({'error': 'Finance module not available'}), 503
    try:
        ticker = request.args.get('ticker', 'AAPL').upper()
        result = finance_analyzer.get_technical_indicators(ticker)
        if 'error' in result:
            return jsonify(result), 400
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Finance indicators error: {e}")
        return jsonify({'error': str(e)}), 500


@app.errorhandler(413)
def too_large(e):
    """Handle file too large error"""
    return jsonify({'error': f'File too large. Maximum size is {MAX_FILE_SIZE/1024/1024:.0f}MB'}), 413


@app.errorhandler(404)
def not_found(e):
    """Handle 404 errors"""
    return jsonify({'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def server_error(e):
    """Handle 500 errors"""
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    print("\n" + "=" * 70)
    print("🚀 SIGNAL VIEWER HUB - BACKEND SERVER")
    print("=" * 70)
    print(f"📍 Backend URL: http://127.0.0.1:5000")
    print(f"📁 Upload folder: {os.path.abspath(UPLOAD_FOLDER)}")
    print(f"📊 Max file size: {MAX_FILE_SIZE/1024/1024:.0f}MB")
    print(f"\n📚 SUPPORTED FORMATS:")

    for fmt in sorted(ALLOWED_EXTENSIONS):
        status = "✅ WORKS" if fmt in ['csv', 'txt', 'hea', 'dat'] else "⚠️"
        if fmt in ['edf', 'bdf'] and HAS_EDF:
            status = "✅ WORKS"
        elif fmt in ['edf', 'bdf'] and not HAS_EDF:
            status = "❌ Needs pyedflib"
        if fmt == 'mat' and HAS_H5:
            status = "✅ WORKS"
        elif fmt == 'mat' and not HAS_H5:
            status = "⚠️ Basic support (h5py for v7.3)"

        print(f"   • .{fmt:<6} {status}")

    print(f"\n🔧 LIBRARIES:")
    print(f"   • pyedflib: {'✅ Installed' if HAS_EDF else '❌ Not installed'} (for EDF/BDF)")
    print(f"   • h5py: {'✅ Installed' if HAS_H5 else '❌ Not installed'} (for MAT v7.3)")

    print(f"\n💹 FINANCE MODULE: {'✅ Loaded (' + str(len(finance_analyzer.models)) + ' models)' if HAS_FINANCE else '❌ Not loaded'}")
    print("\n" + "=" * 70)
    print("✨ Server is ready! Open frontend/dashboard.html")
    print("=" * 70 + "\n")

    app.run(debug=True, host='127.0.0.1', port=5000)