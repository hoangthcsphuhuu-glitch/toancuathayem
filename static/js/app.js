/**
 * ============================================================
 * TOÁN HỌC VUI - MAIN JAVASCRIPT APPLICATION (app.js)
 * ============================================================
 * Ứng dụng: Trợ lý AI học Toán dành cho học sinh Lớp 6 và 7
 * Tác giả: Thầy Lý Hoàng Em - xã Phú Hữu, tỉnh An Giang
 * Công nghệ: Vanilla JS (ES6+), KaTeX Math Rendering, PWA Service Worker
 * ============================================================
 */

'use strict';

/**
 * ─────────────────────────────────────────────────────────────
 * 1. TRẠNG THÁI TOÀN CỤC CỦA ỨNG DỤNG (GLOBAL APPLICATION STATE)
 * ─────────────────────────────────────────────────────────────
 */
const state = {
  // Thông tin người dùng hiện tại sau khi đăng nhập
  currentUser: null,
  // Khối lớp đang chọn (mặc định lớp 6)
  currentGrade: 6,
  // Cờ kiểm soát đang gửi câu hỏi đến AI để tránh gửi đúp
  isSending: false,
  // Bộ nhớ đệm danh sách tin nhắn lịch sử
  historyCache: [],
  // Giao diện hiện tại ('light' hoặc 'dark')
  theme: 'light'
};

/**
 * Cấu hình trình render công thức toán KaTeX
 */
const KATEX_OPTIONS = {
  delimiters: [
    { left: '$$', right: '$$', display: true },
    { left: '$', right: '$', display: false },
    { left: '\\[', right: '\\]', display: true },
    { left: '\\(', right: '\\)', display: false }
  ],
  throwOnError: false,
  errorColor: '#FF6B6B',
  strict: false
};

/**
 * Bảng biểu tượng minh họa cho từng chủ đề toán học
 */
const TOPIC_ICONS = {
  so_hoc: '🔢',
  dai_so: '📊',
  hinh_hoc: '📐',
  thong_ke: '📈',
  phan_so: '🍕',
  so_nguyen: '➕',
  ti_le: '⚖️',
  do_luong: '📏',
  bieu_thuc: '📝',
  phuong_trinh: '🧮',
  khac: '💬'
};

/**
 * ─────────────────────────────────────────────────────────────
 * 2. CÁC HÀM TIỆN ÍCH (UTILITY FUNCTIONS)
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Thoát các ký tự đặc biệt trong chuỗi để phòng chống tấn công XSS
 * @param {string} str - Chuỗi văn bản đầu vào
 * @returns {string} - Chuỗi văn bản đã được mã hóa an toàn
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Định dạng thời gian theo phong cách tiếng Việt thân thiện
 * @param {string|Date} dateInput - Chuỗi thời gian ISO hoặc đối tượng Date
 * @returns {string} - Chuỗi hiển thị (ví dụ: "14:32, Hôm nay" hoặc "08:15, 12/10")
 */
