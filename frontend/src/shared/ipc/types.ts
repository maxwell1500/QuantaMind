export type AppErrorKind =
  | "validation"
  | "not_found"
  | "inference"
  | "internal";

export type AppError = {
  kind: AppErrorKind;
  message: string;
};
