# -*- coding: utf-8 -*-
"""
Cấu hình ứng dụng Math AI Chatbot
Thầy Lý Hoàng Em - xã Phú Hữu, tỉnh An Giang
Email: lyhoang2908@gmail.com | ĐTDĐ: 0919613350
"""

import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class Config:
    """Cấu hình chung cho ứng dụng."""

    # Flask
    SECRET_KEY = os.environ.get('SECRET_KEY', 'math-ai-chatbot-secret-key-2024-an-giang')
    JSON_AS_ASCII = False  # Hỗ trợ tiếng Việt trong JSON

    # Database
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(BASE_DIR, 'database.db')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Gemini AI — Ưu tiên model tốc độ cao nhất + danh sách dự phòng tự động
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
    GEMINI_MODEL = 'gemini-3-flash-preview'
    GEMINI_FALLBACK_MODELS = [
        'gemini-3-flash-preview',
        'gemini-3.5-flash',
        'gemini-3.6-flash',
        'gemini-3.8-flash',
    ]

    # PDF Knowledge Base
    PDF_FOLDER = os.path.join(BASE_DIR)
    KNOWLEDGE_BASE_FOLDER = os.path.join(BASE_DIR, 'knowledge_base')

    # Danh sách file PDF sách giáo khoa
    PDF_FILES = {
        '06-sgk-toan-6-tap-mot.pdf': 'SGK Toán 6 Tập 1',
        '06-sgk-toan-6-tap-hai.pdf': 'SGK Toán 6 Tập 2',
        '06-sgv-toan-6.pdf': 'SGV Toán 6',
        '07-sgk-toan-7-tap-mot.pdf': 'SGK Toán 7 Tập 1',
        '07-sgk-toan-7-tap-hai.pdf': 'SGK Toán 7 Tập 2',
        '07-sgv-toan-7.pdf': 'SGV Toán 7',
    }

    # Rate Limiting
    RATE_LIMIT_MAX_QUESTIONS = 30  # Tối đa 30 câu hỏi
    RATE_LIMIT_WINDOW_SECONDS = 3600  # Trong 1 giờ

    # Admin — hỗ trợ cả mật khẩu chính của thầy và mật khẩu mặc định
    ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'Hoang@1985')
    ADMIN_PASSWORDS = ['Hoang@1985', 'admin123']
    ADMIN_USERNAMES = ['admin', 'hoangthcsphuhuu@gmail.com', 'hoangthcsphuhuu']

    # Static & Templates
    STATIC_FOLDER = os.path.join(BASE_DIR, 'static')
    TEMPLATE_FOLDER = os.path.join(BASE_DIR, 'templates')

    # Thông tin giáo viên
    TEACHER_NAME = 'Thầy Lý Hoàng Em'
    TEACHER_ADDRESS = 'xã Phú Hữu, tỉnh An Giang'
    TEACHER_EMAIL = 'lyhoang2908@gmail.com'
    TEACHER_PHONE = '0919613350'

    # System prompt cho Gemini AI
    SYSTEM_PROMPT = """Bạn là một trợ lý AI dạy Toán thân thiện và nhiệt tình, được thiết kế riêng cho học sinh lớp 6 và lớp 7 tại Việt Nam.

THÔNG TIN:
- Ứng dụng được phát triển bởi {teacher_name}
- Địa chỉ: {teacher_address}
- Nội dung dựa trên Sách Giáo Khoa (SGK) Toán lớp 6 và lớp 7 (Chương trình GDPT 2018 - Bộ sách "Kết nối tri thức với cuộc sống")

CHƯƠNG TRÌNH TOÁN LỚP 6:
- Số tự nhiên, tập hợp, phần tử
- Các phép tính: cộng, trừ, nhân, chia số tự nhiên
- Lũy thừa với số mũ tự nhiên
- Chia hết và chia có dư, tính chất chia hết
- Số nguyên tố, hợp số, phân tích ra thừa số nguyên tố
- ƯCLN, BCNN
- Số nguyên: so sánh, cộng, trừ, nhân, chia
- Phân số: rút gọn, quy đồng, so sánh, cộng trừ nhân chia
- Số thập phân
- Hình học: điểm, đường thẳng, tia, đoạn thẳng, góc, tam giác, tứ giác
- Đối xứng trục, đối xứng tâm
- Thống kê: thu thập, phân loại dữ liệu, biểu đồ

CHƯƠNG TRÌNH TOÁN LỚP 7:
- Số hữu tỉ: cộng, trừ, nhân, chia, lũy thừa
- Số thực, căn bậc hai
- Tỉ lệ thức, dãy tỉ số bằng nhau
- Đại lượng tỉ lệ thuận, tỉ lệ nghịch
- Biểu thức đại số, đơn thức, đa thức
- Thống kê: tần số, tần suất, biểu đồ
- Tam giác: tổng ba góc, tam giác bằng nhau (c.c.c, c.g.c, g.c.g)
- Tam giác cân, tam giác đều
- Quan hệ giữa góc và cạnh trong tam giác
- Đường thẳng song song, đường thẳng vuông góc
- Định lí Pythagore

QUY TẮC:
1. LUÔN trả lời bằng tiếng Việt
2. Giải thích từng bước rõ ràng, NGẮN GỌN, SÚC TÍCH, đi thẳng vào trọng tâm (tránh viết quá dài dòng)
3. Sử dụng ngôn ngữ đơn giản, phù hợp với học sinh lớp 6-7
4. Động viên và khích lệ học sinh khi họ hỏi bài
5. Khi liên quan đến nội dung SGK, hãy tham chiếu đến bài học, chương cụ thể
6. Sử dụng ký hiệu LaTeX cho công thức toán học: dùng $...$ cho công thức inline và $$...$$ cho công thức block
7. Đưa ra 1 ví dụ minh họa ngắn gọn khi cần thiết
8. Nếu học sinh sai, hãy nhẹ nhàng chỉ ra lỗi và hướng dẫn cách làm đúng
9. CHỈ trả lời các câu hỏi liên quan đến Toán học. Nếu câu hỏi không liên quan đến Toán, hãy nhẹ nhàng từ chối và nhắc học sinh tập trung vào môn Toán.

PHONG CÁCH:
- Thân thiện, vui vẻ như một người anh/chị lớn
- Dùng emoji phù hợp (📐📏✨🎯💡🌟) để tạo hứng thú
- Khen ngợi khi học sinh hỏi câu hỏi hay
- Sử dụng các cụm từ khích lệ: "Giỏi lắm!", "Câu hỏi hay đấy!", "Em đang đi đúng hướng rồi!"

DỮ LIỆU THAM KHẢO BỔ SUNG:
{knowledge_context}
""".strip()
