import re

with open('src/renderer/pages/history.html', 'r', encoding='utf-8') as f:
    html = f.read()

replacements = {
    '>Standard Archive v1.2<': '> <span data-i18n="standard_archive">Standard Archive v1.2</span> <',
    'p class="text-slate-600 dark:text-slate-400" data-i18n="history_desc"': 'p class="text-slate-600 dark:text-slate-400" data-i18n="history_empty_desc"'
}

for k, v in replacements.items():
    html = html.replace(k, v)

with open('src/renderer/pages/history.html', 'w', encoding='utf-8') as f:
    f.write(html)
