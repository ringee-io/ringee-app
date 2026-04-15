/**
 * Show Weather Forecast - Record Action
 *
 * This file defines a custom record action that displays a 7-day weather forecast
 * for people and company records in Attio. The action displays a dialog that:
 *
 * 1. **Queries location data** from Attio's GraphQL API using hooks
 * 2. **Fetches weather forecast** from Open-Meteo API via server function
 * 3. **Displays 7-day forecast** with temperature, precipitation, and wind speed
 *
 * @see https://docs.attio.com/sdk/entry-points/record-action - Record Actions documentation
 * @see https://docs.attio.com/sdk/dialogs/show-dialog - showDialog documentation
 */

import type {App} from "attio"
import {showDialog} from "attio/client"
import WeatherForecastDialog from "./weather-forecast-dialog"

export const showWeatherForecast: App.Record.Action = {
    id: "show-weather-forecast",
    label: "Show weather forecast",
    icon: "Sun",
    onTrigger: async ({recordId, object}) => {
        await showDialog({
            title: "7-Day Weather Forecast",
            Dialog: () => {
                return <WeatherForecastDialog object={object} recordId={recordId} />
            },
        })
    },
    objects: ["people", "companies"],
}
