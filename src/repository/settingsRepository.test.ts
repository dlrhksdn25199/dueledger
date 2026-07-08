import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './db';
import { createSettingsRepository, getTaxRate, setTaxRate, type SettingsRepository } from './settingsRepository';

let db: DB;
let repo: SettingsRepository;
beforeEach(() => {
  db = openDatabase(':memory:');
  repo = createSettingsRepository(db);
});

describe('settingsRepository — taxRate', () => {
  it('기본값 = 0.1 (미설정 시)', () => {
    expect(repo.getTaxRate()).toBe(0.1);
    expect(getTaxRate(db)).toBe(0.1);
  });

  it('set → get 왕복', () => {
    repo.setTaxRate(0.13);
    expect(repo.getTaxRate()).toBe(0.13);
  });

  it('upsert — 두 번째 저장이 덮어쓴다(중복 키 아님)', () => {
    repo.setTaxRate(0.1);
    repo.setTaxRate(0.05);
    expect(repo.getTaxRate()).toBe(0.05);
    // 행이 하나만 유지되는지
    const count = db.prepare(`SELECT COUNT(*) AS c FROM app_setting`).get() as { c: number };
    expect(count.c).toBe(1);
  });

  it('경계값 0·1 허용', () => {
    expect(() => setTaxRate(db, 0)).not.toThrow();
    expect(() => setTaxRate(db, 1)).not.toThrow();
  });

  it('범위 밖·비유한 값은 거부', () => {
    expect(() => repo.setTaxRate(-0.1)).toThrow();
    expect(() => repo.setTaxRate(1.5)).toThrow();
    expect(() => repo.setTaxRate(Number.NaN)).toThrow();
  });
});
