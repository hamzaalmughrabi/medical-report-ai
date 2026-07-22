import re

with open('src/renderer/pages/report-view.html', 'r', encoding='utf-8') as f:
    html = f.read()

replacements = {
    '>Case Finalized Successfully<': '> <span data-i18n="case_finalized">Case Finalized Successfully</span> <',
    '>The clinical assessment has been merged with the intake record and committed to the registry.<': '> <span data-i18n="case_finalized_desc">The clinical assessment has been merged with the intake record and committed to the registry.</span> <',
    '>Clinical Report Preview<': '> <span data-i18n="clinical_report_preview">Clinical Report Preview</span> <',
    '>Committed to Registry<': ' data-i18n="committed_registry">Committed to Registry<',
    'Download PDF': '<span data-i18n="download_pdf">Download PDF</span>',
    '>Clinical Impression<': '> <span data-i18n="clinical_impression">Clinical Impression</span> <',
    '>Synthesizing diagnostic data...<': '> <span data-i18n="synthesizing_data">Synthesizing diagnostic data...</span> <',
    '>Treatment Directives<': '> <span data-i18n="treatment_directives">Treatment Directives</span> <',
    '>Awaiting AI refinement...<': '> <span data-i18n="awaiting_ai">Awaiting AI refinement...</span> <',
    '>Finalizing Record<': '> <span data-i18n="finalizing_record">Finalizing Record</span> <',
    'Back to Command Hub': '<span data-i18n="back_to_hub">Back to Command Hub</span>'
}

for k, v in replacements.items():
    html = html.replace(k, v)

with open('src/renderer/pages/report-view.html', 'w', encoding='utf-8') as f:
    f.write(html)