function formatTimeVi(dateInput) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  if (isToday) {
    return `${timeStr}, Hôm nay`;
  }
  if (isYesterday) {
    return `${timeStr}, Hôm qua`;
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${timeStr}, ${day}/${month}`;
}

/**
 * Định dạng thời gian ngắn gọn hiển thị trong danh sách lịch sử
 * @param {string|Date} dateInput - Thời gian ISO
 * @returns {string} - Chuỗi giờ hoặc ngày ngắn gọn
 */
function formatShortTime(dateInput) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  if (isToday) {
    return `${hours}:${minutes}`;
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

/**
 * Lấy biểu tượng cảm xúc tương ứng cho chủ đề
 * @param {string} topicKey - Mã định danh chủ đề
 * @returns {string} - Biểu tượng emoji
 */
function getTopicIcon(topicKey) {
  return TOPIC_ICONS[topicKey] || '💬';
}

/**
 * Hiển thị thông báo Toast nhanh góc màn hình
 * @param {string} message - Nội dung thông báo
 * @param {string} type - Phân loại: 'info', 'success', 'error'
 * @param {number} duration - Thời gian hiển thị (mili giây)
 */
window.showToast = function (message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-text">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  // Hiệu ứng mờ dần và tự hủy phần tử sau khi hết thời gian
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = 'all 0.35s ease';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 350);
  }, duration);
};

/**
 * Cuộn khung hội thoại xuống đáy mượt mà
 * @param {boolean} smooth - Có sử dụng hiệu ứng cuộn mượt hay không
 */
function scrollToBottom(smooth = true) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  // Sử dụng requestAnimationFrame để đảm bảo DOM đã hoàn thành layout
  requestAnimationFrame(() => {
    chatMessages.scrollTo({
      top: chatMessages.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
  });
}

/**
 * ─────────────────────────────────────────────────────────────
 * 3. BỘ PHÂN TÍCH MARKDOWN VÀ KATEX (PARSER ENGINE)
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Chuyển đổi định dạng văn bản Markdown kết hợp công thức LaTeX thành mã HTML an toàn.
 * Quy trình thực hiện:
 *  1. Tách và bảo vệ khối mã nguồn (code blocks) và mã nội dòng (inline code)
 *  2. Tách và bảo vệ công thức toán học LaTeX (display math $$...$$ và inline math $...$)
 *  3. Escape HTML đối với văn bản thông thường để phòng chống XSS
 *  4. Định dạng tiêu đề (h2, h3, h4), chữ in đậm, chữ in nghiêng, gạch ngang
 *  5. Định dạng danh sách có thứ tự (ol) và không có thứ tự (ul)
 *  6. Chuyển đổi các đoạn văn bản (p) và ngắt dòng (br)
 *  7. Phục hồi lại các khối mã và công thức LaTeX đã bảo vệ
 *
 * @param {string} text - Văn bản phản hồi thô từ Gemini AI
 * @returns {string} - Chuỗi HTML hoàn chỉnh đã xử lý
 */
/**
 * Render một biểu thức LaTeX thành chuỗi HTML bằng KaTeX (kèm xử lý dự phòng an toàn)
 * @param {string} mathExpr - Biểu thức LaTeX (không kèm dấu $ hoặc $$)
 * @param {boolean} displayMode - true nếu là công thức khối ($$), false nếu nội dòng ($)
 * @returns {string} - Chuỗi HTML biểu diễn ký hiệu toán học
 */
function renderMathString(mathExpr, displayMode = false) {
  if (!mathExpr) return '';
  const cleanMath = mathExpr.trim();
  if (!cleanMath) return '';

  // Nếu thư viện KaTeX đã nạp sẵn, vẽ trực tiếp sang HTML toán học chuẩn
  if (window.katex && typeof window.katex.renderToString === 'function') {
    try {
      return window.katex.renderToString(cleanMath, {
        displayMode: displayMode,
        throwOnError: false,
        strict: false,
        trust: true,
         errorColor: '#FF6B6B'
      });
    } catch (e) {
      console.warn('KaTeX renderToString fallback:', e);
    }
  }

  // Dự phòng khi KaTeX đang tải (defer): bọc trong thẻ span đã escape HTML an toàn
  // để trình duyệt không nuốt dấu < hoặc >, sau đó renderKaTeX() sẽ quét lại
  const delim = displayMode ? '$$' : '$';
  return `<span class="math-pending">${delim}${escapeHtml(cleanMath)}${delim}</span>`;
}

function formatMarkdown(text) {
  if (!text) return '';

  const codeBlocks = [];
  const displayMath = [];
  const inlineMath = [];
  const inlineCodes = [];

  // Bước 1: Trích xuất các khối mã nguồn ```lang ... ```
  // LƯU Ý QUAN TRỌNG: Placeholder KHÔNG ĐƯỢC dùng dấu _ hoặc * để tránh bị bộ phân tích in nghiêng/đậm làm hỏng!
  text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const id = codeBlocks.length;
    codeBlocks.push({ lang: lang || '', code: code.trim() });
    return `@@CODEBLOCK${id}@@`;
  });

  // Bước 2: Trích xuất công thức toán hiển thị dạng khối $$...$$ và \[...\]
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
    const id = displayMath.length;
    displayMath.push(math.trim());
    return `@@DISPLAYMATH${id}@@`;
  });
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, math) => {
    const id = displayMath.length;
    displayMath.push(math.trim());
    return `@@DISPLAYMATH${id}@@`;
  });

  // Bước 3: Trích xuất công thức toán nội dòng $...$ và \(...\)
  text = text.replace(/\$([^\$\n]+?)\$/g, (match, math) => {
    const id = inlineMath.length;
    inlineMath.push(math.trim());
    return `@@INLINEMATH${id}@@`;
  });
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (match, math) => {
    const id = inlineMath.length;
    inlineMath.push(math.trim());
    return `@@INLINEMATH${id}@@`;
  });

  // Bước 3b: Bắt tự động các lệnh LaTeX phổ biến nếu AI quên bọc trong dấu $...$
  text = text.replace(
    /(\\(?:d?frac|sqrt|widehat|triangle)\{[^{}]*\}(?:\{[^{}]*\})?|\\(?:Rightarrow|Leftrightarrow|leq?|geq?|neq|approx|times|div|cdot|in|notin|subset|parallel|perp|mathbb\{[NZQR]\}))/g,
    (match) => {
      const id = inlineMath.length;
      inlineMath.push(match.trim());
      return `@@INLINEMATH${id}@@`;
    }
  );

  // Bước 4: Trích xuất mã nội dòng `...`
  text = text.replace(/`([^`\n]+)`/g, (match, code) => {
    const id = inlineCodes.length;
    inlineCodes.push(code);
    return `@@INLINECODE${id}@@`;
  });

  // Bước 5: Thoát ký tự HTML nguy hiểm đối với nội dung văn bản còn lại
  text = escapeHtml(text);

  // Bước 6: Phân tích tiêu đề (Headings)
  text = text.replace(/^### (.*$)/gim, '<h4>$1</h4>');
  text = text.replace(/^## (.*$)/gim, '<h3>$1</h3>');
  text = text.replace(/^# (.*$)/gim, '<h2>$1</h2>');

  // Bước 7: Phân tích in đậm, in nghiêng, gạch ngang
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
  text = text.replace(/\*([^\*\n]+?)\*/g, '<em>$1</em>');
  text = text.replace(/(^|\s)_([^_\n]+?)_(?=\s|[.,!?;:]|$)/g, '$1<em>$2</em>');
  text = text.replace(/~~(.*?)~~/g, '<del>$1</del>');

  // Bước 8: Phân tích danh sách (Lists: ul, ol)
  const lines = text.split('\n');
  const processedLines = [];
  let inUl = false;
  let inOl = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);

    if (ulMatch) {
      if (inOl) {
        processedLines.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        processedLines.push('<ul>');
        inUl = true;
      }
      processedLines.push(`<li>${ulMatch[2]}</li>`);
    } else if (olMatch) {
      if (inUl) {
        processedLines.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        processedLines.push('<ol>');
        inOl = true;
      }
      processedLines.push(`<li>${olMatch[2]}</li>`);
    } else {
      if (inUl) {
        processedLines.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        processedLines.push('</ol>');
        inOl = false;
      }
      processedLines.push(line);
    }
  }

  if (inUl) processedLines.push('</ul>');
  if (inOl) processedLines.push('</ol>');

  text = processedLines.join('\n');

  // Bước 9: Gom nhóm đoạn văn (Paragraphs)
  const blocks = text.split(/\n{2,}/);
  const htmlBlocks = blocks.map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    if (
      trimmed.startsWith('<ul>') ||
      trimmed.startsWith('<ol>') ||
      trimmed.startsWith('<h2>') ||
      trimmed.startsWith('<h3>') ||
      trimmed.startsWith('<h4>') ||
      trimmed.startsWith('@@CODEBLOCK') ||
      trimmed.startsWith('@@DISPLAYMATH')
    ) {
      return trimmed;
    }
    // Chuyển ký tự xuống dòng đơn thành thẻ <br>
    const content = trimmed.replace(/\n/g, '<br>');
    return `<p>${content}</p>`;
  });

  text = htmlBlocks.filter((b) => b.length > 0).join('\n');

  // Bước 10: Phục hồi mã nội dòng (Inline Code)
  text = text.replace(/@@INLINECODE(\d+)@@/g, (m, id) => {
    return `<code>${escapeHtml(inlineCodes[Number(id)])}</code>`;
  });

  // Phục hồi khối mã nguồn (Code Blocks)
  text = text.replace(/<p>@@CODEBLOCK(\d+)@@<\/p>/g, '@@CODEBLOCK$1@@');
  text = text.replace(/@@CODEBLOCK(\d+)@@/g, (m, id) => {
    const block = codeBlocks[Number(id)];
    const langClass = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : '';
    return `<pre><code${langClass}>${escapeHtml(block.code)}</code></pre>`;
  });

  // Phục hồi và vẽ trực tiếp công thức khối (Display Math) bằng KaTeX
  text = text.replace(/<p>@@DISPLAYMATH(\d+)@@<\/p>/g, '@@DISPLAYMATH$1@@');
  text = text.replace(/@@DISPLAYMATH(\d+)@@/g, (m, id) => {
    return `<div class="katex-block-wrapper">${renderMathString(displayMath[Number(id)], true)}</div>`;
  });

  // Phục hồi và vẽ trực tiếp công thức nội dòng (Inline Math) bằng KaTeX
  text = text.replace(/@@INLINEMATH(\d+)@@/g, (m, id) => {
    return renderMathString(inlineMath[Number(id)], false);
  });

  return text;
}

