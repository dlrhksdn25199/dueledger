import { useEffect, useState } from 'react';
import type { Vendor } from '../../../shared/api';
import { useDialog } from '../ui/dialog';
import { type TermsType, TERMS_LABEL, termsToForm, formToTerms } from './paymentTermsForm';

export function VendorView() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [termsType, setTermsType] = useState<TermsType>('none');
  const [termsValue, setTermsValue] = useState('');
  const [phone, setPhone] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const dialog = useDialog();

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
    setPhone('');
    setAccountNumber('');
    setContactName('');
    setContactTitle('');
  }

  function startEdit(v: Vendor) {
    setEditingId(v.id);
    setName(v.name);
    const f = termsToForm(v.paymentTerms);
    setTermsType(f.type);
    setTermsValue(f.value);
    setPhone(v.phone ?? '');
    setAccountNumber(v.accountNumber ?? '');
    setContactName(v.contactName ?? '');
    setContactTitle(v.contactTitle ?? '');
  }

  async function save() {
    if (name.trim() === '') return;
    const input = {
      name,
      paymentTerms: formToTerms(termsType, termsValue),
      phone,
      accountNumber,
      contactName,
      contactTitle,
    };
    if (editingId === null) await window.api.vendor.create(input);
    else await window.api.vendor.update(editingId, input);
    resetForm();
    await reload();
  }

  async function remove(id: number) {
    const ok = await dialog.confirm({ message: '이 거래처를 삭제할까요?', danger: true, confirmText: '삭제' });
    if (!ok) return;
    await window.api.vendor.remove(id);
    await reload();
  }

  return (
    <div className="view">
      <section className="form-card compact sticky-form">
        {/* 윗줄: 거래처명 · 결제조건 · 담당자명 · 직급 */}
        <div className="compact-row">
          <strong className="compact-title">{editingId === null ? '거래처 추가' : '거래처 수정'}</strong>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="거래처명" />
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
              style={{ flex: '0 0 90px' }}
            />
          )}
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="담당자명" />
          <input value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} placeholder="직급" />
        </div>
        {/* 아랫줄: 계좌번호 · 전화번호 · (추가/저장) */}
        <div className="compact-row">
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="계좌번호"
          />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="전화번호" />
          <button className="primary" onClick={() => void save()}>
            {editingId === null ? '추가' : '저장'}
          </button>
          {editingId !== null && <button onClick={resetForm}>취소</button>}
        </div>
      </section>

      <div className="table-scroll">
      <table className="grid">
        <thead>
          <tr>
            <th>거래처</th>
            <th>결제조건</th>
            <th>담당자</th>
            <th>전화번호</th>
            <th>계좌번호</th>
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
              <td>{[v.contactName, v.contactTitle].filter(Boolean).join(' ')}</td>
              <td>{v.phone ?? ''}</td>
              <td>{v.accountNumber ?? ''}</td>
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
              <td colSpan={6} className="empty">
                등록된 거래처가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
