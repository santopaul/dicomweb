#!/usr/bin/env python3
"""
dicom_tool.py — Final polished DICOM metadata extractor & batch processor

Features & improvements included in this final version:
 - Pathlib everywhere, robust CLI with help groups
 - Logging (quiet/verbose), optional log file
 - Threaded batch processing with tqdm progress support
 - Streaming aggregation for CSV (memory-safe) and JSON
 - Secure pseudonymization: PBKDF2HMAC via cryptography when available, HMAC-SHA256 fallback
 - Pseudonym mapping export with generated salt when needed (ensures reproducibility)
 - Anonymization modes: pseudonymize (default) and remove
 - Remove private tags option
 - Pixel extraction, thumbnails, HTML & image report generation (Pillow optional)
 - FHIR ImagingStudy mapping (basic) using snake_case keys for aggregation
 - Export schema CSV for Kaggle-style work
 - Dry-run and no-overwrite safeguards
 - Case-insensitive DICOM file scanning, max-depth control
 - Streaming CSV writer to avoid holding all results in memory

This file aims to be a practical, production-ready CLI utility for researchers and
engineers working with large DICOM collections (Kaggle/TCIA/RSNA style workloads).

Usage examples (short):
  # Single file, save JSON
  python dicom_tool.py /path/to/file.dcm -o json

  # Batch directory -> combined CSV, 8 threads
  python dicom_tool.py --batch /data/dicom -o agg-csv -t 8 --output-dir ./out

  # Anonymize (pseudonymize) with explicit salt and save mapping
  python dicom_tool.py --batch /data/dicom -o agg-csv --anonymize --anonymize-salt mysalt --anonymize-map mapping.json

"""
from __future__ import annotations
import argparse
import csv
import getpass
import hashlib
import hmac
import json
import logging
import os
import sys
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import pydicom
from pydicom.errors import InvalidDicomError

# Optional heavy deps
try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont
    _PIL_AVAILABLE = True
except Exception:
    _PIL_AVAILABLE = False

try:
    from tqdm import tqdm
    _TQDM = True
except Exception:
    _TQDM = False

try:
    from dateutil.relativedelta import relativedelta
    _RELATIVEDELTA_AVAILABLE = True
except Exception:
    _RELATIVEDELTA_AVAILABLE = False

try:
    import pandas as pd
    _PANDAS_AVAILABLE = True
except Exception:
    _PANDAS_AVAILABLE = False

# cryptography for PBKDF2
try:
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.backends import default_backend
    _CRYPTO_AVAILABLE = True
except Exception:
    _CRYPTO_AVAILABLE = False

# colorama for colored console output (optional)
try:
    from colorama import Fore, Style, init as colorama_init
    colorama_init(autoreset=True)
except Exception:
    class _Dummy:
        def __getattr__(self, _):
            return ''
    Fore = Style = _Dummy()

# ------------------ Constants & defaults ------------------
__version__ = "0.9.0"
DEFAULT_THREADS = 4
MAX_THREADS = 64
CRITICAL_KEYS = {
    "patient_id", "patient_name", "patient_age", "patient_sex",
    "modality", "body_part_examined", "study_description", "study_date_time"
}

DEFAULT_ANON_TAGS = [
    'patient_name', 'patient_id', 'patient_birth_date', 'patient_birth_time', 'patient_age', 'patient_address',
    'other_patient_ids', 'other_patient_names', 'referring_physician_name', 'performing_physician_name',
    'operators_name', 'institution_name', 'station_name', 'accession_number', 'study_id', 'series_description',
    'study_comments'
]

SUPPORTED_TYPES = {'json', 'csv', 'html', 'image', 'thumbnail', 'fhir', 'report', 'agg-csv', 'agg-json'}
EXT_TO_TYPE = {
    'json': 'json', 'csv': 'csv', 'html': 'html',
    'png': 'image', 'jpg': 'image', 'jpeg': 'image',
    'bmp': 'image', 'tiff': 'image', 'tif': 'image',
    'thumb': 'thumbnail', 'fhir': 'fhir'
}

# ------------------ Argument parser ------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="dicom_tool.py",
                                description="DICOM metadata extractor & batch aggregator")
    p.add_argument("path", nargs="?", default=None,
                   help="Path to DICOM file or folder. Use '-' to read file paths from stdin. Omit to enter interactive REPL.")

    # Output group
    g_out = p.add_argument_group('Output options')
    g_out.add_argument("-o", "--output", action="append", default=[],
                       help="Output targets. Examples: json,csv,image,report,thumbnail,fhir,agg-csv,agg-json or filenames (report.png)")
    g_out.add_argument("--output-dir", default="./dicom_reports", help="Directory to save outputs when requested")
    g_out.add_argument("--no-overwrite", action="store_true", help="Don't overwrite existing output files")
    g_out.add_argument("--dry-run", action="store_true", help="Do a trial run without writing files")

    # Anonymization group
    g_anon = p.add_argument_group('Anonymization options')
    g_anon.add_argument("--anonymize", action="store_true",
                        help="Enable anonymization (default set if --anonymize-tags not provided)")
    g_anon.add_argument("--anonymize-tags", type=str, default=None,
                        help="Comma-separated tags to anonymize only (e.g. patient_name,patient_id). If omitted, default set is used.")
    g_anon.add_argument("--anonymize-mode", choices=['pseudonymize','remove'], default='pseudonymize',
                        help="Pseudonymize (hash) or remove (blank) selected tags. Default: pseudonymize")
    g_anon.add_argument("--anonymize-map", type=str, default=None,
                        help="Path to save pseudonymization map (JSON) when pseudonymize mode used")
    g_anon.add_argument("--anonymize-salt", type=str, default=None, help="Optional salt for pseudonym hashing (recommended for reproducibility)")
    g_anon.add_argument("--remove-private-tags", action="store_true", help="Remove private tags from outputs (safe default when anonymizing)")

    # Performance & batch group
    g_perf = p.add_argument_group('Batch & performance')
    g_perf.add_argument("-b", "--batch", action="store_true", help="Treat path as directory and scan recursively for .dcm files")
    g_perf.add_argument("-t", "--threads", type=int, default=DEFAULT_THREADS, help="Threads for batch processing")
    g_perf.add_argument("--max-depth", type=int, default=None, help="Max recursion depth when scanning folders (None = unlimited)")
    g_perf.add_argument("--min-progress-report", type=int, default=50,
                        help="If processing more than this many files, suppress per-file metadata prints and show progress only")

    # Misc
    g_misc = p.add_argument_group('Misc')
    g_misc.add_argument("--force", action="store_true", help="Force read even if file meta missing (use with caution)")
    g_misc.add_argument("--show-private-values", action="store_true", help="Show full private tag values (may contain PHI)")
    g_misc.add_argument("--minimal", action="store_true", help="Only show STAT quick summary")
    g_misc.add_argument("-q", "--quiet", action="store_true", help="Quiet mode (suppress non-critical prints)")
    g_misc.add_argument("-v", "--verbose", action="count", default=0, help="Verbose mode (-v, -vv)")
    g_misc.add_argument("--log-file", type=str, default=None, help="Optional log file path")
    g_misc.add_argument("--check-deps", action="store_true", help="Check for optional dependencies and exit")
    g_misc.add_argument("--version", action="store_true", help="Show version and exit")
    g_misc.add_argument("--no-interactive", action="store_true", help="Do not prompt/REPL (useful for automation)")
    g_misc.add_argument("--export-schema", nargs='?', const='dicom_schema.csv', help="Export a CSV header template for Kaggle-style aggregation (optional filename)")
    return p

