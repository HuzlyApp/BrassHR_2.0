import { NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/auth/api-session";
import { resolveEffectiveAdminTenantId } from "@/lib/email-templates/resolve-effective-tenant";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  EMPTY_HIRE_JOURNEY_THEME,
  hireJourneyOverrideForSave,
  parseHireJourneyTheme,
  type HireJourneyThemeOverrides,
} from "@/lib/tenant/hire-journey-theme";

const COMPLETED_FALLBACK = "#FFFFFF";
const STEP_BORDER_FALLBACK = "#E8ECF0";
const COMPLETION_FALLBACK = "#12AA00";

export async function GET() {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const tenantId = await resolveEffectiveAdminTenantId(supabase, {
    userId: auth.userId,
    authUser: auth.authUser,
    godAdmin: auth.godAdmin,
  });
  if (!tenantId) {
    return Response.json({ theme: EMPTY_HIRE_JOURNEY_THEME, tenantId: null });
  }

  const { data, error } = await supabase
    .from("tenants")
    .select("hire_journey_theme")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    theme: parseHireJourneyTheme(data?.hire_journey_theme),
    tenantId,
  });
}

export async function PUT(req: Request) {
  const auth = await requireStaffApiSession();
  if (auth instanceof NextResponse) return auth;

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const tenantId = await resolveEffectiveAdminTenantId(supabase, {
    userId: auth.userId,
    authUser: auth.authUser,
    godAdmin: auth.godAdmin,
  });
  if (!tenantId) {
    return NextResponse.json({ error: "No organization selected. Switch tenant and try again." }, { status: 400 });
  }

  let body: {
    progressBackgroundColor?: string;
    stepperIconColor?: string;
    stepIconColor?: string;
    stepIconBorderColor?: string;
    completionIconColor?: string;
    completedStepBackground?: string;
    stepBorderColor?: string;
    modalButtonColor?: string;
    defaults?: { primaryHex?: string; secondaryHex?: string };
    reset?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const primary = body.defaults?.primaryHex ?? "";
  const secondary = body.defaults?.secondaryHex ?? primary;
  const theme: HireJourneyThemeOverrides = body.reset
    ? EMPTY_HIRE_JOURNEY_THEME
    : {
        progressBackgroundColor: hireJourneyOverrideForSave(body.progressBackgroundColor ?? "", primary),
        stepperIconColor: hireJourneyOverrideForSave(body.stepperIconColor ?? "", primary),
        stepIconColor: hireJourneyOverrideForSave(body.stepIconColor ?? "", secondary),
        stepIconBorderColor: hireJourneyOverrideForSave(body.stepIconBorderColor ?? "", secondary),
        completionIconColor: hireJourneyOverrideForSave(body.completionIconColor ?? "", COMPLETION_FALLBACK),
        completedStepBackground: hireJourneyOverrideForSave(
          body.completedStepBackground ?? "",
          COMPLETED_FALLBACK
        ),
        stepBorderColor: hireJourneyOverrideForSave(body.stepBorderColor ?? "", STEP_BORDER_FALLBACK),
        modalButtonColor: hireJourneyOverrideForSave(body.modalButtonColor ?? "", primary),
      };

  const { error } = await supabase
    .from("tenants")
    .update({ hire_journey_theme: theme, updated_at: new Date().toISOString() })
    .eq("id", tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, theme });
}
