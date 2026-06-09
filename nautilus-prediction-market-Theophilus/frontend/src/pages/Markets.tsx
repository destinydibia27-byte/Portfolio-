import { useMemo, useState } from "react";
import { useAllMarkets } from "../hooks/useMarkets";
import type { MarketData } from "../hooks/useMarket";
import MarketCard from "../components/MarketCard";

type SortKey = "hot" | "volume" | "newest" | "closing";

function marketUsd(m: MarketData): number {
  // sum of per-outcome micro-USD across all outcomes
  return m.usdPerOutcome.reduce((s, u) => s + Number(u), 0);
}

function fmtUsd(microRaw: number): string {
  const n = microRaw / 1e6;
  if (n >= 1_000_000) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(2)}`;
}

// Markets hidden by object ID: canceled, wrong deadlines, or duplicates.
const HIDDEN_IDS = new Set([
  "TSDB:Tanzania_vs_Rwanda",                                          // canceled match
  "0xdc8fb1f82efc17e6d7b901def92d991a7826a476c7d30e6a1d890d5341355c75", // DR Congo wrong deadline
  "0x3904d3a2accd4b2bf43ffb21fb22dd69e964ea8a7f49c978fa619a6509614b7f", // Hungary wrong deadline
  "0x3468b5a398c432d54f6926621d42bec7dc547eba0f598acfd09def652fe443a0", // DR Congo duplicate
]);

export default function Markets() {
  const { data, isLoading, error } = useAllMarkets();
  const markets = (data?.markets ?? []).filter(
  (m) => !HIDDEN_IDS.has(m.external_id) && !HIDDEN_IDS.has(m.id) && m.category !== "mock",
);
  const [sort, setSort] = useState<SortKey>("hot");

  const stats = useMemo(() => {
    const totalUsd = markets.reduce((s, m) => s + marketUsd(m), 0);
    const open = markets.filter((m) => m.status === 0).length;
    return {
      tvl: fmtUsd(totalUsd),
      open,
      total: markets.length,
    };
  }, [markets]);

  const sorted = useMemo(() => {
    const copy = [...markets];
    switch (sort) {
      case "volume":
        return copy.sort((a, b) => marketUsd(b) - marketUsd(a));
      case "newest":
        return copy.sort((a, b) => Number(b.created_at) - Number(a.created_at));
      case "closing":
        return copy.sort(
          (a, b) => Number(a.lock_time) - Number(b.lock_time),
        );
      default:
        // "hot" = open markets first, then by volume
        return copy.sort((a, b) => {
          if (a.status !== b.status) return a.status - b.status;
          return marketUsd(b) - marketUsd(a);
        });
    }
  }, [markets, sort]);

  const live = sorted.filter((m) => m.status === 0);
  const locked = sorted.filter((m) => m.status === 1);
  const resolved = sorted.filter((m) => m.status === 2);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <StatRowSkeleton />
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-surface border border-border rounded-xl p-5 h-56 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface border border-red/30 rounded-xl p-6">
        <p className="text-red text-sm font-mono">
          Failed to load markets. RPC error: {(error as Error).message}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stat row — neon callouts */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard label="TOTAL TVL" value={stats.tvl} accent="green" />
        <StatCard label="OPEN MARKETS" value={String(stats.open)} accent="cyan" />
      </section>

      {/* Sort row */}
      <section className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-wider text-subtle">
          {markets.length} {markets.length === 1 ? "market" : "markets"} on chain
        </p>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="font-mono text-[10px] uppercase tracking-wider text-subtle mr-1">
            Sort
          </span>
          <SortPill active={sort === "hot"} onClick={() => setSort("hot")}>
            Hot
          </SortPill>
          <SortPill active={sort === "volume"} onClick={() => setSort("volume")}>
            Volume
          </SortPill>
          <SortPill active={sort === "newest"} onClick={() => setSort("newest")}>
            Newest
          </SortPill>
          <SortPill active={sort === "closing"} onClick={() => setSort("closing")}>
            Closing
          </SortPill>
        </div>
      </section>

      {markets.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-12">
          {live.length > 0 && (
            <Section label="LIVE" sublabel="open for betting" color="text-red">
              <MarketGrid markets={live} />
            </Section>
          )}
          {locked.length > 0 && (
            <Section
              label="AWAITING RESOLUTION"
              sublabel="oracle pending"
              color="text-yellow"
            >
              <MarketGrid markets={locked} />
            </Section>
          )}
          {resolved.length > 0 && (
            <Section
              label="RESOLVED"
              sublabel="claims open"
              color="text-green"
            >
              <MarketGrid markets={resolved} />
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function MarketGrid({ markets }: { markets: MarketData[] }) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {markets.map((m) => (
        <MarketCard key={m.id} market={m} />
      ))}
    </div>
  );
}

function Section({
  label,
  sublabel,
  color,
  children,
}: {
  label: string;
  sublabel?: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <span className={`block w-1 h-5 ${color.replace("text-", "bg-")}`} />
        <h2 className="font-display font-bold text-text text-sm uppercase tracking-wider">
          {label}
        </h2>
        {sublabel && (
          <span className={`font-mono text-[10px] uppercase tracking-wider ${color}`}>
            {sublabel}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "cyan" | "green" | "purple" | "orange";
}) {
  const colorMap: Record<typeof accent, { text: string; ring: string }> = {
    cyan: { text: "text-cyan", ring: "shadow-neon-cyan" },
    green: { text: "text-green", ring: "shadow-neon-green" },
    purple: { text: "text-purple", ring: "shadow-neon-purple" },
    orange: { text: "text-orange", ring: "shadow-neon-orange" },
  };
  const { text, ring } = colorMap[accent];
  return (
    <div className={`bg-surface border border-border-strong rounded-xl px-5 py-4 ${ring}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">
        {label}
      </p>
      <p className={`font-display font-bold text-2xl mt-1 ${text} tabular-nums`}>
        {value}
      </p>
    </div>
  );
}

function StatRowSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {[...Array(2)].map((_, i) => (
        <div
          key={i}
          className="bg-surface border border-border rounded-xl px-5 py-4 h-20 animate-pulse"
        />
      ))}
    </div>
  );
}

function SortPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-md font-mono text-[11px] uppercase tracking-wider border transition-colors ${
        active
          ? "bg-surface border-border-strong text-text"
          : "border-transparent text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="bg-surface border border-border rounded-xl px-6 py-20 text-center">
      <p className="font-display font-semibold text-text">No markets yet</p>
      <p className="text-muted text-sm mt-2 font-mono">
        Run{" "}
        <code className="px-1.5 py-0.5 bg-bg rounded border border-border text-cyan">
          bash scripts/create_market.sh
        </code>{" "}
        to create one.
      </p>
    </div>
  );
}
