/**
 * ==============================================================================
 * BẢNG ĐIỀU KHIỂN QUẢN TRỊ (ADMIN DASHBOARD) - TOÁN HỌC VUI
 * ==============================================================================
 * Trợ lý AI Toán học lớp 6 & 7 - Hệ thống phân tích, thống kê và quản lý
 * Phát triển bởi: Thầy Lý Hoàng Em
 * Địa chỉ: xã Phú Hữu, tỉnh An Giang
 * ==============================================================================
 */

'use strict';

// ==============================================================================
// 1. CẤU HÌNH & HẰNG SỐ HỆ THỐNG
// ==============================================================================
const CONFIG = {
  // Khoảng thời gian tự động làm mới dữ liệu (60 giây)
  AUTO_REFRESH_INTERVAL: 60 * 1000,
  
  // Bảng màu nhận diện ứng dụng (khớp với style.css)
  COLORS: {
    primary: '#6C63FF',
    primaryDark: '#5A52D5',
    primaryLight: '#8B85FF',
    primaryBg: 'rgba(108, 99, 255, 0.12)',
    secondary: '#4ECDC4',
    secondaryDark: '#3DB8B0',
    accent: '#FF6B6B',
    accentDark: '#E05555',
    blue: '#3699FF',
    yellow: '#FFA800',
    purple: '#A55EEA',
    green: '#20BF6B',
    pink: '#FD79A8',
    orange: '#FA8231',
    gridLine: 'rgba(229, 231, 235, 0.6)',
    textPrimary: '#1A1A2E',
    textMuted: '#9CA3AF'
  },

  // Danh mục màu cho biểu đồ hình quạt (Chủ đề toán học)
  TOPIC_PALETTE: [
    '#6C63FF', // Tím chính
    '#4ECDC4', // Xanh ngọc
    '#FF6B6B', // Đỏ san hô
    '#3699FF', // Xanh dương
    '#FFA800', // Cam vàng
    '#A55EEA', // Tím hoa cà
    '#20BF6B', // Xanh lục tươi
    '#FD79A8', // Hồng phấn
    '#45AAF2', // Lam nhạt
    '#FA8231', // Cam đậm
    '#778CA3'  // Xám đá
  ],

  // Đường dẫn các API endpoints backend Flask
  API: {
    AUTH_LOGIN: '/api/auth/login',
    AUTH_LOGOUT: '/api/auth/logout',
    AUTH_ME: '/api/auth/me',
    STATS: '/api/stats',
    ADMIN_USERS: '/api/admin/users',
    ADMIN_MESSAGES: '/api/admin/messages',
    REPROCESS_PDFS: '/api/admin/reprocess-pdfs'
  }
};

// ==============================================================================
// 2. TRẠNG THÁI TOÀN CỤC (APPLICATION STATE)
// ==============================================================================
const state = {
  isAuthenticated: false,
  currentUser: null,
  refreshTimerId: null,
  isRefreshing: false,
  statsData: null,
  users: [],
  messages: [],
  userMap: new Map(), // Ánh xạ user_id -> thông tin học sinh
  charts: {
    questionsPerDay: null,
    topics: null,
    grades: null,
    hourly: null
  }
};

// ==============================================================================
// 3. HÀM TIỆN ÍCH (UTILITY FUNCTIONS)
// ==============================================================================

/**
 * Làm sạch chuỗi chống tấn công XSS khi chèn vào DOM
 * @param {string} str - Chuỗi đầu vào
 * @returns {string} Chuỗi an toàn
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Cắt ngắn chuỗi văn bản nếu vượt quá độ dài chỉ định
 * @param {string} str - Văn bản gốc
 * @param {number} maxLength - Độ dài tối đa
 * @returns {string} Văn bản đã cắt ngắn
 */
function truncateText(str, maxLength = 65) {
  if (!str) return '';
  const trimmed = String(str).trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.substring(0, maxLength) + '...';
}

/**
 * Phân tích chuỗi ISO Datetime thành đối tượng Date (chuẩn hoá múi giờ UTC từ SQLite)
 * @param {string} dateStr - Chuỗi ISO từ backend
 * @returns {Date|null}
 */
