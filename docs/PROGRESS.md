# PROGRESS — 거래명세서 정리 도구

> 진행 상황 단일 기록. 매 작업마다 갱신. (정책·결정은 `CLAUDE.md`, 원칙은 `coding-principles.md`)

## 현재 상태 (2026-06-17)
**계층**: domain + repository + **parser(엑셀 임포터)** + **Electron/React UI**(홈 대시보드·달력·상태배지·결제일 수동지정·인라인 거래처/카테고리 생성·최근목록·**엑셀 가져오기**) + **패키징(electron-builder, 아이콘 포함)** 완료.
**테스트**: 97 passing (blackbox + whitebox + 파서/임포트 실파일 검증), `tsc --noEmit` clean, `electron-vite build` 성공. 스키마 v2(결제일 수동 플래그 + updated_at) 마이그레이션 + 업그레이드/백업 테스트 포함.
**✅ 엑셀 임포터 라이브 검증 (2026-06-17)**: `cdp-import-check` **11/11 통과**(preview 무쓰기 → commit → 결제일=거래일자 → 거래처·카테고리 자동생성 → 재임포트 중복 건너뜀, 2배 안 됨). UI "엑셀 가져오기" 모달 렌더 확인. 회귀 `cdp-smoke` 23/23 유지. *테스트는 합성 fixture(`test/fixtures/sample-ledger.xlsx`, 실명·실금액 없음)로 수행 — 실회사 샘플은 저장소에서 제거.*
**✅ Windows 실기기 라이브 검증 (2026-06-17, 클린 DB)**: `npm run rebuild:electron`(Electron ABI 리빌드) 정상 → 앱 실행 → `cdp-smoke` **23/23 전부 통과**(시드·금액·부가세 0.5올림·결제일 net-30·정렬·삭제가드·홈카드·배지·달력·인라인 거래처/카테고리 생성·수동결제일·홈 최근목록). **어제 맥에서 ABI 막혀 못 했던 라운드(수동결제일·인라인생성·최근목록) 포함 전부 라이브 확인.** → 맥의 better-sqlite3 ABI 이슈는 그 머신 한정, 코드/설정 정상으로 확정.
**맥 실기기 검증 (이전)**: A/B/E 라운드는 패키지된 앱 CDP 스모크 17/17 통과. 이후 라운드는 맥 머신 ABI 리빌드 막혀 미검증이었음(위 Windows 검증으로 해소).
**패키징**: `electron-builder.yml` — win=포터블 .exe(미서명, `build/icon.ico` 아이콘), mac=dir(로컬검증). better-sqlite3 asar 언팩. CI(windows-latest)가 .exe 아티팩트 생성. 메뉴바(File/Edit/View/Window) 제거(`Menu.setApplicationMenu(null)`), 창 아이콘=`build/icon.ico`.
**문서**: `README.md` — 엔드유저용 설치·사용 설명서(한국어). .exe와 함께 전달.
**CI**: GitHub Actions — ubuntu(typecheck+test+build) + windows(포터블 .exe, `needs: test`). 브랜치 `feat/domain-repository-foundation`.

### ⚙️ 로컬 실행/검증 (better-sqlite3 ABI 주의)
better-sqlite3는 네이티브 모듈이라 **Node용 빌드와 Electron용 빌드의 ABI가 다르다.** 한 번에 한쪽만 유효.
- **테스트(Node)**: `npm test` (설치 직후 기본 = Node 프리빌드). 깨졌으면 `npm run rebuild:node`.
- **앱 실행(Electron)**: `npm run rebuild:electron` → `npm run dev`. (이러면 vitest는 다시 깨짐 → 테스트 전 `rebuild:node`.)
- CI는 `npm ci`(Node 빌드) + test + build만 — 앱을 실행하지 않으므로 영향 없음.
- **CDP 스모크**: `npm run rebuild:electron && DUELEDGER_REMOTE_DEBUG=1 npm run dev` (별 셸) → `node scripts/cdp-smoke.mjs`. 헤드리스 CI 불가, 맥/윈도우 데스크톱 세션에서.
- 메인에 `DUELEDGER_REMOTE_DEBUG` 환경변수가 있을 때만 렌더러 원격 디버깅 포트(9222)를 연다(평소 비활성).

