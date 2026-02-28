"""
Signal Viewer Hub — COMPLETE MERGED BACKEND SERVER
====================================================
All file formats: CSV, EDF, BDF, MAT, WFDB, DAT, TXT, WAV, MP3
"""

# ─────────────────────────── stdlib / third-party ────────────────────────────
from flask import Flask, request, jsonify
from flask_cors import CORS
import os, json, math, csv, traceback
import logging
import numpy as np
import scipy.io as sio
from werkzeug.utils import secure_filename


# ══════════════════════════ OPTIONAL LIBRARIES ════════════════════════════════

try:
    import pyedflib
    HAS_EDF = True
    EDF_BACKEND = 'pyedflib'
except ImportError:
    HAS_EDF = False
    EDF_BACKEND = None
    print("⚠ pyedflib not installed — trying edfio ...")

if not HAS_EDF:
    try:
        import edfio
        HAS_EDF = True
        EDF_BACKEND = 'edfio'
        print("✓ edfio found — EDF/BDF enabled")
    except ImportError:
        EDF_BACKEND = None
        print("⚠ No EDF library found. Install one of:\n"
              "  pip install edfio      (pure Python, easiest)\n"
              "  pip install pyedflib   (needs C compiler)")

try:
    import h5py
    HAS_H5 = True
except ImportError:
    HAS_H5 = False
    print("⚠ h5py not installed — MAT v7.3 may fail.    pip install h5py")

try:
    import wfdb
    HAS_WFDB = True
except ImportError:
    HAS_WFDB = False
    print("⚠ wfdb not installed — WFDB limited.         pip install wfdb")

try:
    import soundfile as sf
    HAS_SOUNDFILE = True
except ImportError:
    HAS_SOUNDFILE = False
    print("⚠ soundfile not installed — audio limited.   pip install soundfile")

# ══════════════════════════ MODULE IMPORTS ════════════════════════════════════

# ── Acoustic ──────────────────────────────────────────────────────────────────
try:
    from modules.acoustic import AcousticAnalyzer
    acoustic_analyzer = AcousticAnalyzer()
    HAS_ACOUSTIC = True
    print("✓ Acoustic module loaded")
except Exception as e:
    HAS_ACOUSTIC = False
    acoustic_analyzer = None
    print(f"✗ Acoustic module failed: {e}")

# ── Finance ───────────────────────────────────────────────────────────────────
try:
    from modules.finance import FinanceAnalyzer
    finance_analyzer = FinanceAnalyzer()
    HAS_FINANCE = True
    print("✓ Finance module loaded")
except Exception as e:
    HAS_FINANCE = False
    finance_analyzer = None
    print(f"✗ Finance module failed: {e}")

# ── Microbiome ────────────────────────────────────────────────────────────────
try:
    from modules.microbiome import MicrobiomeAnalyzer
    micro_analyzer = MicrobiomeAnalyzer()
    HAS_MICROBIOME = True
    print("✓ Microbiome module loaded")
except Exception as e:
    HAS_MICROBIOME = False
    micro_analyzer = None
    print(f"✗ Microbiome module failed: {e}")

# ── ECG ───────────────────────────────────────────────────────────────────────
try:
    from modules.ecg.ecg_inference import ECGClassifier
    ecg_classifier = ECGClassifier(model_path='modules/ecg/models/ecg_model.hdf5')
    HAS_ECG = True
    print("✓ ECG module loaded")
except Exception as e:
    HAS_ECG = False
    ecg_classifier = None
    print(f"✗ ECG module failed: {e}")

# ── EEG ───────────────────────────────────────────────────────────────────────
try:
    from modules.eeg.eeg_inference import EEGClassifier
    eeg_classifier = EEGClassifier(model_path='modules/eeg/models/EEG_MODEL.pkl')
    HAS_EEG = True
    print("✓ EEG module loaded")
except Exception as e:
    HAS_EEG = False
    eeg_classifier = None
    print(f"✗ EEG module failed: {e}")

# ── Signal Analysis ────────────────────────────────────────────────────────────
try:
    from signal_analysis import SignalAnalysis
    signal_analyzer = SignalAnalysis()
    HAS_SIGNAL_ANALYSIS = True
    print("✓ SignalAnalysis loaded")
except Exception as e:
    HAS_SIGNAL_ANALYSIS = False
    signal_analyzer = None
    print(f"✗ SignalAnalysis failed: {e}")

# ── File Parser ────────────────────────────────────────────────────────────────
try:
    from file_parsers import FileParser
    file_parser = FileParser()
    HAS_FILE_PARSER = True
    print("✓ FileParser loaded")
except Exception as e:
    HAS_FILE_PARSER = False
    file_parser = None
    print(f"✗ FileParser not available (using built-in parsers)")

# ══════════════════════════ FLASK APP SETUP ═══════════════════════════════════

UPLOAD_FOLDER      = 'uploads'
ALLOWED_EXTENSIONS = {'csv', 'edf', 'bdf', 'mat', 'hea', 'dat', 'txt', 'wav', 'mp3'}
MAX_FILE_SIZE      = 500 * 1024 * 1024   # 500 MB

app = Flask(__name__)

# Full CORS — handles pre-flight from any browser origin
CORS(app, resources={r"/*": {
    "origins": "*",
    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    "max_age": 3600
}})

@app.before_request
def handle_preflight():
    if request.method == 'OPTIONS':
        return '', 200

app.config['UPLOAD_FOLDER']      = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ══════════════════════════ JSON ENCODER ══════════════════════════════════════

class NumpyEncoder(json.JSONEncoder):
    """Handles NumPy types AND sanitises NaN/Inf so JSON stays valid."""
    def default(self, obj):
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            v = float(obj)
            return 0.0 if (math.isnan(v) or math.isinf(v)) else v
        if isinstance(obj, np.bool_):
            return bool(obj)
        return super().default(obj)

    def encode(self, obj):
        def _san(o):
            if isinstance(o, float) and (math.isnan(o) or math.isinf(o)):
                return 0.0
            if isinstance(o, dict):  return {k: _san(v) for k, v in o.items()}
            if isinstance(o, list):  return [_san(v) for v in o]
            return o
        return super().encode(_san(obj))

app.json_encoder = NumpyEncoder


# ══════════════════════════ HELPERS ═══════════════════════════════════════════

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_temp(file):
    fp = os.path.join(UPLOAD_FOLDER, secure_filename(file.filename))
    file.save(fp)
    return fp

def rm(fp):
    try: os.remove(fp)
    except: pass

