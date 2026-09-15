/**
 * POLISH LAB (폴리시랩) - 고객 전용 프리미엄 부분광택 인터랙티브 스크립트
 * Features:
 * 1. 차량 패널 인터랙티브 SVG & 칩 실시간 연동
 * 2. 차종/손상도/다부위 패키지 할인 실시간 계산 엔진
 * 3. 비포 & 애프터 듀얼 인터랙티브 슬라이더 (터치/마우스)
 * 4. 손상 부위 사진 업로드 및 진단 프리뷰
 * 5. 디지털 모바일 견적서 / A4 인쇄 / 카톡 복사
 * 6. 고객 전용 내 예약/견적 실시간 조회
 */

// Panel Data Master Definition
const PANELS_DATA = {
  bonnet: { name: '본넷 (보닛)', basePrice: 65000, timeMin: 50, icon: 'shield' },
  front_bumper: { name: '앞범퍼', basePrice: 55000, timeMin: 45, icon: 'shield' },
  rear_bumper: { name: '뒷범퍼', basePrice: 55000, timeMin: 45, icon: 'shield' },
  front_door_l: { name: '앞도어 (좌측)', basePrice: 50000, timeMin: 40, icon: 'square' },
  front_door_r: { name: '앞도어 (우측)', basePrice: 50000, timeMin: 40, icon: 'square' },
  rear_door_l: { name: '뒷도어 (좌측)', basePrice: 50000, timeMin: 40, icon: 'square' },
  rear_door_r: { name: '뒷도어 (우측)', basePrice: 50000, timeMin: 40, icon: 'square' },
  front_fender_l: { name: '앞휀다 (좌측)', basePrice: 45000, timeMin: 35, icon: 'square' },
  front_fender_r: { name: '앞휀다 (우측)', basePrice: 45000, timeMin: 35, icon: 'square' },
  rear_fender_l: { name: '뒤휀다 (좌측)', basePrice: 50000, timeMin: 40, icon: 'square' },
  rear_fender_r: { name: '뒤휀다 (우측)', basePrice: 50000, timeMin: 40, icon: 'square' },
  trunk: { name: '트렁크 (테일게이트)', basePrice: 55000, timeMin: 45, icon: 'square' },
  roof: { name: '루프 (천장)', basePrice: 75000, timeMin: 60, icon: 'square' },
  side_mirror: { name: '사이드미러 (좌/우)', basePrice: 30000, timeMin: 25, icon: 'disc' }
};

// Addon Services Master
const ADDONS_DATA = {
  coating: { name: '부분 하이엔드 유리막 코팅', price: 35000 },
  glass: { name: '전면유리 유막제거 & 발수코팅', price: 25000 },
  headlight: { name: '헤드라이트 황변/백화 복원 (1조)', price: 45000 },
  ppf: { name: '도어컵 & 도어엣지 PPF 4문짝', price: 25000 }
};

// Application State
const appState = {
  carClass: 'light',
  carClassName: '경차 / 소형',
  carMultiplier: 1.0,
  
  damageLevel: 'level1',
  damageLabel: 'Lv 1. 미세 스월 & 워터스팟',
  damageFactor: 1.0,
  
  selectedPanels: new Set(),
  selectedAddons: new Set(),
  
  serviceMethod: 'shop', // 'shop' or 'onsite'
  uploadedPhotos: [],
  
  calculated: {
    baseSum: 0,
    multiplierSum: 0,
    addonSum: 0,
    discountAmount: 0,
    discountRate: 0,
    finalTotal: 0,
    estTimeMin: 0
  }
};

// Google Sheets Real-Time Sync Configuration
let GOOGLE_SCRIPT_URL = localStorage.getItem('polishlab_gas_url') || '';

// DOM Content Loaded Init
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();

  renderPanelChecklistChips();
  initCarClassSelection();
  initDamageLevelSelection();
  initSVGPanelInteractions();
  initViewTabs();
  initAddonSelection();
  initServiceMethodSelection();
  initBeforeAfterSlider();
  initPhotoUploadDropzone();
  initReservationForm();
  initNavigationAndPhoneFormat();
  initFaqAccordion();

  // Initial calculation
  calculateQuote();
});

/* ==========================================================================
   1. Dynamic Panel Checklist Rendering
   ========================================================================== */
function renderPanelChecklistChips() {
  const container = document.getElementById('panelChipsGrid');
  if (!container) return;

  container.innerHTML = '';
  Object.keys(PANELS_DATA).forEach(key => {
    const item = PANELS_DATA[key];
    const chip = document.createElement('div');
    chip.className = `panel-chip ${appState.selectedPanels.has(key) ? 'selected' : ''}`;
    chip.setAttribute('data-panel', key);

    chip.innerHTML = `
      <div class="panel-chip-left">
        <div class="panel-check-circle">${appState.selectedPanels.has(key) ? '✓' : ''}</div>
        <span class="panel-chip-name">${item.name}</span>
      </div>
      <span class="panel-chip-price">${formatKRW(item.basePrice)}</span>
    `;

    chip.addEventListener('click', () => {
      togglePanelSelection(key);
    });

    container.appendChild(chip);
  });
}

