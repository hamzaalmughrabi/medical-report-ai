import os
import sys
from hybrid_processor import process_audio_locally
from json_to_pdf import make_pdf_from_case
OUTPUT_DIR = "outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)
# --- START FIX FOR CUDNN PATH ON CONDA (Mandatory) ---
# This block tells Windows where to find the CUDA/cuDNN DLLs installed by Conda.
# We will recursively search the Conda prefix for the missing DLLs.

# 1. Suppress the harmless Hugging Face symlink warning
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

# 2. Add the CUDA binaries path to the system DLL search path
if "CONDA_PREFIX" in os.environ and sys.platform == "win32":
    conda_env_path = os.environ["CONDA_PREFIX"]

    # Target file patterns for both cuDNN and cuBLAS
    TARGET_DLLS = ("cudnn_ops64", "cublas64")

    found_paths = 0
    added_dirs = set()  # Use a set to prevent adding the same directory multiple times

    # Recursively search the Conda environment directory for the required DLLs
    for root, _, files in os.walk(conda_env_path):
        dll_found_in_root = False
        for file in files:
            # Check if the file starts with cudnn_ops64 or cublas64 and ends with .dll
            if file.endswith(".dll") and any(file.startswith(target) for target in TARGET_DLLS):
                dll_dir = root
                dll_found_in_root = True
                break

        if dll_found_in_root and dll_dir not in added_dirs:
            # Path found! Add the directory containing the DLL
            try:
                # For Python 3.8+ on Windows, use os.add_dll_directory
                os.add_dll_directory(dll_dir)
                # Also add to PATH as a fallback/for other tools
                os.environ['PATH'] = dll_dir + os.pathsep + os.environ.get('PATH', '')
                print(f"✅ Found and added DLL path: {dll_dir}")
                added_dirs.add(dll_dir)
                found_paths += 1
            except AttributeError:
                # Fallback for older Python versions
                os.environ['PATH'] = dll_dir + os.pathsep + os.environ.get('PATH', '')
                print(f"✅ Found and added PATH (older Python): {dll_dir}")
                added_dirs.add(dll_dir)
                found_paths += 1

    if found_paths == 0:
        print(
            "⚠️ CRITICAL WARNING: Could not locate CUDA/cuDNN DLLs (cudnn_ops64_*.dll or cublas64_*.dll) in the active Conda environment. GPU usage will fail.")

# --- END FIX ---


if __name__ == "__main__":
    audio_file = "Recording (3).m4a"

    # NOTE: Ensure process_audio_locally in hybrid_processor.py uses device="cuda"
    json_data, json_path = process_audio_locally(audio_file)
    pdf_path = make_pdf_from_case(json_data, OUTPUT_DIR)
    print(f"✅ PDF generated: {pdf_path}")
