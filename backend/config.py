import os
from dotenv import load_dotenv
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SECRET_KEY = os.getenv("SECRET_KEY")

# Можно сразу задать дефолтное значение, если в .env забыли его указать
DEBUG = os.getenv("DEBUG", "False").lower() in ("true", "1")