/* ==========================================================================
   2. Interactive SVG & Panel Selection Handler
   ========================================================================== */
function initSVGPanelInteractions() {
  const svgPaths = document.querySelectorAll('.car-panel-path');
  const hoverBadge = document.getElementById('panelHoverBadge');
  const hoverName = document.getElementById('hoverPanelName');

  svgPaths.forEach(path => {
    const panelKey = path.getAttribute('data-panel');
    const panelInfo = PANELS_DATA[panelKey];

    // Hover tooltip
    path.addEventListener('mouseenter', () => {
      if (panelInfo && hoverName) {
        hoverName.textContent = `${panelInfo.name} (기본 ${formatKRW(panelInfo.basePrice)}) - 클릭하여 선택`;
        if (hoverBadge) hoverBadge.style.borderColor = 'var(--accent-cyan)';
      }
    });

    path.addEventListener('mouseleave', () => {
      if (hoverName) {
        hoverName.textContent = '원하는 부위에 마우스를 올리거나 터치하세요';
        if (hoverBadge) hoverBadge.style.borderColor = 'rgba(255,255,255,0.1)';
      }
    });

    // Click toggle
    path.addEventListener('click', () => {
      if (panelKey) {
        togglePanelSelection(panelKey);
      }
    });
  });

  // Clear all button
  const btnClear = document.getElementById('btnClearAllPanels');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      appState.selectedPanels.clear();
      syncPanelUI();
      calculateQuote();
      showToast('선택 해제', '모든 시공 부위 선택이 초기화되었습니다.');
    });
  }
}

function togglePanelSelection(key) {
  if (!PANELS_DATA[key]) return;

  if (appState.selectedPanels.has(key)) {
    appState.selectedPanels.delete(key);
  } else {
    appState.selectedPanels.add(key);
  }

  syncPanelUI();
  calculateQuote();
}

function syncPanelUI() {
  // 1. Sync SVG Paths
  document.querySelectorAll('.car-panel-path').forEach(path => {
    const key = path.getAttribute('data-panel');
    if (appState.selectedPanels.has(key)) {
      path.classList.add('selected');
    } else {
      path.classList.remove('selected');
    }
  });

  // 2. Sync Checklist Chips
  document.querySelectorAll('.panel-chip').forEach(chip => {
    const key = chip.getAttribute('data-panel');
    const isSelected = appState.selectedPanels.has(key);
    chip.classList.toggle('selected', isSelected);
    const circle = chip.querySelector('.panel-check-circle');
    if (circle) circle.textContent = isSelected ? '✓' : '';
  });

  // 3. Sync Summary Tags Box
  const summaryTagsContainer = document.getElementById('selectedPanelsTags');
  const countEl = document.getElementById('selectedPanelCount');
  const mobileCountEl = document.getElementById('mobilePanelCount');

  if (countEl) countEl.textContent = appState.selectedPanels.size;
  if (mobileCountEl) mobileCountEl.textContent = appState.selectedPanels.size;

  if (summaryTagsContainer) {
    if (appState.selectedPanels.size === 0) {
      summaryTagsContainer.innerHTML = `
        <div class="empty-panel-prompt">
          위의 차량 다이어그램 또는 목록에서<br>복원할 부위를 1개 이상 선택해 주세요.
        </div>
      `;
    } else {
      summaryTagsContainer.innerHTML = '';
      appState.selectedPanels.forEach(key => {
        const item = PANELS_DATA[key];
        const tag = document.createElement('div');
        tag.className = 'panel-tag-pill';
        tag.innerHTML = `
          <span>${item.name}</span>
          <span class="panel-tag-remove" data-remove="${key}">&times;</span>
        `;
        tag.querySelector('.panel-tag-remove').addEventListener('click', (e) => {
          e.stopPropagation();
          togglePanelSelection(key);
        });
        summaryTagsContainer.appendChild(tag);
      });
    }
  }

  // 4. Sync Form Summary Ribbon
  const formSummaryEl = document.getElementById('formSelectedPanelsSummary');
  if (formSummaryEl) {
    if (appState.selectedPanels.size === 0) {
      formSummaryEl.textContent = '선택된 부위 없음 (상단 견적기에서 부위를 선택해 주세요)';
      formSummaryEl.style.color = 'var(--text-dim)';
    } else {
      const names = Array.from(appState.selectedPanels).map(k => PANELS_DATA[k].name);
      formSummaryEl.textContent = `${names.join(', ')} (총 ${appState.selectedPanels.size}개 부위)`;
      formSummaryEl.style.color = 'var(--accent-cyan)';
    }
  }
}

