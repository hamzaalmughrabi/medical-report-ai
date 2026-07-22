import urllib.request
import json
try:
    req = urllib.request.Request("http://127.0.0.1:8001/usage-stats")
    with urllib.request.urlopen(req) as response:
        data = response.read().decode('utf-8')
        print(data[:500])
except Exception as e:
    print(f"Error: {e}")