function parseUTCDate(dateStr) {
  if (!dateStr) return null;
  let s = String(dateStr).trim();
  // Nếu chuỗi ISO chưa có chỉ báo múi giờ 'Z' hoặc offset (+/-), gán 'Z' vì backend lưu UTC
  if (!s.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(s)) {
    s += 'Z';
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date(dateStr) : d;
}

/**
 * Định dạng thời gian theo chuẩn Việt Nam: DD/MM/YYYY HH:mm
 * @param {string|Date} dateInput - Chuỗi thời gian hoặc Date
 * @returns {string} Chuỗi hiển thị thân thiện
 */
function formatDateTimeVN(dateInput) {
  if (!dateInput) return '—';
  const d = typeof dateInput === 'string' ? parseUTCDate(dateInput) : dateInput;
  if (!d || isNaN(d.getTime())) return '—';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Hiển thị thời gian tương đối bằng tiếng Việt (VD: "5 phút trước", "Hôm qua")
 * @param {string|Date} dateInput - Chuỗi thời gian hoặc Date
 * @returns {string} Chuỗi thời gian tương đối
 */
function formatRelativeTimeVN(dateInput) {
  if (!dateInput) return '—';
  const d = typeof dateInput === 'string' ? parseUTCDate(dateInput) : dateInput;
  if (!d || isNaN(d.getTime())) return '—';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 0) return 'Vừa xong';
  if (diffSec < 45) return 'Vừa xong';
  if (diffSec < 90) return '1 phút trước';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return 'Hôm qua';
  if (diffDay < 7) return `${diffDay} ngày trước`;

  // Quá 7 ngày thì hiển thị đầy đủ ngày/tháng
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Hiệu ứng đếm số tăng dần (count-up animation) mượt mà
 * @param {HTMLElement} element - Phần tử hiển thị số
 * @param {number} targetValue - Giá trị đích cần hiển thị
 * @param {number} duration - Thời gian chạy hiệu ứng (ms)
 * @param {number} decimals - Số chữ số sau dấu phẩy thập phân
 */
function animateCountUp(element, targetValue, duration = 800, decimals = 0) {
  if (!element) return;

  const currentVal = parseFloat(element.getAttribute('data-numeric-value')) || 0;
  const startVal = isNaN(currentVal) ? 0 : currentVal;
  const endVal = parseFloat(targetValue) || 0;

  element.setAttribute('data-numeric-value', endVal);

  if (startVal === endVal) {
    element.textContent = decimals > 0 
      ? endVal.toFixed(decimals) 
      : Math.round(endVal).toLocaleString('vi-VN');
    return;
  }

  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Hiệu ứng giảm tốc mượt Ease Out Cubic: 1 - (1 - p)^3
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const current = startVal + (endVal - startVal) * easeProgress;

    element.textContent = decimals > 0
      ? current.toFixed(decimals)
      : Math.round(current).toLocaleString('vi-VN');

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      element.textContent = decimals > 0
        ? endVal.toFixed(decimals)
        : Math.round(endVal).toLocaleString('vi-VN');
    }
  }

  requestAnimationFrame(step);
}

// ==============================================================================
// 4. HỆ THỐNG THÔNG BÁO TOAST (TOAST NOTIFICATIONS)
// ==============================================================================

