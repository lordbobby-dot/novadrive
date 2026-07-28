const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    credentials: "include",
  });

  if (!response.ok) {
    // NestJS error responses are `{ message, error, statusCode }` — surface the real message
    // when present (e.g. "This invitation has expired") instead of a generic status-code string.
    const fallback = `Request to ${path} failed with ${response.status}`;
    const body: unknown = await response.json().catch(() => null);
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : fallback;
    throw new ApiError(response.status, message);
  }

  // A 204 has no body — response.json() would throw on the empty string and turn a successful
  // request into a reported failure (the mutation would reject even though the server already
  // applied the change).
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
