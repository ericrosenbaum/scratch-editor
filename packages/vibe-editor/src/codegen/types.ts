// The code-generation boundary. The UI talks to a `CodeGenerator` and never cares
// whether the implementation is a deterministic mock (used today and in tests) or a
// real LLM-backed service (future work). Keeping this interface narrow is what makes
// the chat -> codegen -> runtime loop testable without a model.
import type { Project } from '../model/project'

export type CodeGenScope = 'project' | 'sprite'

export interface CodeGenRequest {
  scope: CodeGenScope
  prompt: string
  /** Target sprite id when scope === 'sprite'. */
  targetId?: string
  /** Full project, so a real generator could use surrounding context. */
  project: Project
}

export interface CodeGenChange {
  targetId: string
  targetName: string
  /** Generated JavaScript that runs against the sprite API. */
  source: string
  /** Human-readable summary generated alongside the code. */
  summary: string
}

export interface CodeGenResult {
  /** Conversational reply shown in the chat transcript. */
  message: string
  /** Zero or more sprite code changes to apply. */
  changes: CodeGenChange[]
}

export interface CodeGenerator {
  generate(req: CodeGenRequest): Promise<CodeGenResult>
}