/**
 * Hiển thị thông báo Toast góc trên bên phải màn hình
 * @param {string} message - Nội dung thông báo
 * @param {'success'|'error'|'info'|'warning'} type - Loại thông báo
 * @param {number} duration - Thời gian tồn tại (ms)
 */
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
  const icon = iconMap[type] || 'ℹ️';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${escapeHTML(message)}</span>
  `;

  // Cho phép đóng nhanh khi nhấp chuột vào toast
  toast.addEventListener('click', () => {
    toast.style.animation = 'fadeOut 0.25s ease forwards';
    setTimeout(() => toast.remove(), 250);
  });

  container.appendChild(toast);

  // Tự động giải phóng sau khoảng thời gian duration
  setTimeout(() => {
    if (toast.parentElement) {
      toast.remove();
    }
  }, duration + 400);
}

// ==============================================================================
// 5. XÁC THỰC QUẢN TRỊ (AUTHENTICATION CONTROLLER)
// ==============================================================================

/**
 * Kiểm tra trạng thái phiên làm việc quản trị khi tải trang
 */
async function checkAuthStatus() {
  try {
    const response = await fetch(CONFIG.API.AUTH_ME, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      showLoginView();
      return;
    }

    const data = await response.json();
    if (data.success && data.logged_in && data.is_admin) {
      state.isAuthenticated = true;
      state.currentUser = data.user;
      showDashboardView();
      await refreshData();
      startAutoRefresh();
    } else {
      showLoginView();
    }
  } catch (err) {
    console.error('Lỗi khi kiểm tra phiên đăng nhập:', err);
    showLoginView();
  }
}

/**
 * Hiển thị giao diện màn hình Đăng nhập Quản trị
 */
function showLoginView() {
  state.isAuthenticated = false;
  state.currentUser = null;
  stopAutoRefresh();
  destroyAllCharts();

  const loginWrapper = document.getElementById('adminLoginWrapper');
  const dashboard = document.getElementById('adminDashboard');

  if (loginWrapper) loginWrapper.classList.remove('hidden');
  if (dashboard) dashboard.classList.add('hidden');

  // Đặt tiêu điểm vào ô nhập mật khẩu
  const passInput = document.getElementById('adminPassword');
  if (passInput) {
    passInput.value = '';
    setTimeout(() => passInput.focus(), 100);
  }
}

/**
 * Hiển thị giao diện màn hình Bảng điều khiển Quản trị (Dashboard)
 */
function showDashboardView() {
  const loginWrapper = document.getElementById('adminLoginWrapper');
  const dashboard = document.getElementById('adminDashboard');

  if (loginWrapper) loginWrapper.classList.add('hidden');
  if (dashboard) dashboard.classList.remove('hidden');
}

/**
 * Xử lý sự kiện gửi form đăng nhập quản trị
 * @param {Event} event - Sự kiện submit
 */
async function adminLogin(event) {
  if (event && event.preventDefault) {
    event.preventDefault();
  }

  const passInput = document.getElementById('adminPassword');
  const loginBtn = document.getElementById('btnAdminLogin');
  if (!passInput) return;

  const password = passInput.value.trim();
  if (!password) {
    showToast('Vui lòng nhập mật khẩu quản trị viên!', 'warning');
    passInput.focus();
    return;
  }

  // Cập nhật trạng thái nút bấm trong khi xử lý
  const originalBtnHTML = loginBtn ? loginBtn.innerHTML : '';
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span>⏳</span> Đang đăng nhập...';
  }

  try {
    const response = await fetch(CONFIG.API.AUTH_LOGIN, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        username: 'admin',
        password: password
      })
    });

    const data = await response.json();

    if (response.ok && data.success && data.is_admin) {
      showToast('Đăng nhập trang quản trị thành công! 🎉', 'success');
      state.isAuthenticated = true;
      state.currentUser = data.user;
      passInput.value = '';

      showDashboardView();
      await refreshData();
      startAutoRefresh();
    } else {
      const errorMsg = data.error || 'Mật khẩu quản trị viên không chính xác!';
      showToast(errorMsg, 'error');
      passInput.select();
    }
  } catch (err) {
    console.error('Lỗi kết nối khi đăng nhập:', err);
    showToast('Không thể kết nối đến máy chủ. Vui lòng thử lại!', 'error');
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.innerHTML = originalBtnHTML;
    }
  }
}

/**
 * Xử lý đăng xuất tài khoản quản trị
 */
async function adminLogout() {
  try {
    await fetch(CONFIG.API.AUTH_LOGOUT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });
  } catch (err) {
    console.warn('Lỗi gửi yêu cầu đăng xuất:', err);
  } finally {
    showToast('Đã đăng xuất khỏi phiên làm việc quản trị!', 'info');
    showLoginView();
  }
}

// ==============================================================================
// 6. DỊCH VỤ TẢI DỮ LIỆU & LÀM MỚI (DATA SERVICE & REFRESH)
// ==============================================================================

/**
 * Tải toàn bộ dữ liệu thống kê, danh sách học sinh và câu hỏi từ Backend
 */
async function refreshData() {
  if (state.isRefreshing) return;
  state.isRefreshing = true;

  // Hiệu ứng xoay icon trên nút "Làm mới"
  const refreshBtns = document.querySelectorAll('button[onclick*="refreshData"]');
  refreshBtns.forEach(btn => {
    btn.classList.add('loading-spin');
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';
  });

  try {
    // Tải song song 3 API endpoints để tối ưu tốc độ mạng
    const [statsRes, usersRes, messagesRes] = await Promise.all([
      fetch(CONFIG.API.STATS, { credentials: 'same-origin' }),
      fetch(`${CONFIG.API.ADMIN_USERS}?page=1&per_page=100`, { credentials: 'same-origin' }),
      fetch(`${CONFIG.API.ADMIN_MESSAGES}?page=1&per_page=100`, { credentials: 'same-origin' })
    ]);

    // Xử lý trường hợp phiên hết hạn (401/403)
    if (usersRes.status === 401 || usersRes.status === 403 || messagesRes.status === 401) {
      showToast('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại!', 'error');
      showLoginView();
      return;
    }

    const [statsData, usersData, messagesData] = await Promise.all([
      statsRes.ok ? statsRes.json() : { success: false },
      usersRes.ok ? usersRes.json() : { success: false },
      messagesRes.ok ? messagesRes.json() : { success: false }
    ]);

    // Lưu dữ liệu vào State
    if (statsData.success && statsData.stats) {
      state.statsData = statsData.stats;
    }

    if (usersData.success && Array.isArray(usersData.users)) {
      state.users = usersData.users;
      // Cập nhật ánh xạ userMap để tra cứu nhanh thông tin lớp của học sinh
      state.userMap.clear();
      state.users.forEach(u => state.userMap.set(u.id, u));
    }

    if (messagesData.success && Array.isArray(messagesData.messages)) {
      state.messages = messagesData.messages;
    }

    // Cập nhật giao diện: Thẻ thống kê, Biểu đồ và Bảng dữ liệu
    updateStatCards(state.statsData, state.users);
    renderAllCharts(state.statsData, state.users, state.messages);
    renderUsersTable(state.users);
    renderQuestionsTable(state.messages, state.userMap);

  } catch (err) {
    console.error('Lỗi khi làm mới dữ liệu quản trị:', err);
    showToast('Lỗi khi tải dữ liệu từ máy chủ. Đang thử lại...', 'error');
  } finally {
    state.isRefreshing = false;
    refreshBtns.forEach(btn => {
      btn.classList.remove('loading-spin');
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    });
  }
}

/**
 * Cập nhật 4 thẻ thống kê ở đầu bảng điều khiển
 * @param {Object} stats - Dữ liệu thống kê tổng hợp từ /api/stats
 * @param {Array} users - Danh sách người dùng
 */
function updateStatCards(stats, users) {
  const elUsers = document.getElementById('statUsers');
  const elQuestions = document.getElementById('statQuestions');
  const elActiveToday = document.getElementById('statActiveToday');
  const elAvgQuestions = document.getElementById('statAvgQuestions');

  const elUsersChange = document.getElementById('statUsersChange');
  const elQuestionsChange = document.getElementById('statQuestionsChange');
  const elActiveTodayChange = document.getElementById('statActiveTodayChange');
  const elAvgChange = document.getElementById('statAvgChange');

  if (!stats) return;

  const totalUsers = stats.total_users || (users ? users.length : 0) || 0;
  const totalQuestions = stats.total_questions || 0;
  const activeToday = stats.active_today || 0;
  const questionsToday = stats.questions_today || 0;
  const avgQuestions = totalUsers > 0 ? (totalQuestions / totalUsers) : 0;

  // 1. Thẻ Tổng học sinh
  if (elUsers) animateCountUp(elUsers, totalUsers, 800, 0);
  if (elUsersChange) {
    elUsersChange.textContent = `Lớp 6 & Lớp 7`;
    elUsersChange.className = 'stat-change positive';
  }

  // 2. Thẻ Tổng câu hỏi
  if (elQuestions) animateCountUp(elQuestions, totalQuestions, 900, 0);
  if (elQuestionsChange) {
    elQuestionsChange.textContent = questionsToday > 0 
      ? `+${questionsToday} câu hôm nay` 
      : 'Chưa có câu mới hôm nay';
    elQuestionsChange.className = questionsToday > 0 ? 'stat-change positive' : 'stat-change';
  }

  // 3. Thẻ Hoạt động hôm nay
  if (elActiveToday) animateCountUp(elActiveToday, activeToday, 800, 0);
  if (elActiveTodayChange) {
    const percent = totalUsers > 0 ? Math.round((activeToday / totalUsers) * 100) : 0;
    elActiveTodayChange.textContent = `${percent}% tổng số học sinh`;
    elActiveTodayChange.className = percent > 0 ? 'stat-change positive' : 'stat-change';
  }

  // 4. Thẻ Trung bình câu hỏi / học sinh
  if (elAvgQuestions) animateCountUp(elAvgQuestions, avgQuestions, 800, 1);
  if (elAvgChange) {
    elAvgChange.textContent = avgQuestions > 0 ? 'Tương tác học tập đều đặn' : 'Chưa có tương tác';
    elAvgChange.className = avgQuestions > 0 ? 'stat-change positive' : 'stat-change';
  }
}

// ==============================================================================
// 7. DỊCH VỤ VẼ BIỂU ĐỒ CHART.JS (CHARTS SERVICE)
// ==============================================================================

/**
 * Cấu hình mặc định chung cho thư viện Chart.js
 */
function setupChartDefaults() {
  if (typeof Chart === 'undefined') return;

  Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
  Chart.defaults.color = '#6B7280';
  Chart.defaults.borderColor = 'rgba(229, 231, 235, 0.7)';
  Chart.defaults.responsive = true;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.plugins.tooltip.backgroundColor = '#1A1A2E';
  Chart.defaults.plugins.tooltip.titleColor = '#FFFFFF';
  Chart.defaults.plugins.tooltip.bodyColor = '#E5E5F0';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.boxPadding = 4;
}

/**
 * Huỷ an toàn toàn bộ thể hiện biểu đồ hiện có để tránh rò rỉ bộ nhớ
 */
function destroyAllCharts() {
  Object.keys(state.charts).forEach(key => {
    if (state.charts[key]) {
      state.charts[key].destroy();
      state.charts[key] = null;
    }
  });
}

/**
 * Vẽ lại tất cả 4 biểu đồ thống kê
 */
function renderAllCharts(stats, users, messages) {
  if (typeof Chart === 'undefined') {
    console.warn('Thư viện Chart.js chưa được tải thành công!');
    return;
  }

  setupChartDefaults();
  renderChartQuestionsPerDay(stats ? stats.chart_data : []);
  renderChartTopics(stats ? stats.topic_stats : {});
  renderChartGrades(users || []);
  renderChartHourly(messages || []);
}

/**
 * Biểu đồ 1: Đường xu hướng câu hỏi theo ngày (Gradient fill, đường cong mềm)
 * @param {Array<{date: string, count: number}>} chartData - Dữ liệu câu hỏi theo ngày
 */
function renderChartQuestionsPerDay(chartData) {
  const canvas = document.getElementById('chartQuestionsPerDay');
  if (!canvas) return;

  if (state.charts.questionsPerDay) {
    state.charts.questionsPerDay.destroy();
    state.charts.questionsPerDay = null;
  }

  const safeData = Array.isArray(chartData) && chartData.length > 0 
    ? chartData 
    : [
        { date: 'Hôm nay', count: 0 }
      ];

  const labels = safeData.map(item => item.date);
  const data = safeData.map(item => item.count);

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, 'rgba(108, 99, 255, 0.45)');
  gradient.addColorStop(0.7, 'rgba(108, 99, 255, 0.12)');
  gradient.addColorStop(1, 'rgba(108, 99, 255, 0.00)');

  state.charts.questionsPerDay = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Số câu hỏi',
        data: data,
        fill: true,
        backgroundColor: gradient,
        borderColor: CONFIG.COLORS.primary,
        borderWidth: 3,
        tension: 0.38,
        pointBackgroundColor: CONFIG.COLORS.primary,
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointHoverBackgroundColor: CONFIG.COLORS.primaryDark,
        pointHoverBorderColor: '#FFFFFF',
        pointHoverBorderWidth: 3
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.y} câu hỏi`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            font: { size: 11 }
          },
          grid: {
            color: 'rgba(229, 231, 235, 0.6)'
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 11 }
          }
        }
      }
    }
  });
}

