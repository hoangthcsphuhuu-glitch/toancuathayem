# -*- coding: utf-8 -*-
"""
Math AI Chatbot - Ứng dụng Trợ lý Toán học AI cho Học sinh Lớp 6-7
Phát triển bởi: Thầy Lý Hoàng Em
Địa chỉ: xã Phú Hữu, tỉnh An Giang
Email: lyhoang2908@gmail.com | ĐTDĐ: 0919613350

Sử dụng Google Gemini AI (gemini-2.0-flash) và SGK Toán lớp 6, 7
"""

import os
import io
import json as json_module
import logging
import socket
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from functools import wraps

from dotenv import load_dotenv

# ⚠️ Load .env TRƯỚC khi import Config (vì Config đọc os.environ lúc import)
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
load_dotenv(_env_path)

from flask import (
    Flask, request, jsonify, session,
    render_template, send_from_directory,
)
from flask_cors import CORS

from config import Config
from models import db, User, ChatMessage, UserStats
from pdf_processor import PDFProcessor, process_pdfs_on_startup

# ──────────────────────────────────────────────
#  Force IPv4 — Tránh lỗi timeout do IPv6
#  Một số ISP tại Việt Nam không hỗ trợ tốt IPv6
#  đến Google API, gây timeout khi gọi API.
# ──────────────────────────────────────────────
_original_getaddrinfo = socket.getaddrinfo


def _getaddrinfo_ipv4(host, port, family=0, type=0, proto=0, flags=0):
    """Wrapper chỉ cho phép IPv4 khi kết nối đến Google API."""
    if isinstance(host, str) and 'googleapis.com' in host:
        return _original_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
    return _original_getaddrinfo(host, port, family, type, proto, flags)


socket.getaddrinfo = _getaddrinfo_ipv4

# ──────────────────────────────────────────────
#  Logging
# ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('app.log', encoding='utf-8'),
    ],
)
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
#  Khởi tạo Flask App
# ──────────────────────────────────────────────
app = Flask(
    __name__,
    static_folder=Config.STATIC_FOLDER,
    template_folder=Config.TEMPLATE_FOLDER,
)
app.config.from_object(Config)

# CORS
CORS(app, supports_credentials=True)

# Database
db.init_app(app)

# ──────────────────────────────────────────────
#  Gemini AI Setup — Ultra-Fast REST API + Keep-Alive + Multi-Model Fallback
#  Giải quyết triệt để vấn đề độ trễ và quá tải model
# ──────────────────────────────────────────────
import requests as http_requests

GEMINI_API_KEY = None
GEMINI_API_URL = None
GEMINI_READY = False

# Timeout ngắn cho mỗi model để chuyển đổi dự phòng nhanh (giây)
GEMINI_TIMEOUT = 18

# HTTP Session dùng chung (Keep-Alive connection pool) giúp giảm 1-3s bắt tay SSL
_http_session = http_requests.Session()
_adapter = http_requests.adapters.HTTPAdapter(
    pool_connections=10,
    pool_maxsize=20,
    max_retries=0,
)
_http_session.mount('https://', _adapter)
_http_session.mount('http://', _adapter)

# Bộ nhớ đệm câu trả lời nhanh (key: (grade, normalized_question) -> response)
_RESPONSE_CACHE = {}
_MAX_CACHE_SIZE = 200


def init_gemini():
    """Khởi tạo cấu hình Gemini AI REST API tốc độ cao."""
    global GEMINI_API_KEY, GEMINI_API_URL, GEMINI_READY

    api_key = Config.GEMINI_API_KEY or os.environ.get('GEMINI_API_KEY', '')

    # Fallback: đọc từ file config nếu env var trống
    if not api_key:
        config_file = os.path.join(os.path.dirname(__file__), 'api_key.txt')
        if os.path.exists(config_file):
            with open(config_file, 'r', encoding='utf-8') as f:
                api_key = f.read().strip()

    if not api_key:
        logger.warning(
            "⚠️  GEMINI_API_KEY chưa được cấu hình! "
            "Đặt biến môi trường GEMINI_API_KEY hoặc tạo file api_key.txt"
        )
        return False

    GEMINI_API_KEY = api_key
    GEMINI_API_URL = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{Config.GEMINI_MODEL}:generateContent?key={api_key}"
    )

    # Khởi tạo kết nối Keep-Alive sẵn đến Google API
    try:
        test_url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{Config.GEMINI_MODEL}?key={api_key}"
        )
        resp = _http_session.get(test_url, timeout=10)
        if resp.status_code == 200:
            model_info = resp.json()
            logger.info(f"✅ Gemini AI ({model_info.get('displayName', Config.GEMINI_MODEL)}) siêu tốc đã sẵn sàng!")
        else:
            logger.info(f"✅ Gemini AI ({Config.GEMINI_MODEL}) đã sẵn sàng!")
        GEMINI_READY = True
        return True
    except Exception as e:
        logger.error(f"❌ Lỗi kết nối Gemini AI: {e}")
        GEMINI_READY = True
        return True


