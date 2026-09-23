export interface ExchangeReview {
  id: string;
  exchange_id: string;
  /** 评价提交人（参与者本人） */
  reviewer_id: string;
  /** 被评价人，固定为本次交换中的对方，由服务层推导，禁止客户端传入 */
  reviewee_id: string;
  /** 1 至 5 星 */
  rating: number;
  /** 标签（标签文案，取自 REVIEW_TAG_OPTIONS） */
  tags: string[];
  created_at: string;
}

/**
 * 一条交换记录的双方评价。
 * 两条都存在时 reviews 成对公开；只有一方提交时，另一方的内容不可见。
 */
export interface ExchangeReviewPair {
  exchange_id: string;
  /** 发起方对接收方的评价 */
  fromReview?: ExchangeReview;
  /** 接收方对发起方的评价 */
  toReview?: ExchangeReview;
  /** 双方都已提交时为 true，此时两条评价同时公开 */
  is_public: boolean;
}

export type ExchangeReviewDraft = Pick<ExchangeReview, 'rating' | 'tags'>;
