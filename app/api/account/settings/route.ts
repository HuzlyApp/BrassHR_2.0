import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { EASTERN_TIME_ZONE } from "@/lib/datetime/eastern"
import { isActiveReferenceTimezone } from "@/lib/account/reference-timezones"
import { fetchAccountData, syncAccountChecklist } from "@/lib/account/fetch-account-data"
import { formatApiError } from "@/lib/api/format-api-error"
import { isStaffRole, parseAppRole } from "@/lib/auth/app-role"
import { authorizeStaffHttpAccess } from "@/lib/auth/module-access.server"
import { createClient } from "@/lib/supabase/server"
import { ONBOARDING_TENANT_SLUG_COOKIE } from "@/lib/tenant/constants"

export const runtime = "nodejs"

type PreferencesBody = {
  timezone?: string
  language?: string
  date_format?: string
  theme?: string
  email_notifications?: boolean
  sms_notifications?: boolean
  push_notifications?: boolean
  marketing_emails?: boolean
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) throw authError
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const role = parseAppRole((user.app_metadata as { role?: unknown } | undefined)?.role)
    if (role && isStaffRole(role)) {
      const jar = await cookies()
      const decision = await authorizeStaffHttpAccess({
        user,
        pathname: "/api/account/settings",
        method: "PATCH",
        tenantSlug: jar.get(ONBOARDING_TENANT_SLUG_COOKIE)?.value ?? null,
      })
      if (!decision.ok && decision.code !== "not_staff") {
        return NextResponse.json({ error: decision.error, detail: decision.detail }, { status: decision.status })
      }
    }

    const body = (await req.json()) as PreferencesBody
    const timezone = EASTERN_TIME_ZONE

    const timezoneAllowed = await isActiveReferenceTimezone(supabase, timezone)
    if (!timezoneAllowed) {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 })
    }

    const accountData = await fetchAccountData(supabase)
    const current = accountData.settings

    const nextSettings = {
      user_id: user.id,
      timezone,
      language: body.language ?? current?.language ?? "en",
      date_format: body.date_format ?? current?.date_format ?? "MM/DD/YYYY",
      theme: body.theme ?? current?.theme ?? "system",
      email_notifications: body.email_notifications ?? current?.email_notifications ?? true,
      sms_notifications: body.sms_notifications ?? current?.sms_notifications ?? false,
      push_notifications: body.push_notifications ?? current?.push_notifications ?? true,
      marketing_emails: body.marketing_emails ?? current?.marketing_emails ?? false,
      updated_at: new Date().toISOString(),
    }

    const { data: savedSettings, error: upsertError } = await supabase
      .from("account_settings")
      .upsert(nextSettings)
      .select("*")
      .single()

    if (upsertError) throw upsertError

    await syncAccountChecklist(supabase, {
      user,
      profile: accountData.profile,
      organization: accountData.organization,
      settings: savedSettings,
      checklist: accountData.checklist,
    })

    return NextResponse.json({ settings: savedSettings })
  } catch (err) {
    console.error("[account/settings PATCH]", err)
    return NextResponse.json({ error: formatApiError(err) }, { status: 500 })
  }
}