def calc_sync_matrix(data):
    try:
        arr = np.array(data, dtype=float)
        if arr.ndim == 1: arr = arr[np.newaxis, :]
        if arr.shape[0] == 1: return [[1.0]]
        if arr.shape[1] > 5000: arr = arr[:, :5000]
        c = np.nan_to_num(np.corrcoef(arr), nan=0.0, posinf=1.0, neginf=-1.0)
        return [[float(v) for v in row] for row in c]
    except Exception as e:
        logger.error(f"Sync matrix error: {e}")
        n = len(data)
        return [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]


# ══════════════════════════ FILE PARSERS ══════════════════════════════════════

def _extract_numeric(obj, depth=5):
    if depth <= 0: return None
    if isinstance(obj, np.ndarray):
        if obj.dtype != object: return obj.astype(float)
        return _extract_numeric(obj.flat[0], depth-1) if obj.size else None
    if isinstance(obj, (list, tuple)) and obj:
        return _extract_numeric(obj[0], depth-1)
    return None


def parse_csv_file(filepath):
    """Parse CSV/TXT — handles headers or no headers, auto-detects delimiter."""
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            first_line = f.readline().strip()
            f.seek(0)
            if not first_line:
                return {'error': 'CSV file is empty'}

            delim = ','
            for d in [',', '\t', ';']:
                if d in first_line:
                    delim = d
                    break

            reader    = csv.reader(f, delimiter=delim)
            first_row = next(reader, [])

            # Detect whether first row is headers (non-numeric) or data
            try:
                [float(x) for x in first_row if x.strip()]
                has_headers = False
            except ValueError:
                has_headers = True

            f.seek(0)
            reader = csv.reader(f, delimiter=delim)

            if has_headers:
                headers = [h.strip() for h in next(reader, []) if h.strip()]
            else:
                headers = None

            rows = list(reader)

        if not rows:
            return {'error': 'CSV file has no data rows'}

        num_cols = max((len(r) for r in rows), default=0)
        channels = headers if (has_headers and headers) \
                   else [f"CH{i+1}" for i in range(num_cols)]

        # Detect time column (numeric and monotonically increasing)
        try:
            fv = [float(r[0]) for r in rows[:10] if r and r[0].strip()]
            is_time = len(fv) > 1 and all(fv[i] <= fv[i+1] for i in range(len(fv)-1))
        except:
            is_time = False

        if is_time and len(channels) > 1:
            ch_names = channels[1:]
            time, data = [], [[] for _ in ch_names]
            for row in rows:
                if len(row) > len(ch_names):
                    try:
                        time.append(float(row[0]))
                        for i, v in enumerate(row[1:len(ch_names)+1]):
                            try:    data[i].append(float(v) if v.strip() else 0.0)
                            except: data[i].append(0.0)
                    except: pass
            if not time:   # fallback if time detection was wrong
                time     = [i/250.0 for i in range(len(rows))]
                ch_names = channels
                data     = [[] for _ in ch_names]
                for row in rows:
                    for i, v in enumerate(row[:len(ch_names)]):
                        try:    data[i].append(float(v) if v.strip() else 0.0)
                        except: data[i].append(0.0)
        else:
            ch_names = channels
            time     = [i/250.0 for i in range(len(rows))]
            data     = [[] for _ in ch_names]
            for row in rows:
                for i, v in enumerate(row[:len(ch_names)]):
                    try:    data[i].append(float(v) if v.strip() else 0.0)
                    except: data[i].append(0.0)

        if not data or len(data[0]) == 0:
            return {'error': 'No valid numeric data found in CSV'}

        # Remove all-zero channels (but always keep at least something)
        vd, vc = [], []
        for i, d in enumerate(data):
            if any(v != 0 for v in d[:200]):
                vd.append(d)
                vc.append(ch_names[i] if i < len(ch_names) else f"CH{i+1}")
        if not vd:
            vd, vc = data, ch_names

        logger.info(f"✓ CSV: {len(vc)} ch, {len(time)} samples")
        return {'success': True, 'channels': vc, 'data': vd, 'time': time,
                'num_channels': len(vc), 'num_samples': len(time),
                'sampling_rate': 250, 'file_type': 'csv'}

    except Exception as e:
        logger.error(f"CSV error: {e}", exc_info=True)
        return {'error': f'CSV parse error: {e}'}


def parse_edf_file(filepath):
    if not HAS_EDF:
        return {'error': 'No EDF library installed. Run: pip install edfio'}

    # ── edfio backend (pure-Python, no C compiler needed) ──────────────────────
    if EDF_BACKEND == 'edfio':
        try:
            edf = edfio.read_edf(filepath)
            SKIP = {'edf annotations', 'bdf annotations', 'status', 'trigger'}
            MAX_SAMPLES = 75_000

            sr_counts = {}
            for sig in edf.signals:
                if sig.label.strip().lower() in SKIP:
                    continue
                sr_counts[int(sig.sampling_frequency)] = sr_counts.get(int(sig.sampling_frequency), 0) + 1

            if not sr_counts:
                return {'error': 'EDF file has no usable signals'}

            sr = max(sr_counts, key=sr_counts.get)
            channels, data = [], []

            for sig in edf.signals:
                if sig.label.strip().lower() in SKIP:
                    continue
                s = sig.data.copy()
                sr_ch = int(sig.sampling_frequency)
                if sr_ch != sr and len(s) > 0:
                    s = np.interp(np.linspace(0, 1, int(len(s) * sr / sr_ch)),
                                  np.linspace(0, 1, len(s)), s)
                if len(s) > MAX_SAMPLES:
                    s = s[:MAX_SAMPLES]
                channels.append(sig.label.strip() or f"CH{len(channels)+1}")
                data.append([float(x) for x in s])

            if not data:
                return {'error': 'No data read from EDF file'}

            ns = max(len(d) for d in data)
            for i in range(len(data)):
                if len(data[i]) < ns:
                    data[i] = data[i] + [0.0] * (ns - len(data[i]))

            logger.info(f"✓ EDF (edfio): {len(channels)} ch, {ns} samples @ {sr} Hz")
            return {'success': True, 'channels': channels, 'data': data,
                    'time': [i / sr for i in range(ns)], 'num_channels': len(channels),
                    'num_samples': ns, 'sampling_rate': float(sr), 'file_type': 'edf'}
        except Exception as e:
            logger.error(f"EDF (edfio) parse error: {e}", exc_info=True)
            return {'error': f'EDF parse error: {e}'}

    # ── pyedflib backend ────────────────────────────────────────────────────────
    try:
        f  = pyedflib.EdfReader(filepath)
        nc = f.signals_in_file
        if nc == 0: return {'error': 'EDF file has no signals'}

        all_labels = list(f.getSignalLabels())
        SKIP_LABELS = {'edf annotations', 'bdf annotations', 'status', 'trigger'}
        valid_indices = [i for i, lbl in enumerate(all_labels)
                         if lbl.strip().lower() not in SKIP_LABELS]
        if not valid_indices:
            valid_indices = list(range(nc))

        channels = [all_labels[i].strip() or f"CH{i+1}" for i in valid_indices]

        sr_counts = {}
        for i in valid_indices:
            try:    sr_i = int(f.getSampleFrequency(i)) or 250
            except: sr_i = 250
            sr_counts[sr_i] = sr_counts.get(sr_i, 0) + 1
        sr = max(sr_counts, key=sr_counts.get)

        MAX_SAMPLES = 75_000
        data, ns = [], 0

        for i in valid_indices:
            try:
                s     = f.readSignal(i)
                sr_ch = int(f.getSampleFrequency(i)) or sr
                if sr_ch != sr and len(s) > 0:
                    s = np.interp(np.linspace(0, 1, int(len(s) * sr / sr_ch)),
                                  np.linspace(0, 1, len(s)), s)
                if len(s) > MAX_SAMPLES:
                    s = s[:MAX_SAMPLES]
                data.append([float(x) for x in s])
                ns = max(ns, len(s))
            except Exception as ch_err:
                logger.warning(f"Skipping EDF channel {i}: {ch_err}")
                data.append([])

        try:    f._close()
        except:
            try: f.close()
            except: pass

        paired = [(d, c) for d, c in zip(data, channels) if d]
        if not paired:
            return {'error': 'No data read from EDF file — all channels empty'}

        data, channels = zip(*paired)
        data, channels = list(data), list(channels)
        ns = max(len(d) for d in data)
        for i in range(len(data)):
            if len(data[i]) < ns:
                data[i] = data[i] + [0.0] * (ns - len(data[i]))

        logger.info(f"✓ EDF (pyedflib): {len(channels)} ch, {ns} samples @ {sr} Hz")
        return {'success': True, 'channels': channels, 'data': data,
                'time': [i / sr for i in range(ns)], 'num_channels': len(channels),
                'num_samples': ns, 'sampling_rate': float(sr), 'file_type': 'edf'}
    except Exception as e:
        logger.error(f"EDF parse error: {e}", exc_info=True)
        return {'error': f'EDF parse error: {e}'}