/**
 * Biểu đồ 2: Hình quạt phân bổ theo chủ đề (Doughnut Chart)
 * @param {Object} topicStats - Đối tượng dạng { "Số học": 12, "Hình học": 8, ... }
 */
function renderChartTopics(topicStats) {
  const canvas = document.getElementById('chartTopics');
  if (!canvas) return;

  if (state.charts.topics) {
    state.charts.topics.destroy();
    state.charts.topics = null;
  }

  const keys = topicStats ? Object.keys(topicStats) : [];
  let labels = [];
  let data = [];
  let colors = [];

  if (keys.length > 0) {
    labels = keys;
    data = keys.map(k => topicStats[k]);
    colors = keys.map((_, idx) => CONFIG.TOPIC_PALETTE[idx % CONFIG.TOPIC_PALETTE.length]);
  } else {
    // Trạng thái dự phòng khi chưa có dữ liệu
    labels = ['Chưa có câu hỏi'];
    data = [1];
    colors = ['#E5E7EB'];
  }

  const ctx = canvas.getContext('2d');
  state.charts.topics = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#FFFFFF',
        hoverOffset: 6
      }]
    },
    options: {
      cutout: '62%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            borderRadius: 3,
            useBorderRadius: true,
            padding: 10,
            font: { size: 11, weight: '500' }
          }
        },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              if (keys.length === 0) return ' Chưa có dữ liệu chủ đề';
              const label = ctx.label || '';
              const value = ctx.parsed || 0;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
              return ` ${label}: ${value} câu (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

/**
 * Biểu đồ 3: Cột phân bổ học sinh theo khối lớp (Lớp 6 vs Lớp 7)
 * @param {Array} users - Danh sách người dùng
 */
function renderChartGrades(users) {
  const canvas = document.getElementById('chartGrades');
  if (!canvas) return;

  if (state.charts.grades) {
    state.charts.grades.destroy();
    state.charts.grades = null;
  }

  let countGrade6 = 0;
  let countGrade7 = 0;

  if (Array.isArray(users)) {
    users.forEach(u => {
      const g = parseInt(u.grade, 10);
      if (g === 7) countGrade7++;
      else countGrade6++;
    });
  }

  const ctx = canvas.getContext('2d');
  state.charts.grades = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Lớp 6', 'Lớp 7'],
      datasets: [{
        label: 'Số lượng học sinh',
        data: [countGrade6, countGrade7],
        backgroundColor: [
          'rgba(108, 99, 255, 0.85)', // Màu tím cho Lớp 6
          'rgba(78, 205, 196, 0.85)'   // Màu ngọc cho Lớp 7
        ],
        hoverBackgroundColor: [
          CONFIG.COLORS.primary,
          CONFIG.COLORS.secondary
        ],
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 54
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.y} học sinh`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            font: { size: 11 }
          },
          grid: {
            color: 'rgba(229, 231, 235, 0.6)'
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 12, weight: '600' }
          }
        }
      }
    }
  });
}