/**
 * Kích hoạt công cụ KaTeX để hiển thị công thức toán học bên trong một phần tử HTML
 * @param {HTMLElement} element - Phần tử cần duyệt công thức
 */
function renderKaTeX(element) {
  if (!element) return;

  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(element, KATEX_OPTIONS);
    } catch (e) {
      console.warn('Lỗi khi vẽ công thức toán bằng KaTeX:', e);
    }
  } else {
    // Trường hợp thư viện KaTeX tải bất đồng bộ (defer) chưa sẵn sàng
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (window.renderMathInElement) {
        clearInterval(interval);
        try {
          window.renderMathInElement(element, KATEX_OPTIONS);
        } catch (e) {
          console.warn('Lỗi khi vẽ công thức toán bằng KaTeX:', e);
        }
      } else if (attempts > 15) {
        clearInterval(interval);
      }
    }, 200);
  }
}

/**
 * ─────────────────────────────────────────────────────────────
 * 4. XÁC THỰC VÀ TÀI KHOẢN (AUTHENTICATION & USER PROFILE)
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Kiểm tra trạng thái đăng nhập của người dùng khi tải trang
 */
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'same-origin'
    });

    if (!res.ok) {
      showAuthModal();
      return;
    }

    const data = await res.json();

    if (data.success && data.logged_in && data.user) {
      state.currentUser = data.user;
      if (data.user.grade) {
        selectGrade(data.user.grade);
      }
      showAppContainer();
      loadChatHistory();
    } else {
      showAuthModal();
    }
  } catch (err) {
    console.warn('Lỗi khi kiểm tra phiên đăng nhập:', err);
    showAuthModal();
  }
}

/**
 * Chuyển đổi giữa tab Đăng nhập và Đăng ký trên cửa sổ Modal
 * @param {string} tab - 'login' hoặc 'register'
 */
window.switchAuthTab = function (tab) {
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  if (tab === 'login') {
    if (tabLogin) tabLogin.classList.add('active');
    if (tabRegister) tabRegister.classList.remove('active');
    if (loginForm) loginForm.classList.remove('hidden');
    if (registerForm) registerForm.classList.add('hidden');

    const input = document.getElementById('loginUsername');
    if (input) setTimeout(() => input.focus(), 100);
  } else {
    if (tabRegister) tabRegister.classList.add('active');
    if (tabLogin) tabLogin.classList.remove('active');
    if (registerForm) registerForm.classList.remove('hidden');
    if (loginForm) loginForm.classList.add('hidden');

    const input = document.getElementById('regFullname');
    if (input) setTimeout(() => input.focus(), 100);
  }
};

