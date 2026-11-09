/** Validate worker data before returning it through Remote. */
import type { ManagementValue, PythonManagementResponse } from '../shared/types.js'

/**
 * Detach data, omitting absent object fields while rejecting unsupported values.
 * @param value - Worker response data.
 * @returns JSON data accepted by the Remote codec.
 */
function json(value: unknown): ManagementValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map(json)
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, json(item)]))
  }
  throw new TypeError('Python management returned unsupported response data.')
}

/**
 * Validate a worker response object.
 * @param value - Raw action response.
 * @returns Detached JSON response fields.
 */
export function managementResponse(value: Record<string, unknown>): PythonManagementResponse {
  if (typeof value.requestId !== 'string') throw new TypeError('Python management returned no request identifier.')
  return { ...Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, json(item)])), requestId: value.requestId }
}