def _call_gemini_rest(contents, system_instruction=None, temperature=0.6,
                      max_output_tokens=1200, timeout=GEMINI_TIMEOUT):
    """
    Gọi Gemini AI qua REST API với Keep-Alive, LOW thinking latency
    và tự động xoay vòng model dự phòng nếu model chính bận.
    """
    models_to_try = getattr(
        Config, 'GEMINI_FALLBACK_MODELS',
        [Config.GEMINI_MODEL, 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.8-flash']
    )

    base_payload = {
        'contents': contents,
        'generationConfig': {
            'temperature': temperature,
            'topP': 0.9,
            'topK': 40,
            'maxOutputTokens': max_output_tokens,
            'thinkingConfig': {
                'thinkingLevel': 'LOW',
            },
        },
        'safetySettings': [
            {'category': 'HARM_CATEGORY_HARASSMENT', 'threshold': 'BLOCK_NONE'},
            {'category': 'HARM_CATEGORY_HATE_SPEECH', 'threshold': 'BLOCK_NONE'},
            {'category': 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'threshold': 'BLOCK_MEDIUM_AND_ABOVE'},
            {'category': 'HARM_CATEGORY_DANGEROUS_CONTENT', 'threshold': 'BLOCK_MEDIUM_AND_ABOVE'},
        ],
    }

    if system_instruction:
        base_payload['systemInstruction'] = {
            'parts': [{'text': system_instruction}]
        }

    for model_name in models_to_try:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model_name}:generateContent?key={GEMINI_API_KEY}"
        )
        try:
            resp = _http_session.post(url, json=base_payload, timeout=timeout)

            # Nếu model không hỗ trợ thinkingLevel LOW, thử lại không có thinkingConfig
            if resp.status_code == 400 and 'thinking' in resp.text.lower():
                fallback_payload = dict(base_payload)
                gen_cfg = dict(fallback_payload['generationConfig'])
                gen_cfg.pop('thinkingConfig', None)
                fallback_payload['generationConfig'] = gen_cfg
                resp = _http_session.post(url, json=fallback_payload, timeout=timeout)

            if resp.status_code == 200:
                result = resp.json()
                candidates = result.get('candidates', [])
                if candidates:
                    parts = candidates[0].get('content', {}).get('parts', [])
                    # Lọc phần text trả lời chính (bỏ qua thought part nếu có)
                    for part in parts:
                        if not part.get('thought') and part.get('text'):
                            return part['text']
                    if parts and parts[0].get('text'):
                        return parts[0]['text']

            logger.warning(f"⚠️ Model {model_name} trả về HTTP {resp.status_code}, chuyển sang model dự phòng...")
        except Exception as e:
            logger.warning(f"⚠️ Model {model_name} quá thời gian/lỗi ({e}), chuyển sang model dự phòng...")
            continue

    return None


# ──────────────────────────────────────────────
#  PDF Knowledge Base
# ──────────────────────────────────────────────
pdf_processor = None
knowledge_context = ""


def init_knowledge_base():
    """Khởi tạo và tải knowledge base từ PDF."""
    global pdf_processor, knowledge_context

    pdf_processor = process_pdfs_on_startup(
        pdf_folder=Config.PDF_FOLDER,
        output_folder=Config.KNOWLEDGE_BASE_FOLDER,
        pdf_files_dict=Config.PDF_FILES,
    )

    knowledge_context = pdf_processor.load_knowledge_base(max_chars_per_file=6000)
    if knowledge_context:
        logger.info("✅ Knowledge base đã tải thành công!")
    else:
        logger.info("📚 Knowledge base trống (chưa có file PDF hoặc chưa trích xuất được).")


# ──────────────────────────────────────────────
#  Helper: Authentication Decorators
# ──────────────────────────────────────────────
def login_required(f):
    """Decorator yêu cầu đăng nhập."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({
                'success': False,
                'error': 'Vui lòng đăng nhập để tiếp tục.',
            }), 401
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    """Decorator yêu cầu quyền admin."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({
                'success': False,
                'error': 'Vui lòng đăng nhập.',
            }), 401
        user = db.session.get(User, user_id)
        if not user or not user.is_admin:
            return jsonify({
                'success': False,
                'error': 'Bạn không có quyền truy cập.',
            }), 403
        return f(*args, **kwargs)
    return decorated_function


