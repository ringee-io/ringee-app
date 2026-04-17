import {RingeeContextSchema} from "../utils/types"
import type {RingeeContext} from "../utils/types"
import {ringeeRequest} from "../utils/ringee-api"

export default async function getRingeeContext(): Promise<RingeeContext> {
    try {
        const data = await ringeeRequest<unknown>("/context")
        return RingeeContextSchema.parse(data)
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch Ringee context"
        console.error(`[getRingeeContext] ${message}`)
        throw new Error(message)
    }
}
