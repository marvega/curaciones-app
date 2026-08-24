import { TOOLS, type ToolContext } from './catalog.js';
import { hasScope } from '../auth/scope-check.js';

/**
 * Minimal subset of the SDK's McpServer surface that registerTools requires.
 * We use `registerTool` (the non-deprecated API) which accepts a config
 * object containing description, inputSchema, and annotations.
 */
export interface RegisterDeps {
  server: { registerTool: (name: string, config: any, handler: any) => void };
  getContext: () => ToolContext;
}

export function registerTools(deps: RegisterDeps): void {
  for (const def of TOOLS) {
    deps.server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: {
          readOnlyHint: def.readOnly,
          destructiveHint: def.destructive,
        },
      },
      async (input: unknown) => {
        const ctx = deps.getContext();

        // Scope check (skip for whoami where requiredScope is empty)
        if (def.requiredScope) {
          const scopeErr = hasScope(ctx.token.scope, def.requiredScope);
          if (scopeErr) {
            return {
              isError: true,
              content: [{ type: 'text', text: scopeErr.message }],
            };
          }
        }

        try {
          return await def.handler(input, ctx);
        } catch (e) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Tool error: ${(e as Error).message}` }],
          };
        }
      },
    );
  }
}
