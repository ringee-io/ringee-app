import {z} from "zod"
import {CallerIdEntrySchema} from "../utils/types"
import type {CallerIdEntry} from "../utils/types"
import {ringeeRequest} from "../utils/ringee-api"

const ResponseSchema = z.array(CallerIdEntrySchema)

export default async function getCallerIds(): Promise<CallerIdEntry[]> {
    try {
        const data = await ringeeRequest<unknown>("/caller-ids")
        return ResponseSchema.parse(data)
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch caller IDs"
        console.error(`[getCallerIds] ${message}`)
        throw new Error(message)
    }
}
