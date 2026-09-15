/**
 * ==========================================================================
 * POLISH LAB (폴리시랩) - 구글 스프레드시트 실시간 양방향 연동 Google Apps Script
 * ==========================================================================
 * 
 * [구글 스프레드시트 기준 실시간 연동 설정]
 * 1. 스프레드시트 상단 메뉴 [확장 프로그램] > [Apps Script]를 클릭합니다.
 * 2. 기존 코드를 모두 지우고 본 코드 전체를 붙여넣은 뒤 저장(Ctrl+S)합니다.
 * 3. 상단 함수 선택에서 [testDirectInsert] 선택 후 [실행] 클릭하여 권한 승인 (시트에 테스트 행 자동 생성).
 * 4. 우측 상단 [배포] > [새 배포] 클릭
 *    - 유형: [웹 앱]
 *    - 설명: POLISH LAB 실시간 연동 (스프레드시트 기준)
 *    - 다음 사용자로 실행: [나 (내 계정)]
 *    - 액세스 권한: [모든 사용자 (Anyone)] ★ 반드시 '모든 사용자' 선택!
 * 5. 발급된 웹 앱 URL을 관리자 페이지(/admin.html)의 [구글 시트 연동 허브]에 저장합니다.
 */

var SHEET_NAME = "부분광택예약목록";

var HEADERS = [
  "신청ID",          // A
  "신청일시",        // B
  "고객명",          // C
  "연락처",          // D
  "차량번호",        // E
  "차종및색상",      // F
  "차종구분",        // G
  "손상도레벨",      // H
  "시공방식",        // I
  "희망시공일시",    // J
  "시공장소/주소",   // K
  "선택시공부위",    // L
  "추가케어옵션",    // M
  "기본시공비",      // N
  "할인적용액",      // O
  "최종견적금액",    // P
  "예상소요시간",    // Q
  "특이및요청사항",  // R
  "진행상태"         // S
];

/**
 * 활성 스프레드시트 탭 가져오기 또는 자동 생성
 */
function getTargetSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("활성화된 스프레드시트를 찾을 수 없습니다.");
  }

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    var sheets = ss.getSheets();
    if (sheets.length > 0 && (sheets[0].getName() === "시트1" || sheets[0].getName() === "Sheet1" || sheets[0].getLastRow() === 0)) {
      sheet = sheets[0];
      sheet.setName(SHEET_NAME);
    } else {
      sheet = ss.insertSheet(SHEET_NAME, 0);
    }
    initSheetHeader(sheet);
  } else if (sheet.getLastRow() === 0) {
    initSheetHeader(sheet);
  }

  return sheet;
}

/**
 * 1. POST 요청 처리 (신규 예약 등록 또는 상태 변경)
 */
