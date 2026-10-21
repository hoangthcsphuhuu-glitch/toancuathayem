# -*- coding: utf-8 -*-
"""
PDF Processor - Trích xuất nội dung từ sách giáo khoa Toán
Sử dụng PyMuPDF (fitz) để đọc và xử lý file PDF
"""

import os
import re
import json
import logging

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None
    print("[CẢNH BÁO] PyMuPDF chưa được cài đặt. Chạy: pip install PyMuPDF")

logger = logging.getLogger(__name__)


class PDFProcessor:
    """Xử lý và trích xuất nội dung từ file PDF sách giáo khoa."""

    def __init__(self, pdf_folder, output_folder):
        """
        Args:
            pdf_folder: Thư mục chứa file PDF
            output_folder: Thư mục lưu file text đã trích xuất
        """
        self.pdf_folder = pdf_folder
        self.output_folder = output_folder
        self.index_file = os.path.join(output_folder, 'index.json')

    def ensure_output_folder(self):
        """Tạo thư mục output nếu chưa tồn tại."""
        os.makedirs(self.output_folder, exist_ok=True)

    def is_already_processed(self):
        """Kiểm tra xem đã trích xuất PDF chưa."""
        return os.path.exists(self.index_file)

    def extract_text_from_pdf(self, pdf_path):
        """
        Trích xuất toàn bộ text từ một file PDF.

        Args:
            pdf_path: Đường dẫn file PDF

        Returns:
            dict: Nội dung theo từng trang {'pages': [...], 'total_pages': int}
        """
        if fitz is None:
            logger.error("PyMuPDF chưa được cài đặt!")
            return {'pages': [], 'total_pages': 0, 'chapters': []}

        result = {
            'pages': [],
            'total_pages': 0,
            'chapters': [],
        }

        try:
            doc = fitz.open(pdf_path)
            result['total_pages'] = len(doc)

            full_text = []
            for page_num in range(len(doc)):
                page = doc[page_num]
                text = page.get_text("text")
                if text and text.strip():
                    result['pages'].append({
                        'page': page_num + 1,
                        'content': text.strip(),
                    })
                    full_text.append(text.strip())

            doc.close()

            # Phát hiện chương/bài
            combined_text = '\n'.join(full_text)
            result['chapters'] = self._detect_chapters(combined_text)

            logger.info(f"Đã trích xuất {len(result['pages'])} trang từ {pdf_path}")

        except Exception as e:
            logger.error(f"Lỗi khi đọc PDF {pdf_path}: {e}")

        return result

    def _detect_chapters(self, text):
        """
        Phát hiện các chương/bài trong nội dung.

        Args:
            text: Nội dung văn bản đầy đủ

        Returns:
            list: Danh sách chương/bài phát hiện được
        """
        chapters = []

        # Các pattern phổ biến trong SGK Toán
        patterns = [
            r'(?:CHƯƠNG|Chương)\s+(\w+)[.:]\s*(.+?)(?:\n|$)',
            r'(?:BÀI|Bài)\s+(\d+)[.:]\s*(.+?)(?:\n|$)',
            r'(?:PHẦN|Phần)\s+(\w+)[.:]\s*(.+?)(?:\n|$)',
            r'§\s*(\d+)[.:]\s*(.+?)(?:\n|$)',
        ]

        for pattern in patterns:
            matches = re.finditer(pattern, text)
            for match in matches:
                chapter_info = {
                    'number': match.group(1).strip(),
                    'title': match.group(2).strip()[:200],  # Giới hạn độ dài
                    'type': 'chương' if 'CHƯƠNG' in pattern or 'Chương' in pattern
                            else 'bài' if 'BÀI' in pattern or 'Bài' in pattern
                            else 'phần' if 'PHẦN' in pattern or 'Phần' in pattern
                            else 'mục',
                }
                # Tránh trùng lặp
                if chapter_info not in chapters:
                    chapters.append(chapter_info)

        return chapters

    def process_single_pdf(self, filename, display_name):
        """
        Xử lý một file PDF và lưu kết quả.

        Args:
            filename: Tên file PDF
            display_name: Tên hiển thị của sách

        Returns:
            dict: Thông tin về file đã xử lý
        """
        # Nếu filename đã là file .txt nằm sẵn trong thư mục knowledge_base
        txt_direct_path = os.path.join(self.output_folder, filename)
        if filename.endswith('.txt') and os.path.exists(txt_direct_path):
            with open(txt_direct_path, 'r', encoding='utf-8') as f:
                content = f.read()
            chapters = self._detect_chapters(content)
            sections = [s for s in content.split('--- MỤC') if s.strip()]
            return {
                'filename': filename,
                'display_name': display_name,
                'txt_file': filename,
                'status': 'processed',
                'total_pages': len(sections),
                'extracted_pages': len(sections),
                'chapters': chapters,
            }

        pdf_path = os.path.join(self.pdf_folder, filename)

        if not os.path.exists(pdf_path):
            logger.warning(f"Không tìm thấy file PDF: {pdf_path}")
            return {
                'filename': filename,
                'display_name': display_name,
                'status': 'not_found',
                'pages': 0,
                'chapters': [],
            }

        logger.info(f"Đang xử lý: {display_name} ({filename})")

        # Trích xuất nội dung
        result = self.extract_text_from_pdf(pdf_path)

        # Tạo tên file output
        base_name = os.path.splitext(filename)[0]
        txt_filename = f"{base_name}.txt"
        txt_path = os.path.join(self.output_folder, txt_filename)

        # Lưu nội dung text
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write(f"{'=' * 60}\n")
            f.write(f"  {display_name}\n")
            f.write(f"  Nguồn: {filename}\n")
            f.write(f"  Tổng số trang: {result['total_pages']}\n")
            f.write(f"{'=' * 60}\n\n")

            if result['chapters']:
                f.write("MỤC LỤC PHÁT HIỆN:\n")
                f.write("-" * 40 + "\n")
                for ch in result['chapters']:
                    f.write(f"  {ch['type'].upper()} {ch['number']}: {ch['title']}\n")
                f.write("\n" + "=" * 60 + "\n\n")

            for page_info in result['pages']:
                f.write(f"\n--- Trang {page_info['page']} ---\n")
                f.write(page_info['content'])
                f.write("\n")

        info = {
            'filename': filename,
            'display_name': display_name,
            'txt_file': txt_filename,
            'status': 'processed',
            'total_pages': result['total_pages'],
            'extracted_pages': len(result['pages']),
            'chapters': result['chapters'],
        }

        logger.info(f"Hoàn thành: {display_name} - {len(result['pages'])} trang đã trích xuất")
        return info

    def process_all_pdfs(self, pdf_files_dict):
        """
        Xử lý tất cả file PDF.

        Args:
            pdf_files_dict: Dict {filename: display_name}

        Returns:
            dict: Index chứa thông tin tất cả file đã xử lý
        """
        self.ensure_output_folder()

        index = {
            'processed_files': [],
            'total_files': len(pdf_files_dict),
            'processed_count': 0,
            'not_found_count': 0,
        }

        for filename, display_name in pdf_files_dict.items():
            info = self.process_single_pdf(filename, display_name)
            index['processed_files'].append(info)

            if info['status'] == 'processed':
                index['processed_count'] += 1
            else:
                index['not_found_count'] += 1

        # Lưu file index
        with open(self.index_file, 'w', encoding='utf-8') as f:
            json.dump(index, f, ensure_ascii=False, indent=2)

        logger.info(
            f"Hoàn thành xử lý: {index['processed_count']}/{index['total_files']} file PDF"
        )
        return index

    def load_knowledge_base(self, max_chars_per_file=8000):
        """
        Tải nội dung knowledge base đã trích xuất.

        Args:
            max_chars_per_file: Số ký tự tối đa mỗi file (để tiết kiệm token)

        Returns:
            str: Nội dung knowledge base đã gộp
        """
        if not os.path.exists(self.index_file):
            return ""

        try:
            with open(self.index_file, 'r', encoding='utf-8') as f:
                index = json.load(f)
        except (json.JSONDecodeError, IOError):
            return ""

        knowledge_parts = []

        for file_info in index.get('processed_files', []):
            if file_info.get('status') != 'processed':
                continue

            txt_path = os.path.join(self.output_folder, file_info['txt_file'])
            if not os.path.exists(txt_path):
                continue

            try:
                with open(txt_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Lấy phần tóm tắt và mục lục (đầu file)
                # cùng với một phần nội dung
                if len(content) > max_chars_per_file:
                    content = content[:max_chars_per_file] + "\n[...nội dung tiếp theo được lược bỏ...]"

                knowledge_parts.append(
                    f"\n📚 {file_info['display_name']}:\n{content}\n"
                )

            except IOError as e:
                logger.error(f"Lỗi khi đọc {txt_path}: {e}")

        return "\n".join(knowledge_parts) if knowledge_parts else "Chưa có dữ liệu SGK."

    def get_relevant_content(self, query, max_chars=4000, user_grade=None):
        """
        Tìm nội dung liên quan đến câu hỏi từ knowledge base.

        Args:
            query: Câu hỏi của học sinh
            max_chars: Số ký tự tối đa trả về
            user_grade: Lớp của học sinh (6 hoặc 7)

        Returns:
            str: Nội dung liên quan
        """
        if not os.path.exists(self.index_file):
            return ""

        query_lower = query.lower()

        # Xác định sách nào liên quan
        grade_6_keywords = ['lớp 6', 'toán 6', 'khối 6', 'ước chung', 'bội chung', 'ưcln', 'bcnn', 'số nguyên tố', 'hợp số', 'hỗn số']
        grade_7_keywords = ['lớp 7', 'toán 7', 'khối 7', 'số hữu tỉ', 'số vô tỉ', 'số thực', 'căn bậc hai', 'tỉ lệ thức', 'tỉ lệ thuận', 'tỉ lệ nghịch', 'đa thức', 'đơn thức', 'lăng trụ', 'trọng tâm', 'trực tâm', 'ngoại tiếp', 'nội tiếp']

        try:
            with open(self.index_file, 'r', encoding='utf-8') as f:
                index = json.load(f)
        except (json.JSONDecodeError, IOError):
            return ""

        scored_files = []
        for file_info in index.get('processed_files', []):
            if file_info.get('status') != 'processed':
                continue

            display = file_info.get('display_name', '').lower()
            file_grade = file_info.get('grade')
            is_grade_6 = (file_grade == 6) or ('6' in display)
            is_grade_7 = (file_grade == 7) or ('7' in display)

            relevant_score = 1
            if any(kw in query_lower for kw in grade_6_keywords):
                relevant_score += 30 if is_grade_6 else -10
            elif any(kw in query_lower for kw in grade_7_keywords):
                relevant_score += 30 if is_grade_7 else -10
            elif user_grade == 6 and is_grade_6:
                relevant_score += 15
            elif user_grade == 7 and is_grade_7:
                relevant_score += 15

            # Tìm trong các chương có liên quan (bỏ qua từ dừng phổ biến)
            stop_words = {'bài', 'toán', 'các', 'của', 'một', 'hai', 'học', 'tìm', 'tính', 'cho', 'trong', 'với'}
            for chapter in file_info.get('chapters', []):
                title = chapter.get('title', '').lower()
                if any(word in title for word in query_lower.split() if len(word) > 2 and word not in stop_words):
                    relevant_score += 2

            scored_files.append((relevant_score, file_info))

        # Ưu tiên duyệt file có điểm cao nhất trước (đúng lớp của học sinh)
        scored_files.sort(key=lambda x: x[0], reverse=True)

        relevant_parts = []
        total_chars = 0

        for relevant_score, file_info in scored_files:
            if relevant_score > 0:
                txt_path = os.path.join(self.output_folder, file_info['txt_file'])
                if os.path.exists(txt_path):
                    try:
                        with open(txt_path, 'r', encoding='utf-8') as f:
                            content = f.read()

                        # Trích xuất đoạn liên quan vừa khít với giới hạn max_chars còn lại
                        remaining_chars = max_chars - total_chars
                        if remaining_chars <= 200:
                            break
                        excerpt = self._extract_relevant_excerpt(content, query, min(2500, remaining_chars))
                        if excerpt:
                            relevant_parts.append(
                                f"[{file_info['display_name']}]:\n{excerpt}"
                            )
                            total_chars += len(excerpt)
                    except IOError:
                        pass

        return "\n\n".join(relevant_parts) if relevant_parts else ""

    def _extract_relevant_excerpt(self, content, query, max_chars=2500):
        """
        Trích xuất đoạn văn bản liên quan nhất từ nội dung.

        Args:
            content: Nội dung đầy đủ
            query: Câu hỏi tìm kiếm
            max_chars: Số ký tự tối đa

        Returns:
            str: Đoạn trích liên quan
        """
        clean_q = re.sub(r'[?,!.():;"]', ' ', query.lower())
        query_words = [w for w in clean_q.split() if len(w) >= 2]
        if not query_words:
            return content[:max_chars]

        # Tạo thêm cụm 2 từ liền kề (bigrams) để tìm chính xác tên bài/khái niệm
        bigrams = [f"{query_words[i]} {query_words[i+1]}" for i in range(len(query_words) - 1)]

        # Chia content thành các mục chuyên đề (--- MỤC) hoặc theo trang (--- Trang)
        if '--- MỤC' in content:
            segments = ['--- MỤC' + s for s in content.split('--- MỤC') if s.strip()]
        else:
            segments = content.split('--- Trang')

        if not segments:
            return content[:max_chars]

        # Tính điểm cho mỗi đoạn
        is_schedule_query = any(w in clean_q for w in ['tuần', 'tiết', 'phân phối', 'kế hoạch', 'ppct'])
        scored_segments = []
        for segment in segments:
            segment_lower = segment.lower()
            first_line = segment_lower.split('\n', 1)[0]
            word_score = sum(1 for word in query_words if word in segment_lower)
            bigram_score = sum(3 for bg in bigrams if bg in segment_lower)
            title_bonus = sum(4 for word in query_words if len(word) > 2 and word in first_line)
            score = word_score + bigram_score + title_bonus
            if score > 0:
                if 'phân phối chương trình' in first_line:
                    score += 15 if is_schedule_query else -8
                else:
                    score += 6 if not is_schedule_query else 0
                scored_segments.append((score, segment.strip()))

        # Sắp xếp theo điểm giảm dần
        scored_segments.sort(key=lambda x: x[0], reverse=True)

        # Ghép các đoạn có điểm cao nhất
        result = []
        total = 0
        for score, segment in scored_segments[:2]:  # Lấy tối đa 2 mục sát nhất
            if total + len(segment) <= max_chars:
                result.append(segment)
                total += len(segment)
            elif not result:
                result.append(segment[:max_chars])
                break

        return "\n...\n".join(result) if result else content[:max_chars]


def process_pdfs_on_startup(pdf_folder, output_folder, pdf_files_dict):
    """
    Hàm tiện ích để xử lý PDF khi khởi động ứng dụng.

    Args:
        pdf_folder: Thư mục chứa file PDF
        output_folder: Thư mục lưu output
        pdf_files_dict: Dict {filename: display_name}

    Returns:
        PDFProcessor: Instance đã xử lý xong
    """
    processor = PDFProcessor(pdf_folder, output_folder)

    if not processor.is_already_processed():
        logger.info("Lần chạy đầu tiên - bắt đầu trích xuất PDF...")
        index = processor.process_all_pdfs(pdf_files_dict)
        logger.info(
            f"Đã trích xuất {index['processed_count']}/{index['total_files']} file PDF"
        )
    else:
        logger.info("Knowledge base đã tồn tại, bỏ qua trích xuất PDF.")

    return processor
