import { ApiResponse } from './types'

const API_BASE_URL = '/api'
const TOKEN_KEY = 'auth_token'

/**
 * Standardized API Client
 * Centralizes duplicate logic for fetch, auth headers, and error handling.
 */
class ApiClient {
    private getHeaders(customHeaders: Record<string, string> = {}): HeadersInit {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...customHeaders,
        }

        if (typeof window !== 'undefined') {
            const token = localStorage.getItem(TOKEN_KEY)
            if (token) {
                headers['Authorization'] = `Bearer ${token}`
            }
        }

        return headers
    }

    private async handleResponse<T>(response: Response): Promise<T> {
        if (response.status === 401) {
            if (typeof window !== 'undefined') {
                // Optional: Dispatch a global event or clear storage if needed
                // localStorage.removeItem(TOKEN_KEY)
                // window.location.href = '/login'
            }
        }

        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
            const errorMessage = data.error || data.message || `API Error: ${response.statusText}`
            throw new Error(errorMessage)
        }

        return data as T
    }

    /**
     * GET Request
     */
    async get<T>(endpoint: string, headers: Record<string, string> = {}): Promise<T> {
        const url = endpoint.startsWith('/') ? `${API_BASE_URL}${endpoint}` : endpoint
        const response = await fetch(url, {
            method: 'GET',
            headers: this.getHeaders(headers),
        })
        return this.handleResponse<T>(response)
    }

    /**
     * POST Request
     */
    async post<T>(endpoint: string, body: any, headers: Record<string, string> = {}): Promise<T> {
        const url = endpoint.startsWith('/') ? `${API_BASE_URL}${endpoint}` : endpoint
        const response = await fetch(url, {
            method: 'POST',
            headers: this.getHeaders(headers),
            body: JSON.stringify(body),
        })
        return this.handleResponse<T>(response)
    }

    /**
     * PATCH Request
     */
    async patch<T>(endpoint: string, body: any, headers: Record<string, string> = {}): Promise<T> {
        const url = endpoint.startsWith('/') ? `${API_BASE_URL}${endpoint}` : endpoint
        const response = await fetch(url, {
            method: 'PATCH',
            headers: this.getHeaders(headers),
            body: JSON.stringify(body),
        })
        return this.handleResponse<T>(response)
    }

    /**
     * DELETE Request
     */
    async delete<T>(endpoint: string, headers: Record<string, string> = {}): Promise<T> {
        const url = endpoint.startsWith('/') ? `${API_BASE_URL}${endpoint}` : endpoint
        const response = await fetch(url, {
            method: 'DELETE',
            headers: this.getHeaders(headers),
        })
        return this.handleResponse<T>(response)
    }
}

export const apiClient = new ApiClient()
