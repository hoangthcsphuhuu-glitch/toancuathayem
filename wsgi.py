# -*- coding: utf-8 -*-
"""
WSGI entry point cho production deployment.
Dùng cho Render.com, Railway, hoặc bất kỳ WSGI server nào.
"""
import os
from dotenv import load_dotenv

# Load .env trước khi import app
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
load_dotenv(_env_path)

from app import create_app

app = create_app()