# ──────────────────────────────────────────────
#  Helper: Rate Limiting
# ──────────────────────────────────────────────
def check_rate_limit(user_id):
    """
    Kiểm tra giới hạn tần suất câu hỏi.

    Returns:
        tuple: (is_allowed: bool, remaining: int, message: str)
    """
    # Dùng naive UTC datetime vì SQLite lưu naive datetimes
    window_start = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        seconds=Config.RATE_LIMIT_WINDOW_SECONDS
    )

    recent_count = ChatMessage.query.filter(
        ChatMessage.user_id == user_id,
        ChatMessage.created_at >= window_start,
    ).count()

    remaining = max(0, Config.RATE_LIMIT_MAX_QUESTIONS - recent_count)

    if recent_count >= Config.RATE_LIMIT_MAX_QUESTIONS:
        return False, 0, (
            f"Bạn đã đặt {Config.RATE_LIMIT_MAX_QUESTIONS} câu hỏi trong giờ qua. "
            "Hãy nghỉ ngơi một chút rồi quay lại nhé! 😊"
        )

    return True, remaining, ""


# ──────────────────────────────────────────────
#  Helper: Gemini AI Chat
# ──────────────────────────────────────────────
def get_ai_response(user_message, user_grade=6, chat_history=None):
    """
    Gửi câu hỏi đến Gemini AI và nhận phản hồi siêu tốc.

    Args:
        user_message: Câu hỏi của học sinh
        user_grade: Lớp của học sinh (6 hoặc 7)
        chat_history: Lịch sử chat gần đây

    Returns:
        str: Phản hồi từ AI
    """
    if not GEMINI_READY or not GEMINI_API_KEY:
        return (
            "⚠️ Hệ thống AI chưa được kích hoạt. "
            "Vui lòng liên hệ thầy/cô để được hỗ trợ.\n\n"
            f"📧 Email: {Config.TEACHER_EMAIL}\n"
            f"📱 Điện thoại: {Config.TEACHER_PHONE}"
        )

    # Kiểm tra bộ nhớ đệm (Cache) cho câu hỏi độc lập để trả lời tức thì (< 0.05s)
    cache_key = (user_grade, ' '.join(user_message.strip().lower().split()))
    if not chat_history and cache_key in _RESPONSE_CACHE:
        logger.info(f"⚡ Trả lời tức thì từ Cache: {user_message[:40]}...")
        return _RESPONSE_CACHE[cache_key]

    try:
        # Tìm nội dung Cẩm nang chuyên sâu Toán 6 & Toán 7 (Kết nối tri thức với cuộc sống) liên quan đến câu hỏi
        relevant_content = ""
        if pdf_processor:
            relevant_content = pdf_processor.get_relevant_content(
                user_message, max_chars=3000, user_grade=user_grade
            )

        # Xây dựng context gọn nhẹ để tăng tốc độ phản hồi
        context = relevant_content if relevant_content else "Áp dụng chuẩn kiến thức Cẩm nang & SGK Toán Kết nối tri thức với cuộc sống (GDPT 2018)."

        # Tạo system prompt (dùng .replace thay vì .format để không xung đột với dấu ngoặc nhọn {a}{b} của LaTeX)
        system_prompt = (
            Config.SYSTEM_PROMPT
            .replace('{teacher_name}', Config.TEACHER_NAME)
            .replace('{teacher_address}', Config.TEACHER_ADDRESS)
            .replace('{knowledge_context}', context)
        )

        # Xây dựng contents cho REST API (giới hạn 4 tin nhắn gần nhất để phản hồi nhanh nhất)
        contents = []
        if chat_history:
            for msg in chat_history[-4:]:
                contents.append({
                    'role': 'user',
                    'parts': [{'text': msg['message']}],
                })
                contents.append({
                    'role': 'model',
                    'parts': [{'text': msg['response']}],
                })

        # Thêm thông tin lớp học sinh
        grade_info = f"[Học sinh lớp {user_grade}] "
        contents.append({
            'role': 'user',
            'parts': [{'text': grade_info + user_message}],
        })

        # Gọi Gemini REST API tốc độ cao
        response_text = _call_gemini_rest(
            contents=contents,
            system_instruction=system_prompt,
        )

        if response_text:
            # Lưu vào cache nếu bộ nhớ chưa đầy
            if len(_RESPONSE_CACHE) >= _MAX_CACHE_SIZE:
                _RESPONSE_CACHE.pop(next(iter(_RESPONSE_CACHE)))
            _RESPONSE_CACHE[cache_key] = response_text
            return response_text
        else:
            return (
                "Xin lỗi em, hiện tại máy chủ AI đang bận một chút. "
                "Em bấm gửi lại câu hỏi nhé! 🤔"
            )

    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8', errors='replace')
        logger.error(f"Gemini API HTTP {e.code}: {error_body[:500]}")
        if e.code == 429:
            return (
                "⚠️ Hệ thống đang bận, em vui lòng đợi 1-2 phút rồi thử lại nhé! 🙏"
            )
        return (
            "⚠️ Có lỗi xảy ra khi xử lý câu hỏi. "
            "Em thử lại sau nhé!\n\n"
            f"Nếu lỗi tiếp tục, hãy liên hệ {Config.TEACHER_NAME}: {Config.TEACHER_EMAIL}"
        )
    except Exception as e:
        logger.error(f"Lỗi Gemini AI: {e}")
        return (
            "⚠️ Có lỗi xảy ra khi xử lý câu hỏi. "
            "Em thử lại sau nhé!\n\n"
            f"Nếu lỗi tiếp tục, hãy liên hệ {Config.TEACHER_NAME}: {Config.TEACHER_EMAIL}"
        )


