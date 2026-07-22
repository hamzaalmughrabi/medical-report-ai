import os
from lkl.lkl_manager import LKLManager

def test_lkl_category_detection():

    # 1) Load LKL file
    lkl_path = "lkl/lkl.json"
    assert os.path.exists(lkl_path), "LKL file not found!"

    manager = LKLManager(lkl_path)

    # 2) Transcript containing knee pain keywords
    transcript = """
    The patient reports severe knee pain after a sports injury.
    Swelling is present and movement is limited.
    """

    # 3) Detect category
    category = manager.detect_category(transcript)

    print("\nDetected Category:", category)

    # 4) Assert correct category
    assert category == "knee_pain"
