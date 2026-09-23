// 交换完成后的互评模型。
// 一笔已完成交换对应两条 Review：双方各一条，对象固定为对方。
// 模型独立成文件，禁止在组件内内联定义（同 User / Item / Exchange 约定）。
export interface Review {
  id: string;
  exchange_id: string;
  reviewer_id: string; // 评价人（参与者本人）
  reviewee_id: string; // 被评价人，固定为该笔交换的对方
  rating: number; // 1~5 星
  tags: string[]; // 评价标签
  created_at: string;
  // 信用分是否已结算：仅在“双方都提交、评价公开”的那次原子写入里置为 true。
  // 用于防重放：任何重复提交都不能再次改变信用分。
  credit_applied: boolean;
}

// 提交评价时的入参：id / created_at / credit_applied 均由 API 层生成。
export type ReviewDraft = Pick<Review, 'exchange_id' | 'reviewer_id' | 'reviewee_id' | 'rating' | 'tags'>;