# ══════════════════════════════════════════════
#  API ROUTES
# ══════════════════════════════════════════════

# ──────────────────────────────────────────────
#  Trang chủ & Static Files
# ──────────────────────────────────────────────
@app.after_request
def add_no_cache_headers(response):
    """Đảm bảo trình duyệt luôn tải phiên bản HTML/JS/CSS mới nhất, không lưu cache cũ."""
    if request.path == '/' or request.path.endswith(('.js', '.css', '.html')):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response


@app.route('/')
def index():
    """Trang chủ."""
    return render_template('index.html')


@app.route('/admin')
def admin_page():
    """Trang quản trị."""
    return render_template('admin.html')


@app.route('/static/<path:filename>')
def static_files(filename):
    """Phục vụ file tĩnh."""
    return send_from_directory(app.static_folder, filename)


# ──────────────────────────────────────────────
#  Auth: Đăng ký & Đăng nhập
# ──────────────────────────────────────────────
import unicodedata
import re as re_module


def _slugify_student_name(full_name, grade=6):
    """Chuyển Họ và Tên tiếng Việt thành username chuẩn để lưu thống kê."""
    text = unicodedata.normalize('NFKD', full_name)
    text = text.encode('ascii', 'ignore').decode('ascii').lower()
    text = re_module.sub(r'[^a-z0-9]+', '_', text).strip('_')
    if not text:
        text = 'hoc_sinh'
    return f"hs{grade}_{text}"[:30]


@app.route('/api/auth/quick-join', methods=['POST'])
def quick_join():
    """
    Cho phép học sinh vào thẳng Chatbot chỉ cần nhập Họ và Tên + Lớp
    (Không cần đăng ký hay mật khẩu, tự động lưu thống kê).
    """
    data = request.get_json() or {}
    display_name = (
        data.get('display_name')
        or data.get('full_name')
        or data.get('username')
        or ''
    ).strip()
    try:
        grade = int(data.get('grade', 6))
    except (ValueError, TypeError):
        grade = 6
    if grade not in (6, 7):
        grade = 6

    if not display_name:
        return jsonify({
            'success': False,
            'error': 'Em vui lòng nhập Họ và tên để vào học nhé!',
        }), 400

    username = _slugify_student_name(display_name, grade)

    try:
        user = User.query.filter_by(username=username).first()
        if not user:
            user = User(
                username=username,
                display_name=display_name,
                grade=grade,
            )
            user.set_password('hocsinh123')
            db.session.add(user)
            db.session.flush()

            stats = UserStats(user_id=user.id)
            db.session.add(stats)
            db.session.commit()
            logger.info(f"Học sinh mới vào học: {display_name} (Lớp {grade})")
        else:
            user.display_name = display_name
            user.grade = grade
            user.update_last_active()
            db.session.commit()
            logger.info(f"Học sinh quay lại: {display_name} (Lớp {grade})")

        session['user_id'] = user.id
        session['username'] = user.username
        session['is_admin'] = user.is_admin

        return jsonify({
            'success': True,
            'message': f'Chào {display_name} (Lớp {grade})! Cùng học Toán nhé! 🎉',
            'user': user.to_dict(),
        })
    except Exception as e:
        db.session.rollback()
        logger.error(f"Lỗi quick_join: {e}")
        return jsonify({
            'success': False,
            'error': 'Có lỗi xảy ra. Em vui lòng thử lại nhé!',
        }), 500