def parse_bdf_file(filepath):
    if not HAS_EDF:
        return {'error': 'No EDF library installed. Run: pip install edfio'}
    result = parse_edf_file(filepath)
    if result.get('success'): result['file_type'] = 'bdf'
    return result


def parse_mat_file(filepath):
    try:
        mat = None
        try:   mat = sio.loadmat(filepath, squeeze_me=True)
        except: pass
        if mat is None and HAS_H5:
            mat = {}
            with h5py.File(filepath, 'r') as f:
                f.visititems(lambda n, o:
                    mat.update({n: np.array(o)}) if isinstance(o, h5py.Dataset) else None)
        if mat is None:
            return {'error': 'Cannot read MAT file. Try: pip install h5py'}

        sig, sz = None, 0
        for k, v in mat.items():
            if k.startswith('_'): continue
            try:
                a = v if isinstance(v, np.ndarray) else np.array(v)
                if a.dtype == object: a = _extract_numeric(a) or a
                if a.dtype != object: a = a.astype(float)
                if a.ndim >= 2 and a.size > sz: sig, sz = a, a.size
            except: pass

        if sig is None:
            return {'error': 'No 2-D signal array found in MAT file'}
        if sig.ndim == 3:
            sig = np.mean(sig, 2) if sig.shape[2] > 1 else sig[:, :, 0]
        if sig.shape[0] > sig.shape[1]: sig = sig.T
        sig = sig[:, :100_000]
        nc, ns = sig.shape
        sr = 250
        logger.info(f"✓ MAT: {nc} ch, {ns} samples")
        return {'success': True, 'channels': [f"CH{i+1}" for i in range(nc)],
                'data': sig.tolist(), 'time': [i/sr for i in range(ns)],
                'num_channels': nc, 'num_samples': ns,
                'sampling_rate': sr, 'file_type': 'mat'}
    except Exception as e:
        return {'error': f'MAT parse error: {e}'}


def parse_wfdb_file(filepath):
    """WFDB — uses wfdb library if available, else raw binary fallback."""
    base = filepath[:-4] if filepath.endswith(('.hea', '.dat')) else filepath
    if HAS_WFDB:
        try:
            rec  = wfdb.rdrecord(base)
            data = rec.p_signal.T.tolist()
            sr   = float(rec.fs)
            ns   = rec.sig_len
            nc   = rec.n_sig
            logger.info(f"✓ WFDB (lib): {nc} ch, {ns} samples")
            return {'success': True, 'channels': list(rec.sig_name), 'data': data,
                    'time': [i/sr for i in range(ns)], 'num_channels': nc,
                    'num_samples': ns, 'sampling_rate': sr, 'file_type': 'wfdb'}
        except Exception as e:
            logger.warning(f"wfdb lib failed ({e}), trying raw fallback ...")

    # Raw binary fallback
    hea = base + '.hea'
    dat = base + '.dat'
    if not os.path.exists(hea): return {'error': 'Missing .hea file'}
    if not os.path.exists(dat): return {'error': 'Missing .dat file'}
    try:
        with open(hea) as fh: lines = fh.readlines()
        parts = lines[0].split()
        nc, sr = int(parts[1]), int(parts[2])
        channels = []
        for i in range(1, min(nc+1, len(lines))):
            p = lines[i].split()
            channels.append(p[5] if len(p) > 5 else f"CH{i}")
        while len(channels) < nc: channels.append(f"CH{len(channels)+1}")
        raw = np.fromfile(dat, dtype=np.int16)
        if len(raw) == 0: return {'error': 'WFDB .dat is empty'}
        ns   = len(raw) // nc
        data = raw[:nc*ns].reshape(nc, ns).astype(float).tolist()
        logger.info(f"✓ WFDB (raw): {nc} ch, {ns} samples")
        return {'success': True, 'channels': channels, 'data': data,
                'time': [i/sr for i in range(ns)], 'num_channels': nc,
                'num_samples': ns, 'sampling_rate': float(sr), 'file_type': 'wfdb'}
    except Exception as e:
        return {'error': f'WFDB parse error: {e}'}


def parse_binary_file(filepath):
    try:
        raw = np.fromfile(filepath, dtype=np.int16)
        if len(raw) == 0: return {'error': 'Binary file is empty'}
        best_nc, best_r = 1, len(raw)
        for nc in [1, 2, 4, 8, 12, 16, 32, 64]:
            r = len(raw) % nc
            if r < best_r: best_r, best_nc = r, nc
        raw  = raw[:len(raw)-best_r] if best_r else raw
        if len(raw) == 0: return {'error': 'No valid data after alignment'}
        ns   = len(raw) // best_nc
        data = raw.reshape(best_nc, ns).astype(float).tolist()
        sr   = 250
        logger.info(f"✓ Binary: {best_nc} ch, {ns} samples")
        return {'success': True, 'channels': [f"CH{i+1}" for i in range(best_nc)],
                'data': data, 'time': [i/sr for i in range(ns)],
                'num_channels': best_nc, 'num_samples': ns,
                'sampling_rate': sr, 'file_type': 'binary'}
    except Exception as e:
        return {'error': f'Binary parse error: {e}'}


