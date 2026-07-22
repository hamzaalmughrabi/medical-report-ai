import os
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY") # set to None to use environment variable OPENAI_API_KEY
AUDIO_FOLDER = "audio_files"
MEMORY_FILE = "memory.json"
REPORTS_DIR = "reports"
WHISPER_MODEL = "whisper-1"      # uses OpenAI API transcription
LLM_MODEL = "gpt-4o-mini"
