import gradio as gr
import os
from transcription import process_audio_to_json
from json_to_pdf import make_pdf_from_case
from datetime import datetime

# Folder for saving files
output_path = "outputs"
os.makedirs(output_path, exist_ok=True)


import os
from transcription import process_audio_to_json
from json_to_pdf import make_pdf_from_case

# Folder for saving files
output_path = "outputs"
os.makedirs(output_path, exist_ok=True)


def handle_audio_upload(audio_file):
    if audio_file is None:
        return "❌ Please upload an audio file.", None, None, "❌ Please upload an audio file."

    try:
        print(f"🎙️ Processing file: {audio_file}")

        # Step 1️⃣ Process audio → structured JSON (tuple or dict)
        result = process_audio_to_json(audio_file)
        json_data = result[0] if isinstance(result, tuple) else result  # safe unpacking

        # Step 2️⃣ Create full output PDF path
        report_id = json_data.get("report_id", "report_unknown")
        pdf_filename = f"{report_id}.pdf"
        pdf_full_path = os.path.join(output_path, pdf_filename)

        # Step 3️⃣ Convert JSON → PDF
        make_pdf_from_case(json_data, pdf_full_path)

        # Step 4️⃣ Verify + return
        if not os.path.isfile(pdf_full_path):
            raise FileNotFoundError(f"PDF not created at {pdf_full_path}")

        print(f"✅ Report created successfully at: {pdf_full_path}")
        return json_data, pdf_full_path, f"✅ Report created successfully: {pdf_filename}"

    except Exception as e:
        print(f"❌ Error during processing: {e}")
        return None, None, None, f"Error: {str(e)}"


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
