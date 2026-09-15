/**
 * ==========================================================================
 * POLISH LAB (폴리시랩) - 구글 스프레드시트 실시간 연동 Google Apps Script
 * ==========================================================================
 * 
 * [설치 및 배포 방법]
 * 1. 구글 스프레드시트(Google Sheets)를 새로 생성합니다.
 * 2. 상단 메뉴에서 [확장 프로그램] > [Apps Script]를 클릭합니다.
 * 3. 기존 코드를 모두 지우고 본 스크립트 전체를 복사하여 붙여넣습니다.
 * 4. 우측 상단 [배포] > [새 배포]를 클릭합니다.
 * 5. 유형 선택: [웹 앱 (Web App)]
 *    - 설명: POLISH LAB 부분광택 실시간 예약 연동
 *    - 다음 사용자로 실행: [나 (내 계정)]
 *    - 액세스 권한이 있는 사용자: [모든 사용자 (Anyone)] ★ 반드시 '모든 사용자'로 설정!
 * 6. [배포] 버튼 클릭 후 생성된 [웹 앱 URL]을 복사합니다.
 * 7. 홈페이지의 app.js 파일 상단 `GOOGLE_SCRIPT_URL` 변수에 복사한 URL을 입력하거나
 *    홈페이지 푸시/배포 시 적용합니다.
 */

// 시트 이름 설정
var SHEET_NAME = "부분광택예약목록";

// 헤더 컬럼 정의
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
 * 1. POST 요청 처리 (신규 예약 데이터 저장)
 */
function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);

    // 시트가 없으면 생성 및 헤더 스타일링
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      initSheetHeader(sheet);
    } else if (sheet.getLastRow() === 0) {
      initSheetHeader(sheet);
    }

    var data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      data = e.parameter;
    } else {
      throw new Error("전송된 데이터가 없습니다.");
    }

    // 부위 및 옵션 문자열 변환
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
    sheet.getRange(lastRow, 1).setFontWeight("bold").setFontColor("#0284C7"); // ID 강조
    sheet.getRange(lastRow, 16).setFontWeight("bold").setFontColor("#0369A1"); // 최종금액 강조

    return ContentService.createTextOutput(JSON.stringify({
      result: "success",
      id: newRow[0],
      message: "구글 스프레드시트에 실시간 예약이 정상 등록되었습니다."
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      result: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 2. GET 요청 처리 (예약 내역 실시간 조회)
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet || sheet.getLastRow() <= 1) {
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

    // 이름 또는 연락처 필터링 파라미터가 있는 경우
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
 * 3. 시트 초기화 및 고급 헤더 서식 지정
 */
function initSheetHeader(sheet) {
  sheet.clear();
  sheet.appendRow(HEADERS);

  // 헤더 스타일링
  var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange
    .setBackground("#0F172A")
    .setFontColor("#38BDF8")
    .setFontWeight("bold")
    .setFontSize(10)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);

  // 컬럼별 너비 자동/적정 설정
  sheet.setColumnWidth(1, 140); // ID
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