def parse_audio_file(filepath):
    if not HAS_SOUNDFILE:
        return {'error': 'Audio needs soundfile: pip install soundfile'}
    try:
        d, sr = sf.read(filepath)
        if d.ndim > 1: d = np.mean(d, axis=1)
        logger.info(f"✓ Audio: sr={sr}, {len(d)} samples")
        return {'success': True, 'channels': ['Audio'], 'data': [d.tolist()],
                'time': list(np.arange(len(d)) / sr),
                'num_channels': 1, 'num_samples': len(d),
                'sampling_rate': float(sr), 'file_type': 'audio'}
    except Exception as e:
        return {'error': f'Audio parse error: {e}'}


def _dispatch_parser(filepath, ext):
    """Route to the correct parser based on file extension."""
    if ext in ('csv', 'txt'):   return parse_csv_file(filepath)
    if ext == 'edf':            return parse_edf_file(filepath)
    if ext == 'bdf':            return parse_bdf_file(filepath)
    if ext == 'mat':            return parse_mat_file(filepath)
    if ext == 'hea':            return parse_wfdb_file(filepath)
    if ext == 'dat':
        return parse_wfdb_file(filepath) \
               if os.path.exists(filepath.replace('.dat', '.hea')) \
               else parse_binary_file(filepath)
    if ext in ('wav', 'mp3'):   return parse_audio_file(filepath)
    return parse_binary_file(filepath)


# ══════════════════════════ CORE ENDPOINTS ════════════════════════════════════

@app.route('/api/health', methods=['GET', 'OPTIONS'])
def health():
    return jsonify({
        'status': 'ok', 'backend': 'running',
        'modules': {
            'acoustic':        HAS_ACOUSTIC,
            'finance':         HAS_FINANCE,
            'microbiome':      HAS_MICROBIOME,
            'ecg':             HAS_ECG,
            'eeg':             HAS_EEG,
            'signal_analysis': HAS_SIGNAL_ANALYSIS,
        },
        'libraries': {
            'pyedflib': HAS_EDF, 'h5py': HAS_H5,
            'wfdb': HAS_WFDB, 'soundfile': HAS_SOUNDFILE,
        },
        'formats_supported': sorted(ALLOWED_EXTENSIONS),
        'ecg_model_loaded': getattr(ecg_classifier, 'model_loaded', False) if HAS_ECG else False,
        'eeg_model_loaded': getattr(eeg_classifier, 'model_loaded', False) if HAS_EEG else False,
    })


@app.route('/api/supported-formats', methods=['GET', 'OPTIONS'])
def supported_formats():
    return jsonify({
        'formats': sorted(ALLOWED_EXTENSIONS),
        'details': {
            'csv': 'Comma-separated values — works',
            'txt': 'Tab/space-separated — works',
            'edf': 'European Data Format'  + (' — works' if HAS_EDF      else ' — needs pyedflib'),
            'bdf': 'BioSemi Data Format'   + (' — works' if HAS_EDF      else ' — needs pyedflib'),
            'mat': 'MATLAB'                + (' — works' if HAS_H5       else ' — needs h5py for v7.3'),
            'hea': 'WFDB header (.hea+.dat)'+ (' — works' if HAS_WFDB   else ' — basic support'),
            'dat': 'WFDB / raw binary — works',
            'wav': 'WAV audio'             + (' — works' if HAS_SOUNDFILE else ' — needs soundfile'),
            'mp3': 'MP3 audio'             + (' — works' if HAS_SOUNDFILE else ' — needs soundfile'),
        },
        'libraries': {
            'pyedflib': HAS_EDF, 'h5py': HAS_H5,
            'wfdb': HAS_WFDB, 'soundfile': HAS_SOUNDFILE,
        }
    })


@app.route('/api/upload', methods=['POST', 'OPTIONS'])
def upload_file():
    """Upload any supported signal file → returns parsed signal + sync matrix."""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        file = request.files['file']
        if not file.filename:
            return jsonify({'error': 'Empty filename'}), 400
        if not allowed_file(file.filename):
            return jsonify({'error': f'Unsupported format. Allowed: {sorted(ALLOWED_EXTENSIONS)}'}), 400

        fp  = save_temp(file)
        ext = fp.rsplit('.', 1)[1].lower()
        logger.info(f"Parsing: {os.path.basename(fp)} ({ext})")

        result = _dispatch_parser(fp, ext)
        rm(fp)

        if 'error' in result:
            return jsonify({'error': result['error']}), 400

        result['sync_matrix'] = calc_sync_matrix(result['data'])
        logger.info(f"✓ Upload OK: {result['num_channels']} ch, {result['num_samples']} samples")
        return jsonify({'status': 'success', 'signal_data': result}), 200

    except Exception as e:
        logger.exception("Upload error")
        return jsonify({'error': str(e)}), 500


