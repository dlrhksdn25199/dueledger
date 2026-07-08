import { useEffect, useState } from 'react';
import { useDialog } from '../ui/dialog';

// 앱 설정 — 현재는 편집 가능한 부가세율 하나.
// ⚠️ 세율은 "쓰기 시점" 파라미터: 저장/임포트할 때의 세율로 vat를 계산해 박는다.
//    세율을 바꿔도 이미 저장된 명세서의 vat는 자동으로 바뀌지 않는다(발행일→결제일과 같은 정책).
export function SettingsView() {
  const [percent, setPercent] = useState(''); // 사용자에겐 %로 보여준다(내부 저장은 0~1 분수)
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const dialog = useDialog();

  useEffect(() => {
    void window.api.settings.getTaxRate().then((rate) => {
      setPercent(String(Math.round(rate * 1000) / 10)); // 0.1 → "10"
      setLoaded(true);
    });
  }, []);

  async function save() {
    const p = Number(percent);
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      await dialog.alert({ title: '값 오류', message: '부가세율은 0~100 사이의 숫자여야 합니다.' });
      return;
    }
    setSaving(true);
    try {
      await window.api.settings.setTaxRate(p / 100); // % → 분수
      await dialog.alert({ title: '저장됨', message: `부가세율을 ${p}%로 저장했습니다.` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="view">
      <section className="form-card compact">
        <div className="compact-row">
          <strong className="compact-title">부가세율</strong>
          <input
            type="number"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            disabled={!loaded}
            style={{ flex: '0 0 100px' }}
            step="0.1"
          />
          <span>%</span>
          <button className="primary" onClick={() => void save()} disabled={!loaded || saving}>
            저장
          </button>
        </div>
        <p className="auto-due">
          과세 품목의 부가세 = 공급가액 × 세율(원 단위 반올림). 기본 10%.
          <br />
          세율 변경은 <strong>이후 저장·가져오는 명세서에만</strong> 적용됩니다. 이미 저장된 명세서의 부가세는 그대로
          유지됩니다.
        </p>
      </section>
    </div>
  );
}
