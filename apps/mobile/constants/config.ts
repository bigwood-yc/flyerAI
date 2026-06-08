// API base URL — dev: local FastAPI; prod: deployed URL via env var
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8000";
