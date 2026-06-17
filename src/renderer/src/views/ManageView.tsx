import { VendorView } from './VendorView';
import { CategoryView } from './CategoryView';

// 거래처·카테고리를 한 탭에서 관리(둘 다 단순 관리 목록이라 탭을 합침). 넓으면 2열, 좁으면 1열.
export function ManageView() {
  return (
    <div className="manage-grid">
      <div className="manage-col">
        <h2 className="section-title">거래처</h2>
        <VendorView />
      </div>
      <div className="manage-col">
        <h2 className="section-title">카테고리</h2>
        <CategoryView />
      </div>
    </div>
  );
}
