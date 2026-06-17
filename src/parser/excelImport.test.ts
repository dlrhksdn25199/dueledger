import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseLedgerWorkbook } from './excelImport';

// 실제 회사 양식 샘플(저장소 docs/)로 파서를 검증 — 양식이 바뀌면 여기서 깨진다.
const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(here, '..', '..', 'docs', '거래명세서_공용.xlsx');

describe('parseLedgerWorkbook — 실제 양식', () => {
  const result = parseLedgerWorkbook(SAMPLE);

  it('유효 품목 줄 36개, 불완전 줄 0, 빈 템플릿 줄은 조용히 제외', () => {
    expect(result.importedRows).toBe(36);
    expect(result.skippedRows).toBe(0);
  });

  it('거래일자+거래처로 명세서를 묶는다 (다품목 포함)', () => {
    // 모든 명세서가 같은 (거래일자, 거래처) 키를 공유.
    for (const s of result.statements) {
      expect(s.items.length).toBeGreaterThan(0);
    }
    const jiwoo = result.statements.find(
      (s) => s.vendorName === '지우케미컬' && s.issueDate === '2026-04-25',
    );
    expect(jiwoo).toBeDefined();
    expect(jiwoo!.items.map((i) => i.name).sort()).toEqual(['도시락 뚜껑', '도시락 용기']);
  });

  it('엑셀 serial 날짜를 YYYY-MM-DD로 변환', () => {
    const hanmaek = result.statements.find((s) => s.vendorName === '한맥');
    expect(hanmaek).toBeDefined();
    expect(hanmaek!.issueDate).toBe('2026-04-22');
  });

  it('공급가액·수량·단가·과세구분을 정확히 읽는다', () => {
    const hanmaek = result.statements.find((s) => s.vendorName === '한맥')!;
    const donkkaseu = hanmaek.items.find((i) => i.name === '돈까스')!;
    expect(donkkaseu.supplyAmount).toBe(37396800);
    expect(donkkaseu.quantity).toBe(35280);
    expect(donkkaseu.unitPrice).toBe(1060);
    expect(donkkaseu.taxType).toBe('과세');
  });

  it('거래처명·카테고리 앞뒤 공백을 trim', () => {
    // 원본엔 "일미농수산 ", "부재료 " 처럼 공백 존재.
    expect(result.statements.some((s) => s.vendorName === '일미농수산')).toBe(true);
    const cats = new Set(
      result.statements.flatMap((s) => s.items.map((i) => i.categoryName)).filter(Boolean),
    );
    expect(cats.has('부재료')).toBe(true);
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
  });
});
