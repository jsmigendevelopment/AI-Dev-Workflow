// Public env for tests: no Clerk key (sign-in off) and a fake server URL. Tests inject their own API.
process.env.EXPO_PUBLIC_API_URL = 'https://api.test'