@app.route('/api/auth/register', methods=['POST'])
def register():
    """Đăng ký tài khoản mới."""
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Dữ liệu không hợp lệ.'}), 400

    username = (data.get('username') or '').strip().lower()
    password = (data.get('password') or '').strip()
    display_name = (data.get('display_name') or '').strip()
    grade = data.get('grade', 6)

    # Validation
    if not username or not password:
        return jsonify({
            'success': False,
            'error': 'Tên đăng nhập và mật khẩu không được để trống.',
        }), 400

    if len(username) < 3 or len(username) > 30:
        return jsonify({
            'success': False,
            'error': 'Tên đăng nhập phải từ 3-30 ký tự.',
        }), 400

    if len(password) < 4:
        return jsonify({
            'success': False,
            'error': 'Mật khẩu phải có ít nhất 4 ký tự.',
        }), 400

    if grade not in (6, 7):
        return jsonify({
            'success': False,
            'error': 'Lớp phải là 6 hoặc 7.',
        }), 400

    if not display_name:
        display_name = username

    # Kiểm tra username đã tồn tại
    existing = User.query.filter_by(username=username).first()
    if existing:
        return jsonify({
            'success': False,
            'error': 'Tên đăng nhập đã được sử dụng. Vui lòng chọn tên khác.',
        }), 409

    try:
        # Tạo user mới
        user = User(
            username=username,
            display_name=display_name,
            grade=grade,
        )
        user.set_password(password)
        db.session.add(user)

        # Tạo stats cho user
        stats = UserStats(user_id=None)  # will set after flush
        db.session.flush()  # Để lấy user.id
        stats.user_id = user.id
        db.session.add(stats)

        db.session.commit()

        # Đăng nhập ngay
        session['user_id'] = user.id
        session['username'] = user.username

        logger.info(f"Đăng ký thành công: {username} (lớp {grade})")

        return jsonify({
            'success': True,
            'message': f'Chào mừng {display_name} đến với Math AI! 🎉',
            'user': user.to_dict(),
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Lỗi đăng ký: {e}")
        return jsonify({
            'success': False,
            'error': 'Có lỗi xảy ra. Vui lòng thử lại.',
        }), 500


@app.route('/api/auth/login', methods=['POST'])
def login():
    """Đăng nhập."""
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Dữ liệu không hợp lệ.'}), 400

    username = (data.get('username') or '').strip().lower()
    password = (data.get('password') or '').strip()

    if not username or not password:
        return jsonify({
            'success': False,
            'error': 'Vui lòng nhập tên đăng nhập và mật khẩu.',
        }), 400

    # Kiểm tra admin login (chấp nhận cả email của thầy hoặc 'admin', với mật khẩu Hoang@1985 hoặc admin123)
    valid_admin_users = getattr(Config, 'ADMIN_USERNAMES', ['admin', 'hoangthcsphuhuu@gmail.com'])
    valid_admin_passes = getattr(Config, 'ADMIN_PASSWORDS', [Config.ADMIN_PASSWORD, 'Hoang@1985', 'admin123'])
    if username in valid_admin_users and password in valid_admin_passes:
        admin_user = User.query.filter_by(username='admin').first()
        if not admin_user:
            # Tạo tài khoản admin nếu chưa có
            admin_user = User(
                username='admin',
                display_name='Quản trị viên',
                grade=6,
                is_admin=True,
            )
            admin_user.set_password(Config.ADMIN_PASSWORD)
            db.session.add(admin_user)

            admin_stats = UserStats(user_id=None)
            db.session.flush()
            admin_stats.user_id = admin_user.id
            db.session.add(admin_stats)

            db.session.commit()

        session['user_id'] = admin_user.id
        session['username'] = admin_user.username
        session['is_admin'] = True
        admin_user.update_last_active()
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Đăng nhập quản trị thành công!',
            'user': admin_user.to_dict(),
            'is_admin': True,
        })

    # Đăng nhập user thường
    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({
            'success': False,
            'error': 'Tên đăng nhập hoặc mật khẩu không đúng.',
        }), 401

    session['user_id'] = user.id
    session['username'] = user.username
    session['is_admin'] = user.is_admin

    user.update_last_active()
    db.session.commit()

    logger.info(f"Đăng nhập: {username}")

    return jsonify({
        'success': True,
        'message': f'Chào mừng {user.display_name} quay lại! 👋',
        'user': user.to_dict(),
        'is_admin': user.is_admin,
    })


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Đăng xuất."""
    username = session.get('username', 'unknown')
    session.clear()
    logger.info(f"Đăng xuất: {username}")
    return jsonify({
        'success': True,
        'message': 'Đã đăng xuất. Hẹn gặp lại! 👋',
    })


@app.route('/api/auth/me', methods=['GET'])
def get_current_user():
    """Lấy thông tin người dùng hiện tại."""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'logged_in': False}), 200

    user = db.session.get(User, user_id)
    if not user:
        session.clear()
        return jsonify({'success': False, 'logged_in': False}), 200

    return jsonify({
        'success': True,
        'logged_in': True,
        'user': user.to_dict(),
        'is_admin': user.is_admin,
    })


# ──────────────────────────────────────────────
#  Chat API
# ──────────────────────────────────────────────
@app.route('/api/chat', methods=['POST'])
@login_required
def chat():
    """Gửi câu hỏi và nhận trả lời từ AI."""
    user_id = session['user_id']
    data = request.get_json()

    if not data or not data.get('message', '').strip():
        return jsonify({
            'success': False,
            'error': 'Vui lòng nhập câu hỏi.',
        }), 400

    message = data['message'].strip()

    if len(message) > 2000:
        return jsonify({
            'success': False,
            'error': 'Câu hỏi quá dài. Vui lòng giới hạn dưới 2000 ký tự.',
        }), 400

    # Kiểm tra rate limit
    allowed, remaining, limit_msg = check_rate_limit(user_id)
    if not allowed:
        return jsonify({
            'success': False,
            'error': limit_msg,
            'rate_limited': True,
        }), 429

    user = db.session.get(User, user_id)
    if not user:
        session.clear()
        return jsonify({'success': False, 'error': 'Phiên đăng nhập hết hạn.'}), 401

    try:
        # Lấy lịch sử chat gần đây
        recent_messages = ChatMessage.query.filter_by(user_id=user_id) \
            .order_by(ChatMessage.created_at.desc()) \
            .limit(6) \
            .all()

        chat_history = [
            {'message': m.message, 'response': m.response}
            for m in reversed(recent_messages)
        ]

        # Gọi AI
        ai_response = get_ai_response(
            user_message=message,
            user_grade=user.grade,
            chat_history=chat_history,
        )

        # Phát hiện chủ đề
        topic = ChatMessage.detect_topic(message)

        # Lưu tin nhắn
        chat_msg = ChatMessage(
            user_id=user_id,
            message=message,
            response=ai_response,
            topic=topic,
        )
        db.session.add(chat_msg)

        # Cập nhật thống kê
        stats = UserStats.query.filter_by(user_id=user_id).first()
        if not stats:
            stats = UserStats(user_id=user_id)
            db.session.add(stats)

        stats.increment_topic(topic)
        stats.start_session()

        # Cập nhật thời gian hoạt động
        user.update_last_active()

        db.session.commit()

        return jsonify({
            'success': True,
            'response': ai_response,
            'topic': topic,
            'topic_display': ChatMessage.TOPICS.get(topic, 'Khác'),
            'remaining_questions': remaining - 1,
            'message_id': chat_msg.id,
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Lỗi xử lý chat: {e}")
        return jsonify({
            'success': False,
            'error': 'Có lỗi xảy ra. Vui lòng thử lại.',
        }), 500


@app.route('/api/chat/history', methods=['GET'])
@login_required
def get_chat_history():
    """Lấy lịch sử chat của người dùng."""
    user_id = session['user_id']

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    per_page = min(per_page, 50)  # Giới hạn tối đa

    query = ChatMessage.query.filter_by(user_id=user_id) \
        .order_by(ChatMessage.created_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'success': True,
        'messages': [msg.to_dict() for msg in pagination.items],
        'total': pagination.total,
        'page': page,
        'per_page': per_page,
        'total_pages': pagination.pages,
        'has_next': pagination.has_next,
        'has_prev': pagination.has_prev,
    })


# ──────────────────────────────────────────────
#  Statistics API
# ──────────────────────────────────────────────
@app.route('/api/stats', methods=['GET'])
def get_overall_stats():
    """Thống kê tổng quan."""
    try:
        total_users = User.query.filter_by(is_admin=False).count()
        total_messages = ChatMessage.query.count()

        # Hoạt động hôm nay (dùng naive UTC cho tương thích SQLite)
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0, tzinfo=None
        )
        active_today = User.query.filter(
            User.last_active >= today_start,
            User.is_admin == False,  # noqa: E712
        ).count()
        questions_today = ChatMessage.query.filter(
            ChatMessage.created_at >= today_start
        ).count()

        # Dữ liệu biểu đồ - câu hỏi 7 ngày gần đây
        chart_data = []
        for i in range(6, -1, -1):
            day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=i)
            day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)

            count = ChatMessage.query.filter(
                ChatMessage.created_at >= day_start,
                ChatMessage.created_at < day_end,
            ).count()

            chart_data.append({
                'date': day_start.strftime('%d/%m'),
                'count': count,
            })

        # Phân bổ theo chủ đề
        topic_stats = {}
        for key, display_name in ChatMessage.TOPICS.items():
            count = ChatMessage.query.filter_by(topic=key).count()
            if count > 0:
                topic_stats[display_name] = count

        # Top 5 học sinh tích cực
        top_users = db.session.query(
            User.display_name,
            User.grade,
            db.func.count(ChatMessage.id).label('msg_count'),
        ).join(ChatMessage).filter(
            User.is_admin == False,  # noqa: E712
        ).group_by(User.id).order_by(
            db.text('msg_count DESC')
        ).limit(5).all()

        top_users_list = [
            {
                'display_name': u.display_name,
                'grade': u.grade,
                'question_count': u.msg_count,
            }
            for u in top_users
        ]

        return jsonify({
            'success': True,
            'stats': {
                'total_users': total_users,
                'total_questions': total_messages,
                'active_today': active_today,
                'questions_today': questions_today,
                'chart_data': chart_data,
                'topic_stats': topic_stats,
                'top_users': top_users_list,
            },
        })

    except Exception as e:
        logger.error(f"Lỗi thống kê: {e}")
        return jsonify({
            'success': False,
            'error': 'Không thể tải thống kê.',
        }), 500


@app.route('/api/stats/user/<int:user_id>', methods=['GET'])
@login_required
def get_user_stats(user_id):
    """Thống kê cá nhân của học sinh."""
    # Chỉ cho phép xem stats của chính mình (hoặc admin xem tất cả)
    current_user_id = session['user_id']
    is_admin = session.get('is_admin', False)

    if current_user_id != user_id and not is_admin:
        return jsonify({
            'success': False,
            'error': 'Bạn không có quyền xem thống kê này.',
        }), 403

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({
            'success': False,
            'error': 'Không tìm thấy người dùng.',
        }), 404

    stats = UserStats.query.filter_by(user_id=user_id).first()

    # Thống kê bổ sung
    total_messages = ChatMessage.query.filter_by(user_id=user_id).count()

    # Hoạt động 7 ngày gần đây
    weekly_data = []
    for i in range(6, -1, -1):
        day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        count = ChatMessage.query.filter(
            ChatMessage.user_id == user_id,
            ChatMessage.created_at >= day_start,
            ChatMessage.created_at < day_end,
        ).count()

        weekly_data.append({
            'date': day_start.strftime('%d/%m'),
            'count': count,
        })

    return jsonify({
        'success': True,
        'user': user.to_dict(),
        'stats': stats.to_dict() if stats else {
            'total_questions': 0,
            'total_sessions': 0,
            'average_session_minutes': 0,
            'topic_breakdown': {},
        },
        'total_messages': total_messages,
        'weekly_activity': weekly_data,
    })


# ──────────────────────────────────────────────
#  Admin API
# ──────────────────────────────────────────────
@app.route('/api/admin/users', methods=['GET'])
@admin_required
def admin_get_users():
    """[Admin] Lấy danh sách tất cả người dùng."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    pagination = User.query.filter_by(is_admin=False) \
        .order_by(User.created_at.desc()) \
        .paginate(page=page, per_page=per_page, error_out=False)

    users = []
    for user in pagination.items:
        user_data = user.to_dict()
        stats = UserStats.query.filter_by(user_id=user.id).first()
        user_data['stats'] = stats.to_dict() if stats else None
        users.append(user_data)

    return jsonify({
        'success': True,
        'users': users,
        'total': pagination.total,
        'page': page,
        'total_pages': pagination.pages,
    })


