"use client";

import { ExternalLink, FileText, PlayCircle } from "lucide-react";
import { videoEmbedForUrl, type PostHireScreenContent } from "@/lib/onboarding/post-hire-step-screens";
import { Section } from "./fields";

/** Admin-configured instructions, document link and training media for a Post-Hire step. */
export default function StepContent({
  content,
  showMedia,
}: {
  content: PostHireScreenContent;
  showMedia: boolean;
}) {
  const embed = showMedia ? videoEmbedForUrl(content.contentUrl) : null;
  const mediaLink = showMedia && content.contentUrl && !embed ? content.contentUrl : null;

  if (!content.instructions && !content.documentUrl && !embed && !mediaLink) return null;

  return (
    <Section>
      {content.instructions ? (
        <p className="whitespace-pre-line text-sm leading-6 text-slate-700">{content.instructions}</p>
      ) : null}

      {embed ? (
        <div className={content.instructions ? "mt-4" : undefined}>
          {embed.type === "iframe" ? (
            <div className="relative w-full overflow-hidden rounded-lg bg-slate-900 pt-[56.25%]">
              <iframe
                src={embed.src}
                title="Training video"
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          ) : (
            <video src={embed.src} controls className="w-full rounded-lg bg-slate-900" preload="metadata" />
          )}
        </div>
      ) : null}

      {mediaLink || content.documentUrl ? (
        <div className={`flex flex-wrap gap-2 ${content.instructions || embed ? "mt-4" : ""}`}>
          {mediaLink ? (
            <a
              href={mediaLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--brand-primary)] px-3 py-2 text-sm font-medium text-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]/5"
            >
              <PlayCircle className="h-4 w-4" />
              Open training
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
          {content.documentUrl ? (
            <a
              href={content.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--brand-primary)] px-3 py-2 text-sm font-medium text-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]/5"
            >
              <FileText className="h-4 w-4" />
              View document
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}
