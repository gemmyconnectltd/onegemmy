import { request } from "./client";
import type { SingleResponse } from "./types";

export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

export const globalApi = {
  currencies: () => request<SingleResponse<Currency[]>>("/global/currencies"),
};
