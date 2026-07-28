import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

interface HealthResponse {
  status: string;
  timestamp: string;
}

export function useHealthCheck() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>("/health"),
    refetchInterval: 30_000,
  });
}
