"""
Signal Viewer Hub - Complete Backend Server
Medical (ECG/EEG), Acoustic, Finance, Microbiome modules
Full support for all file formats: CSV, EDF, BDF, MAT, WFDB, DAT, TXT, WAV, MP3
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import logging
import numpy as np
import scipy.io as sio
import csv
from werkzeug.utils import secure_filename
import traceback
from datetime import datetime, timedelta
import yfinance as yf
import requests

# ── optional libraries ──────────────────────────────────────────────────────
try:
    import pyedflib
    HAS_EDF = True
except ImportError:
    HAS_EDF = False
    print("⚠️ pyedflib not installed – EDF/BDF support disabled. Install with: pip install pyedflib")

try:
    import h5py
    HAS_H5 = True
except ImportError:
    HAS_H5 = False
    print("⚠️ h5py not installed – some MAT files may fail. Install with: pip install h5py")

try:
    import wfdb
    HAS_WFDB = True
except ImportError:
    HAS_WFDB = False
    print("⚠️ wfdb not installed – WFDB support disabled. Install with: pip install wfdb")

try:
    import soundfile as sf
    HAS_SOUNDFILE = True
except ImportError:
    HAS_SOUNDFILE = False
    print("⚠️ soundfile not installed – audio support limited. Install with: pip install soundfile")

try:
    from scipy import signal as sp_signal
    from scipy.fft import fft, fftfreq
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False
    print("⚠️ scipy not installed – some analysis disabled")

# ── local modules ───────────────────────────────────────────────────────────
from modules.acoustic import AcousticAnalyzer
from modules.finance import FinanceAnalyzer
from modules.microbiome import MicrobiomeAnalyzer
from modules.ecg.ecg_inference import ECGClassifier
from modules.eeg.eeg_inference import EEGClassifier
from file_parsers import FileParser
from signal_analysis import SignalAnalysis

# ── configuration ───────────────────────────────────────────────────────────
UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {"csv", "edf", "bdf", "mat", "hea", "dat", "txt", "wav", "mp3"}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB

app = Flask(__name__)

# CORS configuration
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
        "expose_headers": ["Content-Type", "X-Requested-With"],
        "supports_credentials": False,
        "max_age": 3600
    }
})

@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        response = app.make_default_options_response()
        return response

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_SIZE
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Initialize analyzers
acoustic_analyzer = AcousticAnalyzer()
finance_analyzer = FinanceAnalyzer()
microbiome_analyzer = MicrobiomeAnalyzer()
ecg_classifier = ECGClassifier(model_path='modules/ecg/models/ecg_model.hdf5')
eeg_classifier = EEGClassifier(model_path='modules/eeg/models/EEG_MODEL.h5')
file_parser = FileParser()
signal_analyzer = SignalAnalysis()

# ── helpers ─────────────────────────────────────────────────────────────────
class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, (np.integer, np.int64)):
            return int(obj)
        if isinstance(obj, (np.floating, np.float64)):
            return float(obj)
        if isinstance(obj, np.bool_):
            return bool(obj)
        return super().default(obj)

app.json_encoder = NumpyEncoder

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def calc_sync_matrix(data):
    """Calculate correlation matrix between channels"""
    try:
        arr = np.array(data, dtype=float)
        if arr.ndim == 1:
            arr = arr[np.newaxis, :]

        # Limit samples for performance
        if arr.shape[1] > 5000:
            arr = arr[:, :5000]

        if arr.shape[0] == 1:
            return [[1.0]]

        corr = np.corrcoef(arr)
        corr = np.nan_to_num(corr, nan=0.0, posinf=1.0, neginf=-1.0)
        return [[float(v) for v in row] for row in corr]
    except Exception as e:
        logger.error(f"Sync matrix error: {str(e)}")
        n = len(data)
        return [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]

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

# ── file parsers ─────────────────────────────────────────────────────────────

def parse_csv_file(filepath):
    """Parse CSV/TXT file into signal data"""
    try:
        logger.info(f"Parsing CSV file: {filepath}")

        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            first_line = f.readline().strip()
            f.seek(0)

            if not first_line:
                return {"error": "CSV file is empty"}

            # Detect delimiter
            delimiter = ","
            for d in [",", "\t", ";"]:
                if d in first_line:
                    delimiter = d
                    break

            reader = csv.reader(f, delimiter=delimiter)
            first_row = next(reader, [])

            # Check if first row contains headers (non-numeric)
            has_headers = False
            try:
                [float(x) for x in first_row if x.strip()]
                has_headers = False
            except (ValueError, TypeError):
                has_headers = True

            # Reset reader
            f.seek(0)
            reader = csv.reader(f, delimiter=delimiter)

            if has_headers:
                headers = [h.strip() for h in next(reader, []) if h.strip()]
            else:
                headers = None
                f.seek(0)
                reader = csv.reader(f, delimiter=delimiter)

            rows = list(reader)

        if not rows:
            return {"error": "CSV file has no data rows"}

        # Determine number of columns
        num_cols = max(len(row) for row in rows) if rows else 0

        # Create channel names
        if has_headers and headers:
            channels = headers
        else:
            channels = [f"CH{i+1}" for i in range(num_cols)]

        # Detect time column (first column numeric and increasing)
        try:
            first_vals = []
            for row in rows[:10]:
                if row and row[0].strip():
                    first_vals.append(float(row[0]))
            is_time = len(first_vals) > 1 and all(
                first_vals[i] <= first_vals[i + 1] for i in range(len(first_vals) - 1)
            )
        except (ValueError, IndexError):
            is_time = False

        if is_time and len(channels) > 1:
            # First column is time
            time_channels = channels[1:] if len(channels) > 1 else []
            time = []
            data = [[] for _ in range(len(time_channels))]

            for row in rows:
                if len(row) > len(time_channels):
                    try:
                        time.append(float(row[0]))
                        for i, val in enumerate(row[1:len(time_channels) + 1]):
                            try:
                                data[i].append(float(val) if val.strip() else 0.0)
                            except (ValueError, TypeError):
                                data[i].append(0.0)
                    except (ValueError, IndexError):
                        continue

            if not time:
                time = [i / 250.0 for i in range(len(rows))]
                data = [[] for _ in range(len(channels))]
                for row in rows:
                    for i, val in enumerate(row[:len(channels)]):
                        try:
                            data[i].append(float(val) if val.strip() else 0.0)
                        except (ValueError, TypeError):
                            data[i].append(0.0)
        else:
            time = [i / 250.0 for i in range(len(rows))]
            data = [[] for _ in range(len(channels))]

            for row in rows:
                for i, val in enumerate(row[:len(channels)]):
                    try:
                        data[i].append(float(val) if val.strip() else 0.0)
                    except (ValueError, TypeError):
                        data[i].append(0.0)

        if not data or len(data[0]) == 0:
            return {"error": "No valid numeric data found in CSV"}

        # Remove empty channels
        valid_data = []
        valid_channels = []
        for i, ch_data in enumerate(data):
            if any(v != 0 for v in ch_data[:200]):
                valid_data.append(ch_data)
                valid_channels.append(channels[i] if i < len(channels) else f"CH{i + 1}")

        if not valid_data:
            valid_data = data
            valid_channels = channels

        logger.info(f"✓ CSV parsed: {len(valid_channels)} channels, {len(time)} samples")

        return {
            "success": True,
            "channels": valid_channels,
            "data": valid_data,
            "time": time,
            "num_channels": len(valid_channels),
            "num_samples": len(time),
            "sampling_rate": 250,
            "file_type": "csv"
        }

    except Exception as e:
        logger.error(f"CSV parse error: {str(e)}", exc_info=True)
        return {"error": f"CSV file format is incorrect: {str(e)}"}

def parse_edf_file(filepath):
    """Parse EDF (European Data Format) file"""
    if not HAS_EDF:
        return {"error": "EDF support requires pyedflib. Install with: pip install pyedflib"}

    try:
        logger.info(f"Parsing EDF file: {filepath}")

        f = pyedflib.EdfReader(filepath)
        n_channels = f.signals_in_file

        if n_channels == 0:
            return {"error": "EDF file has no signals"}

        channels = f.getSignalLabels()

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

        f._close()

        if num_samples == 0:
            return {"error": "No data read from EDF file"}

        # Pad channels to same length
        for i in range(len(data)):
            if len(data[i]) < num_samples:
                data[i] = data[i] + [0.0] * (num_samples - len(data[i]))

        time = [i / sampling_rate for i in range(num_samples)]

        logger.info(f"✓ EDF parsed: {len(channels)} channels, {num_samples} samples")

        return {
            "success": True,
            "channels": channels,
            "data": data,
            "time": time,
            "num_channels": len(data),
            "num_samples": num_samples,
            "sampling_rate": float(sampling_rate),
            "file_type": "edf"
        }

    except Exception as e:
        logger.error(f"EDF parse error: {str(e)}", exc_info=True)
        return {"error": f"EDF file format is incorrect: {str(e)}"}

def parse_bdf_file(filepath):
    """Parse BDF (BioSemi Data Format) file"""
    if not HAS_EDF:
        return {"error": "BDF support requires pyedflib. Install with: pip install pyedflib"}

    try:
        logger.info(f"Parsing BDF file: {filepath}")

        f = pyedflib.EdfReader(filepath)
        n_channels = f.signals_in_file

        if n_channels == 0:
            return {"error": "BDF file has no signals"}

        channels = f.getSignalLabels()

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

        f._close()

        if num_samples == 0:
            return {"error": "No data read from BDF file"}

        for i in range(len(data)):
            if len(data[i]) < num_samples:
                data[i] = data[i] + [0.0] * (num_samples - len(data[i]))

        time = [i / sampling_rate for i in range(num_samples)]

        logger.info(f"✓ BDF parsed: {len(channels)} channels, {num_samples} samples")

        return {
            "success": True,
            "channels": channels,
            "data": data,
            "time": time,
            "num_channels": len(data),
            "num_samples": num_samples,
            "sampling_rate": float(sampling_rate),
            "file_type": "bdf"
        }

    except Exception as e:
        logger.error(f"BDF parse error: {str(e)}", exc_info=True)
        return {"error": f"BDF file format is incorrect: {str(e)}"}

def parse_mat_file(filepath):
    """Parse MATLAB .mat file"""
    try:
        logger.info(f"Parsing MAT file: {filepath}")

        mat_data = None

        try:
            mat_data = sio.loadmat(filepath, squeeze_me=True)
            logger.info(f"Loaded with scipy, keys: {list(mat_data.keys())}")
        except Exception as e:
            logger.warning(f"scipy load failed: {str(e)}")

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
                return {"error": "MAT file format not recognized. Install h5py for newer MAT files: pip install h5py"}
            return {"error": "MAT file format is incorrect - not a valid MATLAB file"}

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
            return {"error": f'No signal data found in MAT file. Available variables: {", ".join(found_keys[:10])}'}

        logger.info(f"Using key: {signal_key}, shape: {signal_array.shape}")

        if len(signal_array.shape) == 3:
            if signal_array.shape[2] > 1:
                signal_array = np.mean(signal_array, axis=2)
            else:
                signal_array = signal_array[:, :, 0]

        if signal_array.shape[0] > signal_array.shape[1]:
            signal_array = signal_array.T

        max_samples = 100000
        if signal_array.shape[1] > max_samples:
            signal_array = signal_array[:, :max_samples]

        if signal_array.shape[0] == 0 or signal_array.shape[1] == 0:
            return {"error": "Signal array is empty"}

        num_channels, num_samples = signal_array.shape

        channels = [f"CH{i + 1}" for i in range(num_channels)]

        sampling_rate = 250
        time = [i / sampling_rate for i in range(num_samples)]

        data = []
        for row in signal_array:
            data.append([float(x) for x in row])

        logger.info(f"✓ MAT parsed: {num_channels} channels, {num_samples} samples")

        return {
            "success": True,
            "channels": channels,
            "data": data,
            "time": time,
            "num_channels": num_channels,
            "num_samples": num_samples,
            "sampling_rate": sampling_rate,
            "file_type": "mat"
        }

    except Exception as e:
        logger.error(f"MAT parse error: {str(e)}", exc_info=True)
        return {"error": f"MAT file format is incorrect: {str(e)}"}

def parse_wfdb_file(filepath):
    """Parse WFDB format (.hea + .dat pair)"""
    if not HAS_WFDB:
        return {"error": "WFDB support requires wfdb. Install with: pip install wfdb"}

    try:
        if filepath.endswith('.hea'):
            base_path = filepath[:-4]
        elif filepath.endswith('.dat'):
            base_path = filepath[:-4]
        else:
            base_path = filepath.rsplit('.', 1)[0]

        logger.info(f"Parsing WFDB files with base: {base_path}")

        record = wfdb.rdrecord(base_path)

        data = record.p_signal.T.tolist()
        channels = record.sig_name
        fs = float(record.fs)
        num_samples = record.sig_len
        num_channels = record.n_sig

        time = [i / fs for i in range(num_samples)]

        logger.info(f"✓ WFDB parsed: {num_channels} channels, {num_samples} samples")

        return {
            "success": True,
            "channels": channels,
            "data": data,
            "time": time,
            "num_channels": num_channels,
            "num_samples": num_samples,
            "sampling_rate": fs,
            "file_type": "wfdb"
        }

    except Exception as e:
        logger.error(f"WFDB parse error: {str(e)}", exc_info=True)
        return {"error": f"WFDB file format is incorrect: {str(e)}"}

def parse_binary_file(filepath):
    """Parse generic binary .dat file"""
    try:
        logger.info(f"Parsing binary file: {filepath}")

        with open(filepath, 'rb') as f:
            data_bytes = np.fromfile(f, dtype=np.int16)

        if len(data_bytes) == 0:
            return {"error": "Binary file is empty"}

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
            return {"error": "No valid data after truncation"}

        num_samples = len(data_bytes) // best_channels
        data_array = data_bytes.reshape(best_channels, num_samples)

        channels = [f"CH{i + 1}" for i in range(best_channels)]
        sampling_rate = 250
        time = [i / sampling_rate for i in range(num_samples)]

        data = []
        for row in data_array:
            data.append([float(x) for x in row])

        logger.info(f"✓ Binary parsed: {best_channels} channels, {num_samples} samples")

        return {
            "success": True,
            "channels": channels,
            "data": data,
            "time": time,
            "num_channels": best_channels,
            "num_samples": num_samples,
            "sampling_rate": sampling_rate,
            "file_type": "binary"
        }

    except Exception as e:
        logger.error(f"Binary parse error: {str(e)}", exc_info=True)
        return {"error": f"Binary file format is incorrect: {str(e)}"}

def parse_audio_file(filepath):
    """Parse audio file (WAV, MP3)"""
    if not HAS_SOUNDFILE:
        return {"error": "Audio support requires soundfile. Install with: pip install soundfile"}

    try:
        logger.info(f"Parsing audio file: {filepath}")

        data, samplerate = sf.read(filepath)

        if len(data.shape) > 1:
            data = np.mean(data, axis=1)

        channels = ['Audio']
        data_list = [data.tolist()]
        time = list(np.arange(len(data)) / samplerate)

        return {
            "success": True,
            "channels": channels,
            "data": data_list,
            "time": time,
            "num_channels": 1,
            "num_samples": len(data),
            "sampling_rate": samplerate,
            "file_type": "audio"
        }

    except Exception as e:
        logger.error(f"Audio parse error: {str(e)}")
        return {"error": f"Audio file format is incorrect: {str(e)}"}

# ── generic routes ────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET", "OPTIONS"])
def health():
    """Check if backend is running"""
    if request.method == 'OPTIONS':
        return '', 200
    return jsonify({
        "status": "ok",
        "backend": "running",
        "modules": ["ecg", "eeg", "acoustic", "finance", "microbiome"],
        "libraries": {
            "pyedflib": HAS_EDF,
            "h5py": HAS_H5,
            "wfdb": HAS_WFDB,
            "soundfile": HAS_SOUNDFILE
        },
        "formats_supported": list(ALLOWED_EXTENSIONS),
        "ecg_model_loaded": ecg_classifier.model_loaded if hasattr(ecg_classifier, 'model_loaded') else False,
        "eeg_model_loaded": eeg_classifier.model_loaded if hasattr(eeg_classifier, 'model_loaded') else False
    })

@app.route("/api/upload", methods=["POST", "OPTIONS"])
def upload_file():
    """Handle file upload and parse it"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        logger.info("=" * 60)
        logger.info("📥 Upload request received")
        logger.info("=" * 60)

        if "file" not in request.files:
            logger.error("No file in request")
            return jsonify({"error": "No file provided"}), 400

        file = request.files["file"]

        if file.filename == "":
            logger.error("Empty filename")
            return jsonify({"error": "No file selected"}), 400

        if not allowed_file(file.filename):
            logger.error(f"File type not allowed: {file.filename}")
            return jsonify({
                "error": f'File type not supported. Allowed formats: {", ".join(sorted(ALLOWED_EXTENSIONS))}'
            }), 400

        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(filepath)

        file_size = os.path.getsize(filepath)
        logger.info(f"File saved: {filename} ({file_size} bytes)")

        file_ext = filename.lower().rsplit(".", 1)[1].lower()
        logger.info(f"File format detected: .{file_ext}")

        if file_ext in ["csv", "txt"]:
            result = parse_csv_file(filepath)
        elif file_ext == "edf":
            result = parse_edf_file(filepath)
        elif file_ext == "bdf":
            result = parse_bdf_file(filepath)
        elif file_ext == "mat":
            result = parse_mat_file(filepath)
        elif file_ext in ["hea", "dat"]:
            if HAS_WFDB and (
                    file_ext == "hea" or (file_ext == "dat" and os.path.exists(filepath.replace(".dat", ".hea")))):
                result = parse_wfdb_file(filepath)
            else:
                result = parse_binary_file(filepath)
        elif file_ext in ["wav", "mp3"]:
            result = parse_audio_file(filepath)
        else:
            result = parse_binary_file(filepath)

        try:
            os.remove(filepath)
        except Exception:
            pass

        if isinstance(result, dict) and "error" in result:
            logger.error(f"Parse failed: {result['error']}")
            return jsonify({"error": result["error"]}), 400

        if not result or not result.get("success"):
            logger.error("Unknown parsing error")
            return jsonify({"error": "Failed to parse file. The file format may be incorrect or corrupted."}), 400

        logger.info("Calculating synchronization matrix...")
        result["sync_matrix"] = calc_sync_matrix(result["data"])

        logger.info(f"✓ SUCCESS: {result['num_channels']} channels, {result['num_samples']} samples")
        logger.info("=" * 60)

        return jsonify({
            "status": "success",
            "signal_data": result
        }), 200

    except Exception as e:
        logger.error(f"✗ Upload error: {str(e)}", exc_info=True)
        logger.error(traceback.format_exc())
        logger.error("=" * 60)
        return jsonify({"error": f"Server error: {str(e)}"}), 500

