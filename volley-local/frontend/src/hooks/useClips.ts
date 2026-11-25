import { useQuery } from "@tanstack/react-query";
import { api, Clip, Match } from "../api/client";
export function useList<T>(url: string, enabled = true, poll = false) {
  return useQuery({
    queryKey: [url],
    queryFn: () => api<T[]>(url),
    enabled,
    refetchInterval: (q) =>
      poll &&
      (q.state.data ?? []).some(
        (m) =>
          !["ready", "needs_manual_review", "failed"].includes(
            (m as Match).status,
          ),
      )
        ? 1500
        : false,
  });
}
export const useClips = (id: number) =>
  useList<Clip>("/matches/" + id + "/clips", !!id);
