"use client"

import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes"
import { applicationPath } from "@/lib/tenant/with-tenant"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { getApplicantSupabaseClient } from "@/lib/supabase-applicant-browser"
import { ensureApplicantWorker } from "@/lib/onboarding/ensure-applicant-worker"
import { getWorkerSessionContext } from "@/lib/onboarding-worker-pk"
import OnboardingStepper from "@/app/components/OnboardingStepper"
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider"
import { useOnboardingStepNav } from "@/lib/onboarding/use-onboarding-step-nav"
import {
  persistStepProgress,
  useMarkStepInProgressIfPending,
} from "@/lib/onboarding/use-mark-step-in-progress-if-pending"
import OnboardingLayout from "@/app/components/OnboardingLayout"
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext"
import { brandingToCssVars } from "@/lib/tenant/tenant-branding"
import { resolveClientOnboardingTenantSlug } from "@/lib/tenant/client-onboarding-slug"
import { activeSkillCategories, normalizeSkillAssessmentCatalog } from "@/lib/skill-assessment/catalog"
import { createDefaultSkillAssessmentCatalog } from "@/lib/skill-assessment/defaults"
import type { SkillAssessmentCatalog, SkillCategoryDraft } from "@/lib/skill-assessment/types"
import SkillAssessmentCategoryList from "@/app/application/components/SkillAssessmentCategoryList"
import { isCategoryComplete, scoreSkillAssessment } from "@/lib/skill-assessment/score"
import type { SkillQuizAnswers } from "@/lib/skill-assessment/types"

const supabase = getApplicantSupabaseClient()

function localCompletedCategories(slugs: string[]): Set<string> {
  if (typeof window === "undefined") return new Set()
  const done = new Set<string>()
  for (const slug of slugs) {
    if (localStorage.getItem(`${slug}_done`) === "true") done.add(slug)
    if (slug === "basic-care" && localStorage.getItem("basic_care_done") === "true") done.add(slug)
  }
  return done
}

