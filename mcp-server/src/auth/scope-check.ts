export interface ScopeError {
  error: 'insufficient_scope';
  requiredScope: string;
  message: string;
}

export function hasScope(tokenScope: string, requiredScope: string): ScopeError | null {
  const scopes = new Set(tokenScope.split(/\s+/).filter(Boolean));
  if (scopes.has(requiredScope)) return null;
  return {
    error: 'insufficient_scope',
    requiredScope,
    message: `This tool requires scope '${requiredScope}'. Re-authorize the connection with that scope to use it.`,
  };
}