/* ==========================================================================
   3. Car Class & Damage Selection
   ========================================================================== */
function initCarClassSelection() {
  const buttons = document.querySelectorAll('.car-class-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      appState.carClass = btn.getAttribute('data-class');
      appState.carClassName = btn.getAttribute('data-name');
      appState.carMultiplier = parseFloat(btn.getAttribute('data-multiplier') || '1.0');

      const badge = document.getElementById('summaryCarClassBadge');
      if (badge) badge.textContent = appState.carClassName;

      calculateQuote();
    });
  });
}

function initDamageLevelSelection() {
  const cards = document.querySelectorAll('.damage-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      appState.damageLevel = card.getAttribute('data-damage');
      appState.damageLabel = card.getAttribute('data-label');
      appState.damageFactor = parseFloat(card.getAttribute('data-factor') || '1.0');

      calculateQuote();
    });
  });
}

function initAddonSelection() {
  const items = document.querySelectorAll('.addon-item');
  items.forEach(item => {
    item.addEventListener('click', () => {
      const addonKey = item.getAttribute('data-addon');
      if (appState.selectedAddons.has(addonKey)) {
        appState.selectedAddons.delete(addonKey);
        item.classList.remove('selected');
      } else {
        appState.selectedAddons.add(addonKey);
        item.classList.add('selected');
      }
      calculateQuote();
    });
  });
}

function initServiceMethodSelection() {
  const methodCards = document.querySelectorAll('.method-radio-card');
  const addressGroup = document.getElementById('addressFormGroup');
  const addressInput = document.getElementById('serviceAddress');
  const addressReqStar = document.getElementById('addressReqStar');
  const addressStatusTag = document.getElementById('addressStatusTag');
  const addressHintText = document.getElementById('addressHintText');

  methodCards.forEach(card => {
    card.addEventListener('click', () => {
      methodCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      appState.serviceMethod = card.getAttribute('data-method');

      if (appState.serviceMethod === 'onsite') {
        // 출장 케어 선택 시 활성화
        if (addressGroup) addressGroup.classList.remove('disabled-field');
        if (addressInput) {
          addressInput.disabled = false;
          addressInput.required = true;
          addressInput.value = '';
          addressInput.placeholder = '예: 서울 서초구 반포대로 101 OO아파트 지하 2층 주차장 (P-12구역)';
          addressInput.focus();
        }
        if (addressReqStar) addressReqStar.style.display = 'inline';
        if (addressStatusTag) {
          addressStatusTag.className = 'address-status-tag onsite';
          addressStatusTag.textContent = '출장 방문 주소 (필수 입력)';
        }
        if (addressHintText) {
          addressHintText.textContent = '디테일러가 출장 방문할 아파트/자택 지하주차장 등 시공 가능한 상세 주소를 입력해 주세요.';
        }
        showToast('출장 케어 선택', '출장 방문을 희망하시는 상세 주소를 입력해 주세요.');
      } else {
        // 센터 입고 선택 시 비활성화 및 센터 주소 자동 지정
        if (addressGroup) addressGroup.classList.add('disabled-field');
        if (addressInput) {
          addressInput.disabled = true;
          addressInput.required = false;
          addressInput.value = 'POLISH LAB 센터 본점 (서울 강남구 역삼로 123 전문 디테일링 센터)';
        }
        if (addressReqStar) addressReqStar.style.display = 'none';
        if (addressStatusTag) {
          addressStatusTag.className = 'address-status-tag shop';
          addressStatusTag.textContent = '센터 입고 (매장 자동 배정)';
        }
        if (addressHintText) {
          addressHintText.textContent = '전문 디테일링 센터 방문 입고 시공으로 진행되며, 센터 주소가 자동으로 배정됩니다.';
        }
      }
    });
  });
}

function initViewTabs() {
  const tabs = document.querySelectorAll('.view-tab');
  const topSvg = document.getElementById('svgTopView');
  const sideSvg = document.getElementById('svgSideView');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const view = tab.getAttribute('data-view');
      if (view === 'top') {
        if (topSvg) topSvg.style.display = 'block';
        if (sideSvg) sideSvg.style.display = 'none';
      } else {
        if (topSvg) topSvg.style.display = 'none';
        if (sideSvg) sideSvg.style.display = 'block';
      }
    });
  });
}

/* ==========================================================================
   4. Real-Time Pricing Engine
   ========================================================================== */