/**
 * Xử lý biểu mẫu Đăng nhập
 * @param {Event} event - Sự kiện submit form
 */
window.handleLogin = async function (event) {
  if (event) event.preventDefault();

  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  const btnLogin = document.getElementById('btnLogin');

  if (!usernameInput || !passwordInput) return;

  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    showToast('Vui lòng nhập tên đăng nhập và mật khẩu.', 'error');
    return;
  }

  const originalBtnHtml = btnLogin ? btnLogin.innerHTML : '';
  if (btnLogin) {
    btnLogin.disabled = true;
    btnLogin.innerHTML = '<span>⏳</span> Đang đăng nhập...';
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      showToast(data.message || 'Đăng nhập thành công! Chào em.', 'success');
      passwordInput.value = '';

      state.currentUser = data.user;
      if (data.user && data.user.grade) {
        selectGrade(data.user.grade);
      }

      showAppContainer();
      loadChatHistory();
    } else {
      showToast(data.error || 'Tên đăng nhập hoặc mật khẩu không chính xác.', 'error');
    }
  } catch (err) {
    console.error('Lỗi khi gửi yêu cầu đăng nhập:', err);
    showToast('Không thể kết nối đến máy chủ. Em vui lòng thử lại nhé!', 'error');
  } finally {
    if (btnLogin) {
      btnLogin.disabled = false;
      btnLogin.innerHTML = originalBtnHtml;
    }
  }
};

/**
 * Xử lý biểu mẫu Đăng ký tài khoản học sinh mới
 * @param {Event} event - Sự kiện submit form
 */
window.handleRegister = async function (event) {
  if (event) event.preventDefault();

  const fullnameInput = document.getElementById('regFullname');
  const usernameInput = document.getElementById('regUsername');
  const passwordInput = document.getElementById('regPassword');
  const gradeInput = document.getElementById('regGrade');
  const btnRegister = document.getElementById('btnRegister');

  if (!fullnameInput || !usernameInput || !passwordInput || !gradeInput) return;

  const display_name = fullnameInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  const grade = parseInt(gradeInput.value, 10);

  if (!display_name || !username || !password || !grade) {
    showToast('Vui lòng điền đầy đủ các mục thông tin.', 'error');
    return;
  }

  if (password.length < 4) {
    showToast('Mật khẩu phải có ít nhất 4 ký tự.', 'error');
    return;
  }

  const originalBtnHtml = btnRegister ? btnRegister.innerHTML : '';
  if (btnRegister) {
    btnRegister.disabled = true;
    btnRegister.innerHTML = '<span>⏳</span> Đang tạo tài khoản...';
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        display_name,
        username,
        password,
        grade
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      showToast(data.message || 'Chúc mừng em đã đăng ký tài khoản thành công! 🎉', 'success');

      state.currentUser = data.user;
      selectGrade(grade);

      showAppContainer();
      loadChatHistory();
    } else {
      showToast(data.error || 'Đăng ký không thành công. Hãy thử lại!', 'error');
    }
  } catch (err) {
    console.error('Lỗi khi gửi yêu cầu đăng ký:', err);
    showToast('Không thể kết nối máy chủ. Vui lòng thử lại sau!', 'error');
  } finally {
    if (btnRegister) {
      btnRegister.disabled = false;
      btnRegister.innerHTML = originalBtnHtml;
    }
  }
};

/**
 * Đăng xuất khỏi tài khoản và đưa người dùng về màn hình đăng nhập
 */
window.handleLogout = async function () {
  try {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin'
    });
    const data = await res.json();
    showToast(data.message || 'Đã đăng xuất. Hẹn gặp lại em!', 'info');
  } catch (e) {
    console.warn('Lỗi khi gửi lệnh đăng xuất:', e);
  } finally {
    state.currentUser = null;
    showAuthModal();

    // Dọn dẹp tin nhắn hội thoại cũ
    const chatMessages = document.getElementById('chatMessages');
    const welcomeScreen = document.getElementById('welcomeScreen');
    if (chatMessages) {
      const rows = chatMessages.querySelectorAll('.message-row, .typing-indicator');
      rows.forEach((r) => r.remove());
    }
    if (welcomeScreen) {
      welcomeScreen.classList.remove('hidden');
      welcomeScreen.style.display = '';
    }
  }
};

/**
 * Mở giao diện ứng dụng chính và ẩn màn hình đăng nhập
 */
function showAppContainer() {
  const authOverlay = document.getElementById('authOverlay');
  const appContainer = document.getElementById('appContainer');

  if (authOverlay) authOverlay.classList.add('hidden');
  if (appContainer) appContainer.classList.remove('hidden');

  // Cập nhật thông tin hiển thị trên thanh bên (sidebar profile)
  if (state.currentUser) {
    const profileName = document.getElementById('profileName');
    const profileGrade = document.getElementById('profileGrade');
    if (profileName) {
      profileName.textContent =
        state.currentUser.display_name || state.currentUser.username || 'Học sinh';
    }
    if (profileGrade) {
      profileGrade.textContent = `Lớp ${state.currentUser.grade || state.currentGrade}`;
    }
  }

  // Tự động focus vào khung nhập câu hỏi trên máy tính để bàn
  const chatInput = document.getElementById('chatInput');
  if (chatInput && window.innerWidth > 768) {
    setTimeout(() => chatInput.focus(), 300);
  }
}

