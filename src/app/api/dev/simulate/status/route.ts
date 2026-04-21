// GET /api/dev/simulate/status — dev-only. Returns current simulation state.
import { NextResponse } from 'next/server';
import { simulationGuard } from '../_guard';
import { simulationOrchestrator } from '@/services/dev-simulation/orchestrator';

export async function GET() {
  const guard = simulationGuard();
  if (guard) return guard;
  return NextResponse.json(simulationOrchestrator.status());
}
