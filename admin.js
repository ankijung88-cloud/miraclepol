/**
 * POLISH LAB (폴리시랩) - 관리자 전용 관제 시스템 JavaScript
 * Features:
 * 1. PIN 보안 인증 게이트 (기본 PIN: 1234, 커스텀 비밀번호 변경 지원)
 * 2. 구글 스프레드시트 실시간 양방향 연동 & Webhook 허브
 * 3. 실시간 예약 접수 현황, KPI 지표 산출, 상태 변경 관리
 * 4. 엑셀/CSV 내보내기, 고객 알림 문자/카톡 복사
 */

// Application Constants & State
const DEFAULT_PIN = '1234';
let currentPinInput = '';
let allBookingsData = [];
let activeFilter = 'all';
let currentDetailItem = null;

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  
  initAuthCheck();
  initKeypadEvents();
  initDashboardEvents();
});

/* ==========================================================================
   1. Authentication Gate (PIN Logic)
   ========================================================================== */
function initAuthCheck() {
  const isAuth = sessionStorage.getItem('polishlab_admin_auth') === 'true';
  const loginGate = document.getElementById('adminLoginGate');
  const adminDashboard = document.getElementById('adminDashboard');

  if (isAuth) {
    if (loginGate) loginGate.style.display = 'none';
    if (adminDashboard) adminDashboard.style.display = 'flex';
    loadDashboardData();
  } else {
    if (loginGate) loginGate.style.display = 'flex';
    if (adminDashboard) adminDashboard.style.display = 'none';
    resetPinDisplay();
  }
}

function initKeypadEvents() {
  const keypadBtns = document.querySelectorAll('.keypad-btn');
  keypadBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-val');
      if (val === 'clear') {
        currentPinInput = '';
      } else if (val === 'backspace') {
        currentPinInput = currentPinInput.slice(0, -1);
      } else if (val) {
        if (currentPinInput.length < 4) {
          currentPinInput += val;
        }
      }
      updatePinDots();

      if (currentPinInput.length === 4) {
        verifyPin(currentPinInput);
      }
    });
  });

  // Physical Keyboard Support
  window.addEventListener('keydown', (e) => {
    const loginGate = document.getElementById('adminLoginGate');
    if (loginGate && loginGate.style.display !== 'none') {
      if (e.key >= '0' && e.key <= '9') {
        if (currentPinInput.length < 4) {
          currentPinInput += e.key;
          updatePinDots();
          if (currentPinInput.length === 4) {
            verifyPin(currentPinInput);
          }
        }
      } else if (e.key === 'Backspace') {
        currentPinInput = currentPinInput.slice(0, -1);
        updatePinDots();
      } else if (e.key === 'Escape') {
        currentPinInput = '';
        updatePinDots();
      }
    }
  });
}

function updatePinDots() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((dot, idx) => {
    if (idx < currentPinInput.length) {
      dot.classList.add('filled');
    } else {
      dot.classList.remove('filled');
    }
  });
}

function resetPinDisplay() {
  currentPinInput = '';
  updatePinDots();
}

function verifyPin(pin) {
  const storedPin = localStorage.getItem('polishlab_admin_pin') || DEFAULT_PIN;
  if (pin === storedPin) {
    sessionStorage.setItem('polishlab_admin_auth', 'true');
    showAdminToast('인증 성공', 'POLISH LAB 관리자 관제 시스템에 로그인되었습니다.');
    setTimeout(() => {
      initAuthCheck();
    }, 300);
  } else {
    showAdminToast('인증 실패', '비밀번호(PIN)가 일치하지 않습니다.');
    const pinBox = document.getElementById('pinDisplayBox');
    if (pinBox) {
      pinBox.style.transform = 'translateX(-8px)';
      setTimeout(() => pinBox.style.transform = 'translateX(8px)', 80);
      setTimeout(() => pinBox.style.transform = 'translateX(-6px)', 160);
      setTimeout(() => pinBox.style.transform = 'translateX(0)', 240);
    }
    setTimeout(() => {
      resetPinDisplay();
    }, 400);
  }
}

