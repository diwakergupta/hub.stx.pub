import * as React from "react";
import {
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Info,
  Flame,
  CheckCircle2,
  ShieldCheck,
  Layers,
  Coins,
} from "lucide-react";
import type { MinerVizGraph, MinerVizNode } from "@/shared/miner-viz";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommitDetailModal } from "./commit-detail-modal";
import { formatNumber, stringToColor, truncateAddress } from "@/lib/utils";

interface CommitDagViewProps {
  graph: MinerVizGraph;
  bitcoinBlockHeight: number;
  generatedAt: string;
}

interface AnchorPos {
  bottomX: number;
  bottomY: number;
  topX: number;
  topY: number;
}

export function CommitDagView({
  graph,
  bitcoinBlockHeight,
  generatedAt,
}: CommitDagViewProps) {
  const [selectedCommit, setSelectedCommit] = React.useState<MinerVizNode | null>(null);
  const [hoveredMiner, setHoveredMiner] = React.useState<string | null>(null);
  const [hoveredTxid, setHoveredTxid] = React.useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = React.useState<number>(1);

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const cardRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());

  const [nodePositions, setNodePositions] = React.useState<Map<string, AnchorPos>>(new Map());
  const [canvasSize, setCanvasSize] = React.useState<{ width: number; height: number }>({
    width: 1200,
    height: 1000,
  });

  // Extract miners for legend filter
  const miners = React.useMemo(() => {
    const map = new Map<string, { count: number; wins: number; color: string }>();
    for (const b of graph.blocks) {
      for (const c of b.commits) {
        const cleanSender = c.sender.replace(/['"]/g, "").trim();
        const existing = map.get(cleanSender) || {
          count: 0,
          wins: 0,
          color: stringToColor(cleanSender),
        };
        existing.count += 1;
        if (c.won) existing.wins += 1;
        map.set(cleanSender, existing);
      }
    }
    return Array.from(map.entries()).sort(
      (a, b) => b[1].wins - a[1].wins || b[1].count - a[1].count,
    );
  }, [graph]);

  // Sort blocks chronologically so ancestry flows downwards
  const sortedBlocks = React.useMemo(() => {
    return [...graph.blocks].sort((a, b) => a.height - b.height);
  }, [graph.blocks]);

  // Measure anchor positions for every card relative to unclipped contentRef
  const updatePositions = React.useCallback(() => {
    if (!contentRef.current) return;
    const contentRect = contentRef.current.getBoundingClientRect();
    const scrollW = Math.max(contentRef.current.scrollWidth, contentRef.current.clientWidth);
    const scrollH = Math.max(contentRef.current.scrollHeight, contentRef.current.clientHeight);

    setCanvasSize({ width: scrollW, height: scrollH });

    const pos = new Map<string, AnchorPos>();
    cardRefs.current.forEach((el, txid) => {
      const rect = el.getBoundingClientRect();
      const midX = (rect.left - contentRect.left + rect.width / 2) / zoomLevel;
      pos.set(txid, {
        bottomX: midX,
        bottomY: (rect.bottom - contentRect.top) / zoomLevel,
        topX: midX,
        topY: (rect.top - contentRect.top) / zoomLevel,
      });
    });

    setNodePositions(pos);
  }, [zoomLevel]);

  React.useLayoutEffect(() => {
    // Measure after DOM paint
    const timer = setTimeout(updatePositions, 50);
    window.addEventListener("resize", updatePositions);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updatePositions);
    };
  }, [graph, zoomLevel, updatePositions]);

  // Render SVG lines strictly connecting bottom edge to top edge
  const renderedEdges = React.useMemo(() => {
    return graph.edges.map((edge) => {
      const source = nodePositions.get(edge.sourceTxid);
      const target = nodePositions.get(edge.targetTxid);
      if (!source || !target) return null;

      const sx = source.bottomX;
      const sy = source.bottomY;
      const tx = target.topX;
      const ty = target.topY;

      // Vertical distance between the bottom of parent and top of child
      const dy = ty - sy;
      const pathData = `M ${sx} ${sy} C ${sx} ${sy + dy * 0.5}, ${tx} ${ty - dy * 0.5}, ${tx} ${ty}`;

      const isHovered =
        hoveredTxid === edge.sourceTxid || hoveredTxid === edge.targetTxid;

      let strokeColor = "hsl(var(--muted-foreground) / 0.25)";
      let strokeWidth = 1.2;
      let strokeDasharray: string | undefined = undefined;

      if (edge.canonical) {
        strokeColor = "#0284c7"; // Sky 600 / vibrant blue
        strokeWidth = 2.2;
      } else if (edge.isFork) {
        strokeColor = "#ef4444"; // Red 500
        strokeWidth = 1.8;
        strokeDasharray = "3 3";
      }

      if (isHovered) {
        strokeWidth = Math.max(strokeWidth + 1.2, 2.8);
        strokeColor = edge.canonical
          ? "#38bdf8"
          : edge.isFork
            ? "#f87171"
            : "hsl(var(--foreground))";
      }

      return (
        <path
          key={`${edge.sourceTxid}->${edge.targetTxid}`}
          d={pathData}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          className="transition-all duration-150 pointer-events-none"
        />
      );
    });
  }, [graph.edges, nodePositions, hoveredTxid]);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header controls & stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-border bg-muted/20 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Block Commits DAG</h2>
            <Badge variant="outline" className="text-xs font-mono font-normal">
              {graph.blocks.length} Blocks
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Bitcoin block #{bitcoinBlockHeight.toLocaleString()} · Tip:{" "}
            {new Date(generatedAt).toLocaleTimeString()}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center border border-border rounded-lg bg-background p-0.5 shadow-2xs">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.1))}
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs font-mono px-2 text-muted-foreground select-none">
              {Math.round(zoomLevel * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setZoomLevel((z) => Math.min(1.3, z + 0.1))}
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setZoomLevel(1)}
              title="Reset zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Miner Legend / Filter Bar */}
      <div className="px-4 py-2 border-b border-border bg-muted/10 flex items-center justify-between gap-4 overflow-x-auto text-xs">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-muted-foreground font-medium text-[11px]">Miners:</span>
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            {miners.map(([sender, info]) => {
              const isSelected = hoveredMiner === sender;
              return (
                <button
                  key={sender}
                  onMouseEnter={() => setHoveredMiner(sender)}
                  onMouseLeave={() => setHoveredMiner(null)}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-all cursor-pointer font-mono text-[11px] ${
                    isSelected
                      ? "border-primary bg-primary/10 font-bold shadow-2xs"
                      : "border-border/70 bg-background hover:border-primary/50"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: info.color }}
                  />
                  <span>{truncateAddress(sender, 4, 3)}</span>
                  {info.wins > 0 && (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-1 rounded font-sans">
                      {info.wins}w
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground font-medium">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-sky-500 inline-block rounded" /> Canonical Spine
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-red-500 border-b border-dashed inline-block" /> Fork Attempt
          </span>
        </div>
      </div>

      {/* Scrollable Canvas Area */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto overflow-y-auto max-h-[75vh] select-none"
      >
        <div
          ref={contentRef}
          className="relative p-6 min-w-max"
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: "top left",
            transition: "transform 100ms ease-out",
          }}
        >
          {/* Full unclipped SVG overlay for edges */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={canvasSize.width}
            height={canvasSize.height}
            style={{ zIndex: 1 }}
          >
            {renderedEdges}
          </svg>

          {/* Temporal Block Rows */}
          <div className="relative z-10 space-y-4">
            {sortedBlocks.map((block) => {
              const hasWinner = block.commits.some((c) => c.won);

              return (
                <div
                  key={block.height}
                  className="flex items-center gap-3 p-2 rounded-lg border border-border/50 bg-background/90 backdrop-blur-2xs transition-colors hover:border-border"
                >
                  {/* Left Block Header Badge (Fixed Compact Width) */}
                  <div className="w-32 shrink-0 pr-2.5 border-r border-border/60">
                    <div className="flex items-center justify-between">
                      <a
                        href={`https://mempool.space/block/${block.height}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs font-bold text-foreground hover:text-primary transition-colors flex items-center gap-1"
                      >
                        ₿ {block.height.toLocaleString()}
                        <ExternalLink className="w-2.5 h-2.5 text-muted-foreground" />
                      </a>
                      {hasWinner ? (
                        <span className="text-[10px] px-1 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
                          Won
                        </span>
                      ) : (
                        <span className="text-[10px] px-1 rounded bg-amber-500/15 text-amber-600 font-mono">
                          0
                        </span>
                      )}
                    </div>

                    <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                      <span>{formatNumber(Math.round(block.sortitionSpendSats / 1000))}K sats</span>
                      <span>{block.commits.length}m</span>
                    </div>
                  </div>

                  {/* Miner Commits: STRICT SINGLE-ROW NO-WRAP */}
                  <div className="flex items-center gap-2 flex-nowrap shrink-0">
                    {block.commits.map((commit) => {
                      const cleanSender = commit.sender.replace(/['"]/g, "").trim();
                      const minerColor = stringToColor(cleanSender);
                      const isHovered =
                        hoveredMiner === cleanSender || hoveredTxid === commit.txid;
                      const isDimmed = hoveredMiner && hoveredMiner !== cleanSender;

                      return (
                        <div
                          key={commit.txid}
                          ref={(el) => {
                            if (el) cardRefs.current.set(commit.txid, el);
                            else cardRefs.current.delete(commit.txid);
                          }}
                          onMouseEnter={() => {
                            setHoveredTxid(commit.txid);
                            setHoveredMiner(cleanSender);
                          }}
                          onMouseLeave={() => {
                            setHoveredTxid(null);
                            setHoveredMiner(null);
                          }}
                          onClick={() => setSelectedCommit(commit)}
                          className={`w-[114px] h-[38px] px-2 py-1 rounded-md border text-xs shrink-0 cursor-pointer flex flex-col justify-between transition-all duration-150 ${
                            commit.won
                              ? "border-sky-500/80 bg-sky-500/10 shadow-xs ring-1 ring-sky-500/30"
                              : "border-border/80 bg-card hover:border-primary/50 text-muted-foreground hover:text-foreground"
                          } ${
                            commit.tip ? "ring-2 ring-emerald-500/80 border-emerald-500" : ""
                          } ${
                            isHovered
                              ? "scale-[1.04] shadow-md ring-2 ring-primary z-20 bg-accent text-accent-foreground"
                              : ""
                          } ${isDimmed ? "opacity-25" : "opacity-100"}`}
                        >
                          {/* Line 1: Miner Dot + Clean Address + Winner check */}
                          <div className="flex items-center justify-between gap-1 leading-none">
                            <div className="flex items-center gap-1.5 truncate">
                              <span
                                className="w-2 h-2 rounded-full shrink-0 ring-1 ring-border"
                                style={{ backgroundColor: minerColor }}
                              />
                              <span className="font-mono text-[11px] font-semibold truncate">
                                {truncateAddress(cleanSender, 4, 3)}
                              </span>
                            </div>
                            {commit.won && (
                              <CheckCircle2 className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0" />
                            )}
                          </div>

                          {/* Line 2: Stacks Height & Spend sats */}
                          <div className="flex items-center justify-between text-[10px] font-mono leading-none text-muted-foreground">
                            <span>
                              {commit.stacksHeight > 0
                                ? `${Math.round(commit.stacksHeight / 1000)}k`
                                : "—"}
                            </span>
                            <span className="font-medium text-foreground">
                              {formatNumber(Math.round(commit.spendSats / 1000))}K
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer bar */}
      <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" />
          Single-row compact layout · Hover a miner to highlight their commits · Click any node for transaction details.
        </span>
        <span className="font-mono text-[11px]">
          {graph.blocks.length} blocks · {graph.edges.length} ancestry edges
        </span>
      </div>

      {/* Commit Detail Modal */}
      <CommitDetailModal
        commit={selectedCommit}
        onClose={() => setSelectedCommit(null)}
        onSelectCommit={(txid) => {
          for (const b of graph.blocks) {
            const found = b.commits.find((c) => c.txid === txid);
            if (found) {
              setSelectedCommit(found);
              break;
            }
          }
        }}
      />
    </div>
  );
}
