/**
 * ****************************************************
 * THIS FILE IS AUTO-GENERATED AT DEVELOPMENT TIME.
 *
 * DO NOT EDIT DIRECTLY OR COMMIT IT TO SOURCE CONTROL.
 * ****************************************************
 */
import { Query } from "attio/client";

type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };

type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
};

declare module "./get-person-location-by-id.graphql" {
  export type GetPersonLocationByIdQueryVariables = Exact<{
    recordId: Scalars["String"]["input"];
  }>;

  export type GetPersonLocationByIdQuery = {
    person: {
      primary_location: {
        latitude: string | null;
        longitude: string | null;
        country: string | null;
        locality: string | null;
      } | null;
      company: {
        name: string | null;
        primary_location: {
          latitude: string | null;
          longitude: string | null;
          country: string | null;
          locality: string | null;
        } | null;
      } | null;
    } | null;
  };

  const value: Query<
    GetPersonLocationByIdQueryVariables,
    GetPersonLocationByIdQuery
  >;
  export default value;
}