/**
 * Hiển thị màn hình modal xác thực và ẩn giao diện ứng dụng chính
 */
function showAuthModal() {
  const authOverlay = document.getElementById('authOverlay');
  const appContainer = document.getElementById('appContainer');

  if (authOverlay) authOverlay.classList.remove('hidden');
  if (appContainer) appContainer.classList.add('hidden');

  switchAuthTab('login');
}

/**
 * ─────────────────────────────────────────────────────────────
 * 5. QUẢN LÝ CHỌN LỚP VÀ GIAO DIỆN (GRADE & THEME MANAGEMENT)
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Lựa chọn khối lớp học (Lớp 6 hoặc Lớp 7)
 * Cập nhật đồng bộ tất cả các nút trên desktop, mobile và profile
 * @param {number|string} grade - 6 hoặc 7
 */
window.selectGrade = function (grade) {
  const g = parseInt(grade, 10);
  if (g !== 6 && g !== 7) return;

  state.currentGrade = g;
  localStorage.setItem('toan_hoc_vui_grade', g.toString());

  // Đồng bộ hóa trạng thái active trên tất cả các nút chọn lớp
  const allGradeBtns = document.querySelectorAll('.grade-btn');
  allGradeBtns.forEach((btn) => {
    const btnGrade = parseInt(btn.getAttribute('data-grade'), 10);
    if (btnGrade === g) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Cập nhật nhãn lớp học trong profile người dùng
  const profileGrade = document.getElementById('profileGrade');
  if (profileGrade) {
    profileGrade.textContent = `Lớp ${g}`;
  }

  // Cập nhật sẵn vào select box đăng ký nếu người dùng chưa chọn
  const regGrade = document.getElementById('regGrade');
  if (regGrade && !regGrade.value) {
    regGrade.value = g.toString();
  }
};

/**
 * Khởi tạo chọn lớp từ dữ liệu đã lưu trong localStorage hoặc mặc định
 */
function initGradeSelector() {
  const savedGrade = localStorage.getItem('toan_hoc_vui_grade');
  if (savedGrade) {
    selectGrade(parseInt(savedGrade, 10));
  } else {
    selectGrade(6);
  }
}

/**
 * Chuyển đổi qua lại giữa giao diện Sáng và Tối (Light/Dark Theme)
 */
window.toggleTheme = function () {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  applyTheme(newTheme);
  localStorage.setItem('toan_hoc_vui_theme', newTheme);
};

/**
 * Áp dụng theme lên phần tử html và cập nhật nút bấm
 * @param {string} theme - 'light' hoặc 'dark'
 */
function applyTheme(theme) {
  state.theme = theme;
  const html = document.documentElement;
  html.setAttribute('data-theme', theme);

  const themeToggle = document.getElementById('themeToggle');
  if (!themeToggle) return;

  const iconSpan = themeToggle.querySelector('.theme-icon');
  const textSpan = themeToggle.querySelector('.theme-text');

  if (theme === 'dark') {
    if (iconSpan) iconSpan.textContent = '☀️';
    if (textSpan) textSpan.textContent = 'Sáng';
  } else {
    if (iconSpan) iconSpan.textContent = '🌙';
    if (textSpan) textSpan.textContent = 'Tối';
  }
}

/**
 * Khởi tạo theme khi nạp trang (đọc từ localStorage hoặc system preference)
 */
function initTheme() {
  const savedTheme = localStorage.getItem('toan_hoc_vui_theme');
  if (savedTheme === 'dark' || savedTheme === 'light') {
    applyTheme(savedTheme);
  } else {
    // Nếu chưa lưu tùy chọn, tham khảo tùy chỉnh hệ điều hành của người dùng
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }
}

/**
 * ─────────────────────────────────────────────────────────────
 * 6. ĐIỀU HƯỚNG VÀ THANH BÊN (SIDEBAR & NAVIGATION)
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Đóng hoặc mở thanh bên (Sidebar) trên thiết bị di động
 */
window.toggleSidebar = function () {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar || !overlay) return;

  const isOpen = sidebar.classList.contains('open');
  if (isOpen) {
    closeSidebar();
  } else {
    openSidebar();
  }
};

/**
 * Mở thanh bên kèm lớp màn mờ
 */
function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.add('open');
  if (overlay) overlay.classList.add('active');
}

/**
 * Đóng thanh bên và lớp màn mờ
 */
function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
}

/**
 * Bắt đầu một cuộc trò chuyện mới:
 * Dọn sạch khung trò chuyện, hiển thị lại màn hình chào mừng và gợi ý
 */
