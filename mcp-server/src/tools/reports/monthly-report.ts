import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';

export interface MonthlyReportInput {
  month: string; // YYYY-MM
}

export async function monthlyReportHandler(input: MonthlyReportInput, ctx: ToolContext): Promise<ToolResult> {
  const r = await ctx.backend.request({
    method: 'GET',
    path: '/api/reports/monthly',
    bearer: ctx.bearer,
    correlationId: ctx.correlationId,
    query: { month: input.month },
  });
  if (r.status >= 400) {
    const err = mapHttpToMcp({ status: r.status, body: r.body });
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(r.body) }] };
}
