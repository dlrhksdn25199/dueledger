# PROGRESS — 거래명세서 정리 도구

> 진행 상황 단일 기록. 매 작업마다 갱신. (정책·결정은 `CLAUDE.md`, 원칙은 `coding-principles.md`)

## 현재 상태 (2026-06-16)
**계층**: domain(순수 로직) + repository(데이터 게이트) 완료. UI·Electron 셸 미착수.
**테스트**: 58 passing (blackbox + whitebox), `tsc --noEmit` clean.
**CI**: GitHub Actions(`.github/workflows/ci.yml`) — Node 22에서 typecheck + test. 브랜치 `feat/domain-repository-foundation`.

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

## 결정·메모 (코드에 안 드러나는 것)
- **dueDate는 쓰기 시점 계산값**: create/update 때 거래처 결제조건 + 발행일로 계산해 저장. 거래처 결제조건을 나중에 바꿔도 기존 명세서 dueDate는 자동 갱신 안 됨 → 필요해지면 재계산 기능 추가 (YAGNI).
- **taxRate는 현재 기본값 0.10 고정**: 편집 가능 파라미터(파라미터 스토어)는 아직 미구현. 필요 시 도입.
- **명세서 편집 = 품목 삭제 후 재삽입**: 1인 앱이라 단순·정확 우선. diff 머지 안 함.
- **better-sqlite3 Node 26 프리빌드 동작 확인**(무빌드). CI는 Node 22.

## 다음 (P0 #4 코어 경로 남은 것)
1. **테이블 뷰 쿼리 모듈** — 품목 줄 ⨝ 헤더 평면 행. 정렬(금액/수량 **숫자**, 날짜 **날짜**) · 필터(거래처/카테고리/결제상태/과세구분/월/결제일 기간) · 검색(LIKE, 거래처명 trim). repository 쿼리로만.
2. **카테고리 시드** — 식자재/포장재/소모품/위생용품/기타 초기 투입(앱 첫 실행 또는 시드 함수).
3. **Electron + React UI 스캐폴딩** — repository만 호출. 수기 입력 폼 + 테이블 뷰.
