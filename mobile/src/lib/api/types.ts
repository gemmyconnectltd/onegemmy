export interface PaginatedResponse<T> {
  data: { items: T[]; total: number; page: number; page_size: number };
  message: string;
}

export interface SingleResponse<T> {
  data: T;
  message: string;
}
