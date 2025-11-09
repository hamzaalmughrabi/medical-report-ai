from fastapi import FastAPI, UploadFile, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware  # NEW IMPORT
import uvicorn
from main_pipeline import process_audio  # your full pipeline (whisper + GPT + PDF)

app = FastAPI()

# --- CORS CONFIGURATION START ---
origins = [
    "*",  # Allows all origins for development (safest for your local testing)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allows all HTTP methods (POST, GET, etc.)
    allow_headers=["*"],  # Allows all headers
)


# --- CORS CONFIGURATION END ---

@app.post("/generate-report")
async def generate_report(file: UploadFile):
    # Save audio
    file_path = f"uploads/{file.filename}"
    with open(file_path, "wb") as f:
        f.write(await file.read())

    # Process audio (returns path to PDF)
    # NOTE: Ensure you have an 'uploads' directory created next to this script!
    pdf_path = process_audio(file_path)

    # Return generated PDF
    return FileResponse(pdf_path, media_type="application/pdf", filename="medical_report.pdf")


if __name__ == "__main__":
    # Ensure you have the 'python-multipart' and 'uvicorn[standard]' packages installed!
    uvicorn.run(app, host="127.0.0.1", port=8000)