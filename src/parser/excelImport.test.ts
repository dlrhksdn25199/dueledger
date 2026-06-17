import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseLedgerWorkbook } from './excelImport';

// 합성 fixture(실명·실금액 아님)로 파서를 검증. 양식이 바뀌면 test/fixtures/build-sample.mjs와 함께 갱신.
const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(here, '..', '..', 'test', 'fixtures', 'sample-ledger.xlsx');

describe('parseLedgerWorkbook — 회사 양식', () => {
  const result = parseLedgerWorkbook(SAMPLE);

  it('유효 품목 줄 6개, 불완전 줄 0, 빈 템플릿 줄은 조용히 제외', () => {
    expect(result.importedRows).toBe(6);
    expect(result.skippedRows).toBe(0);
  });

  it('거래일자+거래처로 명세서를 묶는다 (다품목 포함)', () => {
    expect(result.statements).toHaveLength(3);
    for (const s of result.statements) {
      expect(s.items.length).toBeGreaterThan(0);
    }
    const nada = result.statements.find(
      (s) => s.vendorName === '나다물산' && s.issueDate === '2026-04-25',
    );
    expect(nada).toBeDefined();
    expect(nada!.items.map((i) => i.name).sort()).toEqual(['도시락 뚜껑', '도시락 용기']);
  });

  it('엑셀 serial 날짜를 YYYY-MM-DD로 변환', () => {
    const gana = result.statements.find((s) => s.vendorName === '가나상사');
    expect(gana).toBeDefined();
    expect(gana!.issueDate).toBe('2026-04-22');
  });

  it('공급가액·수량·단가·과세구분을 정확히 읽는다', () => {
    const gana = result.statements.find((s) => s.vendorName === '가나상사')!;
    const donkkaseu = gana.items.find((i) => i.name === '돈까스')!;
    expect(donkkaseu.supplyAmount).toBe(100000);
    expect(donkkaseu.quantity).toBe(100);
    expect(donkkaseu.unitPrice).toBe(1000);
    expect(donkkaseu.taxType).toBe('과세');
  });

  it('거래처명·카테고리 앞뒤 공백을 trim', () => {
    // fixture에 " 가나상사"(앞 공백), "포장재 "(뒤 공백)가 들어 있다.
    expect(result.statements.some((s) => s.vendorName === '가나상사')).toBe(true);
    const cats = new Set(
      result.statements.flatMap((s) => s.items.map((i) => i.categoryName)).filter(Boolean),
    );
    expect(cats.has('포장재')).toBe(true);
    expect([...cats].every((c) => c === c!.trim())).toBe(true);
  });

  it('텍스트 수량은 숫자 null + 원문을 규격에 보존', () => {
    const all = result.statements.flatMap((s) => s.items);
    const kong = all.find((i) => i.name === '콩기름')!;
    expect(kong.quantity).toBeNull();
    expect(kong.spec).toContain('120통');
  });

  it('면세 품목은 그대로 면세로', () => {
    const all = result.statements.flatMap((s) => s.items);
    const myeonse = all.find((i) => i.taxType === '면세');
    expect(myeonse).toBeDefined();
    expect(myeonse!.name).toBe('단무지');
  });
});
