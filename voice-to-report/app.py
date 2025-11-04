import gradio as gr
import os
from processor import process_audio_to_json
from json_to_pdf import make_pdf_from_case
from datetime import datetime

# Folder for saving files
OUTPUT_DIR = "outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)


def handle_audio_upload(audio_file):
    if audio_file is None:
        return "❌ Please upload an audio file.", None, None, "❌ Please upload an audio file."

    try:
        # Process the audio → structured JSON (using our mock processor)
        json_data = process_audio_to_json(audio_file)

        # Convert JSON → PDF
        # The 'make_pdf_from_case' function takes the output *directory*
        # and returns the full *path* to the created PDF.
        pdf_path = make_pdf_from_case(json_data, OUTPUT_DIR)

        pdf_name = os.path.basename(pdf_path)

        return json_data, pdf_path, f"✅ Report created successfully: {pdf_name}"

    except Exception as e:
        print(f"Error: {e}")
        return None, None, f"❌ An error occurred: {e}"


# Gradio UI
with gr.Blocks(title="Medical Audio to Report") as demo:
    gr.Markdown(
        "## 🏥 Medical Transcription Report Generator\nUpload an audio file to generate a structured report (JSON + PDF).")

    with gr.Row():
        audio_input = gr.Audio(label="🎙️ Upload Doctor Audio", type="filepath")
        generate_button = gr.Button("Generate Report", variant="primary")

    status_output = gr.Textbox(label="Status", interactive=False)
    json_output = gr.JSON(label="🧾 Extracted JSON Data")
    pdf_output = gr.File(label="📄 Download PDF Report")

    generate_button.click(fn=handle_audio_upload,
                          inputs=[audio_input],
                          outputs=[json_output, pdf_output, status_output])

if __name__ == "__main__":
    demo.launch()
