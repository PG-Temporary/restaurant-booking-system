export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const unauthorized = () => new AppError(401, "UNAUTHORIZED", "Please sign in.");
export const forbidden = (msg = "You do not have access to this resource.") => new AppError(403, "FORBIDDEN", msg);
export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found.`);
export const badRequest = (msg: string, details?: unknown) => new AppError(400, "BAD_REQUEST", msg, details);
export const conflict = (code: string, msg: string, details?: unknown) => new AppError(409, code, msg, details);
export const slotUnavailable = () =>
  conflict("SLOT_UNAVAILABLE", "That time is no longer available. Please choose another slot.");