window.adminLogout = function() {
  sessionStorage.removeItem('polishlab_admin_auth');
  showAdminToast('로그아웃', '관리자 세션이 정상적으로 종료되었습니다.');
  initAuthCheck();
};

/* ==========================================================================
   2. Google Sheets Configuration in Admin
   ========================================================================== */
function initDashboardEvents() {
  const gasUrl = localStorage.getItem('polishlab_gas_url') || '';
  const urlInput = document.getElementById('adminGasUrlInput');
  if (urlInput) urlInput.value = gasUrl;
  updateGasStatusUI(gasUrl);

  // Search Input
  const searchInput = document.getElementById('tableSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderBookingsTable();
    });
  }

  // Filter Tabs
  const filterBtns = document.querySelectorAll('.filter-tab-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.getAttribute('data-filter') || 'all';
      renderBookingsTable();
    });
  });
}

function updateGasStatusUI(url) {
  const badge = document.getElementById('adminGasBadge');
  if (!badge) return;

  if (url) {
    badge.className = 'gas-status-badge active';
    badge.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;"></span> 구글 시트 실시간 연동 활성화`;
  } else {
    badge.className = 'gas-status-badge inactive';
    badge.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:#fb7185;display:inline-block;"></span> 구글 시트 미연동 (로컬 모드)`;
  }
}

window.saveAdminGasUrl = function() {
  const input = document.getElementById('adminGasUrlInput');
  if (!input) return;
  const val = input.value.trim();

  if (val && !val.startsWith('https://script.google.com/')) {
    showAdminToast('URL 형식 오류', 'Google Apps Script 웹 앱 URL을 올바르게 입력해 주세요.');
    return;
  }

  localStorage.setItem('polishlab_gas_url', val);
  updateGasStatusUI(val);
  showAdminToast('설정 저장', val ? '구글 스프레드시트 실시간 연동 주소가 저장되었습니다.' : '연동 주소가 초기화되었습니다.');
  loadDashboardData();
};

window.testAdminGasPing = async function() {
  const url = localStorage.getItem('polishlab_gas_url') || (document.getElementById('adminGasUrlInput') ? document.getElementById('adminGasUrlInput').value.trim() : '');
  if (!url) {
    showAdminToast('URL 필요', '구글 Apps Script URL을 먼저 등록해 주세요.');
    return;
  }

  showAdminToast('테스트 전송 중', '구글 시트로 테스트 데이터를 전송하고 있습니다...');

  const testPayload = {
    id: 'ADMIN-TEST-' + Math.floor(1000 + Math.random() * 9000),
    createdAt: formatNowDate(),
    name: '관리자 테스트',
    phone: '010-0000-0000',
    plate: '77가 7777',
    carModel: '관리자 연동 테스트 (BMW 5시리즈)',
    carClass: '중형 / 준대형 세단',
    damageLevel: 'Lv 1. 미세 스월 & 워터스팟',
    serviceMethod: '전문 디테일링 센터 입고',
    reserveSchedule: '테스트 시공 일정',
    address: 'POLISH LAB 센터 본점',
    panels: ['본넷 (보닛)', '앞범퍼'],
    addons: ['부분 하이엔드 유리막 코팅'],
    priceSummary: {
      baseSum: 120000,
      discountAmount: 12000,
      finalTotal: 143000,
      estTimeMin: 90
    },
    remarks: '관리자 페이지에서 전송한 실시간 구글 시트 연동 테스트입니다.',
    status: '테스트 완료'
  };

  try {
    // 1. POST attempt
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(testPayload)
    });
    showAdminToast('테스트 전송 성공', '구글 시트에 테스트 데이터 행이 추가되었습니다!');
    setTimeout(loadDashboardData, 1200);
  } catch (err) {
    console.warn('Ping POST failed, attempting GET fallback:', err);
    try {
      // 2. GET fallback
      const getUrl = url + (url.includes('?') ? '&' : '?') + 'action=book&payload=' + encodeURIComponent(JSON.stringify(testPayload));
      const img = new Image();
      img.src = getUrl;
      showAdminToast('테스트 전송 성공', '구글 시트에 테스트 데이터가 전송되었습니다.');
      setTimeout(loadDashboardData, 1200);
    } catch (e) {
      showAdminToast('전송 실패', '전송 중 오류가 발생했습니다. Apps Script 배포 설정을 확인해 주세요.');
    }
  }
};