# ------------------ Logging ------------------

def configure_logging(quiet: bool, verbose_count: int, log_file: Optional[str] = None):
    if quiet:
        level = logging.WARNING
    else:
        if verbose_count >= 2:
            level = logging.DEBUG
        elif verbose_count == 1:
            level = logging.INFO
        else:
            level = logging.INFO
    handlers = [logging.StreamHandler(sys.stdout)]
    if log_file:
        try:
            fh = logging.FileHandler(log_file)
            handlers.append(fh)
        except Exception as e:
            logging.warning('Could not open log file %s: %s', log_file, e)
    logging.basicConfig(level=level, format='%(asctime)s %(levelname)s: %(message)s', handlers=handlers)
    logging.debug("Logging initialized. level=%s, log_file=%s", logging.getLevelName(level), log_file)

# ------------------ Dependency check ------------------

def check_dependencies() -> Dict[str, bool]:
    deps = {
        'pillow': _PIL_AVAILABLE,
        'numpy': _PIL_AVAILABLE and 'numpy' in sys.modules,
        'pandas': _PANDAS_AVAILABLE,
        'tqdm': _TQDM,
        'dateutil.relativedelta': _RELATIVEDELTA_AVAILABLE,
        'cryptography': _CRYPTO_AVAILABLE
    }
    return deps

# ------------------ Utilities ------------------

def md5_short(s: str, n: int = 8) -> str:
    return hashlib.md5(s.encode('utf-8')).hexdigest()[:n]


def sanitize_for_json(obj: Any) -> Any:
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, (bytes, bytearray)):
        try:
            return obj.decode('utf-8', errors='ignore')
        except Exception:
            return str(obj)
    if isinstance(obj, (list, tuple)):
        return [sanitize_for_json(x) for x in obj]
    try:
        from pydicom.dataset import Dataset
        if isinstance(obj, Dataset):
            out = {}
            for k in obj.keys():
                try:
                    v = obj.get(k)
                except Exception:
                    v = None
                out[str(k)] = sanitize_for_json(v)
            return out
    except Exception:
        pass
    try:
        from pydicom.multival import MultiValue
        if isinstance(obj, MultiValue):
            return [sanitize_for_json(x) for x in obj]
    except Exception:
        pass
    try:
        return str(obj)
    except Exception:
        return repr(obj)

# ------------------ Date helpers ------------------

def parse_dicom_time_str(t: Optional[str]) -> Optional[datetime.time]:
    if not t:
        return None
    t = str(t).split('.')[0].ljust(6, '0')[:6]
    try:
        return datetime.strptime(t, "%H%M%S").time()
    except Exception:
        return None


def detailed_delta_components(dt_obj: datetime, now: Optional[datetime] = None) -> Tuple[int,int,int,int,int,int]:
    if now is None:
        now = datetime.now()
    if _RELATIVEDELTA_AVAILABLE:
        rd = relativedelta(now, dt_obj) if now >= dt_obj else relativedelta(dt_obj, now)
        return abs(rd.years), abs(rd.months), abs(rd.days), abs(rd.hours), abs(rd.minutes), abs(rd.seconds)
    total_seconds = int(abs(int((now - dt_obj).total_seconds())))
    days = total_seconds // 86400
    years = days // 365; days -= years * 365
    months = days // 30; days -= months * 30
    hours = (total_seconds % 86400) // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    return years, months, days, hours, minutes, seconds


def human_readable_delta(dt_obj: datetime, now: Optional[datetime] = None) -> str:
    years, months, days, hours, minutes, seconds = detailed_delta_components(dt_obj, now)
    parts = []
    if years: parts.append(f"{years} year{'s' if years!=1 else ''}")
    if months: parts.append(f"{months} month{'s' if months!=1 else ''}")
    if days: parts.append(f"{days} day{'s' if days!=1 else ''}")
    if hours: parts.append(f"{hours} hour{'s' if hours!=1 else ''}")
    if minutes: parts.append(f"{minutes} minute{'s' if minutes!=1 else ''}")
    if not parts: return "just now"
    return ", ".join(parts[:4])


def format_dicom_datetime(date_str: Optional[str], time_str: Optional[str]) -> Tuple[str,bool,Optional[datetime]]:
    if not date_str:
        return "N/A", False, None
    try:
        date_obj = datetime.strptime(str(date_str), "%Y%m%d")
    except Exception:
        return "Invalid Date", False, None
    tp = parse_dicom_time_str(time_str)
    dt_obj = datetime.combine(date_obj.date(), tp) if tp else date_obj
    now = datetime.now()
    delta_seconds = int((now - dt_obj).total_seconds())
    future = delta_seconds < 0
    rel = human_readable_delta(dt_obj, now)
    rel_text = f"in {rel}" if future and rel != "just now" else (f"{rel} ago" if not future and rel != "just now" else ("in a moment" if future else "just now"))
    formatted = dt_obj.strftime("%d %B %Y, %I:%M %p")
    return f"{formatted} ({rel_text})", future, dt_obj

