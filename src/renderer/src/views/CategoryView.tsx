import { useEffect, useState } from 'react';
import type { Category } from '../../../shared/api';
import { useDialog } from '../ui/dialog';

export function CategoryView() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const dialog = useDialog();

  async function reload() {
    setCategories(await window.api.category.list());
  }
  useEffect(() => {
    void reload();
  }, []);

  async function add() {
    if (newName.trim() === '') return;
    await window.api.category.create(newName);
    setNewName('');
    await reload();
  }

  async function saveRename(id: number) {
    if (editName.trim() === '') return;
    await window.api.category.rename(id, editName);
    setEditingId(null);
    await reload();
  }

  async function remove(c: Category) {
    // 사용 중이면 삭제 거부 — 건수를 안내 (P0 #4, 조용한 재분류 금지)
    const count = await window.api.category.countItemsUsing(c.id);
    if (count > 0) {
      await dialog.alert({
        title: '삭제할 수 없음',
        message: `'${c.name}' 카테고리는 품목 ${count}건에서 사용 중입니다.\n해당 품목을 다른 카테고리로 재지정한 뒤 삭제하세요.`,
      });
      return;
    }
    const ok = await dialog.confirm({ message: `'${c.name}' 카테고리를 삭제할까요?`, danger: true, confirmText: '삭제' });
    if (!ok) return;
    try {
      await window.api.category.remove(c.id);
    } catch (e) {
      // 경합 등으로 그 사이 사용 중이 됐을 때 백엔드 가드가 다시 막음
      await dialog.alert({ title: '삭제 실패', message: (e as Error).message });
    }
    await reload();
  }

  return (
    <div className="view">
      <section className="form-card compact sticky-form">
        <div className="compact-row">
          <strong className="compact-title">카테고리 추가</strong>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="카테고리명"
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            style={{ flex: 1 }}
          />
          <button className="primary" onClick={() => void add()}>
            추가
          </button>
        </div>
      </section>

      <table className="grid">
        <thead>
          <tr>
            <th>카테고리</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.id}>
              <td>
                {editingId === c.id ? (
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void saveRename(c.id)}
                    autoFocus
                  />
                ) : (
                  c.name
                )}
              </td>
              <td className="row-actions">
                {editingId === c.id ? (
                  <>
                    <button className="primary" onClick={() => void saveRename(c.id)}>
                      저장
                    </button>
                    <button onClick={() => setEditingId(null)}>취소</button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(c.id);
                        setEditName(c.name);
                      }}
                    >
                      이름변경
                    </button>
                    <button className="danger" onClick={() => void remove(c)}>
                      삭제
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {categories.length === 0 && (
            <tr>
              <td colSpan={2} className="empty">
                카테고리가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
