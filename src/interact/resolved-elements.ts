import type { ResolvedUiElementContext } from './model.js'

/** Bounded, insertion-ordered handles; repeated observations refresh retention order. */
export class ResolvedElements {
  private readonly elements = new Map<string, ResolvedUiElementContext>()
  constructor(private readonly maximum = 256) {}

  get(id: string) { return this.elements.get(id) }
  clear() { this.elements.clear() }

  remember(id: string, context: ResolvedUiElementContext) {
    if (this.elements.has(id)) this.elements.delete(id)
    this.elements.set(id, context)
    while (this.elements.size > this.maximum) {
      const oldest = this.elements.keys().next().value
      if (!oldest) break
      this.elements.delete(oldest)
    }
  }
}
