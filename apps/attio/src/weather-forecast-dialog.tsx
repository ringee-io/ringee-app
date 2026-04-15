import {
    Badge,
    Divider,
    Link,
    LoadingState,
    Section,
    Table,
    Typography,
    useAsyncCache,
    useQuery,
} from "attio/client"
import {Suspense} from "react"
import getCompanyLocationById from "./get-company-location-by-id.graphql"
import type {TemperatureUnit} from "./get-daily-forecast.server"
import getDailyForecast from "./get-daily-forecast.server"
import getPersonLocationById from "./get-person-location-by-id.graphql"

/**
 * @see https://open-meteo.com/en/docs#weather_variable_documentation
 */
const WMO_CODES = new Map<number, {description: string; emoji: string}>([
    [0, {description: "Clear sky", emoji: "☀️"}],
    [1, {description: "Mainly clear", emoji: "🌤️"}],
    [2, {description: "Partly cloudy", emoji: "⛅"}],
    [3, {description: "Overcast", emoji: "☁️"}],
    [45, {description: "Fog", emoji: "🌫️"}],
    [48, {description: "Depositing rime fog", emoji: "🌫️"}],
    [51, {description: "Light drizzle", emoji: "🌦️"}],
    [53, {description: "Moderate drizzle", emoji: "🌦️"}],
    [55, {description: "Dense drizzle", emoji: "🌦️"}],
    [56, {description: "Light freezing drizzle", emoji: "🧊"}],
    [57, {description: "Dense freezing drizzle", emoji: "🧊"}],
    [61, {description: "Slight rain", emoji: "🌧️"}],
    [63, {description: "Moderate rain", emoji: "🌧️"}],
    [65, {description: "Heavy rain", emoji: "🌧️"}],
    [66, {description: "Light freezing rain", emoji: "🧊"}],
    [67, {description: "Heavy freezing rain", emoji: "🧊"}],
    [71, {description: "Slight snow fall", emoji: "❄️"}],
    [73, {description: "Moderate snow fall", emoji: "❄️"}],
    [75, {description: "Heavy snow fall", emoji: "❄️"}],
    [77, {description: "Snow grains", emoji: "🌨️"}],
    [80, {description: "Slight rain showers", emoji: "🌦️"}],
    [81, {description: "Moderate rain showers", emoji: "🌧️"}],
    [82, {description: "Violent rain showers", emoji: "⛈️"}],
    [85, {description: "Slight snow showers", emoji: "🌨️"}],
    [86, {description: "Heavy snow showers", emoji: "❄️"}],
    [95, {description: "Thunderstorm", emoji: "🌩️"}],
    [96, {description: "Thunderstorm with slight hail", emoji: "⛈️"}],
    [99, {description: "Thunderstorm with heavy hail", emoji: "⛈️"}],
])

interface LocationData {
    latitude: number
    longitude: number
    locality: string | null
    country: string | null
}

interface RawLocation {
    latitude?: string | number | null
    longitude?: string | number | null
    locality?: string | null
    country?: string | null
}

function extractLocationData(
    primaryLocation?: RawLocation | null,
    fallbackLocation?: RawLocation | null
): LocationData | null {
    const hasValidPrimary = primaryLocation?.latitude != null && primaryLocation?.longitude != null
    const hasValidFallback =
        fallbackLocation?.latitude != null && fallbackLocation?.longitude != null

    const location = hasValidPrimary ? primaryLocation : hasValidFallback ? fallbackLocation : null

    if (!location) {
        return null
    }

    return {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        locality: location.locality != null ? location.locality : null,
        country: location.country != null ? location.country : null,
    }
}

function formatLocationString(locality: string | null, country: string | null): string | null {
    if (locality && country) {
        return `${locality}, ${country}`
    }
    if (locality) {
        return locality
    }
    if (country) {
        return country
    }
    return null
}

function getTemperatureBadgeColor(
    temperature: number,
    unit: TemperatureUnit
): React.ComponentProps<typeof Badge>["color"] {
    const tempInCelsius = unit === "fahrenheit" ? ((temperature - 32) * 5) / 9 : temperature

    if (tempInCelsius <= -20) return "cyan"
    if (tempInCelsius <= -10) return "blue"
    if (tempInCelsius <= 0) return "grey"
    if (tempInCelsius <= 10) return "lime"
    if (tempInCelsius <= 20) return "green"
    if (tempInCelsius <= 25) return "yellow"
    if (tempInCelsius <= 30) return "amber"
    if (tempInCelsius <= 35) return "orange"
    return "red"
}

function formatTemperature(temperature: number, unit: TemperatureUnit): string {
    return `${temperature} °${unit[0].toUpperCase()}`
}

function TemperatureBadge({temperature, unit}: {temperature: number; unit: TemperatureUnit}) {
    return (
        <Badge color={getTemperatureBadgeColor(temperature, unit)}>
            {formatTemperature(temperature, unit)}
        </Badge>
    )
}

