# 📐 Toán Học Vui — Chatbot AI Trợ lý Toán Lớp 6, 7

> **Ứng dụng Trợ lý Toán học AI** giúp học sinh lớp 6 và 7 học toán hiệu quả, dựa trên nội dung **Sách Giáo Khoa chính thống**.

**Phát triển bởi:** Thầy Lý Hoàng Em — xã Phú Hữu, tỉnh An Giang  
**Email:** lyhoang2908@gmail.com | **ĐTDĐ:** 0919613350

---

## ✨ Tính năng chính

### 🤖 Chatbot AI thông minh
- Trả lời câu hỏi Toán lớp 6, 7 dựa trên SGK chính thống
- Sử dụng **Google Gemini 2.0 Flash** — AI tiên tiến nhất
- Hỗ trợ **LaTeX** (KaTeX) cho công thức toán học
- Tự động nhận dạng chủ đề (Số học, Hình học, Đại số, Phân số...)
- Giải thích chi tiết từng bước, phù hợp lứa tuổi
- Gợi ý câu hỏi nhanh, chủ đề phổ biến

### 📊 Thống kê người dùng
- **Dashboard quản trị** chuyên nghiệp tại `/admin`
- 4 biểu đồ Chart.js: Câu hỏi/ngày, Chủ đề, Lớp, Hoạt động/giờ
- Bảng học sinh, câu hỏi gần đây
- Xuất dữ liệu CSV, tự động refresh 60 giây

### 📱 Hỗ trợ đa thiết bị (PWA)
- **Responsive** hoàn toàn: Desktop, Tablet, Điện thoại
- **PWA** — cài đặt trên điện thoại như ứng dụng native
- **Service Worker** — hỗ trợ hoạt động offline
- **Chế độ Sáng/Tối** với lưu trữ localStorage

### 🔐 Hệ thống người dùng
- Đăng ký / Đăng nhập / Đăng xuất an toàn
- Phân quyền Admin / Học sinh
- Mã hóa mật khẩu (Werkzeug bcrypt)
- Rate limiting (30 câu hỏi/giờ)

---

## 🚀 Hướng dẫn cài đặt

### Yêu cầu hệ thống
- **Python** 3.10 trở lên
- **Google Gemini API Key** (miễn phí)

### Bước 1: Cài đặt thư viện

```bash
pip install -r requirements.txt
```

### Bước 2: Cấu hình API Key

Lấy API key miễn phí tại: https://aistudio.google.com/apikey

Tạo file `.env` trong thư mục dự án:
```
GEMINI_API_KEY=your_google_gemini_api_key_here
```

Hoặc tạo file `api_key.txt`:
```
your_google_gemini_api_key_here
```

### Bước 3: Chạy ứng dụng

```bash
python app.py
```

### Bước 4: Truy cập

| Trang | Đường dẫn |
|-------|-----------|
| 🤖 Chatbot | http://localhost:5000 |
| ⚙️ Admin Dashboard | http://localhost:5000/admin |

**Mật khẩu admin mặc định:** `admin123`

---

## 📁 Cấu trúc dự án

```
Math_M_Ai_Chatbot/
├── app.py                    # Server Flask chính
├── config.py                 # Cấu hình ứng dụng
├── models.py                 # Database models (SQLAlchemy)
├── pdf_processor.py          # Trích xuất nội dung SGK từ PDF
├── requirements.txt          # Thư viện Python
├── .env.example              # Mẫu cấu hình
│
├── templates/
│   ├── index.html            # Giao diện chatbot chính
│   └── admin.html            # Dashboard quản trị
│
├── static/
│   ├── css/style.css         # Stylesheet (1700+ dòng, responsive)
│   ├── js/app.js             # JavaScript chatbot (1400+ dòng)
│   ├── js/admin.js           # JavaScript admin (1280+ dòng)
│   ├── sw.js                 # Service Worker (PWA)
│   ├── manifest.json         # PWA manifest
│   └── icons/                # PWA icons
│
├── 06-sgk-toan-6-tap-mot.pdf # SGK Toán 6 Tập 1
├── 06-sgk-toan-6-tap-hai.pdf # SGK Toán 6 Tập 2
├── 06-sgv-toan-6.pdf         # Sách Giáo Viên Toán 6
├── 07-sgk-toan-7-tap-mot.pdf # SGK Toán 7 Tập 1
├── 07-sgk-toan-7-tap-hai.pdf # SGK Toán 7 Tập 2
└── 07-sgv-toan-7.pdf         # Sách Giáo Viên Toán 7
```

---

## 🛠️ Công nghệ sử dụng

| Thành phần | Công nghệ |
|-----------|-----------|
| Backend | Python Flask 3.1 |
| Database | SQLite + SQLAlchemy |
| AI | Google Gemini 2.0 Flash |
| PDF Parser | PyMuPDF (fitz) |
| Frontend | Vanilla JavaScript ES6+ |
| CSS | Custom responsive (mobile-first) |
| Toán học | KaTeX (LaTeX rendering) |
| Biểu đồ | Chart.js 4.4 |
| PWA | Service Worker + Web App Manifest |

---

## 📡 API Endpoints

| Method | Endpoint | Mô tả |
|--------|---------|-------|
| `POST` | `/api/auth/register` | Đăng ký tài khoản |
| `POST` | `/api/auth/login` | Đăng nhập |
| `POST` | `/api/auth/logout` | Đăng xuất |
| `GET` | `/api/auth/me` | Thông tin user hiện tại |
| `POST` | `/api/chat` | Gửi câu hỏi cho AI |
| `GET` | `/api/chat/history` | Lịch sử chat |
| `GET` | `/api/stats` | Thống kê tổng quan |
| `GET` | `/api/stats/user/<id>` | Thống kê cá nhân |
| `GET` | `/api/admin/users` | [Admin] Danh sách học sinh |
| `GET` | `/api/admin/messages` | [Admin] Tin nhắn gần đây |
| `POST` | `/api/admin/reprocess-pdfs` | [Admin] Xử lý lại PDF |
| `GET` | `/api/health` | Kiểm tra hệ thống |
| `GET` | `/api/info` | Thông tin ứng dụng |

---

## 📝 Ghi chú

- Lần chạy đầu tiên, ứng dụng sẽ tự động trích xuất nội dung từ các file PDF SGK vào thư mục `knowledge_base/`. Quá trình này có thể mất vài phút.
- Nếu chưa có API key, ứng dụng vẫn chạy nhưng AI sẽ không phản hồi.
- Database SQLite được tạo tự động tại `database.db`.

---

*© 2024 Thầy Lý Hoàng Em — xã Phú Hữu, tỉnh An Giang*
