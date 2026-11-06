export function retryFile<T>(operation: () => Promise<T>): Promise<T>
export function copyCandidateFile(source: string, destination: string): Promise<void>