interface RecordLocation extends LocationData {
    location: string
}

function toRecordLocation(locationData: LocationData): RecordLocation {
    const formattedLocation = formatLocationString(locationData.locality, locationData.country)
    const location = formattedLocation ?? `${locationData.latitude}, ${locationData.longitude}`

    return {
        ...locationData,
        location,
    }
}

function PersonForecast({recordId}: {recordId: string}) {
    const {person} = useQuery(getPersonLocationById, {recordId})
    const locationData = extractLocationData(
        person?.primary_location,
        person?.company?.primary_location
    )

    return <ForecastResult locationData={locationData} />
}

function CompanyForecast({recordId}: {recordId: string}) {
    const {company} = useQuery(getCompanyLocationById, {recordId})
    const locationData = extractLocationData(company?.primary_location)

    return <ForecastResult locationData={locationData} />
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const
const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
] as const

function formatDate(timestamp: number): string {
    const date = new Date(timestamp * 1000)
    const day = DAYS[date.getUTCDay()]
    const month = MONTHS[date.getUTCMonth()]
    return `${day}, ${date.getUTCDate()} ${month}`
}

function ForecastTableHeader() {
    return (
        <Table.Header>
            <Table.HeaderCell>Date</Table.HeaderCell>
            <Table.HeaderCell>Weather</Table.HeaderCell>
            <Table.HeaderCell>Temp. (Max/Min)</Table.HeaderCell>
            <Table.HeaderCell>Precipitation</Table.HeaderCell>
            <Table.HeaderCell>Wind</Table.HeaderCell>
        </Table.Header>
    )
}

function ForecastFooter() {
    return (
        <>
            <Divider />
            <Typography.Body>
                Weather data provided by <Link href="https://open-meteo.com">open-meteo.com</Link>
            </Typography.Body>
        </>
    )
}

function ForecastContent({
    latitude,
    longitude,
    location,
}: {
    latitude: number
    longitude: number
    location: string
}) {
    const temperatureUnit: TemperatureUnit = "fahrenheit"

    const {
        values: {forecast},
    } = useAsyncCache({
        forecast: [getDailyForecast, latitude, longitude, temperatureUnit],
    })

    const locationTitle = `Location: ${location}`

    return (
        <Section title={locationTitle}>
            <Table>
                <ForecastTableHeader />
                <Table.Body>
                    {forecast.daily.time.map((timestamp: number, index: number) => {
                        const weatherCode = forecast.daily.weather_code[index]
                        const tempMax = Math.round(forecast.daily.temperature_2m_max[index])
                        const tempMin = Math.round(forecast.daily.temperature_2m_min[index])
                        const precipitation = forecast.daily.precipitation_sum[index]
                        const precipProb = forecast.daily.precipitation_probability_max[index]
                        const windSpeed = Math.round(forecast.daily.wind_speed_10m_max[index])

                        const weatherInfo = WMO_CODES.get(weatherCode)
                        const weatherEmoji = weatherInfo?.emoji || "🌈"
                        const weatherDesc = weatherInfo?.description || "Unknown"

                        return (
                            <Table.Row key={timestamp}>
                                <Table.Cell>{formatDate(timestamp)}</Table.Cell>
                                <Table.Cell>
                                    {weatherEmoji} {weatherDesc}
                                </Table.Cell>
                                <Table.Cell>
                                    <TemperatureBadge
                                        temperature={tempMax}
                                        unit={temperatureUnit}
                                    />
                                    <TemperatureBadge
                                        temperature={tempMin}
                                        unit={temperatureUnit}
                                    />
                                </Table.Cell>
                                <Table.Cell>
                                    {precipitation.toFixed(1)}{" "}
                                    {forecast.daily_units.precipitation_sum} ({precipProb}%)
                                </Table.Cell>
                                <Table.Cell>
                                    {windSpeed} {forecast.daily_units.wind_speed_10m_max}
                                </Table.Cell>
                            </Table.Row>
                        )
                    })}
                </Table.Body>
            </Table>
            <ForecastFooter />
        </Section>
    )
}

function ForecastResult({locationData}: {locationData: LocationData | null}) {
    if (!locationData) {
        return (
            <Section title="Weather Forecast">No location data available for this record.</Section>
        )
    }

    const recordLocation = toRecordLocation(locationData)

    return (
        <Suspense fallback={<LoadingState />}>
            <ForecastContent
                latitude={recordLocation.latitude}
                longitude={recordLocation.longitude}
                location={recordLocation.location}
            />
        </Suspense>
    )
}

export default function WeatherForecastDialog({
    object,
    recordId,
}: {
    object: string
    recordId: string
}) {
    if (object === "people") {
        return <PersonForecast recordId={recordId} />
    }

    return <CompanyForecast recordId={recordId} />
}