function calculateQuote() {
  let baseSum = 0;
  let totalTime = 0;

  // Calculate panel base and work time
  appState.selectedPanels.forEach(key => {
    const item = PANELS_DATA[key];
    if (item) {
      baseSum += item.basePrice;
      totalTime += item.timeMin;
    }
  });

  // Multiplier: car class + damage severity combined
  const combinedMultiplier = appState.carMultiplier * appState.damageFactor;
  const multiplierPrice = Math.round(baseSum * combinedMultiplier);

  // Multi-panel bundle discount:
  // 2 panels: 10% discount
  // 3+ panels: 15% discount
  const panelCount = appState.selectedPanels.size;
  let discountRate = 0;
  if (panelCount >= 3) {
    discountRate = 0.15;
  } else if (panelCount === 2) {
    discountRate = 0.10;
  }

  const discountAmount = Math.round(multiplierPrice * discountRate);

  // Add-on options
  let addonSum = 0;
  appState.selectedAddons.forEach(key => {
    const addon = ADDONS_DATA[key];
    if (addon) addonSum += addon.price;
  });

  // Final Total
  const finalTotal = (baseSum === 0) ? 0 : Math.max(0, (multiplierPrice - discountAmount) + addonSum);

  // Store in state
  appState.calculated = {
    baseSum,
    multiplierSum: multiplierPrice,
    addonSum,
    discountAmount,
    discountRate,
    finalTotal,
    estTimeMin: totalTime
  };

  // Render to DOM
  const sumBaseEl = document.getElementById('sumBasePrice');
  const sumMultiplierDescEl = document.getElementById('sumMultiplierDesc');
  const sumMultiplierPriceEl = document.getElementById('sumMultiplierPrice');
  const sumAddonPriceEl = document.getElementById('sumAddonPrice');
  const rowDiscountEl = document.getElementById('rowDiscount');
  const discountRateBadgeEl = document.getElementById('discountRateBadge');
  const sumDiscountPriceEl = document.getElementById('sumDiscountPrice');
  const finalTotalPriceEl = document.getElementById('finalTotalPrice');
  const formTotalPriceSummaryEl = document.getElementById('formTotalPriceSummary');
  const mobilePriceDisplayEl = document.getElementById('mobilePriceDisplay');
  const estWorkTimeEl = document.getElementById('estWorkTime');

  if (sumBaseEl) sumBaseEl.textContent = formatKRW(baseSum);
  if (sumMultiplierDescEl) sumMultiplierDescEl.textContent = `(${combinedMultiplier.toFixed(2)}x)`;
  if (sumMultiplierPriceEl) sumMultiplierPriceEl.textContent = formatKRW(multiplierPrice);
  if (sumAddonPriceEl) sumAddonPriceEl.textContent = formatKRW(addonSum);

  if (rowDiscountEl) {
    if (discountAmount > 0) {
      rowDiscountEl.style.display = 'flex';
      if (discountRateBadgeEl) discountRateBadgeEl.textContent = `-${Math.round(discountRate * 100)}%`;
      if (sumDiscountPriceEl) sumDiscountPriceEl.textContent = `-${formatKRW(discountAmount)}`;
    } else {
      rowDiscountEl.style.display = 'none';
    }
  }

  if (finalTotalPriceEl) finalTotalPriceEl.textContent = finalTotal.toLocaleString();
  if (formTotalPriceSummaryEl) formTotalPriceSummaryEl.textContent = formatKRW(finalTotal);
  if (mobilePriceDisplayEl) mobilePriceDisplayEl.textContent = formatKRW(finalTotal);

  if (estWorkTimeEl) {
    if (panelCount === 0) {
      estWorkTimeEl.textContent = '선택 대기';
    } else {
      const hours = Math.floor(totalTime / 60);
      const mins = totalTime % 60;
      estWorkTimeEl.textContent = hours > 0 ? `약 ${hours}시간 ${mins > 0 ? mins + '분' : ''}` : `약 ${mins}분`;
    }
  }
}

/* ==========================================================================
   5. Before & After Dual Interactive Slider
   ========================================================================== */