# ------------------ PHI / private tags ------------------

def check_phi(ds: pydicom.dataset.Dataset) -> List[str]:
    phi = []
    for k in ["PatientName", "PatientID", "PatientAddress", "OtherPatientIDsSequence", "ReferringPhysicianName", "StudyComments", "InstitutionName", "StationName"]:
        if ds.get(k):
            phi.append(k)
    private = [t for t in ds.keys() if t.is_private]
    if private:
        phi.append(f"Private tags: {len(private)}")
    for seq in ["RequestingService", "RequestingPhysician", "RequestingPhysicianName"]:
        if ds.get(seq):
            phi.append(seq)
    return phi


def list_private_tags(ds: pydicom.dataset.Dataset, show_values: bool=False) -> List[Dict[str, Any]]:
    out = []
    tags = sorted([t for t in ds.keys() if t.is_private], key=lambda x: (x.group, x.elem))
    for tag in tags:
        try:
            elem = ds[tag]
            tag_str = f"({tag.group:04x},{tag.elem:04x})"
            keyword = getattr(elem, 'keyword', '') or ''
            name = getattr(elem, 'name', '') or ''
            creator_tag = pydicom.tag.Tag(tag.group, 0x0010)
            creator = ds.get(creator_tag)
            creator_str = str(creator) if creator else ''
            value_preview = sanitize_for_json(elem.value)
            if isinstance(value_preview, str) and len(value_preview) > 200:
                vp = value_preview[:197] + "..."
            else:
                vp = value_preview
            full = sanitize_for_json(elem.value) if show_values else None
            out.append({
                'tag': tag_str, 'group': f"0x{tag.group:04x}", 'element': f"0x{tag.elem:04x}",
                'keyword': keyword, 'name': name, 'creator': creator_str, 'value_preview': vp, 'full_value': full
            })
        except Exception:
            continue
    return out

# ------------------ is_urgent ------------------

def is_urgent(ds: pydicom.dataset.Dataset) -> Tuple[bool, List[str]]:
    reasons = []
    mod = str(ds.get("Modality", "")).upper()
    desc = str(ds.get("StudyDescription", "")).upper()
    if mod in ("CT", "MR") and any(x in desc for x in ["BRAIN", "HEAD", "STROKE", "TRAUMA", "INTRACRANIAL", "ICH", "HEMORRHAGE"]):
        reasons.append("Head study with stroke/trauma keywords")
    if "ANGIO" in desc or "CTA" in desc or "CT ANGIO" in desc:
        reasons.append("Angio/CTA study")
    if mod == "US" and "FAST" in desc:
        reasons.append("FAST ultrasound")
    age = compute_age_from_ds(ds)
    try:
        if isinstance(age, str) and age.endswith('Y'):
            a = int(age.rstrip('Y'))
            if a >= 65 and mod in ("CT", "MR") and "BRAIN" in desc:
                reasons.append("Elderly patient + brain imaging")
    except Exception:
        pass
    return (len(reasons) > 0, reasons)

# ------------------ Anonymization helpers ------------------

import os
import base64


def _pbkdf2_pseudonym(value: str, salt: bytes, iters: int = 100000, length: int = 12) -> str:
    # returns a URL-safe base64 pseudonym fragment
    if not _CRYPTO_AVAILABLE:
        raise RuntimeError("cryptography not available")
    value_bytes = str(value).encode('utf-8')
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=length,
        salt=salt,
        iterations=iters,
        backend=default_backend()
    )
    key = kdf.derive(value_bytes)
    return base64.urlsafe_b64encode(key).decode('utf-8').rstrip('=')


