import { useEffect, useState } from 'react';
import type { ImportSummary, Vendor } from '../../../shared/api';
import { type TermsType, TERMS_LABEL, termsToForm, formToTerms } from './paymentTermsForm';

// 엑셀 가져오기 흐름: 파일 선택 → 미리보기(쓰기 없음) → 확인 시 적재.
// 중복(거래일자+거래처+품목+금액)은 건너뛰고, 미존재 거래처/카테고리는 자동 생성한다.
type Phase = 'idle' | 'previewing' | 'preview' | 'committing' | 'done';

export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickFile() {
    setError(null);
    const path = await window.api.import.openDialog();
    if (!path) return; // 취소
    setFilePath(path);
    setPhase('previewing');
    try {
      const s = await window.api.import.preview(path);
      setSummary(s);
      setPhase('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('idle');
    }
  }

  async function doImport() {
    if (!filePath) return;
    setPhase('committing');
    try {
      const s = await window.api.import.commit(filePath);
      setSummary(s);
      setPhase('done');
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('preview');
    }
  }

  const fileName = filePath ? filePath.replace(/^.*[\\/]/, '') : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <h2>엑셀 가져오기</h2>

        {phase === 'idle' && (
          <p className="auto-due">
            기존 거래명세서 엑셀(.xlsx)을 선택하면 명세서·품목으로 한 번에 등록됩니다. 이미 등록된 동일 건은
            자동으로 건너뜁니다.
          </p>
        )}

        {fileName && (
          <p className="import-file">
            파일: <strong>{fileName}</strong>
          </p>
        )}

        {(phase === 'previewing' || phase === 'committing') && (
          <p className="auto-due">{phase === 'previewing' ? '분석 중…' : '가져오는 중…'}</p>
        )}

        {phase === 'done' && summary && summary.newVendors.length > 0 && (
          <NewVendorTerms names={summary.newVendors} />
        )}

        {summary && (phase === 'preview' || phase === 'done') && (
          <div className="import-summary">
            {phase === 'done' && <p className="import-ok">✅ 가져오기 완료</p>}
            <ul>
              <li>
                {phase === 'done' ? '추가된' : '추가될'} 명세서 <strong>{summary.newStatements}</strong>장 · 품목{' '}
                <strong>{summary.newItems}</strong>줄
              </li>
              <li>
                중복 건너뜀 <strong>{summary.duplicateItems}</strong>줄
              </li>
              {summary.newVendors.length > 0 && (
                <li>
                  신규 거래처 {summary.newVendors.length}곳: {summary.newVendors.join(', ')}
                </li>
              )}
              {summary.newCategories.length > 0 && (
                <li>
                  신규 카테고리 {summary.newCategories.length}개: {summary.newCategories.join(', ')}
                </li>
              )}
              {summary.skippedRows > 0 && (
                <li className="import-warn">불완전한 줄 {summary.skippedRows}개 제외</li>
              )}
            </ul>
            {summary.warnings.length > 0 && (
              <details className="import-warnings">
                <summary>경고 {summary.warnings.length}건 보기</summary>
                <ul>
                  {summary.warnings.slice(0, 50).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          {phase === 'idle' && (
            <button className="primary" onClick={() => void pickFile()}>
              파일 선택…
            </button>
          )}
          {phase === 'preview' && (
            <>
              <button onClick={() => void pickFile()}>다른 파일</button>
              <button
                className="primary"
                disabled={summary != null && summary.newItems === 0}
                onClick={() => void doImport()}
              >
                {summary && summary.newItems === 0 ? '가져올 신규 항목 없음' : '가져오기'}
              </button>
            </>
          )}
          <button onClick={onClose}>{phase === 'done' ? '닫기' : '취소'}</button>
        </div>
      </div>
    </div>
  );
}

// 임포트로 새로 생긴 거래처는 결제조건이 비어 있다(임포터가 채우지 않음).
// 여기서 바로 결제조건을 넣으면 그 거래처 명세서의 결제일이 재계산된다(백엔드 vendor:update 훅).
function NewVendorTerms({ names }: { names: string[] }) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [forms, setForms] = useState<Record<number, { type: TermsType; value: string }>>({});
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    void window.api.vendor.list().then((all) => {
      const wanted = new Set(names.map((n) => n.trim()));
      const matched = all.filter((v) => wanted.has(v.name.trim()));
      setVendors(matched);
      const init: Record<number, { type: TermsType; value: string }> = {};
      for (const v of matched) init[v.id] = termsToForm(v.paymentTerms);
      setForms(init);
    });
  }, [names]);

  function setForm(id: number, patch: Partial<{ type: TermsType; value: string }>) {
    setForms((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setSavedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id); // 다시 편집하면 저장 표시 해제
      return next;
    });
  }

  async function save(v: Vendor) {
    const f = forms[v.id];
    await window.api.vendor.update(v.id, {
      name: v.name,
      paymentTerms: formToTerms(f.type, f.value),
      phone: v.phone,
      accountNumber: v.accountNumber,
      contactName: v.contactName,
      contactTitle: v.contactTitle,
    });
    setSavedIds((prev) => new Set(prev).add(v.id));
  }

  if (vendors.length === 0) return null;

  return (
    <div className="import-new-terms">
      <p className="auto-due">
        새 거래처 {vendors.length}곳의 결제조건을 지금 설정할 수 있습니다(나중에 거래처 탭에서도 가능). 설정하면
        해당 명세서의 결제일이 자동 계산됩니다.
      </p>
      <table className="grid">
        <tbody>
          {vendors.map((v) => {
            const f = forms[v.id] ?? { type: 'none' as TermsType, value: '' };
            return (
              <tr key={v.id}>
                <td>{v.name}</td>
                <td>
                  <select value={f.type} onChange={(e) => setForm(v.id, { type: e.target.value as TermsType })}>
                    {(Object.keys(TERMS_LABEL) as TermsType[]).map((t) => (
                      <option key={t} value={t}>
                        {TERMS_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {f.type !== 'none' && (
                    <input
                      type="number"
                      value={f.value}
                      onChange={(e) => setForm(v.id, { value: e.target.value })}
                      placeholder={f.type === 'net' ? '일수' : '일(1-31)'}
                      style={{ width: 90 }}
                    />
                  )}
                </td>
                <td className="row-actions">
                  <button className="primary" onClick={() => void save(v)}>
                    저장
                  </button>
                  {savedIds.has(v.id) && <span className="import-ok">✓</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
