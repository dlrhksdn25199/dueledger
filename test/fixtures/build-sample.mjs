// 합성 테스트 fixture 생성기 — 실제 회사 양식과 같은 구조/엣지케이스를 가진 가짜 데이터.
// 실명·실금액 없이 파서/임포트 테스트를 재현 가능하게 한다. 양식이 바뀌면 여기와 테스트를 같이 고친다.
//   실행: node test/fixtures/build-sample.mjs  → test/fixtures/sample-ledger.xlsx
// 엑셀 serial 날짜(실파일과 동일 체계): 46134=2026-04-22, 46137=2026-04-25, 46150=2026-05-08.
import xlsx from 'xlsx';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HEADER = [
  'No.', '거래일자', '월', '거래처명', '카테고리', '품목명', '규격/단위',
  '수량', '단가', '공급가액', '과세구분', '부가세', '합계금액', '결제상태', '비고',
];

// 행: [No, 거래일자(serial), 월, 거래처, 카테고리, 품목, 규격, 수량, 단가, 공급가액, 과세구분, 부가세, 합계, 결제상태, 비고]
// 엣지케이스: 거래처/카테고리 앞뒤 공백, 텍스트 수량(규격에 보존), 면세(부가세 0), 다품목(같은 날짜+거래처), 빈 템플릿 행.
const ROWS = [
  // 가나상사 2026-04-22 — 다품목(돈까스+고기), 거래처명 앞 공백, 카테고리 '원재료'(신규)
  [1, 46134, '2026-04', ' 가나상사', '원재료', '돈까스', '1BOX', 100, 1000, 100000, '과세', null, null, '미지급', null],
  [6, 46134, '2026-04', '가나상사', '원재료', '고기', '5kg', 10, 9000, 90000, '과세', null, null, '미지급', null],
  // 나다물산 2026-04-25 — 다품목(용기+뚜껑), 카테고리 '포장재 ' 뒤 공백
  [2, 46137, '2026-04', '나다물산', '포장재', '도시락 용기', '280개', 500, 100, 50000, '과세', null, null, '미지급', null],
  [3, 46137, '2026-04', '나다물산', '포장재 ', '도시락 뚜껑', '280개', 500, 80, 40000, '과세', null, null, '미지급', null],
  // 다라상회 2026-05-08 — 텍스트 수량('120통', 단가 없음) + 면세
  [4, 46150, '2026-05', '다라상회', '부자재', '콩기름', null, '120통', null, 360000, '과세', null, null, '지급완료', '월말 정산'],
  [5, 46150, '2026-05', '다라상회', '식자재', '단무지', '10kg', 200, 1500, 300000, '면세', null, null, '미지급', null],
  // 빈 템플릿 행(No만 있고 나머지 빈칸) — 무시되어야 함
  [7, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  [8, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
];

// 입력 시트: 1행 제목, 2행 안내, 3행 'ㄷ', 4행 헤더, 5행~ 데이터 (실파일과 동일 레이아웃).
const aoa = [
  ['월별 거래명세서 정리표'],
  ['※ 테스트용 합성 데이터 (실명·실금액 아님).'],
  [null, null, null, null, 'ㄷ'],
  HEADER,
  ...ROWS,
];

const ws = xlsx.utils.aoa_to_sheet(aoa);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, '거래명세 입력');

const out = join(dirname(fileURLToPath(import.meta.url)), 'sample-ledger.xlsx');
xlsx.writeFile(wb, out);
console.log('wrote', out);
