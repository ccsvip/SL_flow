import { useQuery } from "@tanstack/react-query";
import { projects, users } from "@/api/client";

export function useProjectOptions() {
  const { data = [] } = useQuery({
    queryKey: ["projects-light"],
    queryFn: () => projects.list(),
    staleTime: 60_000,
  });
  return data.map((p) => ({ value: p.id, label: p.name, code: p.code, color: p.color }));
}

export function useUserOptions(activeOnly = true) {
  const { data = [] } = useQuery({
    queryKey: ["users-light", activeOnly],
    queryFn: () => users.list(),
    staleTime: 60_000,
  });
  const filtered = activeOnly ? data.filter((u) => u.is_active) : data;
  return filtered.map((u) => ({
    value: u.id,
    label: u.full_name ? `${u.full_name} (${u.username})` : u.username,
    user: u,
  }));
}
