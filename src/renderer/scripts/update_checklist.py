import re

with open('src/renderer/pages/checklist.html', 'r', encoding='utf-8') as f:
    html = f.read()

replacements = {
    '>Clinical Protocol: Active<': '> <span data-i18n="clinical_protocol_active">Clinical Protocol: Active</span> <',
    '>Consultation Checklist<': '> <span data-i18n="consultation_checklist">Consultation Checklist</span> <',
    '>Standardized clinical questions and protocol markers to ensure comprehensive diagnostic data collection during sessions.<': '> <span data-i18n="checklist_desc">Standardized clinical questions and protocol markers to ensure comprehensive diagnostic data collection during sessions.</span> <',
    'placeholder="Document a new protocol question..."': 'data-i18n-placeholder="checklist_placeholder" placeholder="Document a new protocol question..."',
    ' Append Question': ' <span data-i18n="append_question">Append Question</span>',
    '>Registry Empty<': '> <span data-i18n="registry_empty">Registry Empty</span> <',
    '>Your consultation protocol list is currently clear. Add standardized questions above.<': '> <span data-i18n="registry_empty_desc">Your consultation protocol list is currently clear. Add standardized questions above.</span> <'
}

for k, v in replacements.items():
    html = html.replace(k, v)

with open('src/renderer/pages/checklist.html', 'w', encoding='utf-8') as f:
    f.write(html)
