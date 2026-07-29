import type { RunContext } from '@/lib/agents/context';
import {
  renderBusiness,
  renderMemory,
  renderPreviousOutputs,
} from '@/lib/agents/context';

/**
 * Shared prompt preamble for production steps.
 *
 * Mirrors the preamble the original capabilities use so an agent's memory and
 * business context reach every step, including the new ones.
 */
export function baseProductionContext(ctx: RunContext): string {
  return [
    renderBusiness(ctx.business),
    '',
    renderMemory(ctx.memory),
    '',
    ctx.mission ? `Mission: ${ctx.mission.title}\nObjective: ${ctx.mission.objective}` : '',
    '',
    renderPreviousOutputs(ctx.previousOutputs),
    '',
    `Task: ${ctx.task.title}`,
    ctx.task.description ? `Detail: ${ctx.task.description}` : '',
    typeof ctx.task.input.operator_feedback === 'string' &&
    ctx.task.input.operator_feedback.trim().length > 0
      ? `\nThe operator reviewed a previous attempt and asked for changes:\n"${ctx.task.input.operator_feedback}"\nAddress this directly.`
      : '',
  ]
    .filter((part) => part.trim().length > 0)
    .join('\n');
}
