import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Search,
  Copy,
  Check,
  ExternalLink,
  Flame,
  Award,
  Layers,
  ArrowUpDown,
  Coins,
  Info,
} from "lucide-react";
import type { MinerPowerSnapshot, MinerPowerItem } from "@/shared/miner-power";
import type { MinerVizResponse } from "@/shared/miner-viz";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CommitDagView } from "@/components/commit-dag-view";
import {
  formatNumber,
  formatPercent,
  formatStx,
  stringToColor,
  truncateAddress,
} from "@/lib/utils";

interface MinersPageProps {
  realtimeEventCounter?: number;
}

export function MinersPage({ realtimeEventCounter = 0 }: MinersPageProps) {
  const [requestedHeight, setRequestedHeight] = React.useState<number | undefined>(undefined);
  const [vizData, setVizData] = React.useState<MinerVizResponse | null>(null);
  const [powerData, setPowerData] = React.useState<MinerPowerSnapshot | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  // Table filtering and sorting state
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [sortField, setSortField] = React.useState<keyof MinerPowerItem>("blocksWon");
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">("desc");
  const [copiedAddress, setCopiedAddress] = React.useState<string | null>(null);

  const loadData = React.useCallback(async (height?: number) => {
    setLoading(true);
    setError(null);
    try {
      const vizUrl = height ? `/api/miners/viz?height=${height}` : "/api/miners/viz";
      const powerUrl = height ? `/api/miners/power?height=${height}` : "/api/miners/power";

      const [vizRes, powerRes] = await Promise.all([
        fetch(vizUrl),
        fetch(powerUrl),
      ]);

      if (!vizRes.ok || !powerRes.ok) {
        throw new Error("Failed to load snapshot telemetry");
      }

      const viz = (await vizRes.json()) as MinerVizResponse;
      const power = (await powerRes.json()) as MinerPowerSnapshot;

      setVizData(viz);
      setPowerData(power);
    } catch (err: any) {
      setError(err?.message || "Failed to load miner data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load and reload when requested height changes or real-time event counter increments
  React.useEffect(() => {
    loadData(requestedHeight);
  }, [requestedHeight, realtimeEventCounter, loadData]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleSort = (field: keyof MinerPowerItem) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Filter and sort miner table items
  const filteredMiners = React.useMemo(() => {
    if (!powerData?.items) return [];
    let items = [...powerData.items];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(
        (m) =>
          m.stacksRecipient.toLowerCase().includes(q) ||
          (m.bitcoinAddress && m.bitcoinAddress.toLowerCase().includes(q)),
      );
    }

    items.sort((a, b) => {
      const valA = a[sortField] ?? 0;
      const valB = b[sortField] ?? 0;
      if (typeof valA === "number" && typeof valB === "number") {
        return sortDirection === "asc" ? valA - valB : valB - valA;
      }
      return 0;
    });

    return items;
  }, [powerData, searchQuery, sortField, sortDirection]);

  // Derived current height
  const currentHeight = vizData?.bitcoinBlockHeight ?? requestedHeight;

  // Aggregate high-level stats
  const totalSpendSats = React.useMemo(() => {
    if (!powerData?.items) return 0;
    return powerData.items.reduce((acc, m) => acc + (m.btcSpent || 0), 0);
  }, [powerData]);

  const totalStxEarned = React.useMemo(() => {
    if (!powerData?.items) return 0;
    return powerData.items.reduce((acc, m) => acc + (m.stxEarnt || 0), 0);
  }, [powerData]);

  return (
    <div className="space-y-6">
      {/* Page Title & Navigation Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stacks Miners</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time telemetry, block commits, and power distribution across canonical Bitcoin sortitions.
          </p>
        </div>

        {/* Snapshot height navigator */}
        <div className="flex items-center gap-1 sm:gap-2 bg-card border border-border rounded-lg p-1 shadow-xs shrink-0 max-w-full overflow-x-auto">
          <Button
            variant="ghost"
            size="sm"
            disabled={!currentHeight}
            onClick={() => currentHeight && setRequestedHeight(currentHeight - 1)}
            className="h-8 gap-1 px-2 text-xs shrink-0"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Prev</span>
          </Button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const val = (e.currentTarget.elements.namedItem("height") as HTMLInputElement).value;
              const h = parseInt(val, 10);
              if (!isNaN(h) && h > 0) setRequestedHeight(h);
            }}
            className="flex items-center gap-1 shrink-0"
          >
            <Input
              name="height"
              key={currentHeight}
              defaultValue={currentHeight?.toString() || ""}
              placeholder="Block #"
              className="h-8 w-20 sm:w-24 text-xs font-mono text-center"
            />
            <Button variant="outline" size="sm" type="submit" className="h-8 px-2 text-xs">
              Go
            </Button>
          </form>

          <Button
            variant="ghost"
            size="sm"
            disabled={!currentHeight}
            onClick={() => currentHeight && setRequestedHeight(currentHeight + 1)}
            className="h-8 gap-1 px-2 text-xs shrink-0"
          >
            <span className="hidden sm:inline">Next</span> <ChevronRight className="w-3.5 h-3.5" />
          </Button>

          <div className="w-px h-4 bg-border mx-0.5 sm:mx-1 shrink-0" />

          <Button
            variant={requestedHeight ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setRequestedHeight(undefined)}
            className="h-8 gap-1 px-2 text-xs text-primary font-medium shrink-0"
          >
            <RotateCw className="w-3 h-3" /> <span className="hidden sm:inline">Latest</span>
          </Button>
        </div>
      </div>

      {/* Top Telemetry KPI Cards */}
      {powerData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs text-muted-foreground font-medium block">
                    Bitcoin Block Height
                  </span>
                  <Badge variant={requestedHeight ? "secondary" : "outline"} className="text-[10px] py-0 px-1 font-mono font-normal">
                    {requestedHeight ? "Historical" : "Tip"}
                  </Badge>
                </div>
                <span className="text-2xl font-bold font-mono tracking-tight text-foreground block">
                  {powerData.bitcoinBlockHeight.toLocaleString()}
                </span>
                <span className="text-[11px] text-muted-foreground block mt-1">
                  {requestedHeight ? `Snapshot at block #${requestedHeight}` : "Latest canonical consensus tip"}
                </span>
              </div>
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Layers className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground font-medium block mb-1">
                  Active Miners
                </span>
                <span className="text-2xl font-bold font-mono tracking-tight text-foreground block">
                  {powerData.items.length}
                </span>
                <span className="text-[11px] text-muted-foreground block mt-1">
                  Past 1,008 blocks (~1 week)
                </span>
              </div>
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
                <Award className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground font-medium block mb-1">
                  Total BTC Spent
                </span>
                <span className="text-2xl font-bold font-mono tracking-tight text-foreground block">
                  {formatNumber(Math.round((totalSpendSats / 100_000_000) * 100) / 100)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">BTC</span>
                </span>
                <span className="text-[11px] text-muted-foreground block mt-1">
                  Past 1,008 blocks (~1 week)
                </span>
              </div>
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                <Flame className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs text-muted-foreground font-medium block">
                    Total STX Rewards
                  </span>
                  <span
                    className="cursor-help text-muted-foreground hover:text-foreground"
                    title="Total miner revenue across the 1,008-block window: includes 1,000 STX coinbase per Bitcoin block (rewards from blocks with no sortition roll over into subsequent winning tenures) plus Nakamoto tenure transaction fees."
                  >
                    <Info className="w-3.5 h-3.5" />
                  </span>
                </div>
                <span className="text-2xl font-bold font-mono tracking-tight text-foreground block">
                  {formatNumber(Math.round(totalStxEarned))}{" "}
                  <span className="text-xs font-normal text-muted-foreground">STX</span>
                </span>
                <span className="text-[11px] text-muted-foreground block mt-1">
                  Past 1,008 blocks (~1 week)
                </span>
              </div>
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                <Coins className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Miner Power Distribution Table */}
      {powerData && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Miner Power Distribution</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Observed over {formatNumber(powerData.bitcoinBlocksObserved ?? powerData.windowSize)} canonical Bitcoin blocks (
                {formatNumber(powerData.noSortitionBlocks ?? 0)} blocks without sortition,{" "}
                {formatPercent((powerData.noSortitionRate ?? 0) / 100)}). Unmined block rewards from no-sortition blocks roll over to subsequent winning tenures.
              </p>
            </div>

            {/* Miner Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter by address…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Miner</TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("blocksWon")}>
                    <div className="flex items-center justify-end gap-1">
                      Blocks Won
                      <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("winRate")}>
                    <div className="flex items-center justify-end gap-1">
                      Win Rate
                      <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("btcSpent")}>
                    <div className="flex items-center justify-end gap-1">
                      BTC Spent (sats)
                      <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("stxEarnt")}>
                    <div className="flex items-center justify-end gap-1">
                      <span
                        className="cursor-help border-b border-dotted border-muted-foreground/60 inline-flex items-center gap-1"
                        title="Coinbase block rewards (including 1K STX/block rollovers from no-sortition Bitcoin blocks) plus Nakamoto tenure transaction fees"
                      >
                        STX Earned
                      </span>
                      <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMiners.map((miner) => {
                  const minerColor = stringToColor(miner.stacksRecipient);
                  const explorerUrl = `https://explorer.stacks.co/address/${miner.stacksRecipient}`;
                  const btcUrl = miner.bitcoinAddress
                    ? `https://mempool.space/address/${miner.bitcoinAddress}`
                    : null;

                  return (
                    <TableRow key={miner.stacksRecipient}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 ring-1 ring-border"
                            style={{ backgroundColor: minerColor }}
                          />
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 font-mono font-medium text-xs">
                              <a
                                href={explorerUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-primary transition-colors hover:underline"
                              >
                                {truncateAddress(miner.stacksRecipient, 8, 6)}
                              </a>
                              <button
                                onClick={() => copyToClipboard(miner.stacksRecipient)}
                                className="text-muted-foreground hover:text-foreground"
                                title="Copy Stacks address"
                              >
                                {copiedAddress === miner.stacksRecipient ? (
                                  <Check className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>

                            {miner.bitcoinAddress && (
                              <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                                <a
                                  href={btcUrl!}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:text-primary transition-colors"
                                >
                                  ₿ {truncateAddress(miner.bitcoinAddress, 6, 4)}
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-right font-mono font-semibold text-foreground">
                        {formatNumber(miner.blocksWon)}
                      </TableCell>

                      <TableCell className="text-right font-mono">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-muted/60 text-xs font-semibold">
                          {formatPercent(miner.winRate / 100)}
                        </span>
                      </TableCell>

                      <TableCell className="text-right font-mono text-muted-foreground">
                        {formatNumber(miner.btcSpent)}
                      </TableCell>

                      <TableCell className="text-right font-mono font-medium text-emerald-600 dark:text-emerald-400">
                        {formatStx(miner.stxEarnt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Modern Commit DAG Visualizer */}
      {vizData?.graph && (
        <CommitDagView
          graph={vizData.graph}
          bitcoinBlockHeight={vizData.bitcoinBlockHeight}
          generatedAt={vizData.generatedAt}
        />
      )}
    </div>
  );
}
