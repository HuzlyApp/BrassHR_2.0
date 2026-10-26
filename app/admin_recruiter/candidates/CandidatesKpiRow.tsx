import type { CandidateKpiCard, CandidateKpiIcon } from "./candidate-kpis";

function CandidatesKpiIcon({ src, bg, leafWidth, leafHeight }: CandidateKpiIcon) {
  return (
    <div
      className="flex size-[50px] shrink-0 items-center justify-center overflow-hidden rounded-xl p-1"
      style={{ backgroundColor: bg }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={leafWidth}
        height={leafHeight}
        className="shrink-0 object-contain"
        style={{ width: leafWidth, height: leafHeight }}
        aria-hidden
      />
    </div>
  );
}

function CandidatesKpiCard({
  label,
  value,
  trendPercent,
  icon,
  loading,
}: CandidateKpiCard & { loading?: boolean }) {
  const down = trendPercent < 0;

  return (
    <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-lg border border-[#E5E7EB] bg-white p-[14px]">
      <div className="flex w-full items-center gap-[14px]">
        <CandidatesKpiIcon {...icon} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-xs font-semibold leading-4 text-[#374151]">{label}</p>
          {loading ? (
            <div
              className="h-8 w-16 animate-pulse rounded bg-[#E5E7EB]"
              aria-hidden
            />
          ) : (
            <p className="text-2xl font-semibold leading-8 text-black">{value}</p>
          )}
          <div className="flex items-center gap-2">
            {loading ? (
              <div className="h-[15px] w-28 animate-pulse rounded bg-[#F3F4F6]" aria-hidden />
            ) : (
              <>
                <span className="inline-flex items-center gap-0.5">
                  <span
                    className={`relative size-3 shrink-0 overflow-hidden ${down ? "rotate-180" : ""}`}
                    aria-hidden
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/icons/candidates-icons/kpi-arrow-up.svg"
                      alt=""
                      width={12}
                      height={12}
                      className="size-3"
                    />
                  </span>
                  <span
                    className={`text-[10px] font-semibold leading-[15px] ${down ? "text-[#B42318]" : "text-[#008C36]"}`}
                  >
                    {Math.abs(trendPercent)}%
                  </span>
                </span>
                <span className="text-[10px] font-normal leading-[15px] text-[#6B7280]">
                  from last 30 days
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CandidatesKpiRow({
  cards,
  loading = false,
}: {
  cards: CandidateKpiCard[];
  loading?: boolean;
}) {
  return (
    <div
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4"
      aria-busy={loading || undefined}
    >
      {cards.map((card) => (
        <CandidatesKpiCard key={card.label} {...card} loading={loading} />
      ))}
    </div>
  );
}
