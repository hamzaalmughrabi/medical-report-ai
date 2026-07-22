import re

with open('src/renderer/pages/patient-profile.html', 'r', encoding='utf-8') as f:
    html = f.read()

replacements = {
    'Registry Node: Active': '<span data-i18n="registry_node_active">Registry Node: Active</span>',
    '>Patient Profile<': '> <span data-i18n="patient_profile_title">Patient Profile</span> <',
    '>Detailed clinical overview and diagnostic history. manage patient records and initiate new sessions from this node.<': '> <span data-i18n="patient_profile_desc">Detailed clinical overview and diagnostic history. manage patient records and initiate new sessions from this node.</span> <',
    '>Profile Context<': '> <span data-i18n="profile_context">Profile Context</span> <',
    '>Standard Registry v1.0.4<': '> <span data-i18n="standard_registry">Standard Registry v1.0.4</span> <',
    '>Active<': ' data-i18n="active">Active<',
    'NEW SESSION': '<span data-i18n="new_session_btn">NEW SESSION</span>',
    'Details\n': '<span data-i18n="tab_overview">Details</span>\n',
    'Sessions <span': '<span data-i18n="tab_sessions">Sessions</span> <span',
    'Reports\n': '<span data-i18n="tab_reports">Reports</span>\n',
    'Clinical Observations\n': '<span data-i18n="clinical_observations">Clinical Observations</span>\n',
    'placeholder="Document physician observations and clinical notes here..."': 'data-i18n-placeholder="clinical_obs_placeholder" placeholder="Document physician observations and clinical notes here..."',
    '>Session Date<': ' data-i18n="session_date">Session Date<',
    '>Duration<': ' data-i18n="duration">Duration<',
    '>Phase<': ' data-i18n="phase_col">Phase<',
    '>Action<': ' data-i18n="action_col">Action<',
    '>Report ID<': ' data-i18n="report_id">Report ID<',
    '>Date<': ' data-i18n="date_col">Date<',
    '>Status<': ' data-i18n="status">Status<',
    '>Patient Stats<': ' data-i18n="patient_stats">Patient Stats<',
    '>Age / Gender<': ' data-i18n="age_gender">Age / Gender<',
    '>Member Since<': ' data-i18n="member_since">Member Since<',
    '>Uploaded Files<': ' data-i18n="uploaded_files">Uploaded Files<',
    '>No external files attached.<': ' data-i18n="no_external_files">No external files attached.<'
}

for k, v in replacements.items():
    html = html.replace(k, v)

with open('src/renderer/pages/patient-profile.html', 'w', encoding='utf-8') as f:
    f.write(html)