/**
 * Biểu đồ 4: Cột thống kê hoạt động theo khung giờ trong ngày (0h - 23h)
 * @param {Array} messages - Danh sách tin nhắn
 */
function renderChartHourly(messages) {
  const canvas = document.getElementById('chartHourly');
  if (!canvas) return;

  if (state.charts.hourly) {
    state.charts.hourly.destroy();
    state.charts.hourly = null;
  }

  const hourlyCounts = new Array(24).fill(0);

  if (Array.isArray(messages)) {
    messages.forEach(msg => {
      if (msg.created_at) {
        const d = parseUTCDate(msg.created_at);
        if (d && !isNaN(d.getHours())) {
          hourlyCounts[d.getHours()]++;
        }
      }
    });
  }

  const labels = Array.from({ length: 24 }, (_, i) => `${i}h`);

  const ctx = canvas.getContext('2d');
  state.charts.hourly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Số câu hỏi',
        data: hourlyCounts,
        backgroundColor: 'rgba(54, 153, 255, 0.8)',
        hoverBackgroundColor: CONFIG.COLORS.blue,
        borderRadius: 4,
        borderSkipped: false,
        maxBarThickness: 18
      }]
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => `Khung giờ: ${items[0].label} - ${parseInt(items[0].label) + 1}h`,
            label: (ctx) => ` ${ctx.parsed.y} câu hỏi`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            font: { size: 10 }
          },
          grid: {
            color: 'rgba(229, 231, 235, 0.6)'
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 10 },
            // Hiển thị cách nhau mỗi 3 tiếng để trục hoành rõ ràng, không bị chồng chữ
            callback: function(val, index) {
              return index % 3 === 0 ? `${index}h` : '';
            }
          }
        }
      }
    }
  });
}