window.startNewChat = function () {
  const chatMessages = document.getElementById('chatMessages');
  const welcomeScreen = document.getElementById('welcomeScreen');
  const chatInput = document.getElementById('chatInput');
  const btnSend = document.getElementById('btnSend');

  if (!chatMessages) return;

  // Xóa các hàng tin nhắn hiện hữu
  const rows = chatMessages.querySelectorAll('.message-row, .typing-indicator');
  rows.forEach((row) => row.remove());

  // Hiển thị lại màn hình chào mừng
  if (welcomeScreen) {
    welcomeScreen.classList.remove('hidden');
    welcomeScreen.style.display = '';
  }

  // Bỏ kích hoạt mục đang chọn trong danh sách lịch sử
  const historyItems = document.querySelectorAll('.history-item');
  historyItems.forEach((item) => item.classList.remove('active'));

  // Reset khung nhập câu hỏi
  if (chatInput) {
    chatInput.value = '';
    handleInputResize();
    chatInput.focus();
  }
  if (btnSend) {
    btnSend.disabled = true;
  }

  // Đóng thanh bên nếu đang ở màn hình điện thoại
  if (window.innerWidth <= 992) {
    closeSidebar();
  }

  showToast('Đã bắt đầu cuộc trò chuyện mới!', 'info', 2500);
};

/**
 * Đặt câu hỏi nhanh theo chủ đề từ thanh bên
 * @param {string} topicName - Tên chủ đề (ví dụ: 'Số học', 'Hình học')
 */
window.askTopic = function (topicName) {
  if (!topicName) return;

  if (window.innerWidth <= 992) {
    closeSidebar();
  }

  const prompt = `Thầy ơi, thầy hãy tóm tắt kiến thức trọng tâm và hướng dẫn các dạng bài tập tiêu biểu về chủ đề "${topicName}" môn Toán lớp ${state.currentGrade} cho em nhé!`;

  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.value = prompt;
    handleInputResize();
    sendMessage();
  }
};

/**
 * Gửi câu hỏi gợi ý khi học sinh nhấn vào nút trên màn hình chào mừng
 * @param {HTMLElement} btn - Nút câu hỏi gợi ý được nhấn
 */
window.sendSuggested = function (btn) {
  if (!btn) return;

  const textSpan = btn.querySelector('span:last-child') || btn;
  const question = textSpan.textContent.trim();

  const chatInput = document.getElementById('chatInput');
  if (chatInput && question) {
    chatInput.value = question;
    handleInputResize();
    sendMessage();
  }
};

/**
 * ─────────────────────────────────────────────────────────────
 * 7. XỬ LÝ TIN NHẮN VÀ GỬI CÂU HỎI (MESSAGING & CHAT ENGINE)
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Tự động điều chỉnh chiều cao của ô textarea theo nội dung nhập vào
 */
function handleInputResize() {
  const chatInput = document.getElementById('chatInput');
  const btnSend = document.getElementById('btnSend');
  if (!chatInput) return;

  chatInput.style.height = 'auto';
  const newHeight = Math.min(Math.max(chatInput.scrollHeight, 24), 120);
  chatInput.style.height = `${newHeight}px`;

  // Kiểm soát trạng thái kích hoạt của nút gửi tin nhắn
  if (btnSend) {
    btnSend.disabled = chatInput.value.trim().length === 0 || state.isSending;
  }
}

/**
 * Hiển thị hiệu ứng AI đang gõ trả lời (typing dots)
 */
function showTypingIndicator() {
  removeTypingIndicator();
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'typingIndicator';
  indicator.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="typing-bubble">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>
  `;
  chatMessages.appendChild(indicator);
  scrollToBottom(true);
}

/**
 * Gỡ bỏ hiệu ứng AI đang gõ
 */
function removeTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) {
    indicator.remove();
  }
}

/**
 * Chèn một dòng tin nhắn của học sinh vào khung chat
 * @param {string} text - Nội dung câu hỏi
 * @param {string|Date} [timestamp] - Thời gian gửi
 */
function appendUserMessage(text, timestamp = new Date()) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const row = document.createElement('div');
  row.className = 'message-row user';

  const timeStr = formatTimeVi(timestamp);

  row.innerHTML = `
    <div class="message-avatar">👨‍🎓</div>
    <div class="message-content">
      <div class="message-bubble" data-raw-text="${escapeHtml(text)}">${escapeHtml(text).replace(/\n/g, '<br>')}</div>
      <div class="message-actions">
        <button class="msg-action-btn" onclick="copyMessageText(this)" title="Sao chép câu hỏi">
          <span>📋</span> Sao chép
        </button>
      </div>
      <div class="message-time">${timeStr}</div>
    </div>
  `;

  chatMessages.appendChild(row);
  scrollToBottom(true);
}

/**
 * Chèn một dòng tin nhắn phản hồi của AI vào khung chat
 * @param {string} markdownText - Nội dung phản hồi dạng Markdown + LaTeX
 * @param {string} [topicDisplay] - Nhãn hiển thị chủ đề toán
 * @param {string|Date} [timestamp] - Thời gian phản hồi
 */
function appendAiMessage(markdownText, topicDisplay = '', timestamp = new Date()) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const row = document.createElement('div');
  row.className = 'message-row ai';

  const timeStr = formatTimeVi(timestamp);
  const formattedHtml = formatMarkdown(markdownText);

  const topicBadge = topicDisplay
    ? `<span class="msg-action-btn" style="pointer-events:none;color:var(--primary);font-weight:600">🏷️ ${escapeHtml(topicDisplay)}</span>`
    : '';

  row.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-content">
      <div class="message-bubble" data-raw-text="${escapeHtml(markdownText)}">
        ${formattedHtml}
      </div>
      <div class="message-actions">
        ${topicBadge}
        <button class="msg-action-btn" onclick="copyMessageText(this)" title="Sao chép câu trả lời">
          <span>📋</span> Sao chép
        </button>
      </div>
      <div class="message-time">${timeStr}</div>
    </div>
  `;

  chatMessages.appendChild(row);

  // Kích hoạt render công thức toán học KaTeX trong bong bóng chat AI
  const bubble = row.querySelector('.message-bubble');
  if (bubble) {
    renderKaTeX(bubble);
  }

  scrollToBottom(true);
}

