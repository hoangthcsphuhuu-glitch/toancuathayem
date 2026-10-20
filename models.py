# -*- coding: utf-8 -*-
"""
Database Models cho Math AI Chatbot
Sử dụng SQLAlchemy ORM với SQLite
"""

from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


def _utcnow():
    """Trả về thời gian UTC hiện tại dạng naive (không có tzinfo) cho tương thích SQLite."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(db.Model):
    """Model người dùng (học sinh)."""

    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    display_name = db.Column(db.String(100), nullable=False)
    grade = db.Column(db.Integer, nullable=False, default=6)  # Lớp 6 hoặc 7
    created_at = db.Column(db.DateTime, default=_utcnow)
    last_active = db.Column(db.DateTime, default=_utcnow)
    is_admin = db.Column(db.Boolean, default=False)

    # Relationships
    messages = db.relationship('ChatMessage', backref='user', lazy='dynamic',
                               cascade='all, delete-orphan')
    stats = db.relationship('UserStats', backref='user', uselist=False,
                            cascade='all, delete-orphan')

    def set_password(self, password):
        """Mã hóa và lưu mật khẩu."""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """Kiểm tra mật khẩu."""
        return check_password_hash(self.password_hash, password)

    def update_last_active(self):
        """Cập nhật thời gian hoạt động cuối cùng."""
        self.last_active = _utcnow()

    def to_dict(self):
        """Chuyển đổi thành dictionary."""
        return {
            'id': self.id,
            'username': self.username,
            'display_name': self.display_name,
            'grade': self.grade,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_active': self.last_active.isoformat() if self.last_active else None,
            'total_messages': self.messages.count() if self.messages else 0,
        }

    def __repr__(self):
        return f'<User {self.username}>'


class ChatMessage(db.Model):
    """Model tin nhắn chat."""

    __tablename__ = 'chat_messages'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    message = db.Column(db.Text, nullable=False)  # Câu hỏi của học sinh
    response = db.Column(db.Text, nullable=False)  # Trả lời của AI
    topic = db.Column(db.String(50), nullable=True)  # Chủ đề tự động phát hiện
    created_at = db.Column(db.DateTime, default=_utcnow, index=True)

    # Các chủ đề toán học
    TOPICS = {
        'so_hoc': 'Số học',
        'dai_so': 'Đại số',
        'hinh_hoc': 'Hình học',
        'thong_ke': 'Thống kê và Xác suất',
        'do_luong': 'Đo lường',
        'ti_le': 'Tỉ lệ và Phần trăm',
        'phan_so': 'Phân số',
        'so_nguyen': 'Số nguyên',
        'bieu_thuc': 'Biểu thức đại số',
        'phuong_trinh': 'Phương trình',
        'khac': 'Khác',
    }

    @staticmethod
    def detect_topic(message_text):
        """Tự động phát hiện chủ đề từ nội dung câu hỏi."""
        text = message_text.lower()

        topic_keywords = {
            'hinh_hoc': [
                'hình', 'tam giác', 'tứ giác', 'đường tròn', 'góc', 'cạnh',
                'diện tích', 'chu vi', 'thể tích', 'vuông', 'chữ nhật',
                'song song', 'vuông góc', 'đối xứng', 'trục', 'tâm',
                'đường thẳng', 'điểm', 'đoạn thẳng', 'hình hộp', 'lăng trụ',
                'hình tròn', 'bán kính', 'đường kính', 'hình thoi', 'hình bình hành',
                'hình thang', 'trung điểm', 'đường cao', 'trung tuyến',
            ],
            'phan_so': [
                'phân số', 'tử số', 'mẫu số', 'quy đồng', 'rút gọn',
                'tối giản', 'hỗn số', 'phần', 'chia hết',
            ],
            'so_nguyen': [
                'số nguyên', 'số âm', 'số dương', 'giá trị tuyệt đối',
                'đối', 'trục số', 'số nguyên âm', 'số nguyên dương',
            ],
            'ti_le': [
                'tỉ lệ', 'phần trăm', '%', 'tỉ số', 'tỉ lệ thức',
                'đại lượng tỉ lệ', 'thuận', 'nghịch',
            ],
            'thong_ke': [
                'thống kê', 'xác suất', 'biểu đồ', 'trung bình', 'tần số',
                'bảng', 'số liệu', 'trung bình cộng', 'mốt',
            ],
            'dai_so': [
                'đại số', 'biểu thức', 'đa thức', 'đơn thức', 'biến',
                'hệ số', 'bậc', 'khai triển', 'thu gọn', 'nhân tử',
            ],
            'phuong_trinh': [
                'phương trình', 'bất phương trình', 'nghiệm', 'giải',
                'ẩn', 'vế',
            ],
            'bieu_thuc': [
                'biểu thức', 'tính giá trị', 'rút gọn biểu thức',
                'thứ tự thực hiện',
            ],
            'do_luong': [
                'đo', 'đơn vị', 'cm', 'km', 'mét', 'kg', 'lít',
                'đổi đơn vị', 'quy đổi',
            ],
            'so_hoc': [
                'ước', 'bội', 'chia hết', 'số nguyên tố', 'hợp số',
                'ước chung', 'bội chung', 'ucln', 'bcnn', 'lũy thừa',
                'căn', 'chia', 'nhân', 'cộng', 'trừ', 'tính',
                'số tự nhiên', 'dấu hiệu', 'phép', 'tính chất',
            ],
        }

        # Đếm số keywords khớp cho mỗi chủ đề
        scores = {}
        for topic, keywords in topic_keywords.items():
            score = sum(1 for kw in keywords if kw in text)
            if score > 0:
                scores[topic] = score

        if scores:
            return max(scores, key=scores.get)
        return 'khac'

    def to_dict(self):
        """Chuyển đổi thành dictionary."""
        topic_display = self.TOPICS.get(self.topic, 'Khác') if self.topic else 'Khác'
        return {
            'id': self.id,
            'user_id': self.user_id,
            'message': self.message,
            'response': self.response,
            'topic': self.topic,
            'topic_display': topic_display,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<ChatMessage {self.id} by User {self.user_id}>'


class UserStats(db.Model):
    """Model thống kê người dùng."""

    __tablename__ = 'user_stats'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, nullable=False)
    total_questions = db.Column(db.Integer, default=0)
    total_sessions = db.Column(db.Integer, default=0)
    total_session_minutes = db.Column(db.Float, default=0.0)  # Tổng thời gian (phút)

    # Thống kê theo chủ đề
    topic_so_hoc = db.Column(db.Integer, default=0)
    topic_dai_so = db.Column(db.Integer, default=0)
    topic_hinh_hoc = db.Column(db.Integer, default=0)
    topic_thong_ke = db.Column(db.Integer, default=0)
    topic_do_luong = db.Column(db.Integer, default=0)
    topic_ti_le = db.Column(db.Integer, default=0)
    topic_phan_so = db.Column(db.Integer, default=0)
    topic_so_nguyen = db.Column(db.Integer, default=0)
    topic_bieu_thuc = db.Column(db.Integer, default=0)
    topic_phuong_trinh = db.Column(db.Integer, default=0)
    topic_khac = db.Column(db.Integer, default=0)

    last_session_start = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(db.DateTime, default=_utcnow)

    def increment_topic(self, topic_key):
        """Tăng số câu hỏi cho chủ đề tương ứng."""
        attr_name = f'topic_{topic_key}'
        if hasattr(self, attr_name):
            current = getattr(self, attr_name) or 0
            setattr(self, attr_name, current + 1)
        self.total_questions = (self.total_questions or 0) + 1
        self.updated_at = _utcnow()

    def start_session(self):
        """Bắt đầu phiên học mới."""
        now = _utcnow()
        # Nếu phiên trước cách đây hơn 30 phút -> phiên mới
        if self.last_session_start is None or \
                (now - self.last_session_start).total_seconds() > 1800:
            self.total_sessions = (self.total_sessions or 0) + 1
            self.last_session_start = now

    def get_average_session_minutes(self):
        """Tính thời gian trung bình mỗi phiên (phút)."""
        if self.total_sessions and self.total_sessions > 0:
            return round(self.total_session_minutes / self.total_sessions, 1)
        return 0.0

    def get_topic_breakdown(self):
        """Lấy thống kê theo chủ đề."""
        return {
            'Số học': self.topic_so_hoc or 0,
            'Đại số': self.topic_dai_so or 0,
            'Hình học': self.topic_hinh_hoc or 0,
            'Thống kê và Xác suất': self.topic_thong_ke or 0,
            'Đo lường': self.topic_do_luong or 0,
            'Tỉ lệ và Phần trăm': self.topic_ti_le or 0,
            'Phân số': self.topic_phan_so or 0,
            'Số nguyên': self.topic_so_nguyen or 0,
            'Biểu thức đại số': self.topic_bieu_thuc or 0,
            'Phương trình': self.topic_phuong_trinh or 0,
            'Khác': self.topic_khac or 0,
        }

    def to_dict(self):
        """Chuyển đổi thành dictionary."""
        return {
            'user_id': self.user_id,
            'total_questions': self.total_questions or 0,
            'total_sessions': self.total_sessions or 0,
            'average_session_minutes': self.get_average_session_minutes(),
            'topic_breakdown': self.get_topic_breakdown(),
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<UserStats for User {self.user_id}>'
