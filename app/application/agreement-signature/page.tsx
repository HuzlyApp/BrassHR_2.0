"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import OnboardingLayout from "@/app/components/OnboardingLayout";
import OnboardingStepper from "@/app/components/OnboardingStepper";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import PostHireStepScreen from "@/app/application/custom-step/[stepKey]/post-hire/PostHireStepScreen";
import {
  APPLICANT_CONTENT_CLASS,
  APPLICANT_HEADER_ROW,
  APPLICANT_SHELL_CLASS,
  APPLICANT_TITLE_CLASS,
} from "@/app/application/applicant-onboarding-responsive";
import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes";
import { isAgreementSignatureStep } from "@/lib/onboarding/agreement-signature-step";
import { POST_HIRE_SCREEN_SUBTITLE } from "@/lib/onboarding/post-hire-step-screens";
import { routeForApplicantStep } from "@/lib/onboarding/resolve-applicant-step-route";
import { useMarkStepInProgressIfPending } from "@/lib/onboarding/use-mark-step-in-progress-if-pending";
import { useOnboardingStepNav } from "@/lib/onboarding/use-onboarding-step-nav";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";

export default function AgreementSignaturePage() {
  const branding = useTenantBranding();
  const contentStyle = brandingToCssVars(branding) as CSSProperties;
  const router = useRouter();
  const nav = useOnboardingStepNav();
  const completingRef = useRef(false);

  const step = nav.currentStep && isAgreementSignatureStep(nav.currentStep) ? nav.currentStep : null;
  const misroutedStep = !nav.configLoading && nav.currentStep && !step ? nav.currentStep : null;

  useEffect(() => {
    if (!misroutedStep) return;
    const target = routeForApplicantStep(misroutedStep, nav.slug);
    if (!target.split("?")[0].includes(APPLICATION_ROUTES.agreementSignature)) router.replace(target);
  }, [misroutedStep, nav.slug, router]);

  useMarkStepInProgressIfPending({
    step,
    disabled: nav.configLoading || !step,
    updateStepStatus: nav.updateStepStatus,
    completingRef,
  });

  if (!nav.configLoading && !nav.currentStep) {
    return (
      <OnboardingLayout>
        <div className={`${APPLICANT_SHELL_CLASS} justify-center`} style={contentStyle}>
          <div className="mx-auto max-w-lg text-center text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Step not found</p>
            <p className="mt-2">This agreement is not part of your onboarding workflow.</p>
          </div>
        </div>
      </OnboardingLayout>
    );
  }

  const pageTitle = step?.title?.trim() || "Authorization e-sign";
  const pageDescription = step?.description?.trim() || POST_HIRE_SCREEN_SUBTITLE.acknowledgment;

  return (
    <OnboardingLayout>
      <div className={APPLICANT_SHELL_CLASS} style={contentStyle}>
        <OnboardingStepper />

        <div className={APPLICANT_CONTENT_CLASS}>
          <div className={APPLICANT_HEADER_ROW}>
            <h2 className={APPLICANT_TITLE_CLASS}>{pageTitle}</h2>
          </div>

          {step ? (
            <>
              <p className="text-sm text-slate-600">{pageDescription}</p>
              <PostHireStepScreen
                key={step.id}
                step={step}
                kind="acknowledgment"
                tenantSlug={nav.slug || null}
                updateStepStatus={nav.updateStepStatus}
                onBack={() => nav.goPrev()}
                onContinue={() => nav.goNext()}
              />
            </>
          ) : (
            <p className="text-sm text-slate-500">Loading agreement…</p>
          )}
        </div>
      </div>
    </OnboardingLayout>
  );
}