// ==============================================================================
// 8. DỊCH VỤ HIỂN THỊ BẢNG DỮ LIỆU (TABLES SERVICE)
// ==============================================================================

/**
 * Hiển thị danh sách học sinh gần đây vào bảng tableUsers
 * @param {Array} users - Danh sách người dùng
 */
function renderUsersTable(users) {
  const tbody = document.getElementById('tableUsers');
  if (!tbody) return;

  if (!Array.isArray(users) || users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:32px; color:var(--text-muted);">
          <span>Chưa có học sinh nào đăng ký trong hệ thống.</span>
        </td>
      </tr>
    `;
    return;
  }

  const rowsHTML = users.map(user => {
    const isGrade7 = parseInt(user.grade, 10) === 7;
    const gradeBadge = isGrade7
      ? '<span class="table-badge grade-7">Lớp 7</span>'
      : '<span class="table-badge grade-6">Lớp 6</span>';

    const questionCount = user.total_messages || (user.stats && user.stats.total_questions) || 0;
    const lastActiveRelative = formatRelativeTimeVN(user.last_active);
    const lastActiveFull = formatDateTimeVN(user.last_active);

    return `
      <tr>
        <td><strong>${escapeHTML(user.display_name || user.username)}</strong></td>
        <td><code>${escapeHTML(user.username)}</code></td>
        <td>${gradeBadge}</td>
        <td><strong>${questionCount.toLocaleString('vi-VN')}</strong></td>
        <td><span title="${lastActiveFull}" style="cursor:help;">${lastActiveRelative}</span></td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHTML;
}

/**
 * Hiển thị danh sách câu hỏi gần đây vào bảng tableQuestions
 * @param {Array} messages - Danh sách tin nhắn
 * @param {Map} userMap - Bản đồ tra cứu học sinh theo user_id
 */
function renderQuestionsTable(messages, userMap) {
  const tbody = document.getElementById('tableQuestions');
  if (!tbody) return;

  if (!Array.isArray(messages) || messages.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center; padding:32px; color:var(--text-muted);">
          <span>Chưa có câu hỏi nào được gửi từ học sinh.</span>
        </td>
      </tr>
    `;
    return;
  }

  const rowsHTML = messages.map(msg => {
    const user = userMap ? userMap.get(msg.user_id) : null;
    const studentName = escapeHTML(msg.display_name || (user ? user.display_name : '') || msg.username || 'Học sinh');
    
    // Xác định khối lớp học sinh
    const gradeNum = parseInt((user && user.grade) || msg.grade || 6, 10);
    const gradeBadge = gradeNum === 7
      ? '<span class="table-badge grade-7">Lớp 7</span>'
      : '<span class="table-badge grade-6">Lớp 6</span>';

    const truncatedQuestion = escapeHTML(truncateText(msg.message, 60));
    const fullQuestion = escapeHTML(msg.message || '');
    const topicDisplay = msg.topic_display ? `<small style="color:var(--text-muted); margin-left:6px;">[${escapeHTML(msg.topic_display)}]</small>` : '';

    const timeRelative = formatRelativeTimeVN(msg.created_at);
    const timeFull = formatDateTimeVN(msg.created_at);

    return `
      <tr style="cursor:pointer;" onclick="viewQuestionDetails(${msg.id})" title="Nhấp để xem đầy đủ câu hỏi và lời giải của AI">
        <td><strong>${studentName}</strong></td>
        <td>
          <span title="${fullQuestion}">${truncatedQuestion}</span>
          ${topicDisplay}
        </td>
        <td>${gradeBadge}</td>
        <td><span title="${timeFull}" style="cursor:help;">${timeRelative}</span></td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHTML;
}

/**
 * Mở cửa sổ Modal xem chi tiết câu hỏi và lời giải của AI
 * @param {number} messageId - ID của tin nhắn
 */
function viewQuestionDetails(messageId) {
  const msg = state.messages.find(m => m.id === messageId);
  if (!msg) return;

  const user = state.userMap.get(msg.user_id);
  const studentName = escapeHTML(msg.display_name || (user ? user.display_name : '') || msg.username || 'Học sinh');
  const grade = parseInt((user && user.grade) || msg.grade || 6, 10);
  const time = formatDateTimeVN(msg.created_at);
  const topic = escapeHTML(msg.topic_display || 'Toán học');

  // Gỡ bỏ modal cũ nếu đang tồn tại
  const existingModal = document.getElementById('adminQuestionModal');
  if (existingModal) existingModal.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'adminQuestionModal';
  modalOverlay.className = 'auth-overlay';
  modalOverlay.style.zIndex = '999';

  modalOverlay.innerHTML = `
    <div class="auth-card" style="max-width: 680px; width: 92%; max-height: 85vh; display: flex; flex-direction: column;">
      <div class="auth-header" style="padding: 20px 24px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h2 style="font-size:1.15rem; margin:0;">💬 Chi tiết tương tác hỏi - đáp</h2>
          <p style="margin:2px 0 0; font-size:0.8rem; opacity:0.85;">Học sinh: <strong>${studentName}</strong> (Lớp ${grade}) • ${time}</p>
        </div>
        <button id="btnCloseQuestionModal" style="color:#fff; font-size:1.4rem; cursor:pointer; line-height:1;">&times;</button>
      </div>

      <div class="auth-body" style="padding: 24px; overflow-y:auto; flex:1;">
        <div style="margin-bottom: 20px;">
          <div style="font-size:0.8rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:6px;">
            Chủ đề: <span style="color:var(--primary);">${topic}</span>
          </div>
          <div style="font-weight:600; color:var(--text-primary); margin-bottom:6px;">❓ Câu hỏi của học sinh:</div>
          <div style="background:var(--bg-input); padding:14px; border-radius:var(--radius-md); border-left:4px solid var(--primary); white-space:pre-wrap; font-size:0.95rem;">${escapeHTML(msg.message)}</div>
        </div>

        <div>
          <div style="font-weight:600; color:var(--text-primary); margin-bottom:6px;">🤖 Lời giải và hướng dẫn của AI:</div>
          <div style="background:var(--bg-card); border:1px solid var(--border-color); padding:14px; border-radius:var(--radius-md); white-space:pre-wrap; line-height:1.6; font-size:0.92rem; max-height:300px; overflow-y:auto;">${escapeHTML(msg.response || 'Chưa có lời giải.')}</div>
        </div>
      </div>

      <div class="auth-footer" style="padding: 14px 24px; text-align:right;">
        <button class="btn btn-primary" id="btnConfirmCloseModal" style="padding:8px 20px; font-size:0.88rem;">Đóng</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  const closeModal = () => modalOverlay.remove();
  const closeBtn = document.getElementById('btnCloseQuestionModal');
  const confirmBtn = document.getElementById('btnConfirmCloseModal');

  if (closeBtn) closeBtn.onclick = closeModal;
  if (confirmBtn) confirmBtn.onclick = closeModal;
  modalOverlay.onclick = (e) => {
    if (e.target === modalOverlay) closeModal();
  };

  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
}

// ==============================================================================
// 9. DỊCH VỤ XUẤT TẬP TIN CSV (EXPORT CSV SERVICE)
// ==============================================================================

/**
 * Xuất toàn bộ dữ liệu danh sách học sinh ra file CSV (hỗ trợ hiển thị tiếng Việt chuẩn UTF-8 trong Excel)
 */
async function exportCSV() {
  try {
    showToast('Đang trích xuất dữ liệu học sinh để xuất CSV...', 'info');

    // Tải toàn bộ danh sách người dùng từ API
    const response = await fetch(`${CONFIG.API.ADMIN_USERS}?page=1&per_page=1000`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Mã lỗi máy chủ: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !Array.isArray(data.users)) {
      throw new Error(data.error || 'Không thể lấy danh sách học sinh.');
    }

    const usersList = data.users;
    if (usersList.length === 0) {
      showToast('Hiện tại chưa có dữ liệu học sinh để xuất file!', 'warning');
      return;
    }

    // Tiêu đề các cột dữ liệu
    const headers = [
      'STT',
      'Họ và tên',
      'Tên đăng nhập',
      'Khối lớp',
      'Tổng số câu hỏi',
      'Ngày tham gia',
      'Lần hoạt động cuối'
    ];

    // Xử lý từng dòng dữ liệu và thoát ký tự kép chuẩn CSV
    const rows = usersList.map((user, index) => {
      const stt = index + 1;
      const name = `"${String(user.display_name || '').replace(/"/g, '""')}"`;
      const username = `"${String(user.username || '').replace(/"/g, '""')}"`;
      const grade = `"Lớp ${user.grade || 6}"`;
      const questions = user.total_messages || (user.stats && user.stats.total_questions) || 0;
      const createdAt = `"${formatDateTimeVN(user.created_at)}"`;
      const lastActive = `"${formatDateTimeVN(user.last_active)}"`;

      return [stt, name, username, grade, questions, createdAt, lastActive].join(',');
    });

    // Ký tự BOM (\uFEFF) giúp Microsoft Excel hiển thị đúng font Tiếng Việt Unicode UTF-8
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');

    // Tạo đối tượng Blob và liên kết tải về máy
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const now = new Date();
    const dateFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    link.href = url;
    link.download = `Danh_Sach_Hoc_Sinh_ToanHocVui_${dateFormatted}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Đã xuất thành công ${usersList.length} hồ sơ học sinh ra file CSV! 📥`, 'success');

  } catch (err) {
    console.error('Lỗi khi xuất dữ liệu CSV:', err);
    showToast(`Lỗi khi xuất CSV: ${err.message}`, 'error');
  }
}

