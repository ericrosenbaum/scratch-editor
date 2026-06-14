// A deterministic, dependency-free stand-in for a real code generator.
//
// It maps keywords in the prompt to small, self-contained behavior snippets that run
// against the sprite API, and writes a matching plain-language summary. Because it is
// fully deterministic, the chat -> codegen -> runtime loop can be integration-tested
// without any model. Swapping in a real generator later means implementing the same
// `CodeGenerator` interface — nothing else in the app needs to change.
import { flattenSprites, findNode, isSprite } from '../model/project'
import type { CodeGenChange, CodeGenRequest, CodeGenResult, CodeGenerator } from './types'

interface Behavior {
  /** Keywords that select this behavior. */
  test: RegExp
  /** A self-contained `{ ... }` block so multiple behaviors can be concatenated without clashing. */
  snippet: (prompt: string) => string
  summary: string
}

const firstNumber = (prompt: string, fallback: number): number => {
  const m = prompt.match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : fallback
}

const sayText = (prompt: string): string => {
  const m = prompt.match(/say\s+(.+)/i)
  const raw = m ? m[1].trim().replace(/^["']|["']$/g, '') : 'Hello!'
  return raw.slice(0, 60)
}

const BEHAVIORS: Behavior[] = [
  {
    test: /spin|rotate|twirl/i,
    snippet: (prompt) => {
      const speed = firstNumber(prompt, /slow/i.test(prompt) ? 2 : /fast/i.test(prompt) ? 9 : 4)
      return `{\n    // spin clockwise forever\n    api.onFrame(() => api.turn(${speed}));\n}`
    },
    summary: 'Spins clockwise continuously.',
  },
  {
    test: /follow|chase|track/i,
    snippet: () =>
      `{\n    // follow the mouse pointer\n    api.onFrame(() => {\n        api.pointTowards(api.mouseX(), api.mouseY());\n        api.move(4);\n    });\n}`,
    summary: 'Follows the mouse pointer around the stage.',
  },
  {
    test: /arrow|wasd|keys?|control/i,
    snippet: () =>
      `{\n    // drive with the arrow keys\n    api.onKey('ArrowRight', () => api.changeX(10));\n    api.onKey('ArrowLeft', () => api.changeX(-10));\n    api.onKey('ArrowUp', () => api.changeY(10));\n    api.onKey('ArrowDown', () => api.changeY(-10));\n}`,
    summary: 'Moves with the arrow keys.',
  },
  {
    test: /bounce|walk|glide|slide|move|wander/i,
    snippet: (prompt) => {
      const speed = firstNumber(prompt, 3)
      return `{\n    // glide forward, bouncing off the edges\n    api.onFrame(() => {\n        api.move(${speed});\n        api.ifOnEdgeBounce();\n    });\n}`
    },
    summary: 'Glides forward and bounces off the edges.',
  },
  {
    test: /grow|bigger|pulse|breathe|throb|beat/i,
    snippet: () =>
      `{\n    // pulse bigger and smaller\n    let t = 0;\n    api.onFrame((dt) => {\n        t += dt;\n        api.setSize(100 + Math.sin(t * 3) * 25);\n    });\n}`,
    summary: 'Pulses bigger and smaller.',
  },
  {
    test: /shrink|smaller|tiny/i,
    snippet: () => `{\n    // start small\n    api.onStart(() => api.setSize(60));\n}`,
    summary: 'Starts at a smaller size.',
  },
  {
    test: /say|hello|hi|talk|greet/i,
    snippet: (prompt) =>
      `{\n    // say something when clicked\n    api.onClick(() => api.say(${JSON.stringify(sayText(prompt))}, 2));\n}`,
    summary: 'Says a message for 2 seconds when clicked.',
  },
]

const FALLBACK: Behavior = {
  test: /.*/,
  snippet: () =>
    `{\n    // gentle bobbing motion\n    let t = 0;\n    let startY = 0;\n    api.onStart(() => {\n        startY = api.getY();\n    });\n    api.onFrame((dt) => {\n        t += dt;\n        api.setY(startY + Math.sin(t * 2) * 12);\n    });\n}`,
  summary:
    'Bobs gently up and down (a default behavior — try mentioning spin, move, grow, follow the mouse, the arrow keys, or "say ...").',
}

const buildBehavior = (prompt: string): { source: string; summaryLines: string[] } => {
  const matched = BEHAVIORS.filter((behavior) => behavior.test.test(prompt))
  const chosen = matched.length > 0 ? matched : [FALLBACK]
  const source = chosen.map((behavior) => behavior.snippet(prompt)).join('\n\n')
  return { source, summaryLines: chosen.map((behavior) => behavior.summary) }
}

export interface MockCodeGeneratorOptions {
  /** Optional artificial latency (ms) to mimic a real request. Defaults to 0. */
  latencyMs?: number
}

export class MockCodeGenerator implements CodeGenerator {
  constructor(private options: MockCodeGeneratorOptions = {}) {}

  async generate(req: CodeGenRequest): Promise<CodeGenResult> {
    if (this.options.latencyMs) {
      await new Promise((resolve) => setTimeout(resolve, this.options.latencyMs))
    }

    const targets =
      req.scope === 'project'
        ? flattenSprites(req.project.roots)
        : (() => {
            if (!req.targetId) return []
            const node = findNode(req.project.roots, req.targetId)
            return node && isSprite(node) ? [node] : []
          })()

    if (targets.length === 0) {
      return {
        message:
          req.scope === 'sprite'
            ? 'Select a sprite first, then tell me what it should do.'
            : 'There are no sprites yet — add one and try again.',
        changes: [],
      }
    }

    const { source, summaryLines } = buildBehavior(req.prompt)
    const summary = summaryLines.join('\n')
    const changes: CodeGenChange[] = targets.map((target) => ({
      targetId: target.id,
      targetName: target.name,
      source,
      summary,
    }))

    const names = targets.map((t) => t.name).join(', ')
    const message =
      req.scope === 'project'
        ? `Done! Applied this behavior to ${targets.length} sprite${targets.length === 1 ? '' : 's'} (${names}):\n${summary}`
        : `Done! Updated ${names}:\n${summary}`

    return { message, changes }
  }
}
