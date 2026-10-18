import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supportApi } from "./support";

const KEY = ["help-support"] as const;

export const useMyTickets = (page = 1) => useQuery({ queryKey: [...KEY, "list", page], queryFn: () => supportApi.list(page).then((r) => r.data) });
export const useMyTicket = (id: string | undefined) =>
  useQuery({ queryKey: [...KEY, "ticket", id], queryFn: () => supportApi.get(id!).then((r) => r.data), enabled: !!id });

export function useCreateMyTicket() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: supportApi.create, onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}
export function useReplyMyTicket() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, body }: { id: string; body: string }) => supportApi.reply(id, body), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}