window.copyGASScriptCode = async function() {
  try {
    const resp = await fetch('google-apps-script.js');
    if (resp.ok) {
      const code = await resp.text();
      navigator.clipboard.writeText(code).then(() => {
        showAdminToast('코드 복사 완료', '최신 Google Apps Script 전체 코드가 클립보드에 복사되었습니다.');
      });
      return;
    }
  } catch (err) {
    console.warn('Fetch google-apps-script.js failed:', err);
  }
};

let pollingIntervalId = null;

/* ==========================================================================
   3. Real-Time Data Fetching & KPI Calculations (Google Sheets as SSOT)
   ========================================================================== */
window.loadDashboardData = async function(isSilent = false) {
  const gasUrl = localStorage.getItem('polishlab_gas_url');
  const refreshBtn = document.querySelector('button[onclick="loadDashboardData()"]');
  if (refreshBtn && !isSilent) {
    refreshBtn.classList.add('loading');
    const icon = refreshBtn.querySelector('i');
    if (icon) icon.style.animation = 'spin 0.8s linear infinite';
  }

  if (gasUrl) {
    try {
      const qUrl = gasUrl + (gasUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
      const resp = await fetch(qUrl);
      if (resp.ok) {
        const json = await resp.json();
        if (json.result === 'success' && Array.isArray(json.data)) {
          // Google Sheets is the Single Source of Truth
          allBookingsData = json.data;
          // Update local cache
          localStorage.setItem('polishlab_bookings', JSON.stringify(json.data));
          if (!isSilent) {
            showAdminToast('구글 시트 동기화 완료', `구글 스프레드시트에서 ${allBookingsData.length}건의 실시간 예약 데이터를 불러왔습니다.`);
          }
        }
      }
    } catch (err) {
      console.warn('Google Sheets fetch failed, falling back to local cache:', err);
      const localList = JSON.parse(localStorage.getItem('polishlab_bookings') || '[]');
      allBookingsData = [...localList];
    }
  } else {
    const localList = JSON.parse(localStorage.getItem('polishlab_bookings') || '[]');
    allBookingsData = [...localList];
  }

  // Sort by createdAt descending
  allBookingsData.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  updateKPICards();
  renderBookingsTable();
  if (window.lucide) lucide.createIcons();

  if (refreshBtn && !isSilent) {
    setTimeout(() => {
      refreshBtn.classList.remove('loading');
      const icon = refreshBtn.querySelector('i');
      if (icon) icon.style.animation = '';
    }, 400);
  }

  // Auto-polling setup (every 8 seconds)
  if (!pollingIntervalId) {
    pollingIntervalId = setInterval(() => {
      const isAuth = sessionStorage.getItem('polishlab_admin_auth') === 'true';
      if (isAuth && localStorage.getItem('polishlab_gas_url')) {
        window.loadDashboardData(true);
      }
    }, 8000);
  }
};

function updateKPICards() {
  const totalCountEl = document.getElementById('kpiTotalCount');
  const todayCountEl = document.getElementById('kpiTodayCount');
  const pendingCountEl = document.getElementById('kpiPendingCount');
  const totalRevenueEl = document.getElementById('kpiTotalRevenue');

  const todayStr = formatNowDate().split(' ')[0];
  let todayCount = 0;
  let pendingCount = 0;
  let totalRevenue = 0;

  allBookingsData.forEach(b => {
    if (b.createdAt && b.createdAt.startsWith(todayStr)) {
      todayCount++;
    }
    if (b.status === '예약 접수완료' || b.status === '대기') {
      pendingCount++;
    }
    const total = b.priceSummary ? (b.priceSummary.finalTotal || 0) : 0;
    if (b.status !== '취소') {
      totalRevenue += total;
    }
  });

  if (totalCountEl) totalCountEl.textContent = allBookingsData.length.toLocaleString() + '건';
  if (todayCountEl) todayCountEl.textContent = todayCount.toLocaleString() + '건';
  if (pendingCountEl) pendingCountEl.textContent = pendingCount.toLocaleString() + '건';
  if (totalRevenueEl) totalRevenueEl.textContent = totalRevenue.toLocaleString() + '원';
}

/* ==========================================================================
   4. Table Rendering & Search
   ========================================================================== */
function renderBookingsTable() {
  const tbody = document.getElementById('adminTableBody');
  const countBadge = document.getElementById('tableRowCountBadge');
  const query = (document.getElementById('tableSearchInput')?.value || '').trim().toLowerCase();

  if (!tbody) return;

  const todayStr = formatNowDate().split(' ')[0];

  const filtered = allBookingsData.filter(item => {
    // 1. Tab Filter
    if (activeFilter === 'today' && !(item.createdAt && item.createdAt.startsWith(todayStr))) return false;
    if (activeFilter === 'shop' && !item.serviceMethod?.includes('센터')) return false;
    if (activeFilter === 'onsite' && !item.serviceMethod?.includes('출장')) return false;
    if (activeFilter === 'pending' && !(item.status === '예약 접수완료' || item.status === '대기')) return false;
    if (activeFilter === 'completed' && item.status !== '시공완료') return false;

    // 2. Query Filter
    if (query) {
      const matchName = item.name?.toLowerCase().includes(query);
      const matchPhone = item.phone?.replace(/[^0-9]/g, '').includes(query.replace(/[^0-9]/g, ''));
      const matchPlate = item.plate?.toLowerCase().includes(query);
      const matchCar = item.carModel?.toLowerCase().includes(query);
      const matchId = item.id?.toLowerCase().includes(query);
      return matchName || matchPhone || matchPlate || matchCar || matchId;
    }
    return true;
  });

  if (countBadge) countBadge.textContent = `${filtered.length}건`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted);">
          <i data-lucide="inbox" style="width:36px;height:36px;margin-bottom:8px;"></i>
          <div>조회된 예약 신청 내역이 없습니다.</div>
        </td>
      </tr>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    let pillClass = 'received';
    if (item.status === '시공예정' || item.status === '시공진행') pillClass = 'scheduled';
    if (item.status === '시공완료') pillClass = 'completed';
    if (item.status === '취소') pillClass = 'cancelled';

    const panelsDisplay = Array.isArray(item.panels) ? item.panels.join(', ') : (item.panels || '-');
    const finalAmt = item.priceSummary ? (item.priceSummary.finalTotal || 0) : 0;

    return `
      <tr>
        <td style="font-weight:800;color:var(--accent-cyan);font-size:0.8rem;">${escapeHtml(item.id)}</td>
        <td style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(item.createdAt)}</td>
        <td>
          <div style="font-weight:800;color:#fff;">${escapeHtml(item.name)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(item.phone)}</div>
        </td>
        <td>
          <div style="font-weight:700;color:var(--accent-cyan);">${escapeHtml(item.plate)}</div>
          <div style="font-size:0.75rem;color:var(--text-secondary);">${escapeHtml(item.carModel)}</div>
        </td>
        <td>
          <div style="font-size:0.8rem;font-weight:700;">${escapeHtml(item.serviceMethod || '-')}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(item.reserveSchedule || '-')}</div>
        </td>
        <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.8rem;" title="${escapeHtml(panelsDisplay)}">
          ${escapeHtml(panelsDisplay)}
        </td>
        <td style="font-weight:900;color:#38bdf8;">
          ${finalAmt.toLocaleString()}원
        </td>
        <td>
          <span class="status-pill ${pillClass}">${escapeHtml(item.status || '접수완료')}</span>
        </td>
        <td>
          <button class="btn-action-view" onclick="openDetailModal('${item.id}')">
            상세/관리
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

/* ==========================================================================
   5. Detail Modal & Status Updating
   ========================================================================== */
window.openDetailModal = function(id) {
  const item = allBookingsData.find(b => b.id === id);
  if (!item) return;

  currentDetailItem = item;
  const modal = document.getElementById('adminDetailModal');
  if (!modal) return;

  document.getElementById('modalDetailId').textContent = item.id;
  document.getElementById('modalDetailName').textContent = `${item.name} (${item.phone})`;
  document.getElementById('modalDetailCar').textContent = `${item.carModel} / ${item.plate} (${item.carClass || '-'})`;
  document.getElementById('modalDetailSchedule').textContent = item.reserveSchedule || '-';
  document.getElementById('modalDetailLocation').textContent = `${item.serviceMethod} | ${item.address || '-'}`;
  document.getElementById('modalDetailDamage').textContent = item.damageLevel || '-';
  document.getElementById('modalDetailPanels').textContent = Array.isArray(item.panels) ? item.panels.join(', ') : item.panels;
  document.getElementById('modalDetailAddons').textContent = Array.isArray(item.addons) ? (item.addons.length ? item.addons.join(', ') : '없음') : (item.addons || '없음');
  document.getElementById('modalDetailPrice').textContent = item.priceSummary ? item.priceSummary.finalTotal.toLocaleString() + '원' : '0원';
  document.getElementById('modalDetailRemarks').textContent = item.remarks || '특이사항 없음';

  const statusSelect = document.getElementById('modalStatusSelect');
  if (statusSelect) {
    statusSelect.value = item.status || '예약 접수완료';
  }

  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
};

window.closeDetailModal = function() {
  const modal = document.getElementById('adminDetailModal');
  if (modal) modal.classList.add('hidden');
};

window.saveBookingStatusChange = async function() {
  if (!currentDetailItem) return;
  const newStatus = document.getElementById('modalStatusSelect').value;
  const bookingId = currentDetailItem.id;

  currentDetailItem.status = newStatus;

  // 1. Update in local storage cache
  const localList = JSON.parse(localStorage.getItem('polishlab_bookings') || '[]');
  const idx = localList.findIndex(b => b.id === bookingId);
  if (idx !== -1) {
    localList[idx].status = newStatus;
    localStorage.setItem('polishlab_bookings', JSON.stringify(localList));
  }

  // 2. Real-time sync with Google Spreadsheet
  const gasUrl = localStorage.getItem('polishlab_gas_url');
  if (gasUrl) {
    showAdminToast('스프레드시트 동기화 중', `구글 스프레드시트 S열 상태를 [${newStatus}](으)로 반영하고 있습니다...`);
    try {
      // POST Attempt
      await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updateStatus',
          id: bookingId,
          status: newStatus
        })
      });
      showAdminToast('상태 변경 완료', `구글 스프레드시트 및 관제 시스템 상태가 [${newStatus}](으)로 반영되었습니다.`);
    } catch (err) {
      console.warn('POST status update failed, trying GET fallback:', err);
      try {
        const getUrl = gasUrl + (gasUrl.includes('?') ? '&' : '?') + 'action=updateStatus&id=' + encodeURIComponent(bookingId) + '&status=' + encodeURIComponent(newStatus) + '&_t=' + Date.now();
        const img = new Image();
        img.src = getUrl;
        showAdminToast('상태 변경 완료', `구글 스프레드시트에 상태 변경 요청이 전송되었습니다.`);
      } catch (e) {
        console.error('GAS status update failed:', e);
      }
    }
  } else {
    showAdminToast('상태 변경 완료', `예약 상태가 [${newStatus}](으)로 업데이트되었습니다.`);
  }

  closeDetailModal();
  updateKPICards();
  renderBookingsTable();
};

window.copyCustomerNoticeKakao = function() {
  if (!currentDetailItem) return;
  const d = currentDetailItem;
  const text = `[POLISH LAB 시공 예약 확정 안내]
안녕하세요, ${d.name} 고객님!
POLISH LAB 프리미엄 부분광택 예약이 정상 확정되었습니다.

- 예약번호: ${d.id}
- 시공차량: ${d.carModel} (${d.plate})
- 시공일시: ${d.reserveSchedule}
- 시공방식: ${d.serviceMethod}
- 시공부위: ${Array.isArray(d.panels) ? d.panels.join(', ') : d.panels}
- 예상소요: 약 ${d.priceSummary?.estTimeMin || 60}분
- 최종견적: ${d.priceSummary?.finalTotal.toLocaleString()}원

※ 시공 당일 담당 디테일러가 사전에 연락드릴 예정입니다.
문의: 010-7246-7211`;

  navigator.clipboard.writeText(text).then(() => {
    showAdminToast('복사 완료', '고객 알림용 카카오톡/문자 안내문이 복사되었습니다.');
  });
};

/* ==========================================================================
   6. Export CSV
   ========================================================================== */
window.exportBookingsToCSV = function() {
  if (!allBookingsData.length) {
    showAdminToast('내보내기 불가', '내보낼 예약 데이터가 없습니다.');
    return;
  }

  const headers = ['신청ID', '신청일시', '고객명', '연락처', '차량번호', '차종', '시공방식', '시공일시', '시공부위', '최종견적금액', '상태'];
  const rows = allBookingsData.map(b => [
    b.id,
    b.createdAt,
    b.name,
    b.phone,
    b.plate,
    b.carModel,
    b.serviceMethod,
    b.reserveSchedule,
    Array.isArray(b.panels) ? b.panels.join(' / ') : b.panels,
    b.priceSummary ? b.priceSummary.finalTotal : 0,
    b.status
  ]);

  let csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.map(r => r.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `POLISH_LAB_예약목록_${formatNowDate().replace(/[^0-9]/g, '')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showAdminToast('CSV 다운로드', '예약 데이터 CSV 파일 다운로드가 시작되었습니다.');
};

/* ==========================================================================
   7. Password / PIN Change Modal
   ========================================================================== */
window.openChangePinModal = function() {
  const modal = document.getElementById('changePinModal');
  if (modal) modal.classList.remove('hidden');
};

window.closeChangePinModal = function() {
  const modal = document.getElementById('changePinModal');
  if (modal) modal.classList.add('hidden');
};

window.saveNewAdminPin = function() {
  const oldPin = document.getElementById('currentPinInput').value.trim();
  const newPin = document.getElementById('newPinInput').value.trim();
  const confirmPin = document.getElementById('confirmPinInput').value.trim();

  const currentStored = localStorage.getItem('polishlab_admin_pin') || DEFAULT_PIN;

  if (oldPin !== currentStored) {
    showAdminToast('변경 실패', '현재 비밀번호(PIN)가 일치하지 않습니다.');
    return;
  }

  if (!newPin || newPin.length !== 4 || isNaN(newPin)) {
    showAdminToast('변경 실패', '새 비밀번호는 숫자 4자리로 입력해 주세요.');
    return;
  }

  if (newPin !== confirmPin) {
    showAdminToast('변경 실패', '새 비밀번호 확인이 일치하지 않습니다.');
    return;
  }

  localStorage.setItem('polishlab_admin_pin', newPin);
  showAdminToast('PIN 변경 완료', '관리자 비밀번호가 성공적으로 변경되었습니다.');
  closeChangePinModal();
};

/* ==========================================================================
   8. Utilities
   ========================================================================== */
function formatNowDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showAdminToast(title, msg) {
  const container = document.getElementById('adminToastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.style.cssText = `
    background: #0f172a;
    border: 1px solid rgba(56, 189, 248, 0.4);
    border-radius: 8px;
    padding: 12px 18px;
    color: #fff;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 280px;
    animation: fadeIn 0.3s ease;
  `;
  toast.innerHTML = `
    <i data-lucide="shield-check" style="color:#38bdf8;width:20px;height:20px;flex-shrink:0;"></i>
    <div>
      <div style="font-size:0.88rem;font-weight:800;">${title}</div>
      <div style="font-size:0.78rem;color:#94a3b8;">${msg}</div>
    </div>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