@app.route('/api/admin/messages', methods=['GET'])
@admin_required
def admin_get_messages():
    """[Admin] Lấy tất cả tin nhắn gần đây."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    pagination = ChatMessage.query \
        .order_by(ChatMessage.created_at.desc()) \
        .paginate(page=page, per_page=per_page, error_out=False)

    messages = []
    for msg in pagination.items:
        msg_data = msg.to_dict()
        user = db.session.get(User, msg.user_id)
        msg_data['username'] = user.username if user else 'unknown'
        msg_data['display_name'] = user.display_name if user else 'Unknown'
        messages.append(msg_data)

    return jsonify({
        'success': True,
        'messages': messages,
        'total': pagination.total,
        'page': page,
        'total_pages': pagination.pages,
    })


@app.route('/api/admin/reprocess-pdfs', methods=['POST'])
@admin_required
def admin_reprocess_pdfs():
    """[Admin] Xử lý lại tất cả file PDF."""
    global pdf_processor, knowledge_context

    try:
        # Xóa index cũ để buộc xử lý lại
        index_file = os.path.join(Config.KNOWLEDGE_BASE_FOLDER, 'index.json')
        if os.path.exists(index_file):
            os.remove(index_file)

        init_knowledge_base()

        return jsonify({
            'success': True,
            'message': 'Đã xử lý lại tất cả file PDF thành công!',
        })
    except Exception as e:
        logger.error(f"Lỗi xử lý lại PDF: {e}")
        return jsonify({
            'success': False,
            'error': f'Lỗi: {str(e)}',
        }), 500


# ──────────────────────────────────────────────
#  Health Check & Info
# ──────────────────────────────────────────────
@app.route('/api/health', methods=['GET'])
def health_check():
    """Kiểm tra trạng thái hệ thống."""
    return jsonify({
        'success': True,
        'status': 'running',
        'ai_ready': GEMINI_READY,
        'gemini_ready': GEMINI_READY,
        'knowledge_base_ready': bool(knowledge_context),
        'teacher': Config.TEACHER_NAME,
        'version': '1.0.0',
    })


@app.route('/api/info', methods=['GET'])
def app_info():
    """Thông tin ứng dụng."""
    return jsonify({
        'success': True,
        'app_name': 'Math AI Chatbot',
        'description': 'Trợ lý Toán học AI cho Học sinh Lớp 6-7',
        'teacher': {
            'name': Config.TEACHER_NAME,
            'address': Config.TEACHER_ADDRESS,
            'email': Config.TEACHER_EMAIL,
            'phone': Config.TEACHER_PHONE,
        },
        'features': [
            'Giải đáp câu hỏi Toán lớp 6 và 7',
            'Dựa trên nội dung SGK chính thống',
            'Giải thích chi tiết từng bước',
            'Hỗ trợ LaTeX cho công thức toán học',
            'Thống kê học tập cá nhân',
        ],
    })


# ══════════════════════════════════════════════
#  Error Handlers
# ══════════════════════════════════════════════
@app.errorhandler(404)
def not_found(e):
    """Xử lý lỗi 404."""
    if request.path.startswith('/api/'):
        return jsonify({
            'success': False,
            'error': 'Không tìm thấy tài nguyên yêu cầu.',
        }), 404
    return render_template('index.html')


@app.errorhandler(500)
def server_error(e):
    """Xử lý lỗi 500."""
    return jsonify({
        'success': False,
        'error': 'Lỗi hệ thống. Vui lòng thử lại sau.',
    }), 500


@app.errorhandler(405)
def method_not_allowed(e):
    """Xử lý lỗi 405."""
    return jsonify({
        'success': False,
        'error': 'Phương thức không được hỗ trợ.',
    }), 405


# ══════════════════════════════════════════════
#  Application Startup
# ══════════════════════════════════════════════
def create_app():
    """Factory function để tạo và cấu hình ứng dụng."""
    with app.app_context():
        # Tạo database tables
        db.create_all()
        logger.info("✅ Database đã sẵn sàng!")

        # Khởi tạo Gemini AI
        init_gemini()

        # Khởi tạo Knowledge Base
        init_knowledge_base()

    return app


# ──────────────────────────────────────────────
#  Chạy ứng dụng
# ──────────────────────────────────────────────
if __name__ == '__main__':
    app = create_app()
    logger.info("🚀 Math AI Chatbot đang khởi động...")
    logger.info(f"📚 Phát triển bởi: {Config.TEACHER_NAME}")
    logger.info(f"📍 {Config.TEACHER_ADDRESS}")

    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', '0') == '1'

    if debug:
        # Development mode
        app.run(host='0.0.0.0', port=port, debug=True)
    else:
        # Production mode (Waitress trên Windows)
        try:
            from waitress import serve
            logger.info(f"🌐 Server chạy tại: http://0.0.0.0:{port}")
            serve(app, host='0.0.0.0', port=port, threads=4,
                  channel_timeout=180, recv_bytes=65536)
        except ImportError:
            app.run(host='0.0.0.0', port=port, debug=False)
