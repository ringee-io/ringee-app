import {ringeeRequest} from "../utils/ringee-api"
import {ValidateResponseSchema} from "../utils/types"
import type {ValidateResponse} from "../utils/types"

export default async function validateConnection(): Promise<ValidateResponse> {
    try {
        const data = await ringeeRequest<unknown>("/validate", {method: "POST"})
        return ValidateResponseSchema.parse(data)
    } catch (error) {
        const message = error instanceof Error ? error.message : "Connection validation failed"
        console.error(`[validateConnection] ${message}`)
        throw new Error(message)
    }
}