// ==============================================================================
// 10. TÍNH NĂNG BẢO TRÌ HỆ THỐNG (SYSTEM MAINTENANCE)
// ==============================================================================

/**
 * Yêu cầu máy chủ xử lý và trích xuất lại toàn bộ giáo trình SGK từ file PDF
 */
async function reprocessPDFs() {
  const confirmAction = confirm('Bạn có chắc chắn muốn xử lý lại toàn bộ file PDF sách giáo khoa? Thao tác này có thể mất vài phút.');
  if (!confirmAction) return;

  try {
    showToast('Đang yêu cầu hệ thống phân tích lại các file PDF SGK...', 'info', 5000);
    const response = await fetch(CONFIG.API.REPROCESS_PDFS, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });

    const data = await response.json();
    if (response.ok && data.success) {
      showToast(data.message || 'Đã hoàn tất xử lý lại toàn bộ sách giáo khoa!', 'success');
    } else {
      showToast(data.error || 'Không thể xử lý lại file PDF.', 'error');
    }
  } catch (err) {
    console.error('Lỗi khi xử lý lại PDF:', err);
    showToast('Lỗi kết nối khi gửi yêu cầu xử lý lại PDF!', 'error');
  }
}

// ==============================================================================
// 11. BỘ ĐẾM THỜI GIAN & CHU KỲ HOẠT ĐỘNG (LIFECYCLE & POLLING)
// ==============================================================================