export default function AssessmentPage() {
  const branding = useTenantBranding()
  const router = useRouter()
  const nav = useOnboardingStepNav()
  const onboarding = useOnboardingConfigOptional()
  const completingRef = useRef(false)
  const [catalog, setCatalog] = useState<SkillAssessmentCatalog | null>(null)
  const [completedSlugs, setCompletedSlugs] = useState<Set<string>>(() => new Set())
  const [answersByCategory, setAnswersByCategory] = useState<Record<string, SkillQuizAnswers>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const allowSkip = onboarding?.config?.skillAssessmentSettings?.allowSkip !== false

  const loadCategories = useCallback(async () => {
    setLoadError(null)
    setLoading(true)
    try {
      const search = typeof window !== "undefined" ? window.location.search : ""
      const tenantSlug = resolveClientOnboardingTenantSlug(search)
      const query = new URLSearchParams()
      if (tenantSlug) query.set("slug", tenantSlug)
      const res = await fetch(`/api/onboarding/skill-assessment-catalog?${query.toString()}`, {
        cache: "no-store",
      })
      const payload = (await res.json().catch(() => null)) as {
        catalog?: unknown
        enabled?: boolean
        error?: string
      } | null
      if (!res.ok) throw new Error(payload?.error || "Failed to load skill assessment")
      if (payload?.enabled === false) {
        if (nav.nextRoute) router.replace(nav.nextRoute)
        return
      }
      const nextCatalog = payload?.catalog
        ? normalizeSkillAssessmentCatalog(payload.catalog)
        : createDefaultSkillAssessmentCatalog()
      setCatalog(nextCatalog)
      const slugs = activeSkillCategories(nextCatalog).map((c) => c.slug)

      const { data: userData } = await supabase.auth.getUser()
      const user = userData?.user
      if (!user) {
        setCompletedSlugs(localCompletedCategories(slugs))
        return
      }
      // localStorage `*_done` flags are shared by every applicant in this browser, so a signed-in
      // applicant's completion must come only from their own saved rows.
      const ctx = await getWorkerSessionContext(supabase)
      const workerKeys = ctx?.id ? [ctx.id, user.id] : [user.id]
      const { data: doneRows } = await supabase
        .from("skill_assessments")
        .select("category, answers, completed")
        .in("worker_id", workerKeys)

      const combined = new Set<string>()
      const collected: Record<string, SkillQuizAnswers> = {}
      for (const row of doneRows ?? []) {
        const slug = String(row.category ?? "")
        if (!slug) continue
        collected[slug] = (row.answers ?? {}) as SkillQuizAnswers
        if (row.completed) combined.add(slug)
        const category = activeSkillCategories(nextCatalog).find((c) => c.slug === slug)
        if (category && isCategoryComplete(category, (row.answers ?? {}) as SkillQuizAnswers)) {
          combined.add(slug)
        }
      }
      setAnswersByCategory(collected)
      setCompletedSlugs(combined)
    } catch (error) {
      console.error("[skill-assessment]", error)
      setLoadError(error instanceof Error ? error.message : "Could not load skill categories")
      setCatalog(createDefaultSkillAssessmentCatalog())
    } finally {
      setLoading(false)
    }
  }, [nav.nextRoute, router])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  useEffect(() => {
    void ensureApplicantWorker()
  }, [])

  const skillStep =
    nav.currentStep ??
    nav.enabledSteps?.find(
      (s) => s.step_type === "skill_assessment" || s.step_key === "skill_assessment"
    ) ??
    null

  useMarkStepInProgressIfPending({
    step: skillStep,
    disabled: loading,
    updateStepStatus: onboarding?.updateStepStatus,
    completingRef,
  })

  const categories = catalog ? activeSkillCategories(catalog) : []
  const allCategoriesComplete =
    categories.length > 0 && categories.every((cat) => completedSlugs.has(cat.slug))
  const score =
    catalog && catalog.scoring.showResultsToApplicant && allCategoriesComplete
      ? scoreSkillAssessment(catalog, answersByCategory)
      : null

  const goToCategory = (cat: SkillCategoryDraft) => {
    router.push(applicationPath(APPLICATION_ROUTES.skillQuiz(cat.slug)))
  }

  const skipSkillAssessment = async () => {
    if (!allowSkip) return
    if (skillStep?.step_key) {
      try {
        await persistStepProgress(
          onboarding?.updateStepStatus,
          skillStep.step_key,
          "skipped",
          completingRef
        )
      } catch {
        /* continue to next step even if progress sync fails */
      }
    }
    if (nav.nextRoute) router.push(nav.nextRoute)
  }

  const continueSkillAssessment = async () => {
    if (skillStep?.step_key) {
      try {
        await persistStepProgress(
          onboarding?.updateStepStatus,
          skillStep.step_key,
          allCategoriesComplete ? "completed" : "skipped",
          completingRef
        )
      } catch {
        /* continue even if progress sync fails */
      }
    }
    if (nav.nextRoute) router.push(nav.nextRoute)
  }

  if (loading || !catalog) {
    return (
      <OnboardingLayout
        cardClassName="min-[700px]:h-auto min-[700px]:min-h-[540px] min-[1200px]:min-h-[700px]"
        rightPanelImageClassName="opacity-60 object-top"
        rightPanelOverlayClassName="bg-white/65"
      >
        <div className="flex h-full flex-col px-4 pb-8 pt-6 sm:px-10 sm:pb-10 sm:pt-8" style={brandingToCssVars(branding)}>
          <OnboardingStepper />
        </div>
      </OnboardingLayout>
    )
  }

  return (
    <OnboardingLayout
      cardClassName="min-[700px]:h-auto min-[700px]:min-h-[540px] min-[1200px]:min-h-[700px]"
      rightPanelImageClassName="opacity-60 object-top"
      rightPanelOverlayClassName="bg-white/65"
    >
      <div className="flex h-full flex-col px-4 pb-8 pt-6 sm:px-10 sm:pb-10 sm:pt-8" style={brandingToCssVars(branding)}>
        <OnboardingStepper />
        {loadError ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            {loadError}
          </div>
        ) : null}
        {score ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
            {catalog?.scoring.showOverallScore ? (
              <p>
                Overall score: <span className="font-semibold">{score.percent}%</span>
                {score.passed ? " · Passed" : " · Below passing score"}
              </p>
            ) : null}
            {catalog?.scoring.scoreByCategory ? (
              <ul className="mt-1 space-y-0.5 text-[12px]">
                {score.byCategory.map((row) => (
                  <li key={row.categoryId}>
                    {row.name}: {row.percent}%
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <SkillAssessmentCategoryList
          catalog={catalog}
          completedSlugs={completedSlugs}
          onSelectCategory={goToCategory}
          allowSkip={allowSkip}
          onSkip={() => void skipSkillAssessment()}
          onBack={() => router.back()}
          onContinue={() => void continueSkillAssessment()}
        />
      </div>
    </OnboardingLayout>
  )
}
