import type { ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { Api, Model } from '@earendil-works/pi-ai'

export interface ProductionReasoningModelSelection {
  readonly providerId: string
  readonly modelId: string
}

export const PRIMARY_PRODUCTION_REASONING_MODEL: ProductionReasoningModelSelection = Object.freeze({
  providerId: 'zhipu-openapi',
  modelId: 'glm-5.3-flash',
})

export function selectProductionReasoningModel(runtime: ModelRuntime, selection: ProductionReasoningModelSelection = PRIMARY_PRODUCTION_REASONING_MODEL): Model<Api> {
  const model = runtime.getModel(selection.providerId, selection.modelId)
  if (model === undefined) throw new Error(`Configured production reasoning model is unavailable: ${selection.providerId}/${selection.modelId}`)
  return model
}
