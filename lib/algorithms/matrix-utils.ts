/**
 * Matrix Utilities for Portfolio Optimization
 * 
 * Lightweight matrix operations for MPT calculations
 * No external dependencies - pure TypeScript
 */

/**
 * Matrix multiplication: A @ B
 */
export function matrixMultiply(A: number[][], B: number[][]): number[][] {
  const rowsA = A.length
  const colsA = A[0].length
  const rowsB = B.length
  const colsB = B[0].length

  if (colsA !== rowsB) {
    throw new Error(`Matrix dimensions mismatch: ${rowsA}x${colsA} @ ${rowsB}x${colsB}`)
  }

  const result: number[][] = Array(rowsA).fill(0).map(() => Array(colsB).fill(0))

  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      for (let k = 0; k < colsA; k++) {
        result[i][j] += A[i][k] * B[k][j]
      }
    }
  }

  return result
}

/**
 * Matrix-vector multiplication: A @ v
 */
export function matrixVectorMultiply(A: number[][], v: number[]): number[] {
  const rows = A.length
  const cols = A[0].length

  if (cols !== v.length) {
    throw new Error(`Matrix-vector dimensions mismatch: ${rows}x${cols} @ ${v.length}`)
  }

  const result: number[] = Array(rows).fill(0)

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[i] += A[i][j] * v[j]
    }
  }

  return result
}

/**
 * Vector dot product: v1 @ v2
 */
export function dotProduct(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) {
    throw new Error(`Vector dimensions mismatch: ${v1.length} vs ${v2.length}`)
  }

  let sum = 0
  for (let i = 0; i < v1.length; i++) {
    sum += v1[i] * v2[i]
  }
  return sum
}

/**
 * Transpose matrix
 */
export function transpose(A: number[][]): number[][] {
  const rows = A.length
  const cols = A[0].length
  const result: number[][] = Array(cols).fill(0).map(() => Array(rows).fill(0))

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = A[i][j]
    }
  }

  return result
}

/**
 * Create identity matrix
 */
export function identity(n: number): number[][] {
  const result: number[][] = Array(n).fill(0).map(() => Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    result[i][i] = 1
  }
  return result
}

/**
 * Matrix addition: A + B
 */
export function matrixAdd(A: number[][], B: number[][]): number[][] {
  const rows = A.length
  const cols = A[0].length

  if (B.length !== rows || B[0].length !== cols) {
    throw new Error(`Matrix dimensions mismatch for addition`)
  }

  const result: number[][] = Array(rows).fill(0).map(() => Array(cols).fill(0))

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[i][j] = A[i][j] + B[i][j]
    }
  }

  return result
}

/**
 * Matrix subtraction: A - B
 */
export function matrixSubtract(A: number[][], B: number[][]): number[][] {
  const rows = A.length
  const cols = A[0].length

  if (B.length !== rows || B[0].length !== cols) {
    throw new Error(`Matrix dimensions mismatch for subtraction`)
  }

  const result: number[][] = Array(rows).fill(0).map(() => Array(cols).fill(0))

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[i][j] = A[i][j] - B[i][j]
    }
  }

  return result
}

/**
 * Scalar multiplication: c * A
 */
export function scalarMultiply(A: number[][], c: number): number[][] {
  return A.map(row => row.map(val => val * c))
}

