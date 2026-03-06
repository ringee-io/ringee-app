import { auth } from '@clerk/nextjs/server';
import { ApiClient } from './api';
import { apiMocks } from './api.mocks';

export class ApiServer extends ApiClient {
  constructor() {
    super({
      getAuthToken: async () => {
        try {
          const { getToken } = await auth();
          return await getToken();
        } catch (err) {
          return null;
        }
      },
      mockDelayMs: 0,
      mocks: apiMocks
    });
  }
}

export const apiServer = new ApiServer();
