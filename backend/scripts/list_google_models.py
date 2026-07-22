import google.generativeai as genai
import json
import os

CONFIG_PATH = "data/config.json"

def main():
    api_key = os.environ.get("GOOGLE_API_KEY")
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
                data = json.load(f)
                if data.get("google_api_key"):
                    api_key = data.get("google_api_key")
        except:
            pass

    if not api_key:
        print("No Google API Key found in env or data/config.json")
        return

    print(f"Using API Key: {api_key[:5]}...{api_key[-5:]}")
    
    with open("models_list.txt", "w") as f:
        try:
            genai.configure(api_key=api_key)
            f.write("Listing models...\n")
            for m in genai.list_models():
                if 'generateContent' in m.supported_generation_methods:
                    f.write(f"- {m.name}\n")
        except Exception as e:
            f.write(f"Error: {e}\n")


if __name__ == "__main__":
    main()