/**
 * Gửi câu hỏi của học sinh tới máy chủ và nhận phản hồi từ Gemini AI
 */
window.sendMessage = async function () {
  const chatInput = document.getElementById('chatInput');
  const btnSend = document.getElementById('btnSend');
  const welcomeScreen = document.getElementById('welcomeScreen');

  if (!chatInput || state.isSending) return;

  const rawText = chatInput.value.trim();
  if (!rawText) return;

  // 1. Thiết lập trạng thái đang gửi
  state.isSending = true;
  chatInput.value = '';
  handleInputResize();
  if (btnSend) btnSend.disabled = true;

  // 2. Ẩn màn hình chào mừng khi có tin nhắn đầu tiên
  if (welcomeScreen && !welcomeScreen.classList.contains('hidden')) {
    welcomeScreen.classList.add('hidden');
    welcomeScreen.style.display = 'none';
  }

  // 3. Thêm tin nhắn của học sinh vào giao diện
  appendUserMessage(rawText);

  // 4. Hiển thị hiệu ứng AI đang suy nghĩ
  showTypingIndicator();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin',
      body: JSON.stringify({ message: rawText })
    });

    const data = await response.json();

    // 5. Gỡ bỏ hiệu ứng suy nghĩ
    removeTypingIndicator();

    if (response.ok && data.success) {
      // 6. Hiển thị phản hồi từ AI
      appendAiMessage(data.response, data.topic_display);

      // Cảnh báo nếu số câu hỏi trong phiên sắp chạm giới hạn rate-limit
      if (
        typeof data.remaining_questions === 'number' &&
        data.remaining_questions <= 5 &&
        data.remaining_questions > 0
      ) {
        showToast(`Em còn ${data.remaining_questions} câu hỏi trong giờ này nhé!`, 'info', 4000);
      }

      // Tải lại danh sách lịch sử ở thanh bên
      loadChatHistory();
    } else if (response.status === 429 || data.rate_limited) {
      // Giới hạn tần suất đặt câu hỏi (Rate-limit)
      const errorMsg =
        data.error ||
        'Em đã hỏi khá nhiều trong giờ qua rồi. Hãy nghỉ ngơi một chút rồi quay lại nhé! 😊';
      appendAiMessage(errorMsg, 'Nghỉ giải lao');
      showToast(errorMsg, 'error', 5000);
    } else {
      const errorMsg = data.error || 'Có lỗi xảy ra khi xử lý câu hỏi. Em hãy thử lại nhé!';
      appendAiMessage(`⚠️ ${errorMsg}`);
      showToast(errorMsg, 'error', 4000);
    }
  } catch (err) {
    console.error('Lỗi khi gửi câu hỏi tới API:', err);
    removeTypingIndicator();
    appendAiMessage(
      '⚠️ Mất kết nối tới máy chủ. Em vui lòng kiểm tra đường truyền mạng và thử lại nhé!'
    );
    showToast('Lỗi mạng hoặc máy chủ không phản hồi!', 'error', 4000);
  } finally {
    state.isSending = false;
    handleInputResize();
    if (chatInput && window.innerWidth > 768) {
      chatInput.focus();
    }
  }
};

/**
 * Sao chép nội dung văn bản của tin nhắn vào Clipboard
 * @param {HTMLElement} btn - Nút sao chép được nhấn
 */
window.copyMessageText = function (btn) {
  if (!btn) return;
  const messageRow = btn.closest('.message-row');
  if (!messageRow) return;
  const bubble = messageRow.querySelector('.message-bubble');
  if (!bubble) return;

  const rawText = bubble.getAttribute('data-raw-text') || bubble.innerText || bubble.textContent;
  if (!rawText) return;

  const originalHtml = btn.innerHTML;

  function onCopied() {
    btn.innerHTML = '<span>✓</span> Đã chép';
    btn.disabled = true;
    showToast('Đã sao chép nội dung vào bộ nhớ tạm!', 'success', 2000);
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }, 2000);
  }

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(rawText.trim())
      .then(onCopied)
      .catch(() => {
        fallbackCopyText(rawText.trim(), onCopied);
      });
  } else {
    fallbackCopyText(rawText.trim(), onCopied);
  }
};

/**
 * Phương thức sao chép dự phòng cho các trình duyệt cũ hoặc kết nối không bảo mật (non-HTTPS)
 * @param {string} text - Văn bản cần chép
 * @param {Function} callback - Hàm gọi lại sau khi thành công
 */
function fallbackCopyText(text, callback) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    const successful = document.execCommand('copy');
    if (successful && callback) {
      callback();
    }
  } catch (err) {
    console.error('Lỗi khi sao chép bằng fallback:', err);
    showToast('Không thể sao chép văn bản.', 'error', 2000);
  } finally {
    document.body.removeChild(textArea);
  }
}

/**
 * ─────────────────────────────────────────────────────────────
 * 8. LỊCH SỬ HỘI THOẠI (CHAT HISTORY MANAGEMENT)
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Tải danh sách lịch sử trò chuyện của người dùng từ máy chủ
 * @param {number} page - Số trang cần tải (mặc định trang 1)
 */
