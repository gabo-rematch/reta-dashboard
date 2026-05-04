export type SymptomInput = {
  category: string;
  severity: number;
  vomit: boolean;
  note: string | null;
};

export async function logSymptom(
  workerOrigin: string,
  input: SymptomInput
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!workerOrigin) {
    return { ok: false, reason: "worker origin missing" };
  }

  try {
    const response = await fetch(`${workerOrigin}/symptom`, {
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
      reason: error instanceof Error ? error.message : "symptom log failed"
    };
  }
}