function initBeforeAfterSlider() {
  const container = document.getElementById('comparisonSliderBox');
  const afterLayer = document.getElementById('afterImageLayer');
  const handle = document.getElementById('sliderHandle');
  if (!container || !afterLayer || !handle) return;

  let isDragging = false;

  function updateSliderPosition(clientX) {
    const rect = container.getBoundingClientRect();
    let offsetX = clientX - rect.left;
    if (offsetX < 0) offsetX = 0;
    if (offsetX > rect.width) offsetX = rect.width;

    const percent = (offsetX / rect.width) * 100;
    afterLayer.style.width = `${percent}%`;
    handle.style.left = `${percent}%`;
  }

  // Mouse Events
  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    updateSliderPosition(e.clientX);
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    updateSliderPosition(e.clientX);
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Touch Events
  container.addEventListener('touchstart', (e) => {
    isDragging = true;
    if (e.touches[0]) updateSliderPosition(e.touches[0].clientX);
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    if (e.touches[0]) updateSliderPosition(e.touches[0].clientX);
  }, { passive: true });

  window.addEventListener('touchend', () => {
    isDragging = false;
  });

  // Case switch buttons
  const caseButtons = document.querySelectorAll('.case-tab-btn');
  const swirlOverlay = document.getElementById('simSwirlOverlay');

  caseButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      caseButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const caseType = btn.getAttribute('data-case');
      if (swirlOverlay) {
        if (caseType === 'swirl') {
          swirlOverlay.style.backgroundImage = `
            radial-gradient(ellipse 60px 40px at 40% 40%, rgba(255, 255, 255, 0.45) 0%, transparent 60%),
            radial-gradient(circle 80px at 60% 60%, rgba(255, 255, 255, 0.35) 0%, transparent 70%),
            repeating-linear-gradient(45deg, transparent, transparent 15px, rgba(255, 255, 255, 0.15) 16px, transparent 18px),
            repeating-linear-gradient(-60deg, transparent, transparent 20px, rgba(255, 255, 255, 0.18) 21px, transparent 23px)
          `;
        } else if (caseType === 'scratch') {
          swirlOverlay.style.backgroundImage = `
            linear-gradient(120deg, transparent 40%, rgba(255,255,255,0.7) 48%, transparent 52%),
            radial-gradient(circle 30px at 50% 50%, rgba(255,255,255,0.6) 0%, transparent 60%),
            repeating-linear-gradient(15deg, transparent, transparent 30px, rgba(255, 255, 255, 0.3) 31px, transparent 33px)
          `;
        } else if (caseType === 'bumper') {
          swirlOverlay.style.backgroundImage = `
            radial-gradient(ellipse 120px 80px at 70% 60%, rgba(255, 255, 255, 0.5) 0%, transparent 80%),
            repeating-linear-gradient(85deg, transparent, transparent 8px, rgba(255, 255, 255, 0.25) 9px, transparent 12px)
          `;
        }
      }
    });
  });
}

/* ==========================================================================
   6. Photo Upload & Preview
   ========================================================================== */
function initPhotoUploadDropzone() {
  const dropzone = document.getElementById('photoDropzone');
  const fileInput = document.getElementById('photoFileInput');
  const previewGrid = document.getElementById('photoPreviewGrid');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    if (appState.uploadedPhotos.length + files.length > 4) {
      showToast('업로드 제한', '사진은 최대 4장까지 등록 가능합니다.');
      return;
    }

    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        appState.uploadedPhotos.push(event.target.result);
        renderPhotoPreviews();
      };
      reader.readAsDataURL(file);
    });

    fileInput.value = '';
  });

  function renderPhotoPreviews() {
    if (!previewGrid) return;
    previewGrid.innerHTML = '';

    appState.uploadedPhotos.forEach((src, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'preview-thumbnail-wrap';
      wrap.innerHTML = `
        <img src="${src}" class="preview-img" alt="손상 부위 ${idx + 1}">
        <div class="btn-remove-photo" data-index="${idx}">&times;</div>
      `;
      wrap.querySelector('.btn-remove-photo').addEventListener('click', (e) => {
        e.stopPropagation();
        appState.uploadedPhotos.splice(idx, 1);
        renderPhotoPreviews();
      });
      previewGrid.appendChild(wrap);
    });
  }
}

/* ==========================================================================
   7. Online Reservation Form Handler
   ========================================================================== */