async function loadChatHistory(page = 1) {
  const container = document.getElementById('chatHistory');
  if (!container) return;

  try {
    const res = await fetch(`/api/chat/history?page=${page}&per_page=30`, {
      method: 'GET',
      credentials: 'same-origin'
    });

    if (!res.ok) return;

    const data = await res.json();
    if (data.success && Array.isArray(data.messages)) {
      state.historyCache = data.messages;
      renderHistorySidebar(data.messages);
    }
  } catch (err) {
    console.warn('Lỗi khi tải danh sách lịch sử:', err);
  }
}

/**
 * Vẽ danh sách các mục lịch sử vào thanh bên (sidebar)
 * @param {Array<Object>} messages - Mảng các tin nhắn từ backend
 */
function renderHistorySidebar(messages) {
  const container = document.getElementById('chatHistory');
  if (!container) return;

  if (!messages || messages.length === 0) {
    container.innerHTML = `
      <div style="padding: 16px 12px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">
        Chưa có câu hỏi nào
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  messages.forEach((msg) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.setAttribute('data-id', msg.id);
    item.setAttribute('title', msg.message);

    const icon = getTopicIcon(msg.topic);
    const shortTime = formatShortTime(msg.created_at);

    item.innerHTML = `
      <span class="history-icon">${icon}</span>
      <span class="history-text">${escapeHtml(msg.message)}</span>
      <span class="history-time">${shortTime}</span>
    `;

    item.addEventListener('click', () => {
      loadHistoryItem(msg.id);
    });

    container.appendChild(item);
  });
}

/**
 * Tải và hiển thị lại một cặp câu hỏi và câu trả lời trong lịch sử lên khung chat
 * @param {number|string} msgId - ID của tin nhắn
 */
window.loadHistoryItem = function (msgId) {
  const msg = state.historyCache.find((m) => m.id == msgId);
  if (!msg) return;

  // Đánh dấu mục active trong danh sách
  const allItems = document.querySelectorAll('.history-item');
  allItems.forEach((el) => {
    if (el.getAttribute('data-id') == msgId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Ẩn màn hình chào mừng
  const welcomeScreen = document.getElementById('welcomeScreen');
  if (welcomeScreen) {
    welcomeScreen.classList.add('hidden');
    welcomeScreen.style.display = 'none';
  }

  // Xóa sạch các tin nhắn trước và nạp lại cặp tin nhắn này
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;

  const rows = chatMessages.querySelectorAll('.message-row, .typing-indicator');
  rows.forEach((r) => r.remove());

  // Thêm tin nhắn câu hỏi của học sinh
  appendUserMessage(msg.message, msg.created_at);

  // Thêm tin nhắn câu trả lời của AI
  appendAiMessage(msg.response, msg.topic_display, msg.created_at);

  // Cuộn ngay xuống đáy mà không cần delay
  scrollToBottom(false);

  // Đóng sidebar trên thiết bị di động
  if (window.innerWidth <= 992) {
    closeSidebar();
  }
};

/**
 * ─────────────────────────────────────────────────────────────
 * 9. ĐĂNG KÝ PWA SERVICE WORKER
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Đăng ký Service Worker để ứng dụng hỗ trợ hoạt động offline và cài đặt dạng PWA
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/static/sw.js')
        .then((reg) => {
          console.log('✅ Service Worker đã được kích hoạt thành công:', reg.scope);
        })
        .catch((err) => {
          console.warn('⚠️ Đăng ký Service Worker không thành công:', err);
        });
    });
  }
}

/**
 * ─────────────────────────────────────────────────────────────
 * 10. KHỞI TẠO SỰ KIỆN GIAO DIỆN (EVENT LISTENERS INITIALIZATION)
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Đăng ký các sự kiện bàn phím và thay đổi kích thước trên ô nhập liệu
 */
function initChatInputEvents() {
  const chatInput = document.getElementById('chatInput');
  const btnSend = document.getElementById('btnSend');

  if (chatInput) {
    // Xử lý tự co giãn kích thước
    chatInput.addEventListener('input', handleInputResize);

    // Xử lý phím Enter (gửi tin) và Shift + Enter (xuống dòng)
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!btnSend || !btnSend.disabled) {
          sendMessage();
        }
      }
    });
  }

  // Lắng nghe sự kiện thay đổi kích thước cửa sổ để tự động đóng màn mờ sidebar
  window.addEventListener('resize', () => {
    if (window.innerWidth > 992) {
      const overlay = document.getElementById('sidebarOverlay');
      if (overlay && overlay.classList.contains('active')) {
        overlay.classList.remove('active');
      }
    }
  });
}

/**
 * Khởi chạy toàn bộ ứng dụng khi tài liệu HTML đã sẵn sàng
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Khởi tạo ứng dụng Toán Học Vui - Thầy Lý Hoàng Em');

  // 1. Áp dụng giao diện (Sáng/Tối)
  initTheme();

  // 2. Khởi tạo chọn lớp học
  initGradeSelector();

  // 3. Đăng ký các sự kiện ô nhập câu hỏi
  initChatInputEvents();

  // 4. Kiểm tra trạng thái đăng nhập
  checkAuth();

  // 5. Đăng ký Service Worker cho PWA
  registerServiceWorker();
});
