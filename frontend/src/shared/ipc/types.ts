export type AppErrorKind =
  | "validation"
  | "not_found"
  | "inference"
  | "io"
  | "internal";

export type AppError = {
  kind: AppErrorKind;
  message: string;
};

export type StoredPrompt = {
  model: string;
  prompt: string;
};

export type HealthStatus = {
  available: boolean;
  version: string | null;
};
