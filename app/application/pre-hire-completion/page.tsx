"use client";

import { Suspense } from "react";
import OnboardingLayout from "@/app/components/OnboardingLayout";
import PreHireCompletionView from "@/app/application/components/completion/PreHireCompletionView";

function PreHireCompletionPageInner() {
  return (
    <OnboardingLayout
      cardClassName="min-[700px]:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)] min-[1200px]:grid-cols-[minmax(0,1.65fr)_minmax(220px,1fr)]"
      rightPanelImageClassName="object-cover object-center grayscale opacity-60"
      rightPanelOverlayClassName="bg-white/65"
    >
      <PreHireCompletionView />
    </OnboardingLayout>
  );
}

export default function PreHireCompletionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 animate-pulse" />}>
      <PreHireCompletionPageInner />
    </Suspense>
  );
}
