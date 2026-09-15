/**
 * ==========================================================================
 * POLISH LAB (폴리시랩) - 구글 스프레드시트 실시간 양방향 연동 Google Apps Script
 * ==========================================================================
 * 
 * [가장 쉬운 3분 설치 및 배포 방법]
 * 1. 구글 스프레드시트(https://sheets.new)를 생성합니다.
 * 2. 상단 메뉴에서 [확장 프로그램] > [Apps Script]를 클릭합니다.
 * 3. 기존 코드를 모두 지우고 본 스크립트 전체를 복사하여 붙여넣고 저장(Ctrl+S)합니다.
 * 4. 상단 함수 선택창에서 [testDirectInsert]를 선택하고 [실행] 버튼을 눌러 권한을 승인합니다.
 *    (스프레드시트에 헤더 및 테스트 행이 즉시 생성되는 것을 확인하세요!)
 * 5. 우측 상단 [배포] > [새 배포]를 클릭합니다.
 *    - 유형 선택: [웹 앱 (Web App)]
 *    - 설명: POLISH LAB 실시간 예약 연동
 *    - 다음 사용자로 실행: [나 (내 계정)]
 *    - 액세스 권한이 있는 사용자: [모든 사용자 (Anyone)] ★ 반드시 '모든 사용자' 선택!
 * 6. [배포] 클릭 후 생성된 [웹 앱 URL] (https://script.google.com/macros/s/.../exec)을 복사합니다.
 * 7. 관리자 페이지 (/admin.html)의 [구글 시트 연동 허브]에 복사한 URL을 넣고 [URL 저장]을 누르면 완료!
 */

// 시트 탭 이름 설정
var SHEET_NAME = "부분광택예약목록";

// 헤더 컬럼 정의 (19개 항목)
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
 * 시트 가져오기 또는 첫 번째 탭 자동 초기화
 */
function getTargetSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("활성화된 스프레드시트를 찾을 수 없습니다. 스프레드시트 내 [확장 프로그램] > [Apps Script]에서 실행해 주세요.");
  }

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    var sheets = ss.getSheets();
    // 첫 번째 탭이 기본 시트1이거나 비어있으면 이름 변경 후 사용
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
 * 1. POST 요청 처리 (신규 예약 데이터 실시간 저장)
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

    return appendBookingRow(sheet, data);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      result: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 2. GET 요청 처리 (예약 조회 및 GET 방식 비상 백업 등록)
 */
function doGet(e) {
  try {
    var sheet = getTargetSheet();

    // GET 방식을 통한 예약 등록 지원 (action=book 또는 payload 파라미터가 있을 때)
    if (e && e.parameter && (e.parameter.action === "book" || e.parameter.payload)) {
      var payloadStr = e.parameter.payload || e.parameter.data;
      var dataObj = payloadStr ? JSON.parse(payloadStr) : e.parameter;
      return appendBookingRow(sheet, dataObj);
    }

    // 조회 모드
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
 * 공통 행 추가 로직
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

  // 새로 추가된 행 스타일링
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
 * 3. 시트 헤더 초기화 및 프리미엄 다크네이비 스타일링
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

  // 컬럼별 최적 너비 설정
  sheet.setColumnWidth(1, 140); // 신청ID
  sheet.setColumnWidth(2, 130); // 신청일시
  sheet.setColumnWidth(3, 90);  // 고객명
  sheet.setColumnWidth(4, 120); // 연락처
  sheet.setColumnWidth(5, 110); // 차량번호
  sheet.setColumnWidth(6, 150); // 차종/색상
  sheet.setColumnWidth(7, 120); // 차종구분
  sheet.setColumnWidth(8, 140); // 손상도
  sheet.setColumnWidth(9, 140); // 시공방식
  sheet.setColumnWidth(10, 140); // 희망일시
  sheet.setColumnWidth(11, 240); // 주소
  sheet.setColumnWidth(12, 180); // 부위
  sheet.setColumnWidth(13, 160); // 옵션
  sheet.setColumnWidth(14, 100); // 기본비
  sheet.setColumnWidth(15, 100); // 할인액
  sheet.setColumnWidth(16, 120); // 최종금액
  sheet.setColumnWidth(17, 100); // 시간
  sheet.setColumnWidth(18, 180); // 요청사항
  sheet.setColumnWidth(19, 100); // 상태
}

function formatNumberKRW(num) {
  var n = Number(num) || 0;
  return n.toLocaleString() + "원";
}

function parseKRWToNumber(str) {
  if (!str) return 0;
  var clean = str.replace(/[^0-9]/g, "");
  return Number(clean) || 0;
}

/**
 * 4. Apps Script 편집기 내에서 바로 실행해보는 테스트 함수
 * (상단 함수 선택에서 testDirectInsert 선택 후 [실행] 클릭)
 */
function testDirectInsert() {
  var sheet = getTargetSheet();
  var sample = {
    id: "PL-TEST-" + Math.floor(1000 + Math.random() * 9000),
    createdAt: Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm"),
    name: "홍길동 (테스트)",
    phone: "010-1234-5678",
    plate: "12가 3456",
    carModel: "제네시스 G80 (우유니 화이트)",
    carClass: "중형 / 준대형 세단",
    damageLevel: "Lv 1. 미세 스월 & 워터스팟",
    serviceMethod: "전문 디테일링 센터 입고",
    reserveSchedule: "내일 14:00 예약",
    address: "POLISH LAB 센터 본점",
    panels: ["본넷 (보닛)", "앞범퍼"],
    addons: ["부분 하이엔드 유리막 코팅"],
    priceSummary: {
      baseSum: 120000,
      discountAmount: 12000,
      finalTotal: 143000,
      estTimeMin: 95
    },
    remarks: "Apps Script 테스트 실행으로 자동 등록된 데이터입니다.",
    status: "예약 접수완료"
  };

  appendBookingRow(sheet, sample);
  Logger.log("테스트 예약 행이 성공적으로 추가되었습니다! 스프레드시트 탭을 확인해 보세요.");
}