@app.route('/api/recurrence', methods=['POST', 'OPTIONS'])
def compute_recurrence():
    """Generic recurrence plot between two signal arrays.
    Body: { signal1: [...], signal2: [...], threshold: 0.5 }"""
    try:
        body = request.get_json()
        s1   = np.array(body['signal1'])
        s2   = np.array(body['signal2'])
        thr  = float(body.get('threshold', 0.5))
        n    = min(200, len(s1), len(s2))
        s1d  = s1[::max(1, len(s1)//n)][:n]
        s2d  = s2[::max(1, len(s2)//n)][:n]
        rec  = [[1 if abs(float(s1d[i]) - float(s2d[j])) < thr else 0
                 for j in range(len(s2d))] for i in range(len(s1d))]
        return jsonify({'status': 'success', 'recurrence': rec}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/analyze', methods=['POST', 'OPTIONS'])
def analyze():
    """Advanced signal analysis (FFT, stats, etc.).
    Body: { signal_data: { data, sampling_rate, ... } }"""
    if not HAS_SIGNAL_ANALYSIS:
        return jsonify({'error': 'signal_analysis module not available'}), 503
    try:
        body    = request.get_json()
        results = signal_analyzer.analyze(body.get('signal_data', {}))
        return jsonify({'status': 'success', 'results': results}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/filter', methods=['POST', 'OPTIONS'])
def apply_filter():
    """Apply digital filter to signal.
    Body: { signal: [...], filter_type: lowpass|highpass|bandpass, cutoff: 50, order: 4 }"""
    if not HAS_SIGNAL_ANALYSIS:
        return jsonify({'error': 'signal_analysis module not available'}), 503
    try:
        body     = request.get_json()
        filtered = signal_analyzer.apply_filter(
            body.get('signal', []),
            body.get('filter_type', 'lowpass'),
            body.get('cutoff', 50),
            body.get('order', 4)
        )
        return jsonify({'status': 'success', 'filtered_signal': filtered}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/wavelet', methods=['POST', 'OPTIONS'])
def wavelet():
    """Compute wavelet transform.
    Body: { signal_data: { data, sampling_rate, ... } }"""
    if not HAS_SIGNAL_ANALYSIS:
        return jsonify({'error': 'signal_analysis module not available'}), 503
    try:
        body    = request.get_json()
        results = signal_analyzer.compute_wavelet(body.get('signal_data', {}))
        return jsonify({'status': 'success', 'wavelet': results}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ══════════════════════════ ECG ENDPOINTS ════════════════════════════════════

@app.route('/api/ecg/analyze', methods=['POST', 'OPTIONS'])
def ecg_analyze():
    """Multi-channel ECG AI detection + classic ML comparison.
    Body: { signal_data: { data: [[ch0...],[ch1...]], sampling_rate: 250, ... } }"""
    if not HAS_ECG:
        return jsonify({'error': 'ECG module not available'}), 503
    try:
        body        = request.get_json(force=True)
        signal_data = body.get('signal_data')
        if not signal_data:
            return jsonify({'error': 'signal_data required'}), 400
        ai_result      = ecg_classifier.predict(signal_data)
        classic_result = ecg_classifier.classic_ml_detection(signal_data)
        return jsonify({'status': 'success',
                        'ai_detection': ai_result,
                        'classic_comparison': classic_result}), 200
    except Exception as e:
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


@app.route('/api/ecg/xor', methods=['POST', 'OPTIONS'])
def ecg_xor():
    """XOR graph — chunks of signal XOR-ed onto each other.
    Body: { signal_data, chunk_size: 250, channel_idx: 0 }"""
    if not HAS_SIGNAL_ANALYSIS:
        return jsonify({'error': 'signal_analysis module not available'}), 503
    try:
        body   = request.get_json()
        result = signal_analyzer.compute_xor_graph(
            body.get('signal_data'),
            int(body.get('chunk_size', 250)),
            int(body.get('channel_idx', 0)))
        return jsonify({'status': 'success', 'xor': result}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/ecg/polar', methods=['POST', 'OPTIONS'])
def ecg_polar():
    """Polar graph — magnitude vs time in polar coordinates.
    Body: { signal_data, channel_idx: 0, period: 100, mode: cumulative|latest }"""
    if not HAS_SIGNAL_ANALYSIS:
        return jsonify({'error': 'signal_analysis module not available'}), 503
    try:
        body   = request.get_json()
        result = signal_analyzer.compute_polar_plot(
            body.get('signal_data'),
            int(body.get('channel_idx', 0)),
            int(body.get('period', 100)),
            body.get('mode', 'cumulative'))
        return jsonify({'status': 'success', 'polar': result}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/ecg/recurrence', methods=['POST', 'OPTIONS'])
def ecg_recurrence():
    """Recurrence plot between two ECG channels.
    Body: { signal_data, ch_x: 0, ch_y: 1, threshold: 0.5 }"""
    if not HAS_SIGNAL_ANALYSIS:
        return jsonify({'error': 'signal_analysis module not available'}), 503
    try:
        body   = request.get_json()
        result = signal_analyzer.compute_recurrence_plot(
            body.get('signal_data'),
            int(body.get('ch_x', 0)),
            int(body.get('ch_y', 1)),
            float(body.get('threshold', 0.5)))
        return jsonify({'status': 'success', 'recurrence': result}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/ecg/abnormalities', methods=['GET', 'OPTIONS'])
def ecg_abnormalities():
    """Return list of ECG abnormality types the model can detect."""
    if not HAS_ECG:
        return jsonify({'error': 'ECG module not available'}), 503
    return jsonify({'status': 'success',
                    'abnormalities': ecg_classifier.get_abnormality_types()})


@app.route('/api/ecg/info', methods=['GET', 'OPTIONS'])
def ecg_info():
    """ECG model metadata."""
    if not HAS_ECG:
        return jsonify({'error': 'ECG module not available'}), 503
    return jsonify({
        'status': 'success',
        'model_loaded': getattr(ecg_classifier, 'model_loaded', False),
        'model_path':   getattr(ecg_classifier, 'model_path', ''),
        'num_classes':  getattr(ecg_classifier, 'num_classes', 0),
        'abnormalities': ecg_classifier.get_abnormality_types()
                         if hasattr(ecg_classifier, 'get_abnormality_types') else []
    })


@app.route('/api/ecg/simulate', methods=['POST', 'OPTIONS'])
def ecg_simulate():
    """Generate synthetic ECG for testing (no file needed).
    Body: { abnormality: normal|afib|..., duration: 10, fs: 250, n_channels: 8 }"""
    if not HAS_ECG:
        return jsonify({'error': 'ECG module not available'}), 503
    try:
        body        = request.get_json()
        signal_data = ecg_classifier.simulate_ecg(
            body.get('abnormality', 'normal'),
            float(body.get('duration', 10)),
            float(body.get('fs', 250)),
            int(body.get('n_channels', 8)))
        signal_data['sync_matrix'] = calc_sync_matrix(signal_data['data'])
        return jsonify({'status': 'success', 'signal_data': signal_data}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ══════════════════════════ EEG ENDPOINTS ════════════════════════════════════

@app.route('/api/eeg/analyze', methods=['POST', 'OPTIONS'])
def eeg_analyze():
    """Multi-channel EEG AI detection + classic ML comparison.
    Body: { signal_data: { data: [[ch0...],[ch1...]], sampling_rate: 250, ... } }"""
    if not HAS_EEG:
        return jsonify({'error': 'EEG module not available'}), 503
    try:
        body        = request.get_json(force=True)
        signal_data = body.get('signal_data')
        if not signal_data:
            return jsonify({'error': 'signal_data required'}), 400
        ai_result      = eeg_classifier.predict(signal_data)
        classic_result = eeg_classifier.classic_ml_detection(signal_data)
        return jsonify({'status': 'success',
                        'ai_detection': ai_result,
                        'classic_comparison': classic_result}), 200
    except Exception as e:
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


@app.route('/api/eeg/xor', methods=['POST', 'OPTIONS'])
def eeg_xor():
    """XOR graph for EEG.
    Body: { signal_data, chunk_size: 250, channel_idx: 0 }"""
    if not HAS_SIGNAL_ANALYSIS:
        return jsonify({'error': 'signal_analysis module not available'}), 503
    try:
        body   = request.get_json()
        result = signal_analyzer.compute_xor_graph(
            body.get('signal_data'),
            int(body.get('chunk_size', 250)),
            int(body.get('channel_idx', 0)))
        return jsonify({'status': 'success', 'xor': result}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/eeg/polar', methods=['POST', 'OPTIONS'])
def eeg_polar():
    """Polar graph for EEG.
    Body: { signal_data, channel_idx: 0, period: 100, mode: cumulative|latest }"""
    if not HAS_SIGNAL_ANALYSIS:
        return jsonify({'error': 'signal_analysis module not available'}), 503
    try:
        body   = request.get_json()
        result = signal_analyzer.compute_polar_plot(
            body.get('signal_data'),
            int(body.get('channel_idx', 0)),
            int(body.get('period', 100)),
            body.get('mode', 'cumulative'))
        return jsonify({'status': 'success', 'polar': result}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/eeg/recurrence', methods=['POST', 'OPTIONS'])
def eeg_recurrence():
    """Recurrence plot between two EEG channels.
    Body: { signal_data, ch_x: 0, ch_y: 1, threshold: 0.5 }"""
    if not HAS_SIGNAL_ANALYSIS:
        return jsonify({'error': 'signal_analysis module not available'}), 503
    try:
        body   = request.get_json()
        result = signal_analyzer.compute_recurrence_plot(
            body.get('signal_data'),
            int(body.get('ch_x', 0)),
            int(body.get('ch_y', 1)),
            float(body.get('threshold', 0.5)))
        return jsonify({'status': 'success', 'recurrence': result}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/eeg/abnormalities', methods=['GET', 'OPTIONS'])
def eeg_abnormalities():
    """Return list of EEG abnormality types the model can detect."""
    if not HAS_EEG:
        return jsonify({'error': 'EEG module not available'}), 503
    return jsonify({'status': 'success',
                    'abnormalities': eeg_classifier.get_abnormality_types()})


@app.route('/api/eeg/info', methods=['GET', 'OPTIONS'])
def eeg_info():
    """EEG model metadata."""
    if not HAS_EEG:
        return jsonify({'error': 'EEG module not available'}), 503
    return jsonify({
        'status': 'success',
        'model_loaded': getattr(eeg_classifier, 'model_loaded', False),
        'model_path':   getattr(eeg_classifier, 'model_path', ''),
        'num_classes':  getattr(eeg_classifier, 'num_classes', 0),
        'abnormalities': eeg_classifier.get_abnormality_types()
                         if hasattr(eeg_classifier, 'get_abnormality_types') else []
    })


@app.route('/api/eeg/simulate', methods=['POST', 'OPTIONS'])
def eeg_simulate():
    """Generate synthetic EEG for testing.
    Body: { abnormality: normal|epilepsy|..., duration: 10, fs: 250, n_channels: 19 }"""
    if not HAS_EEG:
        return jsonify({'error': 'EEG module not available'}), 503
    try:
        body        = request.get_json()
        signal_data = eeg_classifier.simulate_eeg(
            body.get('abnormality', 'normal'),
            float(body.get('duration', 10)),
            float(body.get('fs', 250)),
            int(body.get('n_channels', 19)))
        signal_data['sync_matrix'] = calc_sync_matrix(signal_data['data'])
        return jsonify({'status': 'success', 'signal_data': signal_data}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ══════════════════════════ ACOUSTIC ENDPOINTS ════════════════════════════════

@app.route('/api/acoustic/doppler/generate', methods=['POST', 'OPTIONS'])
def generate_doppler():
    """Generate Doppler sound of a passing vehicle.
    Body: { frequency: 440, velocity: 30, duration: 5 }"""
    if not HAS_ACOUSTIC:
        return jsonify({'error': 'Acoustic module not available'}), 503
    try:
        body   = request.get_json()
        freq   = float(body.get('frequency', 440))
        vel    = float(body.get('velocity', 30))
        dur    = float(body.get('duration', 5))
        result = acoustic_analyzer.generate_doppler_sound(freq, vel, dur)
        if result:
            # expose both key names used across versions
            return jsonify({'status': 'success', 'audio_data': result, 'audio': result}), 200
        return jsonify({'error': 'Doppler generation failed'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/acoustic/doppler/estimate', methods=['POST', 'OPTIONS'])
def estimate_doppler():
    """Estimate velocity from a real Doppler audio recording.
    Form-data: file=<audio>  [optional: original_freq=440]"""
    if not HAS_ACOUSTIC:
        return jsonify({'error': 'Acoustic module not available'}), 503
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    try:
        fp        = save_temp(request.files['file'])
        orig_freq = float(request.form.get('original_freq', 440))

        # Support both method signatures used across team versions
        result = None
        if hasattr(acoustic_analyzer, 'estimate_velocity_from_file'):
            result = acoustic_analyzer.estimate_velocity_from_file(fp)
        elif hasattr(acoustic_analyzer, 'estimate_velocity'):
            result = acoustic_analyzer.estimate_velocity(fp, orig_freq)

        rm(fp)
        if result and 'error' not in result:
            return jsonify({'status': 'success', 'estimation': result}), 200
        return jsonify({'error': (result or {}).get('error', 'Estimation failed')}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/acoustic/drone/detect', methods=['POST', 'OPTIONS'])
def detect_drone():
    """Detect drone / submarine in an audio file.
    Form-data: file=<audio>"""
    if not HAS_ACOUSTIC:
        return jsonify({'error': 'Acoustic module not available'}), 503
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    try:
        fp = save_temp(request.files['file'])

        # Support both method signatures
        result = None
        if hasattr(acoustic_analyzer, 'detect_drone_from_file'):
            result = acoustic_analyzer.detect_drone_from_file(fp)
        elif hasattr(acoustic_analyzer, 'detect_drone'):
            result = acoustic_analyzer.detect_drone(fp)

        rm(fp)
        if not result:
            result = {'detected': False, 'confidence': 0.0, 'drone_type': 'Unknown'}

        return jsonify({
            'status': 'success',
            'detection': {
                'detected':   result.get('detected', False),
                'confidence': result.get('confidence', 0.0),
                'drone_type': result.get('drone_type', 'Unknown'),
                'error':      result.get('error', None),
            }
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/acoustic/drone/simulate', methods=['POST', 'OPTIONS'])
def simulate_drone():
    """Generate synthetic drone audio for testing.
    Body: { duration: 3, with_drone: true }"""
    if not HAS_ACOUSTIC:
        return jsonify({'error': 'Acoustic module not available'}), 503
    try:
        body   = request.get_json()
        result = acoustic_analyzer.simulate_drone_sound(
            float(body.get('duration', 3)),
            bool(body.get('with_drone', True)))
        return jsonify({'status': 'success', 'audio': result}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ══════════════════════════ FINANCE ENDPOINTS ════════════════════════════════

@app.route('/api/finance/tickers', methods=['GET', 'OPTIONS'])
def finance_tickers():
    """All supported tickers grouped by category."""
    if not HAS_FINANCE:
        return jsonify({'error': 'Finance module not available'}), 503
    try:
        return jsonify(finance_analyzer.get_all_tickers()), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/finance/history', methods=['GET', 'OPTIONS'])
def finance_history():
    """Historical OHLCV data.
    Query: ticker=AAPL  period=1mo|3mo|6mo|1y|2y  interval=1d|1wk"""
    if not HAS_FINANCE:
        return jsonify({'error': 'Finance module not available'}), 503
    try:
        ticker   = request.args.get('ticker', 'AAPL').upper()
        period   = request.args.get('period',   '6mo')
        interval = request.args.get('interval', '1d')
        try:
            result = finance_analyzer.get_history(ticker, period, interval)
        except TypeError:
            result = finance_analyzer.get_history(ticker, period)
        return (jsonify(result), 400) if 'error' in result else (jsonify(result), 200)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/finance/predict', methods=['GET', 'POST', 'OPTIONS'])
def finance_predict():
    """Price forecast.
    GET  ?ticker=AAPL              → 7-day XGBoost forecast
    POST { prices: [...], days: 5} → predict from raw price array"""
    if not HAS_FINANCE:
        return jsonify({'error': 'Finance module not available'}), 503
    try:
        if request.method == 'POST':
            body   = request.get_json()
            prices = body.get('prices', [])
            days   = int(body.get('days', 5))
            result = finance_analyzer.predict_future(prices, days)
            return jsonify({'status': 'success', 'prediction': result}), 200
        else:
            ticker = request.args.get('ticker', 'AAPL').upper()
            result = finance_analyzer.get_prediction(ticker)
            return (jsonify(result), 400) if 'error' in result else (jsonify(result), 200)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/finance/indicators', methods=['GET', 'OPTIONS'])
def finance_indicators():
    """Technical indicators (RSI, MACD, Bollinger Bands, MAs).
    Query: ticker=AAPL"""
    if not HAS_FINANCE:
        return jsonify({'error': 'Finance module not available'}), 503
    try:
        ticker = request.args.get('ticker', 'AAPL').upper()
        result = finance_analyzer.get_technical_indicators(ticker)
        return (jsonify(result), 400) if 'error' in result else (jsonify(result), 200)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/finance/stock/<symbol>', methods=['GET', 'OPTIONS'])
def get_stock_data(symbol):
    """Stock market OHLCV data. Query: period=3mo"""
    if not HAS_FINANCE:
        return jsonify({'error': 'Finance module not available'}), 503
    try:
        data = finance_analyzer.get_stock_data(symbol.upper(), request.args.get('period', '3mo'))
        return jsonify({'status': 'success', 'data': data}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/finance/currency/<pair>', methods=['GET', 'OPTIONS'])
def get_currency_data(pair):
    """Currency pair OHLCV data. Query: period=3mo"""
    if not HAS_FINANCE:
        return jsonify({'error': 'Finance module not available'}), 503
    try:
        data = finance_analyzer.get_currency_data(pair, request.args.get('period', '3mo'))
        return jsonify({'status': 'success', 'data': data}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/finance/commodity/<n>', methods=['GET', 'OPTIONS'])
def get_commodity_data(name):
    """Commodity / mineral OHLCV data. Query: period=3mo"""
    if not HAS_FINANCE:
        return jsonify({'error': 'Finance module not available'}), 503
    try:
        data = finance_analyzer.get_commodity_data(name, request.args.get('period', '3mo'))
        return jsonify({'status': 'success', 'data': data}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/finance/stock/list', methods=['GET', 'OPTIONS'])
def get_stock_list():
    return jsonify({'status': 'success', 'stocks': [
        {'symbol': 'AAPL',  'name': 'Apple Inc.'},
        {'symbol': 'GOOGL', 'name': 'Alphabet Inc.'},
        {'symbol': 'MSFT',  'name': 'Microsoft Corp.'},
        {'symbol': 'AMZN',  'name': 'Amazon.com Inc.'},
        {'symbol': 'TSLA',  'name': 'Tesla Inc.'},
        {'symbol': 'META',  'name': 'Meta Platforms Inc.'},
        {'symbol': 'NFLX',  'name': 'Netflix Inc.'},
        {'symbol': 'NVDA',  'name': 'NVIDIA Corp.'},
    ]}), 200


@app.route('/api/finance/currency/list', methods=['GET', 'OPTIONS'])
def get_currency_list():
    return jsonify({'status': 'success', 'currencies': [
        {'pair': 'EURUSD=X', 'name': 'EUR/USD'},
        {'pair': 'GBPUSD=X', 'name': 'GBP/USD'},
        {'pair': 'USDJPY=X', 'name': 'USD/JPY'},
        {'pair': 'AUDUSD=X', 'name': 'AUD/USD'},
        {'pair': 'USDCAD=X', 'name': 'USD/CAD'},
        {'pair': 'USDCHF=X', 'name': 'USD/CHF'},
    ]}), 200


@app.route('/api/finance/commodity/list', methods=['GET', 'OPTIONS'])
def get_commodity_list():
    return jsonify({'status': 'success', 'commodities': [
        {'name': 'GC=F', 'display': 'Gold'},
        {'name': 'SI=F', 'display': 'Silver'},
        {'name': 'CL=F', 'display': 'Crude Oil'},
        {'name': 'NG=F', 'display': 'Natural Gas'},
        {'name': 'ZC=F', 'display': 'Corn'},
        {'name': 'ZW=F', 'display': 'Wheat'},
    ]}), 200


# ══════════════════════════ MICROBIOME ENDPOINTS ══════════════════════════════

@app.route('/api/microbiome/sample/<dataset>', methods=['GET', 'OPTIONS'])
def get_microbiome_sample(dataset):
    """Sample data for a named microbiome dataset (ihmp, ipop, ...)."""
    if not HAS_MICROBIOME:
        return jsonify({'error': 'Microbiome module not available'}), 503
    try:
        data = micro_analyzer.get_sample_data(dataset)
        if data:
            return jsonify({'status': 'success', 'sample': data}), 200
        return jsonify({'error': f'Dataset "{dataset}" not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/microbiome/datasets', methods=['GET', 'OPTIONS'])
def get_microbiome_datasets():
    """List of all available microbiome datasets."""
    if not HAS_MICROBIOME:
        return jsonify({'error': 'Microbiome module not available'}), 503
    try:
        datasets = micro_analyzer.get_available_datasets()
        return jsonify({'status': 'success', 'datasets': datasets}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/microbiome/analyze', methods=['POST', 'OPTIONS'])
def analyze_microbiome():
    """Analyze bacterial abundance counts → diversity + patient profile.
    Body: { counts: { Bacteroides: 1200, Firmicutes: 800, ... } }"""
    if not HAS_MICROBIOME:
        return jsonify({'error': 'Microbiome module not available'}), 503
    try:
        body   = request.get_json()
        counts = body.get('counts', {})
        if not counts:
            return jsonify({'error': '"counts" field is required'}), 400

        # Support both method names used across team versions
        if hasattr(micro_analyzer, 'analyze_patient'):
            analysis = micro_analyzer.analyze_patient(counts)
        elif hasattr(micro_analyzer, 'analyze_sample'):
            analysis = micro_analyzer.analyze_sample(counts)
        else:
            return jsonify({'error': 'MicrobiomeAnalyzer has no analyze method'}), 500

        return jsonify({'status': 'success', 'analysis': analysis}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/microbiome/profile', methods=['POST', 'OPTIONS'])
def estimate_patient_profile():
    """Estimate patient disease profile from microbiome counts.
    Body: { counts: { ... } }"""
    if not HAS_MICROBIOME:
        return jsonify({'error': 'Microbiome module not available'}), 503
    try:
        body   = request.get_json()
        counts = body.get('counts', {})

        if hasattr(micro_analyzer, 'estimate_patient_profile'):
            profile = micro_analyzer.estimate_patient_profile(counts)
        elif hasattr(micro_analyzer, 'analyze_patient'):
            profile = micro_analyzer.analyze_patient(counts)
        else:
            return jsonify({'error': 'MicrobiomeAnalyzer has no profile method'}), 500

        return jsonify({'status': 'success', 'profile': profile}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/microbiome/diseases', methods=['GET', 'OPTIONS'])
def get_disease_profiles():
    """Known disease-microbiome association profiles."""
    return jsonify({'status': 'success', 'diseases': [
        {'name': 'Healthy',              'description': 'Normal gut microbiome'},
        {'name': 'IBD',                  'description': 'Inflammatory Bowel Disease'},
        {'name': 'Diabetes Type 2',      'description': 'T2D microbiome signature'},
        {'name': 'Obesity',              'description': 'Obesity-associated microbiome'},
        {'name': 'Rheumatoid Arthritis', 'description': 'RA microbiome profile'},
    ]}), 200


# ══════════════════════════ ERROR HANDLERS ════════════════════════════════════

@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': f'File too large. Max: {MAX_FILE_SIZE//1024//1024} MB'}), 413

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500


# ══════════════════════════ STARTUP ══════════════════════════════════════════

if __name__ == '__main__':
    S = '=' * 75
    print(f"\n{S}")
    print("  SIGNAL VIEWER HUB — COMPLETE MERGED BACKEND")
    print(S)
    print(f"  URL    : http://127.0.0.1:5000")
    print(f"  Uploads: {os.path.abspath(UPLOAD_FOLDER)}")
    print(f"  MaxFile: {MAX_FILE_SIZE//1024//1024} MB")

    print("\n  MODULES:")
    for name, ok in [("Acoustic",      HAS_ACOUSTIC),
                     ("Finance",       HAS_FINANCE),
                     ("Microbiome",    HAS_MICROBIOME),
                     ("ECG",           HAS_ECG),
                     ("EEG",           HAS_EEG),
                     ("SignalAnalysis",HAS_SIGNAL_ANALYSIS)]:
        print(f"    {'✓' if ok else '✗'} {name}")

    print("\n  LIBRARIES:")
    for name, ok in [("pyedflib", HAS_EDF), ("h5py",      HAS_H5),
                     ("wfdb",     HAS_WFDB),("soundfile", HAS_SOUNDFILE)]:
        print(f"    {'✓' if ok else '✗'} {name}")

    print("\n  ALL API ENDPOINTS:")
    for ep in [
        "GET  /api/health",
        "GET  /api/supported-formats",
        "POST /api/upload                         ← any signal file",
        "POST /api/recurrence                     ← generic recurrence plot",
        "POST /api/analyze                        ← FFT / stats analysis",
        "POST /api/filter                         ← digital filter",
        "POST /api/wavelet                        ← wavelet transform",
        "── ECG ──────────────────────────────────────────────────────────",
        "POST /api/ecg/analyze                    ← AI + classic detection",
        "POST /api/ecg/xor                        ← XOR graph",
        "POST /api/ecg/polar                      ← Polar graph",
        "POST /api/ecg/recurrence                 ← Recurrence plot",
        "POST /api/ecg/simulate                   ← Synthetic ECG",
        "GET  /api/ecg/abnormalities",
        "GET  /api/ecg/info",
        "── EEG ──────────────────────────────────────────────────────────",
        "POST /api/eeg/analyze                    ← AI + classic detection",
        "POST /api/eeg/xor",
        "POST /api/eeg/polar",
        "POST /api/eeg/recurrence",
        "POST /api/eeg/simulate                   ← Synthetic EEG",
        "GET  /api/eeg/abnormalities",
        "GET  /api/eeg/info",
        "── Acoustic ─────────────────────────────────────────────────────",
        "POST /api/acoustic/doppler/generate      ← generate Doppler audio",
        "POST /api/acoustic/doppler/estimate      ← estimate velocity",
        "POST /api/acoustic/drone/detect          ← drone detection",
        "POST /api/acoustic/drone/simulate        ← synthetic drone audio",
        "── Finance ──────────────────────────────────────────────────────",
        "GET  /api/finance/tickers",
        "GET  /api/finance/history?ticker=&period=&interval=",
        "GET  /api/finance/predict?ticker=",
        "POST /api/finance/predict                ← from raw prices",
        "GET  /api/finance/indicators?ticker=",
        "GET  /api/finance/stock/<symbol>",
        "GET  /api/finance/currency/<pair>",
        "GET  /api/finance/commodity/<name>",
        "GET  /api/finance/stock/list",
        "GET  /api/finance/currency/list",
        "GET  /api/finance/commodity/list",
        "── Microbiome ───────────────────────────────────────────────────",
        "GET  /api/microbiome/datasets",
        "GET  /api/microbiome/sample/<dataset>",
        "POST /api/microbiome/analyze             ← diversity + profile",
        "POST /api/microbiome/profile             ← disease profile",
        "GET  /api/microbiome/diseases",
    ]:
        print(f"    {ep}")

    print(f"\n{S}")
    print("  Server ready!  Open frontend/dashboard.html")
    print(f"{S}\n")

    app.run(debug=True, host='127.0.0.1', port=5000)