import { useEffect, useState } from 'react';
import type { Vendor, PaymentTerms } from '../../../shared/api';

type TermsType = 'none' | 'net' | 'dayOfMonth';

function termsToForm(t: PaymentTerms | null): { type: TermsType; value: string } {
  if (!t) return { type: 'none', value: '' };
  return { type: t.type, value: String(t.value) };
}

function formToTerms(type: TermsType, value: string): PaymentTerms | null {
  if (type === 'none') return null;
  return { type, value: Number(value) };
}

const TERMS_LABEL: Record<TermsType, string> = {
  none: '없음',
  net: '발행일+N일 (net)',
  dayOfMonth: '매월 N일',
};

export function VendorView() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [termsType, setTermsType] = useState<TermsType>('none');
  const [termsValue, setTermsValue] = useState('');

  async function reload() {
    setVendors(await window.api.vendor.list());
  }
  useEffect(() => {
    void reload();
  }, []);

  function resetForm() {
    setEditingId(null);
    setName('');
    setTermsType('none');
    setTermsValue('');
  }

  function startEdit(v: Vendor) {
    setEditingId(v.id);
    setName(v.name);
    const f = termsToForm(v.paymentTerms);
    setTermsType(f.type);
    setTermsValue(f.value);
  }

  async function save() {
    if (name.trim() === '') return;
    const input = { name, paymentTerms: formToTerms(termsType, termsValue) };
    if (editingId === null) await window.api.vendor.create(input);
    else await window.api.vendor.update(editingId, input);
    resetForm();
    await reload();
  }

  async function remove(id: number) {
    if (!confirm('이 거래처를 삭제할까요?')) return;
    await window.api.vendor.remove(id);
    await reload();
  }

  return (
    <div className="view">
      <section className="form-card">
        <h2>{editingId === null ? '거래처 추가' : '거래처 수정'}</h2>
        <div className="form-row">
          <label>이름</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="거래처명" />
        </div>
        <div className="form-row">
          <label>결제조건</label>
          <select value={termsType} onChange={(e) => setTermsType(e.target.value as TermsType)}>
            {(Object.keys(TERMS_LABEL) as TermsType[]).map((t) => (
              <option key={t} value={t}>
                {TERMS_LABEL[t]}
              </option>
            ))}
          </select>
          {termsType !== 'none' && (
            <input
              type="number"
              value={termsValue}
              onChange={(e) => setTermsValue(e.target.value)}
              placeholder={termsType === 'net' ? '일수' : '일(1-31)'}
              style={{ width: 100 }}
            />
          )}
        </div>
        <div className="form-actions">
          <button className="primary" onClick={() => void save()}>
            {editingId === null ? '추가' : '저장'}
          </button>
          {editingId !== null && <button onClick={resetForm}>취소</button>}
        </div>
      </section>

      <table className="grid">
        <thead>
          <tr>
            <th>거래처</th>
            <th>결제조건</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((v) => (
            <tr key={v.id}>
              <td>{v.name}</td>
              <td>
                {v.paymentTerms === null
                  ? '—'
                  : v.paymentTerms.type === 'net'
                    ? `발행일 +${v.paymentTerms.value}일`
                    : `매월 ${v.paymentTerms.value}일`}
              </td>
              <td className="row-actions">
                <button onClick={() => startEdit(v)}>수정</button>
                <button className="danger" onClick={() => void remove(v.id)}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
          {vendors.length === 0 && (
            <tr>
              <td colSpan={3} className="empty">
                등록된 거래처가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