/**
 * Khởi động bộ đếm tự động làm mới số liệu mỗi 60 giây
 */
function startAutoRefresh() {
  stopAutoRefresh();
  state.refreshTimerId = setInterval(() => {
    // Chỉ tự động tải khi tab trình duyệt đang mở và người dùng đã xác thực
    if (state.isAuthenticated && !document.hidden) {
      refreshData();
    }
  }, CONFIG.AUTO_REFRESH_INTERVAL);
}

/**
 * Dừng bộ đếm tự động làm mới
 */
function stopAutoRefresh() {
  if (state.refreshTimerId) {
    clearInterval(state.refreshTimerId);
    state.refreshTimerId = null;
  }
}

/**
 * Đăng ký sự kiện chuyển tab (Visibility Change) để tiết kiệm tài nguyên
 */
function setupVisibilityHandler() {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.isAuthenticated) {
      // Khi quay lại tab sau một thời gian, cập nhật ngay dữ liệu mới nhất
      refreshData();
    }
  });
}

// ==============================================================================
// 12. GẮN CÁC HÀM TOÀN CỤC CHO HTML GỌI TRỰC TIẾP (WINDOW EXPOSURE)
// ==============================================================================
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.refreshData = refreshData;
window.exportCSV = exportCSV;
window.reprocessPDFs = reprocessPDFs;
window.showToast = showToast;
window.viewQuestionDetails = viewQuestionDetails;

// ==============================================================================
// 13. KHỞI CHẠY ỨNG DỤNG (INITIALIZATION)
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupVisibilityHandler();
  checkAuthStatus();
});
