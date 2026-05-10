export type InjectionInput = {
  clicks: number;
  site: string | null;
  notes: string | null;
  preserveSchedule: boolean;
};

export async function logInjection(
  workerOrigin: string,
  input: InjectionInput
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!workerOrigin) {
    return { ok: false, reason: "worker origin missing" };
  }

  try {
    const response = await fetch(`${workerOrigin}/injection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: `${response.status} ${response.statusText}`.trim()
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "injection log failed"
    };
  }
}
