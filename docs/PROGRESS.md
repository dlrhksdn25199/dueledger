# PROGRESS — 거래명세서 정리 도구

> 진행 상황 단일 기록. 매 작업마다 갱신. (정책·결정은 `CLAUDE.md`, 원칙은 `coding-principles.md`)

## 현재 상태 (2026-06-16)
**계층**: domain + repository + **Electron/React UI**(홈 대시보드·달력·상태배지·결제일 수동지정·인라인 거래처/카테고리 생성·최근목록) + **패키징(electron-builder)** 완료.
**테스트**: 84 passing (blackbox + whitebox), `tsc --noEmit` clean, `electron-vite build` 성공. 스키마 v2(결제일 수동 플래그 + updated_at) 마이그레이션 + 업그레이드/백업 테스트 포함.
**맥 실기기 검증**: A/B/E 라운드는 패키지된 앱 CDP 스모크 **17/17** 통과(시드·금액·결제일·정렬·삭제가드·홈카드·배지·달력). ⚠️ **이후 라운드(수동결제일·인라인생성·최근목록)는 로컬 better-sqlite3 네이티브 ABI 리빌드가 이 머신에서 막혀 라이브 실행 검증 못 함** — 코드 문제 아님(84 유닛 테스트 + build 통과). CI .exe는 fresh 환경이라 영향 없음. 다음 `시작` 때 클린 머신/`npm ci`에서 `cdp-smoke` 재실행 권장.
**패키징**: `electron-builder.yml` — win=포터블 .exe(미서명), mac=dir(로컬검증). better-sqlite3 asar 언팩. CI(windows-latest)가 .exe 아티팩트 생성.
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
- 결제상태 색상 배지(미지급=빨강/지급예정=노랑/지급완료=회색) + 연체 강조. 홈·달력 로직은 `domain/paymentSchedule`(분류·날짜집계) 순수 함수로 테스트.
- **결제일 수동 지정**: 폼에서 "직접 지정" 체크 → 자동계산 대신 입력값 저장(`due_date_overridden`). 기본은 자동.
- **인라인 생성**: 명세서 폼 안에서 거래처(이름만)·카테고리 즉시 추가(탭 이동 불필요). *(Electron `prompt()` 미지원이라 인라인 입력)*
- **홈 최근 입력·수정**: `updated_at` 기준 최근 5건(`transaction.listRecent`).
- DB 경로 = `userData/dueledger.db`(%APPDATA%), 첫 실행 시 카테고리 시드.

### ⚠️ 알려진 로컬 이슈 (이 개발 머신)
- `npm run rebuild:electron`(install-app-deps) / electron-rebuild / node-gyp 모두 이 머신에서 better-sqlite3를 **Node ABI(147)로만** 빌드 → Electron(146) 실행 시 크래시. Electron 헤더 폴백 문제로 추정. 코드/설정 문제 아님(CI .exe·이전 라이브검증은 정상). 클린 체크아웃이나 다른 머신에선 표준대로 동작 예상.

## 다음 (다음 세션 이어서)
0. **🔜 가장 먼저: 새 기능 라이브 재검증** — 수동결제일·인라인생성·최근목록은 유닛테스트(84)·build만 통과, 맥 라이브 미검증(위 로컬 ABI 이슈). 다음 세션 시작 때 클린 상태(`rm -rf node_modules && npm ci` → `npm run rebuild:electron` 또는 `npm run package:mac`)에서 `DUELEDGER_REMOTE_DEBUG=1`로 띄우고 `node scripts/cdp-smoke.mjs`(17→재확장) 돌려 그린 확인. 안 되면 ABI 원인부터.
1. **.exe 인계** — CI 아티팩트(`DueLedger-portable-exe`) 다운로드 → 그 1명에게 전달. 미서명이라 첫 실행 시 "추가 정보 → 실행" 1회 안내. productName/아이콘/회사명 확정 시 `electron-builder.yml` 갱신.
2. **PR #2 머지 여부** 결정(현재 OPEN·CI 그린). 
3. (선택·나중) 엑셀 임포터 · taxRate 편집 파라미터 · 거래처 결제조건 변경 시 dueDate 재계산 · CategoryInUseError 건수의 IPC 구조화 전달.
