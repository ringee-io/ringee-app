export interface ApiClientOptions {
  baseURL?: string;
  headers?: Record<string, string>;
  getAuthToken?: () => Promise<string | null>;
  mocks?: Record<string, (...args: any[]) => Promise<any> | any>;
  mockDelayMs?: number;
}

export class ApiError extends Error {
  public status: number;
  public data?: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export class ApiClient {
  private baseURL: string;
  private headers: Record<string, string>;
  private mocks?: Record<string, (...args: any[]) => Promise<any> | any>;
  private mockDelayMs: number;

  constructor(private readonly options?: ApiClientOptions) {
    // On the server (Node.js), we can read runtime env vars directly.
    // API_INTERNAL_URL uses the Docker-internal service name (e.g. http://ringee-backend:3000/api)
    // and is NOT baked into the bundle at build time.
    // On the client (browser), we fall back to NEXT_PUBLIC_API_URL which IS baked at build time.
    const isServer = typeof window === 'undefined';
    this.baseURL =
      options?.baseURL ||
      (isServer
        ? process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'
        : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api');
    this.headers = {
      'Content-Type': 'application/json',
      ...(options?.headers || {})
    };
    this.mocks = options?.mocks || {};
    this.mockDelayMs = options?.mockDelayMs ?? 0;
  }

  private buildUrl(endpoint: string) {
    return endpoint.startsWith('http')
      ? endpoint
      : `${this.baseURL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  }

  private async getAuthToken(): Promise<string | null> {
    try {
      if (this.options?.getAuthToken) {
        return await this.options.getAuthToken();
      }
      return null;
    } catch {
      return null;
    }
  }

  private async buildHeaders() {
    const token = await this.getAuthToken();
    return {
      ...this.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }

  private handleGlobalError(error: unknown): never {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      //@ts-ignore
      error?.message ?? 'Unknown error occurred',
      //@ts-ignore
      error?.statusCode ?? 500
    );
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    const text = await res.text();
    let data: any;

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new ApiError('❌ Error parsing server response', res.status);
    }

    if (!res.ok) {
      const message =
        data?.message || data?.error || `Request failed (${res.status})`;
      throw new ApiError(message, res.status, data);
    }

    return data as T;
  }

  private async maybeMock<T>(
    endpoint: string,
    args?: { body?: any; params?: Record<string, any> }
  ): Promise<T | undefined> {
    const token = await this.getAuthToken();

    const mock = Object.entries(this.mocks || {}).find(([key]) =>
      endpoint.startsWith(key)
    );
    if (!mock) return undefined;

    const [, handler] = mock;

    // Simula latencia si está configurada
    if (this.mockDelayMs > 0)
      await new Promise((r) => setTimeout(r, this.mockDelayMs));

    const result = await handler(args);
    return result as T;
  }

  async get<T = any>(
    endpoint: string,
    params?: Record<string, any>
  ): Promise<T> {
    try {
      if (params?.mock === true) {
        const mocked = await this.maybeMock<T>(endpoint, { params });
        if (mocked !== undefined) return mocked;
      }

      const url = new URL(this.buildUrl(endpoint));
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null && k !== 'mock') {
            url.searchParams.append(k, String(v));
          }
        });
      }

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: await this.buildHeaders(),
        credentials: 'include'
      });
      return await this.handleResponse<T>(res);
    } catch (error) {
      this.handleGlobalError(error);
    }
  }

  async post<T = any>(endpoint: string, body?: any): Promise<T> {
    try {
      const mocked = await this.maybeMock<T>(endpoint, { body });
      if (mocked !== undefined) return mocked;

      const res = await fetch(this.buildUrl(endpoint), {
        method: 'POST',
        headers: await this.buildHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include'
      });
      return await this.handleResponse<T>(res);
    } catch (error) {
      this.handleGlobalError(error);
    }
  }

  async put<T = any>(endpoint: string, body?: any): Promise<T> {
    try {
      const mocked = await this.maybeMock<T>(endpoint, { body });
      if (mocked !== undefined) return mocked;

      const res = await fetch(this.buildUrl(endpoint), {
        method: 'PUT',
        headers: await this.buildHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include'
      });
      return await this.handleResponse<T>(res);
    } catch (error) {
      this.handleGlobalError(error);
    }
  }

  async patch<T = any>(endpoint: string, body?: any): Promise<T> {
    try {
      const mocked = await this.maybeMock<T>(endpoint, { body });
      if (mocked !== undefined) return mocked;

      const res = await fetch(this.buildUrl(endpoint), {
        method: 'PATCH',
        headers: await this.buildHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include'
      });
      return await this.handleResponse<T>(res);
    } catch (error) {
      this.handleGlobalError(error);
    }
  }

  async delete<T = any>(endpoint: string, body?: any): Promise<T> {
    try {
      const mocked = await this.maybeMock<T>(endpoint, { body });
      if (mocked !== undefined) return mocked;

      const res = await fetch(this.buildUrl(endpoint), {
        method: 'DELETE',
        headers: await this.buildHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include'
      });
      return await this.handleResponse<T>(res);
    } catch (error) {
      this.handleGlobalError(error);
    }
  }

  async upload<T = any>(endpoint: string, formData: FormData): Promise<T> {
    try {
      const token = await this.getAuthToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      // Don't set Content-Type - browser will set it with boundary for FormData

      const res = await fetch(this.buildUrl(endpoint), {
        method: 'POST',
        headers,
        body: formData,
        credentials: 'include'
      });
      return await this.handleResponse<T>(res);
    } catch (error) {
      this.handleGlobalError(error);
    }
  }
}