## 완료
### domain/ (DB 없음, 순수 함수)
- `types.ts` — `TaxType`(과세/면세) · `PaymentStatus`(미지급/지급예정/지급완료) · `PaymentTerms`(net/dayOfMonth)
- `amount.ts` — `defaultSupplyAmount`(수량×단가, 보조) · `computeVat`(면세=0, 과세=round(공급가액×0.10)) · `computeTotal`
  - 0.5 올림 경계 검증: 12,345 → vat 1,235 (부동소수 드리프트 없음, P0 #6d)
- `paymentDate.ts` — `computeDueDate`
  - net = 발행일 + value일 (월·연·윤년 경계)
  - dayOfMonth = 발행일 ≤ value면 이번 달, 지났으면 다음 달 / **월말 클램프**(2월 31→28, 윤년 29) / 12월→다음 해 1월
- `grouping.ts` — `vendorGroupKey`(trim) · `groupByVendor`(첫등장 순서, 정수 합계)

### repository/ (better-sqlite3, P0 #5 단일 게이트)
- `schema.ts` — v1 스키마 4테이블(vendor / category / transaction_header / transaction_item) + 인덱스. 금액 정수 컬럼. `MIGRATIONS`/`LATEST_VERSION`.
- `migrate.ts` — `PRAGMA user_version` 추적 · 전진형 · 마이그레이션당 트랜잭션 · `backupDatabaseFile`(쓰기 전 백업, P0 #6). 멱등.
- `db.ts` — `openDatabase(path)` 단일 진입점(WAL, foreign_keys ON, 오픈 시 마이그레이션). **여기서만 SQLite 생성.**
- `vendorRepository.ts` — CRUD. paymentTerms를 2컬럼으로 평탄화, 이름 trim 정규화.
- `categoryRepository.ts` — CRUD + **사용 중 삭제 차단**(`CategoryInUseError`에 건수, 조용한 재분류 금지, P0 #4).
- `transactionRepository.ts` — 명세서(헤더+다품목) CRUD. 품목 편집=전량 교체. **파생값(vat·total·dueDate)을 쓰기 게이트에서 domain 함수로 계산·저장**(공식 불변식 강제, P0 #1).
- `ledgerRepository.ts` — 테이블 뷰 평면 조회(품목 ⨝ 헤더 ⨝ 거래처 ⨝ 카테고리). 정렬(화이트리스트, **금액 숫자·날짜 연대순** P0 #4) · 필터(거래처/카테고리/결제상태/과세구분/월/결제일 기간) · 검색(LIKE, 검색어 trim). 정렬 컬럼 주입 차단.
- `importRepository.ts` — 파싱 결과 일괄 적재. `preview`(쓰기 없음, 신규/중복 집계)/`commit`(한 트랜잭션). 중복=거래일자+거래처+품목명+공급가액(파일 내 자기중복도 건너뜀). 미존재 거래처/카테고리 자동 생성. **결제일=거래일자·수동지정(overridden=1)**, 거래처 결제조건은 비움. vat·total은 domain 함수로 계산(P0 #1).

### parser/ (엑셀 임포터 — 선택 기능, 실파일 1양식만)
- `excelImport.ts` — `parseLedgerWorkbook(path)`: `거래명세 입력` 시트만, 열 **위치**로 읽음(헤더 라벨 의존 X). serial 날짜→`YYYY-MM-DD`, 텍스트 수량("120통")은 숫자 null+원문 규격 보존, 거래처/카테고리 trim, 빈 템플릿 줄(수식 0 캐시) 무시. 같은 거래일자+거래처=명세서 1장. `import * as` 아닌 **default import**(`import xlsx from 'xlsx'`) — electron-vite 외부화 CJS interop 때문.

## 결정·메모 (코드에 안 드러나는 것)
- **dueDate는 쓰기 시점 계산값**: create/update 때 거래처 결제조건 + 발행일로 계산해 저장. 거래처 결제조건을 나중에 바꿔도 기존 명세서 dueDate는 자동 갱신 안 됨 → 필요해지면 재계산 기능 추가 (YAGNI).
- **taxRate는 현재 기본값 0.10 고정**: 편집 가능 파라미터(파라미터 스토어)는 아직 미구현. 필요 시 도입.
- **명세서 편집 = 품목 삭제 후 재삽입**: 1인 앱이라 단순·정확 우선. diff 머지 안 함.
- **better-sqlite3 Node 26 프리빌드 동작 확인**(무빌드). CI는 Node 22.

- `seed.ts` — 초기 카테고리(식자재/포장재/소모품/위생용품/기타) 시드. 빈 DB일 때만, 멱등. openDatabase엔 비엮음(앱 init이 호출).

### UI (Electron + React, electron-vite)
- `electron.vite.config.ts` · `src/main/{index,ipc}.ts` · `src/preload/index.ts` · `src/shared/api.ts`(IPC 계약) · `src/renderer/**`
- 메인이 DB/repository 소유, IPC로 노출 → preload contextBridge `window.api` → 렌더러는 IPC만 호출(SQLite 직접접근 ❌, P0 #5).
- 5탭: **홈**(다가오는 결제 대시보드 — 연체/임박/예정/총미지급 카드 + 챙길 결제 목록) · **명세서**(테이블 뷰 정렬·필터·검색 + 다품목 입력 폼) · **달력**(결제일 월간 캘린더, 미지급=빨강) · **거래처** CRUD · **카테고리** CRUD(사용 중 삭제 시 건수 안내).
- 결제상태 색상 배지(미지급=빨강/지급예정=노랑/지급완료=초록) + 연체 강조. 홈·달력 로직은 `domain/paymentSchedule`(분류·날짜집계) 순수 함수로 테스트.
- **명세서 목록에서 결제상태 배지 클릭 → 상태 순환**(미지급→지급예정→지급완료) 저장. `transaction.setPaymentStatus(id,status)`(헤더만 갱신, 품목·dueDate 불변).
- **달력 날짜 클릭 → 하단 상세 패널**: 그 결제일의 품목 줄(거래처·품목·규격·수량·합계·결제상태 + 합계)을 `ledger.list({dueDateFrom/To})`로 조회해 표시. 결제 있는 칸만 클릭 가능(초록 강조).
- **홈에서도 결제상태 배지 클릭 토글**(챙길 결제·최근 입력 목록 모두).
- **명세서 표 인라인 날짜 수정**: 발행일/결제일 칸 클릭 → date 입력. `transaction.setIssueDate`(미수동지정이면 결제일 재계산)·`setDueDate`(직접 지정=수동 플래그 ON).
- **명세서 폼 결제일 개선**: '직접 지정' 체크박스 제거 → 항상 date 입력 + 거래처 결제조건 있으면 `자동계산` 버튼.
- **엑셀 내보내기(외부 공유)**: `parser/excelExport.ts` `writeLedgerWorkbook` — 현재 조회 결과(필터·정렬 반영)를 입력과 같은 칼럼의 `.xlsx`로 저장(저장 대화상자). IPC `export:ledger`.

- **거래처·카테고리 한 탭으로 합침**(`ManageView`, 반응형 2열→1열). 탭 5개→4개.
- **반응형·가독성 정리**: 입력/버튼 크게(14px, 패딩↑), 명세서 툴바 검색창이 남는 폭 채움(`flex`)·줄바꿈, 표 줄무늬(짝수행 배경, 연체행 제외).

### 과세 기준 (메모)
- 품목별 `과세`/`면세`. `과세`=공급가액×**10%**(0.5 올림) 부가세, `면세`=0. 세율 `DEFAULT_TAX_RATE=0.1` 고정(아직 화면 편집 불가). 합계=공급가액+부가세.
- **표시 이름 = "DueLedger"**(앱 헤더 h1 + 타이틀바 + BrowserWindow title). productName과 일치.
- **결제일 수동 지정**: 폼에서 "직접 지정" 체크 → 자동계산 대신 입력값 저장(`due_date_overridden`). 기본은 자동.
- **인라인 생성**: 명세서 폼 안에서 거래처(이름만)·카테고리 즉시 추가(탭 이동 불필요). *(Electron `prompt()` 미지원이라 인라인 입력)*
- **홈 최근 입력·수정**: `updated_at` 기준 최근 5건(`transaction.listRecent`).
- DB 경로 = `userData/dueledger.db`(%APPDATA%), 첫 실행 시 카테고리 시드.

### ⚠️ 알려진 로컬 이슈 (맥 개발 머신 한정 — Windows에서 해소됨)
- 맥 머신: `npm run rebuild:electron` 등이 better-sqlite3를 **Node ABI로만** 빌드 → Electron 실행 시 크래시. Electron 헤더 폴백 문제로 추정. **→ Windows(2026-06-17)에서 `rebuild:electron` 표준대로 동작·앱 실행·cdp-smoke 23/23 통과로 코드/설정 정상 확정.** 클린 체크아웃이나 다른 머신에선 표준대로 동작.
- **크로스플랫폼 주의(2026-06-17 수정)**: `migrate.test.ts`·`cdp-smoke.mjs`가 `path.split('/')`로 basename을 뽑아 Windows 백슬래시 경로에서 깨졌음 → `node:path`의 `basename` 사용으로 수정. CDP eval은 전역 스코프라 `const` 재선언 충돌 → IIFE로 감쌈.
- **ABI 토글 절차(Windows)**: `npm test`(Node ABI) ↔ 앱 실행(Electron ABI)은 better-sqlite3 재빌드 필요. `rebuild:electron`(install-app-deps)이 **캐시로 no-op**할 때가 있음 → 확실히 하려면 `npx @electron/rebuild -f -w better-sqlite3`. 테스트로 돌아갈 땐 `npm run rebuild:node`.

## 다음
1. **.exe 인계** — CI 아티팩트(`DueLedger-*-portable.exe`) 다운로드 → 그 1명에게 전달. 미서명이라 첫 실행 시 "추가 정보 → 실행" 1회 안내. 아이콘=`build/icon.ico` 적용됨. productName/회사명 확정 시 `electron-builder.yml` 갱신.
2. **엑셀 임포터 = 완료**(명세서 탭 "엑셀 가져오기"). 실양식 1개 대상, 중복 건너뛰기, 거래처/카테고리 자동생성, 결제일=거래일자(수동지정).
3. (선택·나중) taxRate 편집 파라미터 · 거래처 결제조건 변경 시 dueDate 재계산 · CategoryInUseError 건수의 IPC 구조화 전달 · 임포트 후 거래처별 결제조건 설정 UI(현재는 거래처 탭에서 개별 수정).