def pseudonymize_value(value: Any, salt_str: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value_str = str(value)
    if salt_str is None:
        # no salt provided: generate random salt for this run (kept by caller in mapping)
        salt_bytes = os.urandom(16)
    else:
        salt_bytes = salt_str.encode('utf-8')

    if _CRYPTO_AVAILABLE:
        try:
            pseud = _pbkdf2_pseudonym(value_str, salt_bytes)
            return f"anon_{pseud}"
        except Exception as e:
            logging.debug('PBKDF2 pseudonym failed: %s', e)
    # fallback to HMAC-SHA256
    key = salt_bytes if salt_bytes else b'default_salt'
    hm = hmac.new(key, value_str.encode('utf-8'), hashlib.sha256).hexdigest()[:16]
    return f"anon_{hm}"


def apply_anonymization_to_sanitized(sanitized: Dict[str, Any], tags: List[str], mode: str, salt: Optional[str]) -> Tuple[Dict[str, Any], Dict[str, str], Optional[str]]:
    mapping: Dict[str, str] = {}
    used_salt = salt
    # If pseudonymize and no salt provided, generate run-level salt and return it for persistence
    if mode == 'pseudonymize' and salt is None:
        used_salt = base64.urlsafe_b64encode(os.urandom(12)).decode('utf-8')
        logging.warning('No anonymize-salt provided: generating a random salt for this run (saving it to map will allow reproducibility)')
    for tag in tags:
        # allow both snake_case and human readable keys
        possible_keys = [tag, tag.replace('_', ' ').title(), tag.replace('_', ' ').replace(' ', ' ')]
        found = None
        for k in possible_keys:
            if k in sanitized:
                found = k
                break
        if not found:
            # try case-insensitive match
            for k in list(sanitized.keys()):
                if k.lower().replace(' ', '_') == tag.lower().replace(' ', '_'):
                    found = k
                    break
        if not found:
            continue
        orig = sanitized.get(found)
        if mode == 'pseudonymize':
            pseud = pseudonymize_value(orig, used_salt)
            mapping[str(orig)] = pseud
            sanitized[found] = pseud
        else:
            sanitized[found] = 'REDACTED'
    return sanitized, mapping, used_salt

# ------------------ Pixel / thumbnail ------------------

def save_pixel_images(ds: pydicom.dataset.Dataset, out_prefix: str, ext: str = '.png') -> List[str]:
    saved: List[str] = []
    if 'PixelData' not in ds:
        return saved
    if not _PIL_AVAILABLE:
        logging.debug('Pillow/numpy not available; cannot save pixel images')
        return saved
    try:
        arr = ds.pixel_array
    except Exception as e:
        logging.debug('pixel_array decode failed: %s', e)
        return saved
    try:
        np_arr = np.asarray(arr)
    except Exception:
        return saved

    if np_arr.ndim == 2:
        frames = [np_arr]
    elif np_arr.ndim == 3:
        # heuristics
        if np_arr.shape[0] <= 512 and (np_arr.shape[1] > 4 and np_arr.shape[2] > 4):
            frames = [np_arr[i] for i in range(np_arr.shape[0])]
        else:
            frames = [np_arr]
    elif np_arr.ndim == 4:
        frames = [np_arr[i] for i in range(np_arr.shape[0])]
    else:
        frames = [np_arr]

    ext_l = ext.lower()
    format_map = {'.png': 'PNG', '.jpg': 'JPEG', '.jpeg': 'JPEG', '.bmp': 'BMP', '.tiff': 'TIFF', '.tif': 'TIFF'}
    pil_format = format_map.get(ext_l, 'PNG')

    for idx, frame in enumerate(frames):
        f = frame
        if hasattr(f, 'dtype') and f.dtype != np.uint8:
            try:
                fmin, fmax = float(f.min()), float(f.max())
                if fmax - fmin > 0:
                    f = ((f - fmin) / (fmax - fmin) * 255.0).astype(np.uint8)
                else:
                    f = (f * 0).astype(np.uint8)
            except Exception:
                try:
                    f = f.astype(np.uint8)
                except Exception:
                    continue
        try:
            img = Image.fromarray(f)
        except Exception:
            try:
                img = Image.fromarray(np.squeeze(f))
            except Exception:
                continue

        if img.mode not in ('L', 'RGB', 'RGBA'):
            try:
                img = img.convert('L')
            except Exception:
                img = img.convert('RGB')

        if len(frames) == 1:
            outpath = f"{out_prefix}{ext_l}"
        else:
            outpath = f"{out_prefix}_frame{idx}{ext_l}"
        try:
            Path(outpath).parent.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass
        try:
            img.save(outpath, format=pil_format)
            saved.append(outpath)
        except Exception:
            try:
                img.save(outpath)
                saved.append(outpath)
            except Exception:
                continue
    return saved


def try_thumbnail(ds: pydicom.dataset.Dataset, out_path: str, max_size: int = 256) -> bool:
    if not _PIL_AVAILABLE:
        return False
    try:
        if 'PixelData' not in ds:
            return False
        arr = ds.pixel_array
        if arr is None:
            return False
        np_arr = np.asarray(arr)
        if np_arr.ndim == 3:
            idx = np_arr.shape[0] // 2
            frame = np_arr[idx]
        elif np_arr.ndim == 4:
            frame = np_arr[0, ...]
        else:
            frame = np_arr
        if frame.dtype != np.uint8:
            fmin, fmax = float(frame.min()), float(frame.max())
            if fmax - fmin > 0:
                frame = ((frame - fmin) / (fmax - fmin) * 255.0).astype(np.uint8)
            else:
                frame = (frame * 0).astype(np.uint8)
        img = Image.fromarray(frame)
        img = img.convert('L') if img.mode != 'L' else img
        img.thumbnail((max_size, max_size))
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        img.save(out_path, format='PNG')
        return True
    except Exception as e:
        logging.debug('Thumbnail creation failed: %s', e)
        return False

# ------------------ Metadata extraction ------------------

def get_dicom_metadata_from_ds(ds: pydicom.dataset.Dataset, file_path: str) -> Dict[str, Any]:
    try:
        study_dt_str, warn_future, dt_obj = format_dicom_datetime(ds.get('StudyDate', 'N/A'), ds.get('StudyTime', 'N/A'))
        stat_report = {
            'patient_id': str(ds.get('PatientID', 'N/A')),
            'patient_name': str(ds.get('PatientName', 'N/A')),
            'patient_age': compute_age_from_ds(ds),
            'patient_sex': str(ds.get('PatientSex', 'N/A')),
            'modality': str(ds.get('Modality', 'N/A')),
            'body_part_examined': str(ds.get('BodyPartExamined', 'N/A')),
            'study_description': str(ds.get('StudyDescription', 'N/A')),
            'study_date_time': study_dt_str,
            'phi_removed': ds.get('PatientIdentityRemoved', 'Unknown'),
            '_study_date_future': warn_future,
            '_file_path': file_path,
        }
        full_report = {
            'manufacturer': str(ds.get('Manufacturer', 'N/A')),
            'model': str(ds.get('ManufacturerModelName', 'N/A')),
            'software_versions': ds.get('SoftwareVersions', 'N/A'),
            'magnetic_field_strength': ds.get('MagneticFieldStrength', 'N/A'),
            'slice_thickness': ds.get('SliceThickness', 'N/A'),
            'pixel_spacing': ds.get('PixelSpacing', 'N/A'),
            'rows': ds.get('Rows', 'N/A'),
            'columns': ds.get('Columns', 'N/A'),
            'photometric_interpretation': ds.get('PhotometricInterpretation', 'N/A'),
            'study_instance_uid': ds.get('StudyInstanceUID', 'N/A'),
            'series_instance_uid': ds.get('SeriesInstanceUID', 'N/A'),
            'transfer_syntax_uid': str(getattr(ds.file_meta, 'TransferSyntaxUID', 'N/A')),
        }
        phi_flags = check_phi(ds)
        urgent, reasons = is_urgent(ds)
        private_tags = list_private_tags(ds, show_values=False)
        # add some extras
        if hasattr(ds, 'NumberOfFrames'):
            full_report['number_of_frames'] = ds.NumberOfFrames
        return {'stat': stat_report, 'full': full_report, 'phi_flags': phi_flags, 'urgent': urgent, 'urgent_reasons': reasons, 'private_tags': private_tags}
    except Exception as e:
        return {'Error': f"Unexpected error extracting metadata: {e}\n{traceback.format_exc()}"}

# ------------------ compute age ------------------

def compute_age_from_ds(ds: pydicom.dataset.Dataset) -> str:
    age = ds.get('PatientAge')
    if age and str(age).strip():
        return str(age)
    bdate = ds.get('PatientBirthDate') or ds.get('PatientsBirthDate')
    if bdate:
        try:
            bd = datetime.strptime(str(bdate), '%Y%m%d')
            years = (datetime.now() - bd).days // 365
            return f"{years}Y"
        except Exception:
            return 'N/A'
    return 'N/A'

# ------------------ Output helpers ------------------

def parse_output_items(items: List[str], outdir: str) -> Dict[str, List[str]]:
    outmap: Dict[str, List[str]] = {}
    outdirp = Path(outdir)
    for raw in items:
        if not raw:
            continue
        parts = [p.strip() for p in raw.replace(';', ',').split(',') if p.strip()]
        for p in parts:
            if '=' in p:
                t, fn = p.split('=', 1)
                t = t.strip().lower()
                if t not in SUPPORTED_TYPES:
                    logging.warning("Unsupported output type '%s' in '%s' -> skipped", t, p)
                    continue
                path = Path(fn) if Path(fn).is_absolute() or Path(fn).parent != Path('.') else Path.cwd() / fn
                outmap.setdefault(t, []).append(str(path))
                continue
            if p.lower() in SUPPORTED_TYPES:
                outmap.setdefault(p.lower(), []).append('')
                continue
            if '.' in p:
                ext = p.rsplit('.', 1)[1].lower()
                t = EXT_TO_TYPE.get(ext)
                if not t:
                    logging.warning("Unknown extension '.%s' for '%s' -- supported: .json .csv .html .png .jpg .jpeg .bmp .tiff", ext, p)
                    continue
                path = Path(p) if Path(p).is_absolute() or Path(p).parent != Path('.') else Path.cwd() / p
                outmap.setdefault(t, []).append(str(path))
                continue
            logging.warning("Unrecognized output argument '%s' -- supported types: %s", p, ','.join(sorted(SUPPORTED_TYPES)))
    return outmap

# ------------------ find files ------------------

def find_dicom_files(root: str, max_depth: Optional[int] = None) -> List[str]:
    rootp = Path(root)
    if not rootp.exists():
        return []
    # case-insensitive suffix check
    out: List[str] = []
    if max_depth is None:
        for p in rootp.rglob('*'):
            if p.is_file() and p.suffix.lower() == '.dcm':
                out.append(str(p))
    else:
        base_level = len(rootp.parts)
        for p in rootp.rglob('*'):
            if p.is_file() and p.suffix.lower() == '.dcm' and (len(p.parts) - base_level) <= max_depth:
                out.append(str(p))
    return out

# ------------------ Flatten helper ------------------

def _flatten_for_csv_value(v: Any) -> Any:
    if v is None:
        return ''
    if isinstance(v, (dict, list, tuple)):
        try:
            return json.dumps(v, ensure_ascii=False)
        except Exception:
            return str(v)
    return v

# ------------------ Processing per-file ------------------

def process_and_save(path: str, args, outputs_map: Dict[str, List[str]], dry_run: bool=False, suppress_details: bool = False) -> Optional[Dict[str, Any]]:
    pathp = Path(path)
    try:
        ds = pydicom.dcmread(str(pathp), force=args.force)
    except InvalidDicomError:
        logging.error('Not a valid DICOM: %s', path)
        return None
    except Exception as e:
        logging.error('Failed to read DICOM %s: %s', path, e)
        logging.debug(traceback.format_exc())
        return None

    metadata = get_dicom_metadata_from_ds(ds, str(pathp))
    if 'Error' in metadata:
        logging.error('Metadata extraction error for %s: %s', path, metadata.get('Error'))
        return None

    sanitized: Dict[str, Any] = {}
    stat = metadata.get('stat', {})
    full = metadata.get('full', {})
    # merge into snake_case flat dict
    sanitized.update({k: sanitize_for_json(v) for k, v in stat.items() if not str(k).startswith('_')})
    sanitized.update({k: sanitize_for_json(v) for k, v in full.items()})
    sanitized['phi_flags'] = metadata.get('phi_flags', [])
    sanitized['urgent'] = metadata.get('urgent', False)
    sanitized['urgent_reasons'] = metadata.get('urgent_reasons', [])
    sanitized['private_tags'] = metadata.get('private_tags', [])

    # anonymize if requested
    anon_map_local: Dict[str, str] = {}
    used_salt: Optional[str] = None
    if args.anonymize:
        tags_to_anon = DEFAULT_ANON_TAGS if not args.anonymize_tags else [t.strip() for t in args.anonymize_tags.split(',') if t.strip()]
        sanitized, amap, used_salt = apply_anonymization_to_sanitized(sanitized, tags_to_anon, args.anonymize_mode, args.anonymize_salt)
        if amap:
            anon_map_local.update(amap)

    # decide console output
    if not args.batch or args.verbose > 0:
        logging.info('STAT: %s | %s | %s %s | %s', sanitized.get('patient_age','N/A'), sanitized.get('patient_sex','N/A'), sanitized.get('modality','N/A'), sanitized.get('body_part_examined','N/A'), sanitized.get('study_date_time','N/A'))
    else:
        if not suppress_details:
            logging.debug('Processed %s (details suppressed)', path)

    base = pathp.stem
    uniq = md5_short(str(pathp.resolve()))
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    thumb_path: Optional[str] = None

    # JSON per-file
    if 'json' in outputs_map:
        targets = outputs_map.get('json') or ['']
        for t in targets:
            outpath = Path(t) if t else out_dir / f"{base}_{uniq}_metadata.json"
            if args.dry_run:
                logging.info('DRY RUN: would save JSON -> %s', outpath)
            else:
                try:
                    if outpath.exists() and args.no_overwrite:
                        logging.warning('Skipping existing file (no-overwrite): %s', outpath)
                    else:
                        with open(outpath, 'w', encoding='utf-8') as f:
                            json.dump(sanitized, f, indent=2, ensure_ascii=False)
                        logging.info('Saved JSON -> %s', outpath)
                except Exception as e:
                    logging.error('Failed to save JSON: %s', e)

    # CSV per-file
    if 'csv' in outputs_map:
        targets = outputs_map.get('csv') or ['']
        for t in targets:
            outpath = Path(t) if t else out_dir / f"{base}_{uniq}_metadata.csv"
            if args.dry_run:
                logging.info('DRY RUN: would save CSV -> %s', outpath)
            else:
                try:
                    if outpath.exists() and args.no_overwrite:
                        logging.warning('Skipping existing file (no-overwrite): %s', outpath)
                    else:
                        with open(outpath, 'w', newline='', encoding='utf-8') as f:
                            if sanitized:
                                writer = csv.DictWriter(f, fieldnames=list(sanitized.keys()))
                                writer.writeheader()
                                writer.writerow({k: _flatten_for_csv_value(v) for k, v in sanitized.items()})
                        logging.info('Saved CSV -> %s', outpath)
                except Exception as e:
                    logging.error('Failed to save CSV: %s', e)

    # Thumbnail
    if 'thumbnail' in outputs_map:
        targets = outputs_map.get('thumbnail') or ['']
        for t in targets:
            dest = Path(t) if t else out_dir / 'thumbnails' / f"{base}_{uniq}_thumb.png"
            if args.dry_run:
                logging.info('DRY RUN: would create thumbnail -> %s', dest)
            else:
                try:
                    ok = try_thumbnail(ds, str(dest))
                    if ok:
                        logging.info('Thumbnail -> %s', dest)
                        thumb_path = str(dest)
                    else:
                        logging.warning('Thumbnail unavailable or failed (compressed/unsupported) for %s', path)
                except Exception as e:
                    logging.error('Thumbnail generation failed: %s', e)

    # HTML
    if 'html' in outputs_map:
        targets = outputs_map.get('html') or ['']
        for t in targets:
            dest = Path(t) if t else out_dir / f"{base}_{uniq}_report.html"
            if args.dry_run:
                logging.info('DRY RUN: would save HTML -> %s', dest)
            else:
                try:
                    generate_html_report({'STAT_Report': sanitized, 'Full_Report': {}}, thumb_path, str(dest))
                    logging.info('HTML report -> %s', dest)
                except Exception as e:
                    logging.error('Failed to save HTML: %s', e)

    # FHIR
    if 'fhir' in outputs_map:
        targets = outputs_map.get('fhir') or ['']
        for t in targets:
            dest = Path(t) if t else out_dir / f"{base}_{uniq}_imagingstudy.json"
            if args.dry_run:
                logging.info('DRY RUN: would save FHIR -> %s', dest)
            else:
                try:
                    imaging = dicom_to_fhir_imagingstudy(sanitized)
                    with open(dest, 'w', encoding='utf-8') as f:
                        json.dump(imaging, f, indent=2, ensure_ascii=False)
                    logging.info('FHIR ImagingStudy -> %s', dest)
                except Exception as e:
                    logging.error('Failed to save FHIR JSON: %s', e)

    # IMAGE (pixel extraction)
    if 'image' in outputs_map:
        targets = outputs_map.get('image') or ['']
        for t in targets:
            if t and Path(t).suffix:
                outpath = Path(t) if Path(t).is_absolute() or Path(t).parent != Path('.') else Path.cwd() / t
                prefix_no_ext = outpath.with_suffix('')
                ext = outpath.suffix.lower() or '.png'
                allowed = ('.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif')
                if ext not in allowed:
                    logging.warning("Unsupported image extension '%s' -> defaulting to .png", ext)
                    ext = '.png'
                    prefix_no_ext = outpath.with_suffix('')
            else:
                prefix_no_ext = out_dir / f"{base}_{uniq}_image"
                ext = '.png'
            if args.dry_run:
                logging.info('DRY RUN: would save pixel images -> %s*%s', prefix_no_ext, ext)
            else:
                try:
                    saved = save_pixel_images(ds, str(prefix_no_ext), ext=ext)
                    if saved:
                        logging.info('Saved pixel image(s): %s', saved)
                    else:
                        logging.warning('No pixel images saved (pixel data missing, compressed or not decodable) for %s', path)
                except Exception as e:
                    logging.error('Failed to extract/save pixel images: %s', e)

    # REPORT (metadata-as-image)
    if 'report' in outputs_map:
        targets = outputs_map.get('report') or ['']
        for t in targets:
            dest = Path(t) if t else out_dir / f"{base}_{uniq}_metadata_report.png"
            if args.dry_run:
                logging.info('DRY RUN: would generate metadata image -> %s', dest)
            else:
                try:
                    generate_metadata_image({'STAT_Report': sanitized, 'Private_Tags': sanitized.get('private_tags', [])}, thumb_path, str(dest))
                    logging.info('Metadata image -> %s', dest)
                except Exception as e:
                    logging.error('Failed to generate metadata image: %s', e)

    # return sanitized + mapping info for aggregation
    out = dict(sanitized)
    if anon_map_local:
        out['_anon_map'] = anon_map_local
    if used_salt:
        out['_anon_salt'] = used_salt
    return out

# ------------------ Reporting helpers ------------------

def generate_html_report(metadata: Dict[str, Any], thumbnail_path: Optional[str], out_html: str):
    stat = metadata.get('STAT_Report', {})
    full = metadata.get('Full_Report', {})
    html_lines = []
    html_lines.append('<!doctype html>')
    html_lines.append('<html><head><meta charset="utf-8"><title>DICOM Report</title>')
    html_lines.append('<style>body{font-family:Arial,Helvetica,sans-serif;padding:16px} .stat{background:#ffecec;padding:8px;border-radius:6px} .full{background:#eef9ec;padding:8px;border-radius:6px} h1{font-size:18px}</style>')
    html_lines.append('</head><body>')
    html_lines.append('<h1>DICOM Metadata Report</h1>')
    if thumbnail_path and Path(thumbnail_path).exists():
        html_lines.append(f'<img src="{Path(thumbnail_path).name}" alt="thumbnail" style="max-width:200px;float:right;margin-left:12px">')
    html_lines.append('<h2>STAT (critical)</h2>')
    html_lines.append('<div class="stat"><ul>')
    for k, v in stat.items():
        if k.startswith('_'):
            continue
        html_lines.append(f'<li><strong>{k}:</strong> {sanitize_for_json(v)}</li>')
    html_lines.append('</ul></div>')
    html_lines.append('<h2>Full (technical)</h2>')
    html_lines.append('<div class="full"><ul>')
    for k, v in full.items():
        html_lines.append(f'<li><strong>{k}:</strong> {sanitize_for_json(v)}</li>')
    html_lines.append('</ul></div>')
    html_lines.append('<h2>Private Tags</h2>')
    html_lines.append('<div class="full"><ul>')
    for p in metadata.get('Private_Tags', []):
        html_lines.append(f'<li><strong>{p.get("tag")}:</strong> Creator: {p.get("creator")} | Name: {p.get("name")} | Preview: {p.get("value_preview")}</li>')
    html_lines.append('</ul></div>')
    html_lines.append('</body></html>')
    with open(out_html, 'w', encoding='utf-8') as f:
        f.write('\n'.join(html_lines))


def generate_metadata_image(metadata: Dict[str, Any], thumbnail_path: Optional[str], out_image: str, width: int = 1200):
    if not _PIL_AVAILABLE:
        raise RuntimeError('Pillow not installed')
    stat = metadata.get('STAT_Report', {})
    full = metadata.get('Full_Report', {})
    private = metadata.get('Private_Tags', [])
    margin = 24
    right_col_width = 320 if thumbnail_path else 0
    lines: List[str] = []
    lines.append('DICOM METADATA REPORT')
    lines.append('')
    lines.append('STAT (critical):')
    for k, v in stat.items():
        if k.startswith('_'):
            continue
        lines.append(f"{k}: {v}")
    lines.append('')
    if metadata.get('Urgent'):
        lines.append(f"URGENT: {'; '.join(metadata.get('Urgent_Reasons', []))}")
        lines.append('')
    if metadata.get('PHI_Flags'):
        lines.append(f"PHI-like: {', '.join(metadata.get('PHI_Flags', []))}")
        lines.append('')
    lines.append('Private Tags:')
    for p in private:
        lines.append(f"{p.get('tag')} {p.get('creator') or 'N/A'} {p.get('name') or p.get('keyword') or ''}")
        lines.append(f"Preview: {p.get('value_preview')}")
    lines.append('')
    lines.append('Full (technical):')
    for k, v in full.items():
        lines.append(f"{k}: {v}")
    try:
        font = ImageFont.load_default()
        title_font = ImageFont.load_default()
    except Exception:
        font = None
        title_font = None
    line_h = 14
    if title_font:
        try:
            line_h = max(line_h, title_font.getsize("A")[1])
        except Exception:
            line_h = 14
    canvas_h = margin * 2 + line_h * (len(lines) + 2)
    img = Image.new('RGB', (width, max(canvas_h, 200)), color='white')
    draw = ImageDraw.Draw(img)
    x = margin
    y = margin
    if title_font:
        draw.text((x, y), 'DICOM METADATA REPORT', fill='black', font=title_font)
    else:
        draw.text((x, y), 'DICOM METADATA REPORT', fill='black')
    y += line_h * 2
    for line in lines:
        if len(line) > 120:
            for chunk in [line[i:i+120] for i in range(0, len(line), 120)]:
                draw.text((x, y), chunk, fill='black', font=font)
                y += line_h
        else:
            draw.text((x, y), line, fill='black', font=font)
            y += line_h
    if thumbnail_path and Path(thumbnail_path).exists():
        try:
            thumb = Image.open(thumbnail_path)
            thumb.thumbnail((right_col_width, right_col_width))
            img.paste(thumb, (width - right_col_width - margin, margin))
        except Exception:
            pass
    img.save(out_image, format='PNG')

# ------------------ FHIR mapper ------------------

def dicom_to_fhir_imagingstudy(sanitized: Dict[str, Any]) -> Dict[str, Any]:
    # Very small mapping to ImagingStudy-like JSON. Not a full validator.
    study_uid = sanitized.get('study_instance_uid') or sanitized.get('StudyInstanceUID')
    patient_id = sanitized.get('patient_id')
    modality = sanitized.get('modality')
    inst = {
        'resourceType': 'ImagingStudy',
        'identifier': [{'system': 'urn:dicom:uid', 'value': study_uid}] if study_uid else [],
        'status': 'available',
        'subject': {'reference': f"Patient/{patient_id}"} if patient_id else None,
        'numberOfSeries': 1,
        'modality': modality,
        'started': sanitized.get('study_date_time')
    }
    # cleanup Nones
    return {k: v for k, v in inst.items() if v is not None}

# ------------------ Streaming aggregation ------------------

def stream_write_csv(rows_iter: Iterable[Dict[str, Any]], outpath: Path):
    """Write rows (dicts) to CSV streaming to avoid memory issues."""
    it = iter(rows_iter)
    try:
        first = next(it)
    except StopIteration:
        logging.warning('No rows to write to %s', outpath)
        return
    fieldnames = list(first.keys())
    with open(outpath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerow({k: _flatten_for_csv_value(v) for k, v in first.items()})
        cnt = 1
        for r in it:
            writer.writerow({k: _flatten_for_csv_value(r.get(k)) for k in fieldnames})
            cnt += 1
            if cnt % 1000 == 0:
                f.flush()
    logging.info('Wrote %d rows to %s', cnt, outpath)


def stream_write_json(rows_iter: Iterable[Dict[str, Any]], outpath: Path):
    # write as a JSON array streaming
    with open(outpath, 'w', encoding='utf-8') as f:
        f.write('[\n')
        first = True
        cnt = 0
        for r in rows_iter:
            if not first:
                f.write(',\n')
            f.write(json.dumps(r, ensure_ascii=False))
            first = False
            cnt += 1
            if cnt % 1000 == 0:
                f.flush()
        f.write('\n]')
    logging.info('Wrote %d rows to %s', cnt, outpath)

# ------------------ Main ------------------

def main():
    parser = build_parser()
    args = parser.parse_args()

    if args.version:
        print(f"dicom_tool.py version {__version__}")
        return

    configure_logging(args.quiet, args.verbose, args.log_file)

    if args.check_deps:
        deps = check_dependencies()
        for k, v in deps.items():
            logging.info('%s: %s', k, 'OK' if v else 'MISSING')
        return

    outputs_map = parse_output_items(args.output or [], args.output_dir)

    # Export schema quick path
    if args.export_schema:
        schema_file = Path(args.export_schema) if isinstance(args.export_schema, str) else Path('dicom_schema.csv')
        header = [
            'study_id','series_id','instance_id','patient_id','patient_age','patient_sex','modality',
            'body_part','manufacturer','model','study_date','study_time','study_date_time','path_to_image',
            'rows','columns','pixel_spacing','urgent','private_tags_count'
        ]
        logging.info('Writing schema header to %s', schema_file)
        with open(schema_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(header)
        return

    # Interactive REPL
    if args.path is None and not args.no_interactive:
        logging.info('Interactive mode. Enter DICOM path (or "exit").')
        while True:
            try:
                user_in = input('File path (or exit): ').strip()
            except EOFError:
                logging.info('Exiting REPL.')
                break
            if not user_in:
                continue
            if user_in.lower() in ('exit', 'quit', 'q'):
                logging.info('Bye — have a nice day!')
                break
            if not Path(user_in).exists():
                logging.error('Path not found: %s', user_in)
                continue
            run_map = outputs_map if outputs_map else {}
            process_and_save(user_in, args, run_map, dry_run=args.dry_run)
        return

    # Non-interactive
    if args.batch:
        if not args.path or not Path(args.path).is_dir():
            logging.error('Batch path is not a directory: %s', args.path)
            sys.exit(1)
        files = find_dicom_files(args.path, max_depth=args.max_depth)
        if not files:
            logging.warning('No .dcm files found under %s', args.path)
            return
        total = len(files)
        logging.info('Processing %d files with %d threads', total, max(1, min(args.threads, MAX_THREADS)))

        # suppression logic
        suppress_details = total >= max(args.min_progress_report, 1) and args.verbose == 0

        results_iterable = []  # will be list of dicts; for streaming, we will yield as they complete
        executor = ThreadPoolExecutor(max_workers=max(1, min(args.threads, MAX_THREADS)))
        futures = {executor.submit(process_and_save, fpath, args, outputs_map, args.dry_run, suppress_details): fpath for fpath in files}

        use_tqdm = _TQDM and not args.quiet
        global_anon_map: Dict[str, str] = {}
        global_salt: Optional[str] = None

        if use_tqdm:
            for fut in tqdm(as_completed(futures), total=len(futures), desc='Processing'):
                try:
                    res = fut.result()
                    if res:
                        # collect mapping pieces
                        amap = res.pop('_anon_map', None)
                        if amap:
                            global_anon_map.update(amap)
                        salt = res.pop('_anon_salt', None)
                        if salt and global_salt is None:
                            global_salt = salt
                        results_iterable.append(res)
                except Exception as e:
                    logging.error('Error in worker: %s', e)
        else:
            completed = 0
            for fut in as_completed(futures):
                try:
                    res = fut.result()
                    if res:
                        amap = res.pop('_anon_map', None)
                        if amap:
                            global_anon_map.update(amap)
                        salt = res.pop('_anon_salt', None)
                        if salt and global_salt is None:
                            global_salt = salt
                        results_iterable.append(res)
                except Exception as e:
                    logging.error('Error in worker: %s', e)
                completed += 1
                if completed % max(1, min(50, max(1, total//20))) == 0:
                    logging.info('Progress: %d / %d', completed, total)

        # Aggregation exports
        if results_iterable and ('agg-csv' in outputs_map or 'agg-json' in outputs_map):
            if _PANDAS_AVAILABLE:
                df = pd.DataFrame(results_iterable)
                if 'agg-csv' in outputs_map:
                    combined_csv = Path(args.output_dir) / 'combined_metadata.csv'
                    if args.dry_run:
                        logging.info('DRY RUN: would write combined CSV -> %s', combined_csv)
                    else:
                        try:
                            df.to_csv(combined_csv, index=False)
                            logging.info('Combined CSV -> %s', combined_csv)
                        except Exception as e:
                            logging.error('Failed to write combined CSV: %s', e)
                if 'agg-json' in outputs_map:
                    combined_json = Path(args.output_dir) / 'combined_metadata.json'
                    if args.dry_run:
                        logging.info('DRY RUN: would write combined JSON -> %s', combined_json)
                    else:
                        try:
                            df.to_json(combined_json, orient='records', force_ascii=False, indent=2)
                            logging.info('Combined JSON -> %s', combined_json)
                        except Exception as e:
                            logging.error('Failed to write combined JSON: %s', e)
            else:
                # stream write
                if 'agg-csv' in outputs_map:
                    combined_csv = Path(args.output_dir) / 'combined_metadata.csv'
                    if args.dry_run:
                        logging.info('DRY RUN: would write combined CSV -> %s', combined_csv)
                    else:
                        try:
                            stream_write_csv(iter(results_iterable), combined_csv)
                        except Exception as e:
                            logging.error('Failed to stream write combined CSV: %s', e)
                if 'agg-json' in outputs_map:
                    combined_json = Path(args.output_dir) / 'combined_metadata.json'
                    if args.dry_run:
                        logging.info('DRY RUN: would write combined JSON -> %s', combined_json)
                    else:
                        try:
                            stream_write_json(iter(results_iterable), combined_json)
                        except Exception as e:
                            logging.error('Failed to stream write combined JSON: %s', e)

        # save anonymization mapping if requested
        if global_anon_map and args.anonymize_map:
            map_path = Path(args.anonymize_map)
            outobj = {'mapping': global_anon_map}
            if global_salt:
                outobj['salt'] = global_salt
            if args.dry_run:
                logging.info('DRY RUN: would save anonymization map -> %s', map_path)
            else:
                try:
                    map_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(map_path, 'w', encoding='utf-8') as f:
                        json.dump(outobj, f, indent=2, ensure_ascii=False)
                    logging.info('Anonymization map -> %s', map_path)
                except Exception as e:
                    logging.error('Failed to save anonymization map: %s', e)

        logging.info('Batch complete. Reports (if any) in: %s', args.output_dir)
        return

    # Single file non-batch mode
    if not args.path:
        logging.error('No path provided and not interactive. Use --batch or provide a file path.')
        sys.exit(1)
    if not Path(args.path).exists():
        logging.error('Path does not exist: %s', args.path)
        sys.exit(1)

    process_and_save(args.path, args, outputs_map, dry_run=args.dry_run)


if __name__ == '__main__':
    main()