function doPost(e) {
  try {
    var sheet = getTargetSheet();
    var data = null;

    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      data = e.parameter;
    } else {
      throw new Error("전송된 데이터가 없습니다.");
    }

    // 상태 업데이트 요청
    if (data.action === "updateStatus") {
      return updateBookingStatus(sheet, data.id, data.status);
    }

    // 신규 예약 추가
    return appendBookingRow(sheet, data);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      result: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 2. GET 요청 처리 (실시간 전체 목록 조회, 검색, 상태변경 및 비상 등록)
 */
function doGet(e) {
  try {
    var sheet = getTargetSheet();

    // 상태 변경 요청 처리 (GET 파라미터)
    if (e && e.parameter && e.parameter.action === "updateStatus") {
      return updateBookingStatus(sheet, e.parameter.id, e.parameter.status);
    }

    // 비상 등록 요청 처리 (GET 파라미터)
    if (e && e.parameter && (e.parameter.action === "book" || e.parameter.payload)) {
      var payloadStr = e.parameter.payload || e.parameter.data;
      var dataObj = payloadStr ? JSON.parse(payloadStr) : e.parameter;
      return appendBookingRow(sheet, dataObj);
    }

    // 실시간 전체 시트 데이터 조회
    if (sheet.getLastRow() <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        result: "success",
        data: []
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var values = sheet.getDataRange().getValues();
    var rows = values.slice(1); // 헤더 제외

    var list = [];
    for (var i = rows.length - 1; i >= 0; i--) {
      var r = rows[i];
      if (!r[0]) continue;

      list.push({
        id: String(r[0]),
        createdAt: String(r[1]),
        name: String(r[2]),
        phone: String(r[3]),
        plate: String(r[4]),
        carModel: String(r[5]),
        carClass: String(r[6]),
        damageLevel: String(r[7]),
        serviceMethod: String(r[8]),
        reserveSchedule: String(r[9]),
        address: String(r[10]),
        panels: String(r[11]).split(", "),
        addons: String(r[12]) === "없음" ? [] : String(r[12]).split(", "),
        priceSummary: {
          finalTotal: parseKRWToNumber(String(r[15]))
        },
        estTime: String(r[16]),
        remarks: String(r[17]),
        status: String(r[18] || "예약 접수완료")
      });
    }

    // 필터링 파라미터 적용 (검색 시)
    var nameFilter = e && e.parameter ? e.parameter.name : null;
    var phoneFilter = e && e.parameter ? e.parameter.phone : null;

    if (nameFilter || phoneFilter) {
      list = list.filter(function(item) {
        var matchN = nameFilter ? item.name.indexOf(nameFilter) > -1 : true;
        var cleanP = item.phone.replace(/[^0-9]/g, "");
        var queryP = phoneFilter ? phoneFilter.replace(/[^0-9]/g, "") : "";
        var matchP = queryP ? (cleanP.indexOf(queryP) > -1 || item.plate.indexOf(nameFilter || "") > -1) : true;
        return matchN && matchP;
      });
    }

    return ContentService.createTextOutput(JSON.stringify({
      result: "success",
      data: list
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      result: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 신규 행 추가
 */
function appendBookingRow(sheet, data) {
  var panelsStr = Array.isArray(data.panels) ? data.panels.join(", ") : (data.panels || "-");
  var addonsStr = Array.isArray(data.addons) ? (data.addons.length ? data.addons.join(", ") : "없음") : (data.addons || "없음");
  
  var basePrice = data.priceSummary ? data.priceSummary.baseSum : (data.basePrice || 0);
  var discountAmt = data.priceSummary ? data.priceSummary.discountAmount : (data.discountAmount || 0);
  var finalTotal = data.priceSummary ? data.priceSummary.finalTotal : (data.finalTotal || 0);
  var estTimeMin = data.priceSummary ? data.priceSummary.estTimeMin : (data.estTimeMin || 0);

  var estTimeStr = estTimeMin > 0 
    ? (Math.floor(estTimeMin / 60) > 0 ? "약 " + Math.floor(estTimeMin / 60) + "시간 " + (estTimeMin % 60 ? (estTimeMin % 60) + "분" : "") : "약 " + estTimeMin + "분")
    : "-";

  var newRow = [
    data.id || ("PL-" + Utilities.formatDate(new Date(), "Asia/Seoul", "yyyyMMdd-HHmmss")),
    data.createdAt || Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm"),
    data.name || "",
    data.phone || "",
    data.plate || "",
    data.carModel || "",
    data.carClass || "",
    data.damageLevel || "",
    data.serviceMethod || "",
    data.reserveSchedule || "",
    data.address || "",
    panelsStr,
    addonsStr,
    formatNumberKRW(basePrice),
    formatNumberKRW(discountAmt),
    formatNumberKRW(finalTotal),
    estTimeStr,
    data.remarks || "",
    data.status || "예약 접수완료"
  ];

  sheet.appendRow(newRow);

  var lastRow = sheet.getLastRow();
  var range = sheet.getRange(lastRow, 1, 1, HEADERS.length);
  range.setFontFamily("Pretendard").setFontSize(10).setVerticalAlignment("middle");
  sheet.getRange(lastRow, 1).setFontWeight("bold").setFontColor("#0284C7");
  sheet.getRange(lastRow, 16).setFontWeight("bold").setFontColor("#0369A1");

  return ContentService.createTextOutput(JSON.stringify({
    result: "success",
    id: newRow[0],
    message: "구글 스프레드시트에 실시간 예약이 정상 등록되었습니다."
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 진행 상태 실시간 업데이트
 */
function updateBookingStatus(sheet, id, status) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) {
      sheet.getRange(i + 1, 19).setValue(status); // S열 (19번째 컬럼)
      return ContentService.createTextOutput(JSON.stringify({
        result: "success",
        id: id,
        status: status,
        message: "스프레드시트 진행 상태가 [" + status + "](으)로 업데이트되었습니다."
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({
    result: "not_found",
    message: "해당 ID의 행을 찾을 수 없습니다."
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 시트 헤더 초기화
 */
function initSheetHeader(sheet) {
  sheet.clear();
  sheet.appendRow(HEADERS);

  var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange
    .setBackground("#0F172A")
    .setFontColor("#38BDF8")
    .setFontWeight("bold")
    .setFontSize(10)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.setRowHeight(1, 38);
  sheet.setFrozenRows(1);

  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 130);
  sheet.setColumnWidth(3, 90);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 110);
  sheet.setColumnWidth(6, 150);
  sheet.setColumnWidth(7, 120);
  sheet.setColumnWidth(8, 140);
  sheet.setColumnWidth(9, 140);
  sheet.setColumnWidth(10, 140);
  sheet.setColumnWidth(11, 240);
  sheet.setColumnWidth(12, 180);
  sheet.setColumnWidth(13, 160);
  sheet.setColumnWidth(14, 100);
  sheet.setColumnWidth(15, 100);
  sheet.setColumnWidth(16, 120);
  sheet.setColumnWidth(17, 100);
  sheet.setColumnWidth(18, 180);
  sheet.setColumnWidth(19, 100);
}

function formatNumberKRW(num) {
  var n = Number(num) || 0;
  return n.toLocaleString() + "원";
}

function parseKRWToNumber(str) {
  if (!str) return 0;
  var clean = String(str).replace(/[^0-9]/g, "");
  return Number(clean) || 0;
}

/**
 * 직접 테스트 실행용 함수
 */
function testDirectInsert() {
  var sheet = getTargetSheet();
  var sample = {
    id: "PL-2026-2957",
    createdAt: Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm"),
    name: "Kijung An",
    phone: "010-7246-7211",
    plate: "290루3326",
    carModel: "렉스턴/검정",
    carClass: "중대형 SUV / RV",
    damageLevel: "Lv 1. 미세 스월 & 워터스팟",
    serviceMethod: "전문 디테일링 센터 입고",
    reserveSchedule: "2026-09-16 11:00",
    address: "POLISH LAB 센터 본점",
    panels: ["앞범퍼", "앞도어 (우측)", "앞휀다 (좌측)"],
    addons: ["부분 하이엔드 유리막 코팅"],
    priceSummary: {
      baseSum: 150000,
      discountAmount: 15000,
      finalTotal: 170000,
      estTimeMin: 120
    },
    remarks: "스프레드시트 기준 실시간 연동 테스트",
    status: "예약 접수완료"
  };

  appendBookingRow(sheet, sample);
  Logger.log("테스트 예약 행이 성공적으로 추가되었습니다!");
}