function initReservationForm() {
  const form = document.getElementById('reservationForm');
  const proceedBtn = document.getElementById('btnProceedReserve');

  if (proceedBtn) {
    proceedBtn.addEventListener('click', () => {
      if (appState.selectedPanels.size === 0) {
        showToast('부위 선택 필요', '복원하실 차량 부위를 1개 이상 선택해 주세요.');
        const studioEl = document.getElementById('studioSection');
        if (studioEl) studioEl.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      const reserveEl = document.getElementById('reserveSection');
      if (reserveEl) reserveEl.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Set default reserveDate to tomorrow
  const dateInput = document.getElementById('reserveDate');
  if (dateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    dateInput.min = `${yyyy}-${mm}-${dd}`;
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    if (appState.selectedPanels.size === 0) {
      showToast('부위 선택 필요', '시공 부위가 선택되지 않았습니다. 상단에서 부위를 선택해 주세요.');
      const studioEl = document.getElementById('studioSection');
      if (studioEl) studioEl.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    const plate = document.getElementById('custCarPlate').value.trim();
    const carModel = document.getElementById('custCarModel').value.trim();
    const reserveDate = document.getElementById('reserveDate') ? document.getElementById('reserveDate').value.trim() : '';
    const reserveTime = document.getElementById('reserveTime') ? document.getElementById('reserveTime').value.trim() : '';
    const address = (appState.serviceMethod === 'shop')
      ? 'POLISH LAB 센터 본점 (서울 강남구 역삼로 123 전문 디테일링 센터)'
      : document.getElementById('serviceAddress').value.trim();
    const remarks = document.getElementById('custRemarks').value.trim();

    if (!name || !phone || !plate || !carModel || !reserveDate || !reserveTime) {
      showToast('입력 확인', '필수 입력 항목을 모두 작성해 주세요.');
      return;
    }

    if (appState.serviceMethod === 'onsite' && !address) {
      showToast('출장 주소 확인', '출장 방문을 희망하시는 상세 주소를 입력해 주세요.');
      const addressInput = document.getElementById('serviceAddress');
      if (addressInput) addressInput.focus();
      return;
    }

    const bookingId = 'PL-' + new Date().getFullYear() + '-' + String(Math.floor(1000 + Math.random() * 9000));
    const nowStr = formatNowDate();

    const selectedPanelNames = Array.from(appState.selectedPanels).map(k => PANELS_DATA[k].name);
    const selectedAddonNames = Array.from(appState.selectedAddons).map(k => ADDONS_DATA[k].name);

    const bookingRecord = {
      id: bookingId,
      createdAt: nowStr,
      name,
      phone,
      plate,
      carModel,
      carClass: appState.carClassName,
      damageLevel: appState.damageLabel,
      serviceMethod: appState.serviceMethod === 'shop' ? '전문 디테일링 센터 입고' : '프리미엄 출장 케어',
      reserveSchedule: `${reserveDate} ${reserveTime === 'consult' ? '시간 조율 상담' : reserveTime}`,
      address,
      panels: selectedPanelNames,
      addons: selectedAddonNames,
      priceSummary: { ...appState.calculated },
      remarks,
      status: '예약 접수완료'
    };

    // Save to LocalStorage
    saveBookingToStorage(bookingRecord);

    // Send to Google Spreadsheet in real-time
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <span class="spinner" style="display:inline-block;width:16px;height:16px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:6px;vertical-align:middle;"></span>
        <span>스프레드시트 실시간 전송 중...</span>
      `;
    }

    sendBookingToGoogleSheets(bookingRecord).finally(() => {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
      
      // Show Voucher Modal
      openVoucherModal(bookingRecord);
      showToast('예약 완료', '부분광택 예약 신청 및 디지털 견적서가 발급되었습니다!');

      // Reset Form
      form.reset();
      appState.uploadedPhotos = [];
      const previewGrid = document.getElementById('photoPreviewGrid');
      if (previewGrid) previewGrid.innerHTML = '';
    });
  });
}

async function sendBookingToGoogleSheets(record) {
  const gasUrl = localStorage.getItem('polishlab_gas_url') || GOOGLE_SCRIPT_URL;
  if (!gasUrl) return;

  try {
    // 1. Primary POST Webhook
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(record)
    });
    showToast('구글 시트 연동', '구글 스프레드시트에 실시간 예약 데이터가 정상 등록되었습니다.');
  } catch (err) {
    console.warn('Google Sheets POST fallback to GET:', err);
    try {
      // 2. GET Query Fallback
      const getUrl = gasUrl + (gasUrl.includes('?') ? '&' : '?') + 'action=book&payload=' + encodeURIComponent(JSON.stringify(record));
      const img = new Image();
      img.src = getUrl;
      showToast('구글 시트 연동', '구글 스프레드시트에 실시간 예약 데이터가 백그라운드로 전송되었습니다.');
    } catch (fallbackErr) {
      console.error('GAS Fallback Error:', fallbackErr);
    }
  }
}

function saveBookingToStorage(record) {
  try {
    const list = JSON.parse(localStorage.getItem('polishlab_bookings') || '[]');
    list.unshift(record);
    localStorage.setItem('polishlab_bookings', JSON.stringify(list));
  } catch (err) {
    console.error('Storage error:', err);
  }
}

function getStoredBookings() {
  try {
    return JSON.parse(localStorage.getItem('polishlab_bookings') || '[]');
  } catch (err) {
    return [];
  }
}

/* ==========================================================================
   8. Digital Voucher / Receipt Modal Logic
   ========================================================================== */
let activeVoucherData = null;

function openVoucherModal(data) {
  activeVoucherData = data;
  const modal = document.getElementById('voucherModal');
  if (!modal) return;

  document.getElementById('docBookingId').textContent = data.id;
  document.getElementById('docIssuedAt').textContent = data.createdAt;
  document.getElementById('docCustName').textContent = data.name;
  document.getElementById('docCustPhone').textContent = data.phone;
  document.getElementById('docCustCar').textContent = `${data.carModel} (${data.carClass})`;
  document.getElementById('docCustPlate').textContent = data.plate;
  document.getElementById('docSchedule').textContent = data.reserveSchedule;
  document.getElementById('docLocation').textContent = `${data.serviceMethod} | ${data.address}`;
  document.getElementById('docPanels').textContent = data.panels.join(', ');
  document.getElementById('docAddons').textContent = data.addons.length ? data.addons.join(', ') : '선택 안함';
  document.getElementById('docDamageLevel').textContent = data.damageLevel;
  document.getElementById('docTotalPrice').textContent = formatKRW(data.priceSummary.finalTotal);

  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

window.closeVoucherModal = function() {
  const modal = document.getElementById('voucherModal');
  if (modal) modal.classList.add('hidden');
};

window.copyVoucherKakaoText = function() {
  if (!activeVoucherData) return;
  const d = activeVoucherData;
  const text = `[POLISH LAB 프리미엄 부분광택 예약 확인서]
- 예약번호: ${d.id}
- 고객명: ${d.name} 님
- 차량: ${d.carModel} (${d.plate})
- 시공일시: ${d.reserveSchedule}
- 시공방식: ${d.serviceMethod}
- 시공부위: ${d.panels.join(', ')}
- 추가옵션: ${d.addons.length ? d.addons.join(', ') : '없음'}
- 최종견적: ${formatKRW(d.priceSummary.finalTotal)}
- 문의/안내: 010-7246-7211`;

  navigator.clipboard.writeText(text).then(() => {
    showToast('복사 완료', '카카오톡/문자 전송용 견적 텍스트가 복사되었습니다.');
  }).catch(() => {
    showToast('복사 실패', '클립보드 권한을 확인해 주세요.');
  });
};

/* Terms & Policy Modal Handlers */
window.openTermsModal = function() {
  const modal = document.getElementById('termsModal');
  if (modal) {
    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
};

window.closeTermsModal = function() {
  const modal = document.getElementById('termsModal');
  if (modal) modal.classList.add('hidden');
};

window.confirmTermsAgreement = function() {
  const chk = document.getElementById('chkTerms');
  if (chk) chk.checked = true;
  closeTermsModal();
  showToast('약관 동의 완료', '시공 안내 및 개인정보 처리방침에 동의하셨습니다.');
};

/* ==========================================================================
   9. Customer Reservation Lookup Modal (LocalStorage + Google Sheets Sync)
   ========================================================================== */
function initNavigationAndPhoneFormat() {
  // Nav Lookup Button
  const navLookupBtn = document.getElementById('navLookupBtn');
  if (navLookupBtn) {
    navLookupBtn.addEventListener('click', openLookupModal);
  }

  // Auto-format phone input (010-XXXX-XXXX)
  const phoneInputs = [document.getElementById('custPhone'), document.getElementById('lookupPhone')];
  phoneInputs.forEach(input => {
    if (!input) return;
    input.addEventListener('input', (e) => {
      let val = e.target.value.replace(/[^0-9]/g, '');
      if (val.length > 3 && val.length <= 7) {
        val = val.slice(0, 3) + '-' + val.slice(3);
      } else if (val.length > 7) {
        val = val.slice(0, 3) + '-' + val.slice(3, 7) + '-' + val.slice(7, 11);
      }
      e.target.value = val;
    });
  });

  // Sticky Navbar Scroll Effect
  window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    if (navbar) {
      if (window.scrollY > 40) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }
  });
}

window.openLookupModal = function() {
  const modal = document.getElementById('lookupModal');
  const resultArea = document.getElementById('lookupResultArea');
  if (resultArea) resultArea.innerHTML = '';
  if (modal) {
    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
};

window.closeLookupModal = function() {
  const modal = document.getElementById('lookupModal');
  if (modal) modal.classList.add('hidden');
};

window.searchCustomerReservation = async function() {
  const nameQuery = document.getElementById('lookupName').value.trim();
  const phoneQuery = document.getElementById('lookupPhone').value.trim().replace(/[^0-9]/g, '');
  const resultArea = document.getElementById('lookupResultArea');
  if (!resultArea) return;

  if (!nameQuery && !phoneQuery) {
    showToast('검색어 입력', '고객 성명 또는 연락처를 입력해 주세요.');
    return;
  }

  resultArea.innerHTML = `
    <div style="text-align:center;padding:24px 10px;color:var(--text-muted);">
      <span class="spinner" style="display:inline-block;width:20px;height:20px;border:2px solid var(--accent-cyan);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:8px;"></span>
      <div style="font-size:0.85rem;">예약 내역을 실시간으로 조회하고 있습니다...</div>
    </div>
  `;

  let matched = [];
  const localBookings = getStoredBookings();

  // Try Google Sheets GET lookup if URL is set
  let isGoogleSheetsSynced = false;
  const gasUrl = localStorage.getItem('polishlab_gas_url') || GOOGLE_SCRIPT_URL;
  if (gasUrl) {
    try {
      const qUrl = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}name=${encodeURIComponent(nameQuery)}&phone=${encodeURIComponent(phoneQuery)}&_t=${Date.now()}`;
      const resp = await fetch(qUrl);
      if (resp.ok) {
        const json = await resp.json();
        if (json.result === 'success' && Array.isArray(json.data)) {
          matched = json.data;
          isGoogleSheetsSynced = true;
        }
      }
    } catch (err) {
      console.warn('Google Sheets lookup failed, falling back to localStorage:', err);
    }
  }

  // Merge with local storage if not already present
  localBookings.forEach(localItem => {
    const matchName = nameQuery ? localItem.name.includes(nameQuery) : true;
    const cleanPhone = localItem.phone.replace(/[^0-9]/g, '');
    const matchPhone = phoneQuery ? (cleanPhone.includes(phoneQuery) || localItem.plate.includes(nameQuery)) : true;
    if (matchName && matchPhone) {
      if (!matched.some(m => m.id === localItem.id)) {
        matched.push(localItem);
      }
    }
  });

  if (matched.length === 0) {
    resultArea.innerHTML = `
      <div style="text-align:center;padding:24px 10px;background:rgba(255,255,255,0.02);border-radius:var(--radius-md);border:1px solid var(--border-subtle);margin-top:14px;">
        <i data-lucide="search-x" style="width:36px;height:36px;color:var(--text-dim);margin-bottom:8px;"></i>
        <div style="font-weight:700;color:var(--text-main);">일치하는 예약 내역이 없습니다.</div>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">성명 및 연락처를 다시 확인하시거나 고객센터(010-7246-7211)로 문의 바랍니다.</p>
      </div>
    `;
  } else {
    resultArea.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;margin-bottom:8px;">
        <span style="font-size:0.85rem;color:var(--accent-cyan);font-weight:700;">
          조회 결과 (${matched.length}건)
        </span>
        ${isGoogleSheetsSynced ? `
          <span style="font-size:0.72rem;background:rgba(16,185,129,0.15);color:var(--accent-emerald);padding:2px 8px;border-radius:var(--radius-full);font-weight:800;border:1px solid rgba(16,185,129,0.3);">
            🟢 구글 시트 실시간 연동됨
          </span>
        ` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${matched.map(item => `
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(56,189,248,0.3);border-radius:var(--radius-md);padding:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-size:0.75rem;font-weight:800;color:var(--accent-cyan);">${item.id}</span>
              <span style="font-size:0.72rem;background:rgba(16,185,129,0.2);color:var(--accent-emerald);padding:2px 8px;border-radius:var(--radius-full);font-weight:800;">${item.status}</span>
            </div>
            <div style="font-size:0.95rem;font-weight:800;color:#fff;">${escapeHtml(item.carModel)} (${escapeHtml(item.plate)})</div>
            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">시공일시: ${escapeHtml(item.reserveSchedule)}</div>
            <div style="font-size:0.8rem;color:var(--text-muted);">시공부위: ${escapeHtml(item.panels.join(', '))}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.1);">
              <span style="font-weight:800;color:var(--accent-cyan);font-size:1rem;">${formatKRW(item.priceSummary ? item.priceSummary.finalTotal : 0)}</span>
              <button class="btn-primary" style="padding:6px 14px;font-size:0.8rem;" onclick="viewLookupDetail('${item.id}')">
                견적서 보기
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  if (window.lucide) lucide.createIcons();
};

window.viewLookupDetail = function(bookingId) {
  const allBookings = getStoredBookings();
  const found = allBookings.find(b => b.id === bookingId);
  if (found) {
    closeLookupModal();
    openVoucherModal(found);
  }
};

/* ==========================================================================
   10. FAQ Accordion Logic
   ========================================================================== */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const q = item.querySelector('.faq-question');
    if (!q) return;
    q.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      faqItems.forEach(i => i.classList.remove('active'));
      if (!isActive) item.classList.add('active');
    });
  });
}

/* ==========================================================================
   11. Helper Utilities
   ========================================================================== */
function formatKRW(num) {
  return (num || 0).toLocaleString() + '원';
}

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

function showToast(title, msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <i data-lucide="sparkles" style="color:var(--accent-cyan);width:20px;height:20px;flex-shrink:0;"></i>
    <div>
      <div style="font-size:0.88rem;font-weight:800;color:#fff;">${title}</div>
      <div style="font-size:0.78rem;color:var(--text-muted);">${msg}</div>
    </div>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
