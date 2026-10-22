import { z } from "zod";
import { EMPLOYMENT_TYPES } from "@/lib/jobs/types";

const optionalUuid = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed || null;
  })
  .pipe(z.uuid().nullable());

/** Tenant profession id, or a profession_catalog key for a profession not added yet. */
const PROFESSION_REF =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[a-z][a-z0-9_]{1,62})$/i;

const optionalProfessionRef = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed || null;
  })
  .pipe(z.string().regex(PROFESSION_REF, "Choose a profession.").nullable());

const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed || null;
  });

export const workflowMappingInputSchema = z.object({
  id: z.uuid().optional(),
  professionId: optionalProfessionRef,
  specialtyId: optionalUuid,
  employmentType: z.enum(EMPLOYMENT_TYPES),
  location: optionalText,
  locationType: optionalText,
  yearsOfExperience: optionalText,
  workflowId: z.uuid(),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).max(10_000).default(100),
});

export const workflowResolveInputSchema = z.object({
  professionId: optionalUuid,
  specialtyId: optionalUuid,
  employmentType: z.enum(EMPLOYMENT_TYPES),
  location: optionalText,
  locationType: optionalText,
  yearsOfExperience: optionalText,
});
