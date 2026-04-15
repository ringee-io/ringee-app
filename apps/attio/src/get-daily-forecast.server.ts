import {z} from "zod"

/**
 * Weather Forecast Schemas
 *
 * Zod validation schemas for weather forecast API requests and responses.
 *
 * @see https://open-meteo.com/en/docs#api_documentation
 */

export const TemperatureUnitSchema = z.enum(["celsius", "fahrenheit"])

export type TemperatureUnit = z.infer<typeof TemperatureUnitSchema>

const DailyUnitsSchema = z.object({
    time: z.string(),
    weather_code: z.string(),
    precipitation_sum: z.string(),
    precipitation_probability_max: z.string(),
    temperature_2m_max: z.string(),
    temperature_2m_min: z.string(),
    wind_speed_10m_max: z.string(),
})

const DailyForecastSchema = z.object({
    time: z.array(z.number()),
    weather_code: z.array(z.number()),
    precipitation_sum: z.array(z.number()),
    precipitation_probability_max: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    wind_speed_10m_max: z.array(z.number()),
})

const DailyForecastResponseSchema = z.object({
    latitude: z.number(),
    longitude: z.number(),
    timezone: z.string(),
    daily_units: DailyUnitsSchema,
    daily: DailyForecastSchema,
})

export type DailyForecastResponse = z.infer<typeof DailyForecastResponseSchema>

function buildUrl(
    baseUrl: string,
    params?: Record<string, string | number | boolean | undefined | null | string[] | number[]>
): string {
    if (!params || Object.keys(params).length === 0) {
        return baseUrl
    }

    const url = new URL(baseUrl)

    for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
            url.searchParams.append(key, value.join(","))
        } else if (value !== null && value !== undefined) {
            url.searchParams.append(key, String(value))
        }
    }

    return url.toString()
}

/**
 * Handles non-OK API responses by parsing the error and throwing an appropriate error.
 * Supports Open-Meteo's error format: `{error: true, reason: "..."}`
 *
 * @see https://open-meteo.com/en/docs#errors
 */
async function handleApiError(response: Response): Promise<never> {
    const errorBody = await response.json().catch(() => null)
    const apiReason = errorBody?.error && errorBody?.reason ? errorBody.reason : null

    if (response.status === 429) {
        console.error("[Open Meteo API] Rate limit exceeded")
        throw new Error("Weather service rate limit exceeded. Please try again later.")
    }

    if (response.status >= 500) {
        console.error(`[Open Meteo API] Service unavailable (${response.status})`)
        throw new Error("Weather service temporarily unavailable. Please try again later.")
    }

    if (apiReason) {
        console.error(`[Open Meteo API] API error: ${apiReason}`)
        throw new Error(`Weather API error: ${apiReason}`)
    }

    console.error(`[Open Meteo API] HTTP error: ${response.status}`)
    throw new Error(`Weather service error (${response.status})`)
}

/**
 * Fetches 7-day weather forecast from Open-Meteo API.
 *
 * @see https://open-meteo.com/en/docs
 */
export default async function getDailyForecast(
    latitude: number,
    longitude: number,
    temperature_unit: TemperatureUnit
): Promise<DailyForecastResponse> {
    try {
        const url = buildUrl("https://api.open-meteo.com/v1/forecast", {
            latitude,
            longitude,
            daily: [
                "weather_code",
                "precipitation_sum",
                "precipitation_probability_max",
                "temperature_2m_max",
                "temperature_2m_min",
                "wind_speed_10m_max",
            ],
            format: "json",
            timeformat: "unixtime",
            temperature_unit: temperature_unit === "celsius" ? null : temperature_unit,
        })

        const response = await fetch(url, {
            method: "GET",
            headers: {
                Accept: "application/json",
            },
        })

        if (!response.ok) {
            await handleApiError(response)
        }

        const data = await response.json()
        const validatedResponse = DailyForecastResponseSchema.parse(data)

        console.log(`[Weather Forecast] Successfully fetched forecast data`)

        return validatedResponse
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.error(`[Weather Forecast Error] ${errorMessage}`)
        throw new Error(`Failed to fetch weather forecast: ${errorMessage}`)
    }
}
