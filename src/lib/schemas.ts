import { z } from "zod";
import { isValidDateString, isValidTimeString, isValidTimeZone } from "./time.ts";

export const dateStr = z.string().refine(isValidDateString, "Expected a valid date (YYYY-MM-DD)");
export const timeStr = z.string().refine(isValidTimeString, "Expected a time (HH:mm)");
export const isoInstant = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s));
export const partySizeSchema = z.coerce.number().int().min(1).max(50);
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const confirmationCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{8}$/, "Invalid confirmation code");

export const guestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  phone: z.string().trim().min(5).max(30),
});

export const emptySchema = z.object({});

export const registerSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("DINER"),
    name: z.string().trim().min(1).max(100),
    email: emailSchema,
    password: z.string().min(8).max(200),
  }),
  z.object({
    role: z.literal("OWNER"),
    name: z.string().trim().min(1).max(100),
    email: emailSchema,
    password: z.string().min(8).max(200),
    restaurantName: z.string().trim().min(1).max(120),
  }),
]);

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

const hoursEntry = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  opensAt: timeStr,
  closesAt: timeStr,
});

export const restaurantUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  address: z.string().trim().max(200).default(""),
  city: z.string().trim().min(1).max(100),
  postcode: z.string().trim().min(2).max(12),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  timezone: z.string().refine(isValidTimeZone, "Unknown IANA timezone"),
  slotLengthMinutes: z.number().int().min(15).max(480),
  slotIntervalMinutes: z.number().int().min(5).max(240),
  leadTimeMinutes: z.number().int().min(0).max(60 * 24 * 14),
  maxPartySize: z.number().int().min(1).max(50),
  openingHours: z.array(hoursEntry).max(40),
});

export const tableCreateSchema = z.object({
  name: z.string().trim().min(1).max(50),
  capacity: z.number().int().min(1).max(50),
});
export const tableUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    capacity: z.number().int().min(1).max(50),
    active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const reservationStatusSchema = z.enum(["CONFIRMED", "SEATED", "COMPLETED", "NO_SHOW", "CANCELLED"]);
