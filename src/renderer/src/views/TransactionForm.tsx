import { useState } from 'react';
import type {
  Category,
  Vendor,
  Transaction,
  TransactionInput,
  TransactionItemInput,
  TaxType,
  PaymentStatus,
} from '../../../shared/api';
import { computeVat, computeTotal } from '../../../domain/amount';
import { computeDueDate } from '../../../domain/paymentDate';
import { won, todayISO } from '../format';

const PAYMENT_STATUSES: PaymentStatus[] = ['미지급', '지급예정', '지급완료'];
const TAX_TYPES: TaxType[] = ['과세', '면세'];

interface ItemForm {
  categoryId: string; // '' = 미분류
  name: string;
  spec: string;
  quantity: string;
  unitPrice: string;
  supplyAmount: string;
  taxType: TaxType;
}

function emptyItem(): ItemForm {
  return { categoryId: '', name: '', spec: '', quantity: '', unitPrice: '', supplyAmount: '', taxType: '과세' };
}

function toNumberOrNull(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function itemToForm(it: Transaction['items'][number]): ItemForm {
  return {
    categoryId: it.categoryId === null ? '' : String(it.categoryId),
    name: it.name,
    spec: it.spec ?? '',
    quantity: it.quantity === null ? '' : String(it.quantity),
    unitPrice: it.unitPrice === null ? '' : String(it.unitPrice),
    supplyAmount: String(it.supplyAmount),
    taxType: it.taxType,
  };
}

interface Props {
  vendors: Vendor[];
  categories: Category[];
  editing: Transaction | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function TransactionForm({ vendors, categories, editing, onSaved, onCancel }: Props) {
  const [vendorList, setVendorList] = useState<Vendor[]>(vendors);
  const [categoryList, setCategoryList] = useState<Category[]>(categories);

  const [vendorId, setVendorId] = useState<string>(editing ? String(editing.vendorId) : '');
  const [issueDate, setIssueDate] = useState(editing?.issueDate ?? todayISO());
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(editing?.paymentStatus ?? '미지급');
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [items, setItems] = useState<ItemForm[]>(editing ? editing.items.map(itemToForm) : [emptyItem()]);
  const [error, setError] = useState<string | null>(null);

  // 결제일 수동 지정
  const [manualDue, setManualDue] = useState<boolean>(editing?.dueDateOverridden ?? false);
  const [manualDueDate, setManualDueDate] = useState<string>(editing?.dueDate ?? '');

  // 인라인 생성
  const [showVendorAdd, setShowVendorAdd] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [showCatAdd, setShowCatAdd] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const selectedVendor = vendorList.find((v) => v.id === Number(vendorId));
  // 자동 결제일 미리보기 (거래처 결제조건 + 발행일)
  const autoDue = selectedVendor?.paymentTerms ? computeDueDate(issueDate, selectedVendor.paymentTerms) : null;

  function updateItem(idx: number, patch: Partial<ItemForm>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }
  function removeItem(idx: number) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  async function addVendorInline() {
    const name = newVendorName.trim();
    if (name === '') return;
    const v = await window.api.vendor.create({ name, paymentTerms: null });
    setVendorList((prev) => [...prev, v]);
    setVendorId(String(v.id));
    setNewVendorName('');
    setShowVendorAdd(false);
  }

  async function addCategoryInline() {
    const name = newCatName.trim();
    if (name === '') return;
    const c = await window.api.category.create(name);
    setCategoryList((prev) => [...prev, c]);
    setNewCatName('');
    setShowCatAdd(false);
  }

  function preview(it: ItemForm): { vat: number; total: number } {
    const supply = toNumberOrNull(it.supplyAmount) ?? 0;
    const vat = computeVat(supply, it.taxType);
    return { vat, total: computeTotal(supply, vat) };
  }
  const grandTotal = items.reduce((sum, it) => sum + preview(it).total, 0);

  async function save() {
    setError(null);
    if (vendorId === '') {
      setError('거래처를 선택하세요.');
      return;
    }
    const itemInputs: TransactionItemInput[] = [];
    for (const it of items) {
      const supply = toNumberOrNull(it.supplyAmount);
      if (it.name.trim() === '' || supply === null) {
        setError('각 품목의 이름과 공급가액(숫자)을 입력하세요.');
        return;
      }
      itemInputs.push({
        categoryId: it.categoryId === '' ? null : Number(it.categoryId),
        name: it.name,
        spec: it.spec.trim() === '' ? null : it.spec,
        quantity: toNumberOrNull(it.quantity),
        unitPrice: toNumberOrNull(it.unitPrice),
        supplyAmount: supply,
        taxType: it.taxType,
      });
    }
    const input: TransactionInput = {
      vendorId: Number(vendorId),
      issueDate,
      paymentStatus,
      memo: memo.trim() === '' ? null : memo,
      items: itemInputs,
      dueDateOverridden: manualDue,
      dueDate: manualDue ? (manualDueDate.trim() === '' ? null : manualDueDate) : undefined,
    };
    if (editing) await window.api.transaction.update(editing.id, input);
    else await window.api.transaction.create(input);
    onSaved();
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editing ? '명세서 수정' : '새 명세서'}</h2>

        <div className="form-row">
          <label>거래처</label>
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">선택</option>
            {vendorList.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {!showVendorAdd ? (
            <button onClick={() => setShowVendorAdd(true)}>+ 새 거래처</button>
          ) : (
            <>
              <input
                autoFocus
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                placeholder="새 거래처명"
                onKeyDown={(e) => e.key === 'Enter' && void addVendorInline()}
                style={{ width: 140 }}
              />
              <button className="primary" onClick={() => void addVendorInline()}>
                추가
              </button>
              <button onClick={() => setShowVendorAdd(false)}>취소</button>
            </>
          )}
        </div>

        <div className="form-row">
          <label>발행일</label>
          <input type="date" max="9999-12-31" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          <label>결제상태</label>
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>결제일</label>
          <input
            type="date"
            max="9999-12-31"
            value={manualDue ? manualDueDate : autoDue ?? ''}
            onChange={(e) => {
              setManualDue(true);
              setManualDueDate(e.target.value);
            }}
          />
          {selectedVendor?.paymentTerms && (
            <button
              type="button"
              onClick={() => {
                setManualDue(false);
                setManualDueDate('');
              }}
            >
              자동계산
            </button>
          )}
          <span className="auto-due">
            {manualDue
              ? '직접 지정됨'
              : autoDue
                ? '거래처 결제조건으로 자동'
                : '거래처 결제조건 없음 — 날짜를 직접 입력하세요'}
          </span>
        </div>

        <div className="form-row">
          <label>비고</label>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} style={{ flex: 1 }} placeholder="(선택)" />
        </div>

        <div className="items-bar">
          {!showCatAdd ? (
            <button onClick={() => setShowCatAdd(true)}>+ 새 카테고리</button>
          ) : (
            <>
              <input
                autoFocus
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="새 카테고리명"
                onKeyDown={(e) => e.key === 'Enter' && void addCategoryInline()}
                style={{ width: 140 }}
              />
              <button className="primary" onClick={() => void addCategoryInline()}>
                추가
              </button>
              <button onClick={() => setShowCatAdd(false)}>취소</button>
            </>
          )}
        </div>

        <table className="grid items">
          <thead>
            <tr>
              <th>카테고리</th>
              <th>품목</th>
              <th>규격</th>
              <th>수량</th>
              <th>단가</th>
              <th>공급가액</th>
              <th>과세</th>
              <th>부가세</th>
              <th>합계</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const p = preview(it);
              return (
                <tr key={idx}>
                  <td>
                    <select value={it.categoryId} onChange={(e) => updateItem(idx, { categoryId: e.target.value })}>
                      <option value="">미분류</option>
                      {categoryList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input value={it.name} onChange={(e) => updateItem(idx, { name: e.target.value })} />
                  </td>
                  <td>
                    <input value={it.spec} onChange={(e) => updateItem(idx, { spec: e.target.value })} style={{ width: 70 }} />
                  </td>
                  <td>
                    <input
                      value={it.quantity}
                      onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                      style={{ width: 60 }}
                    />
                  </td>
                  <td>
                    <input
                      value={it.unitPrice}
                      onChange={(e) => updateItem(idx, { unitPrice: e.target.value })}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>
                    <input
                      value={it.supplyAmount}
                      onChange={(e) => updateItem(idx, { supplyAmount: e.target.value })}
                      style={{ width: 90 }}
                    />
                  </td>
                  <td>
                    <select value={it.taxType} onChange={(e) => updateItem(idx, { taxType: e.target.value as TaxType })}>
                      {TAX_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">{won(p.vat)}</td>
                  <td className="num">{won(p.total)}</td>
                  <td>
                    <button className="danger" onClick={() => removeItem(idx)} disabled={items.length === 1}>
                      −
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={8} className="num">
                명세서 합계
              </td>
              <td className="num">{won(grandTotal)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <button onClick={addItem}>+ 품목 추가</button>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button className="primary" onClick={() => void save()}>
            저장
          </button>
          <button onClick={onCancel}>취소</button>
        </div>
      </div>
    </div>
  );
}