@app.route("/api/analyze", methods=["POST", "OPTIONS"])
def analyze():
    """Perform advanced analysis on signal data"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        body = request.get_json()
        sd = body.get("signal_data", {})
        results = signal_analyzer.analyze(sd)
        return jsonify({"status": "success", "results": results}), 200
    except Exception as e:
        logger.error(f"Analysis error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/filter", methods=["POST", "OPTIONS"])
def apply_filter():
    """Apply digital filter to signal"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        body = request.get_json()
        filtered = signal_analyzer.apply_filter(
            body.get("signal", []),
            body.get("filter_type", "lowpass"),
            body.get("cutoff", 50),
            body.get("order", 4)
        )
        return jsonify({"status": "success", "filtered_signal": filtered}), 200
    except Exception as e:
        logger.error(f"Filter error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/wavelet", methods=["POST", "OPTIONS"])
def wavelet():
    """Compute wavelet transform"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        body = request.get_json()
        results = signal_analyzer.compute_wavelet(body.get("signal_data", {}))
        return jsonify({"status": "success", "wavelet": results}), 200
    except Exception as e:
        logger.error(f"Wavelet error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/supported-formats", methods=["GET", "OPTIONS"])
def supported_formats():
    """List supported file formats with detailed information"""
    if request.method == 'OPTIONS':
        return '', 200

    return jsonify({
        "formats": sorted(list(ALLOWED_EXTENSIONS)),
        "details": {
            "csv": "Comma-separated values (Time, CH1, CH2, ...) - WORKS",
            "txt": "Tab or space separated values - WORKS",
            "edf": "European Data Format (EEG/ECG)" + (" - WORKS" if HAS_EDF else " - requires pyedflib"),
            "bdf": "BioSemi Data Format" + (" - WORKS" if HAS_EDF else " - requires pyedflib"),
            "mat": "MATLAB format (.mat files)" + (" - WORKS" if HAS_H5 else " - requires h5py for v7.3"),
            "hea": "WFDB header file (with .dat pair)" + (" - WORKS" if HAS_WFDB else " - requires wfdb"),
            "dat": "Binary data file or WFDB data" + (" - WORKS" if HAS_WFDB else " - basic binary support"),
            "wav": "Audio file format (WAV)" + (" - WORKS" if HAS_SOUNDFILE else " - requires soundfile"),
            "mp3": "Compressed audio format (MP3)" + (" - WORKS" if HAS_SOUNDFILE else " - requires soundfile")
        },
        "installation": {
            "pyedflib": "pip install pyedflib",
            "h5py": "pip install h5py",
            "wfdb": "pip install wfdb",
            "soundfile": "pip install soundfile"
        },
        "libraries": {
            "pyedflib": HAS_EDF,
            "h5py": HAS_H5,
            "wfdb": HAS_WFDB,
            "soundfile": HAS_SOUNDFILE
        }
    })

# ════════════════════════════════════════════════════════════════════════════
#  ECG ENDPOINTS (6 types)
# ════════════════════════════════════════════════════════════════════════════

@app.route("/api/ecg/analyze", methods=["POST", "OPTIONS"])
def ecg_analyze():
    """Multi-channel ECG abnormality detection"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = request.get_json(force=True)
        signal_data = data.get("signal_data")

        if not signal_data:
            return jsonify({"error": "signal_data required"}), 400

        ai_result = ecg_classifier.predict(signal_data)
        classic_result = ecg_classifier.classic_ml_detection(signal_data)

        return jsonify({
            "status": "success",
            "ai_detection": ai_result,
            "classic_comparison": classic_result
        }), 200

    except Exception as e:
        logger.error(f"ECG analyze error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route("/api/ecg/xor", methods=["POST", "OPTIONS"])
def ecg_xor():
    """XOR graph for ECG with colormap control"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = request.get_json()
        signal_data = data.get("signal_data")
        chunk_size = int(data.get("chunk_size", 250))
        channel_idx = int(data.get("channel_idx", 0))
        colormap = data.get("colormap", "Hot")

        result = signal_analyzer.compute_xor_graph(signal_data, chunk_size, channel_idx, colormap)
        return jsonify({"status": "success", "xor": result}), 200

    except Exception as e:
        logger.error(f"XOR error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/ecg/polar", methods=["POST", "OPTIONS"])
def ecg_polar():
    """Polar plot for ECG"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = request.get_json()
        signal_data = data.get("signal_data")
        channel_idx = int(data.get("channel_idx", 0))
        period = int(data.get("period", 100))
        mode = data.get("mode", "cumulative")

        result = signal_analyzer.compute_polar_plot(signal_data, channel_idx, period, mode)
        return jsonify({"status": "success", "polar": result}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/ecg/recurrence", methods=["POST", "OPTIONS"])
def ecg_recurrence():
    """Recurrence plot for ECG"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = request.get_json()
        signal_data = data.get("signal_data")
        ch_x = int(data.get("ch_x", 0))
        ch_y = int(data.get("ch_y", 1))
        threshold = float(data.get("threshold", 0.5))

        result = signal_analyzer.compute_recurrence_plot(signal_data, ch_x, ch_y, threshold)
        return jsonify({"status": "success", "recurrence": result}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/ecg/abnormalities", methods=["GET", "OPTIONS"])
def ecg_abnormalities():
    """Get list of ECG abnormality types (6 types)"""
    if request.method == 'OPTIONS':
        return '', 200

    return jsonify({
        "status": "success",
        "abnormalities": ecg_classifier.get_abnormality_types()
    })

@app.route("/api/ecg/info", methods=["GET", "OPTIONS"])
def ecg_info():
    """Get ECG model info"""
    if request.method == 'OPTIONS':
        return '', 200

    return jsonify({
        "status": "success",
        "model_loaded": ecg_classifier.model_loaded if hasattr(ecg_classifier, 'model_loaded') else False,
        "model_path": ecg_classifier.model_path if hasattr(ecg_classifier, 'model_path') else "",
        "num_classes": ecg_classifier.num_classes if hasattr(ecg_classifier, 'num_classes') else 0,
        "abnormalities": ecg_classifier.get_abnormality_types() if hasattr(ecg_classifier, 'get_abnormality_types') else []
    })

@app.route("/api/ecg/simulate", methods=["POST", "OPTIONS"])
def ecg_simulate():
    """Generate synthetic ECG for testing"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = request.get_json()
        abnormality = data.get("abnormality", "normal")
        duration = float(data.get("duration", 10))
        fs = float(data.get("fs", 250))
        n_channels = int(data.get("n_channels", 8))

        signal_data = ecg_classifier.simulate_ecg(abnormality, duration, fs, n_channels)
        signal_data["sync_matrix"] = calc_sync_matrix(signal_data["data"])

        return jsonify({
            "status": "success",
            "signal_data": signal_data
        }), 200

    except Exception as e:
        logger.error(f"ECG simulate error: {e}")
        return jsonify({"error": str(e)}), 500

# ════════════════════════════════════════════════════════════════════════════
#  EEG ENDPOINTS (4 types)
# ════════════════════════════════════════════════════════════════════════════

@app.route("/api/eeg/analyze", methods=["POST", "OPTIONS"])
def eeg_analyze():
    """Multi-channel EEG abnormality detection"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = request.get_json(force=True)
        signal_data = data.get("signal_data")

        if not signal_data:
            return jsonify({"error": "signal_data required"}), 400

        ai_result = eeg_classifier.predict(signal_data)
        classic_result = eeg_classifier.classic_ml_detection(signal_data)

        return jsonify({
            "status": "success",
            "ai_detection": ai_result,
            "classic_comparison": classic_result
        }), 200

    except Exception as e:
        logger.error(f"EEG analyze error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route("/api/eeg/xor", methods=["POST", "OPTIONS"])
def eeg_xor():
    """XOR graph for EEG with colormap control"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = request.get_json()
        signal_data = data.get("signal_data")
        chunk_size = int(data.get("chunk_size", 250))
        channel_idx = int(data.get("channel_idx", 0))
        colormap = data.get("colormap", "Hot")

        result = signal_analyzer.compute_xor_graph(signal_data, chunk_size, channel_idx, colormap)
        return jsonify({"status": "success", "xor": result}), 200

    except Exception as e:
        logger.error(f"XOR error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/eeg/polar", methods=["POST", "OPTIONS"])
def eeg_polar():
    """Polar plot for EEG"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = request.get_json()
        signal_data = data.get("signal_data")
        channel_idx = int(data.get("channel_idx", 0))
        period = int(data.get("period", 100))
        mode = data.get("mode", "cumulative")

        result = signal_analyzer.compute_polar_plot(signal_data, channel_idx, period, mode)
        return jsonify({"status": "success", "polar": result}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/eeg/recurrence", methods=["POST", "OPTIONS"])
def eeg_recurrence():
    """Recurrence plot for EEG"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = request.get_json()
        signal_data = data.get("signal_data")
        ch_x = int(data.get("ch_x", 0))
        ch_y = int(data.get("ch_y", 1))
        threshold = float(data.get("threshold", 0.5))

        result = signal_analyzer.compute_recurrence_plot(signal_data, ch_x, ch_y, threshold)
        return jsonify({"status": "success", "recurrence": result}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/eeg/abnormalities", methods=["GET", "OPTIONS"])
def eeg_abnormalities():
    """Get list of EEG abnormality types (4 types)"""
    if request.method == 'OPTIONS':
        return '', 200

    return jsonify({
        "status": "success",
        "abnormalities": eeg_classifier.get_abnormality_types()
    })

@app.route("/api/eeg/info", methods=["GET", "OPTIONS"])
def eeg_info():
    """Get EEG model info"""
    if request.method == 'OPTIONS':
        return '', 200

    return jsonify({
        "status": "success",
        "model_loaded": eeg_classifier.model_loaded if hasattr(eeg_classifier, 'model_loaded') else False,
        "model_path": eeg_classifier.model_path if hasattr(eeg_classifier, 'model_path') else "",
        "num_classes": eeg_classifier.num_classes if hasattr(eeg_classifier, 'num_classes') else 0,
        "abnormalities": eeg_classifier.get_abnormality_types() if hasattr(eeg_classifier, 'get_abnormality_types') else []
    })

@app.route("/api/eeg/simulate", methods=["POST", "OPTIONS"])
def eeg_simulate():
    """Generate synthetic EEG for testing"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = request.get_json()
        abnormality = data.get("abnormality", "normal")
        duration = float(data.get("duration", 10))
        fs = float(data.get("fs", 250))
        n_channels = int(data.get("n_channels", 19))

        signal_data = eeg_classifier.simulate_eeg(abnormality, duration, fs, n_channels)
        signal_data["sync_matrix"] = calc_sync_matrix(signal_data["data"])

        return jsonify({
            "status": "success",
            "signal_data": signal_data
        }), 200

    except Exception as e:
        logger.error(f"EEG simulate error: {e}")
        return jsonify({"error": str(e)}), 500

# ════════════════════════════════════════════════════════════════════════════
#  ACOUSTIC SIGNALS - Doppler Effect & Drone Detection
# ════════════════════════════════════════════════════════════════════════════

@app.route("/api/acoustic/doppler/generate", methods=["POST", "OPTIONS"])
def generate_doppler():
    """Generate Doppler effect sound"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = request.get_json()
        frequency = float(data.get("frequency", 440))
        velocity = float(data.get("velocity", 30))
        duration = float(data.get("duration", 5))

        result = acoustic_analyzer.generate_doppler_sound(frequency, velocity, duration)
        return jsonify({"status": "success", "audio": result}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/acoustic/doppler/estimate", methods=["POST", "OPTIONS"])
def estimate_velocity():
    """Estimate velocity from Doppler recording"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files["file"]
        original_freq = float(request.form.get("original_freq", 440))

        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(filepath)

        result = acoustic_analyzer.estimate_velocity(filepath, original_freq)

        try:
            os.remove(filepath)
        except:
            pass

        return jsonify({"status": "success", "estimation": result}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/acoustic/drone/detect", methods=["POST", "OPTIONS"])
def detect_drone():
    """Detect drone from audio file"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files["file"]
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(filepath)

        result = acoustic_analyzer.detect_drone(filepath)

        try:
            os.remove(filepath)
        except:
            pass

        return jsonify({"status": "success", "detection": result}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/acoustic/drone/simulate", methods=["POST", "OPTIONS"])
def simulate_drone():
    """Simulate drone sound for testing"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = request.get_json()
        duration = float(data.get("duration", 3))
        with_drone = data.get("with_drone", True)

        result = acoustic_analyzer.simulate_drone_sound(duration, with_drone)
        return jsonify({"status": "success", "audio": result}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ════════════════════════════════════════════════════════════════════════════
#  FINANCE SIGNALS - Stocks, Currencies, Minerals
# ════════════════════════════════════════════════════════════════════════════

@app.route("/api/finance/stock/<symbol>", methods=["GET", "OPTIONS"])
def get_stock_data(symbol):
    """Get stock market data"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        period = request.args.get("period", "3mo")
        data = finance_analyzer.get_stock_data(symbol, period)
        return jsonify({"status": "success", "data": data}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/finance/currency/<pair>", methods=["GET", "OPTIONS"])
def get_currency_data(pair):
    """Get currency exchange data"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        period = request.args.get("period", "3mo")
        data = finance_analyzer.get_currency_data(pair, period)
        return jsonify({"status": "success", "data": data}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/finance/commodity/<name>", methods=["GET", "OPTIONS"])
def get_commodity_data(name):
    """Get commodity/mineral data"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        period = request.args.get("period", "3mo")
        data = finance_analyzer.get_commodity_data(name, period)
        return jsonify({"status": "success", "data": data}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/finance/predict", methods=["POST", "OPTIONS"])
def predict_prices():
    """Predict future prices"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = request.get_json()
        prices = data.get("prices", [])
        days = int(data.get("days", 5))

        prediction = finance_analyzer.predict_future(prices, days)
        return jsonify({"status": "success", "prediction": prediction}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/finance/stock/list", methods=["GET", "OPTIONS"])
def get_stock_list():
    """Get list of available stocks"""
    if request.method == 'OPTIONS':
        return '', 200

    stocks = [
        {"symbol": "AAPL", "name": "Apple Inc."},
        {"symbol": "GOOGL", "name": "Alphabet Inc."},
        {"symbol": "MSFT", "name": "Microsoft Corp."},
        {"symbol": "AMZN", "name": "Amazon.com Inc."},
        {"symbol": "TSLA", "name": "Tesla Inc."},
        {"symbol": "META", "name": "Meta Platforms Inc."},
        {"symbol": "NFLX", "name": "Netflix Inc."},
        {"symbol": "NVDA", "name": "NVIDIA Corp."}
    ]
    return jsonify({"status": "success", "stocks": stocks}), 200

@app.route("/api/finance/currency/list", methods=["GET", "OPTIONS"])
def get_currency_list():
    """Get list of available currency pairs"""
    if request.method == 'OPTIONS':
        return '', 200

    currencies = [
        {"pair": "EURUSD=X", "name": "EUR/USD"},
        {"pair": "GBPUSD=X", "name": "GBP/USD"},
        {"pair": "USDJPY=X", "name": "USD/JPY"},
        {"pair": "AUDUSD=X", "name": "AUD/USD"},
        {"pair": "USDCAD=X", "name": "USD/CAD"},
        {"pair": "USDCHF=X", "name": "USD/CHF"}
    ]
    return jsonify({"status": "success", "currencies": currencies}), 200

@app.route("/api/finance/commodity/list", methods=["GET", "OPTIONS"])
def get_commodity_list():
    """Get list of available commodities"""
    if request.method == 'OPTIONS':
        return '', 200

    commodities = [
        {"name": "GC=F", "display": "Gold"},
        {"name": "SI=F", "display": "Silver"},
        {"name": "CL=F", "display": "Crude Oil"},
        {"name": "NG=F", "display": "Natural Gas"},
        {"name": "ZC=F", "display": "Corn"},
        {"name": "ZW=F", "display": "Wheat"}
    ]
    return jsonify({"status": "success", "commodities": commodities}), 200

# ════════════════════════════════════════════════════════════════════════════
#  MICROBIOME SIGNALS
# ════════════════════════════════════════════════════════════════════════════

@app.route("/api/microbiome/analyze", methods=["POST", "OPTIONS"])
def analyze_microbiome():
    """Analyze microbiome sample"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = request.get_json()
        counts = data.get("counts", {})

        result = microbiome_analyzer.analyze_sample(counts)
        return jsonify({"status": "success", "analysis": result}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/microbiome/datasets", methods=["GET", "OPTIONS"])
def get_microbiome_datasets():
    """Get available microbiome datasets"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        datasets = microbiome_analyzer.get_available_datasets()
        return jsonify({"status": "success", "datasets": datasets}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/microbiome/sample/<dataset>", methods=["GET", "OPTIONS"])
def get_microbiome_sample(dataset):
    """Get sample from dataset"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        sample = microbiome_analyzer.get_sample_data(dataset)
        return jsonify({"status": "success", "sample": sample}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/microbiome/profile", methods=["POST", "OPTIONS"])
def estimate_patient_profile():
    """Estimate patient profile from microbiome data"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        data = request.get_json()
        counts = data.get("counts", {})

        profile = microbiome_analyzer.estimate_patient_profile(counts)
        return jsonify({"status": "success", "profile": profile}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/microbiome/diseases", methods=["GET", "OPTIONS"])
def get_disease_profiles():
    """Get disease profiles for microbiome"""
    if request.method == 'OPTIONS':
        return '', 200

    diseases = [
        {"name": "Healthy", "description": "Normal gut microbiome"},
        {"name": "IBD", "description": "Inflammatory Bowel Disease"},
        {"name": "Diabetes Type 2", "description": "T2D microbiome signature"},
        {"name": "Obesity", "description": "Obesity-associated microbiome"},
        {"name": "Rheumatoid Arthritis", "description": "RA microbiome profile"}
    ]
    return jsonify({"status": "success", "diseases": diseases}), 200

# ════════════════════════════════════════════════════════════════════════════
#  ERROR HANDLERS
# ════════════════════════════════════════════════════════════════════════════

@app.errorhandler(413)
def too_large(e):
    """Handle file too large error"""
    return jsonify({"error": f"File too large. Maximum size is {MAX_FILE_SIZE / 1024 / 1024:.0f}MB"}), 413

@app.errorhandler(404)
def not_found(e):
    """Handle 404 errors"""
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def server_error(e):
    """Handle 500 errors"""
    return jsonify({"error": "Internal server error"}), 500

# ── entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n" + "=" * 80)
    print("🚀 SIGNAL VIEWER HUB – COMPLETE BACKEND SERVER")
    print("=" * 80)
    print(f"📍 Backend URL: http://127.0.0.1:5000")
    print(f"📁 Upload folder: {os.path.abspath(UPLOAD_FOLDER)}")
    print(f"📊 Max file size: {MAX_FILE_SIZE / 1024 / 1024:.0f}MB")

    print(f"\n📚 SUPPORTED FORMATS:")
    for fmt in sorted(ALLOWED_EXTENSIONS):
        status = "✅ WORKS"
        if fmt in ["edf", "bdf"] and not HAS_EDF:
            status = "❌ Needs pyedflib"
        if fmt == "mat" and not HAS_H5:
            status = "⚠️ Basic support only (h5py for v7.3)"
        if fmt in ["hea", "dat"] and not HAS_WFDB:
            status = "⚠️ Basic binary only (wfdb for full support)"
        if fmt in ["wav", "mp3"] and not HAS_SOUNDFILE:
            status = "❌ Needs soundfile"
        print(f"   • .{fmt:<6} {status}")

    print(f"\n🔧 LIBRARIES INSTALLED:")
    print(f"   • pyedflib: {'✅' if HAS_EDF else '❌'} (for EDF/BDF)")
    print(f"   • h5py: {'✅' if HAS_H5 else '❌'} (for MAT v7.3)")
    print(f"   • wfdb: {'✅' if HAS_WFDB else '❌'} (for WFDB/PhysioBank)")
    print(f"   • soundfile: {'✅' if HAS_SOUNDFILE else '❌'} (for WAV/MP3)")

    print(f"\n❤️ ECG MODEL: {'✅ LOADED' if ecg_classifier.model_loaded else '❌ NOT LOADED'}")
    if ecg_classifier.model_loaded:
        print(f"   • Path: {ecg_classifier.model_path}")
        print(f"   • Classes: {ecg_classifier.num_classes}")
    print(f"\n⚕️ ECG ABNORMALITIES ({len(ecg_classifier.get_abnormality_types())} types):")
    for ab in ecg_classifier.get_abnormality_types():
        print(f"   • {ab['name']} - {ab['risk']}")

    print(f"\n🧠 EEG MODEL: {'✅ LOADED' if eeg_classifier.model_loaded else '❌ NOT LOADED'}")
    if eeg_classifier.model_loaded:
        print(f"   • Path: {eeg_classifier.model_path}")
        print(f"   • Classes: {eeg_classifier.num_classes}")
    print(f"\n🧠 EEG ABNORMALITIES ({len(eeg_classifier.get_abnormality_types())} types):")
    for ab in eeg_classifier.get_abnormality_types():
        print(f"   • {ab['name']} - {ab['risk']}")

    print("\n" + "=" * 80)
    print("✨ Server is ready! Open frontend/dashboard.html")
    print("=" * 80 + "\n")

    app.run(debug=True, host="127.0.0.1", port=5000)