import * as React from "react";
import { ExternalLink, X, ShieldCheck, Flame, Layers, Users, Trophy } from "lucide-react";
import type { MinerVizBlock, MinerVizNode } from "@/shared/miner-viz";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber, stringToColor, truncateAddress } from "@/lib/utils";

interface BlockDetailModalProps {
  block: MinerVizBlock | null;
  onClose: () => void;
  onSelectCommit?: (commit: MinerVizNode) => void;
}

export function BlockDetailModal({ block, onClose, onSelectCommit }: BlockDetailModalProps) {
  if (!block) return null;

  const mempoolUrl = `https://mempool.space/block/${block.height}`;
  const targetStacksHeight = block.commits[0]?.stacksHeight ?? 0;
  const winningCommit = block.commits.find((c) => c.won);
  const stacksExplorerUrl = targetStacksHeight > 0
    ? `https://explorer.stacks.co/block/${targetStacksHeight}`
    : null;

  // Sort commits by spend sats descending so highest bidders appear first
  const sortedCommits = [...block.commits].sort((a, b) => b.spendSats - a.spendSats);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-0">
      <div
        className="relative w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl text-card-foreground animate-in zoom-in-95 max-h-[90vh] flex flex-col"
        role="dialog"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <span className="font-bold text-sm font-mono">₿</span>
          </div>
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              Bitcoin Block #{block.height.toLocaleString()}
            </h3>
            <p className="text-xs text-muted-foreground font-mono">
              PoX Sortition & Stacks Nakamoto Tenure Summary
            </p>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {winningCommit ? (
            <Badge variant="success" className="gap-1 font-mono text-xs">
              <Trophy className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Sortition Winner Elected
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1 font-mono text-xs">
              No Sortition Winner
            </Badge>
          )}

          <Badge variant="outline" className="font-mono text-xs">
            {block.commits.length} Miner {block.commits.length === 1 ? "Commit" : "Commits"}
          </Badge>
        </div>

        {/* Scrollable Content */}
        <div className="space-y-4 overflow-y-auto pr-1 flex-1 text-sm">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <span className="text-xs text-muted-foreground block mb-1">Target Stacks Tip</span>
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold font-mono text-foreground">
                  {targetStacksHeight > 0 ? `#${targetStacksHeight.toLocaleString()}` : "—"}
                </span>
                {stacksExplorerUrl && (
                  <a
                    href={stacksExplorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-0.5"
                  >
                    Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <span className="text-xs text-muted-foreground block mb-1">Total Burn Fee</span>
              <span className="text-base font-semibold font-mono flex items-center gap-1.5 text-foreground">
                <Flame className="w-4 h-4 text-amber-500 shrink-0" />
                {formatNumber(block.sortitionSpendSats)} <span className="text-xs font-normal text-muted-foreground">sats</span>
              </span>
            </div>
          </div>

          {/* Winner Highlights (if present) */}
          {winningCommit && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Winning Miner
                </span>
                <span className="font-mono text-[11px]">
                  {formatNumber(winningCommit.spendSats)} sats burned ({Math.round((winningCommit.spendSats / (block.sortitionSpendSats || 1)) * 100)}%)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full ring-1 ring-border shrink-0"
                    style={{ backgroundColor: stringToColor(winningCommit.sender) }}
                  />
                  <span className="font-mono text-xs font-semibold">
                    {truncateAddress(winningCommit.sender, 8, 6)}
                  </span>
                </div>
                {onSelectCommit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onClose();
                      onSelectCommit(winningCommit);
                    }}
                    className="h-7 text-xs px-2.5"
                  >
                    View Commit
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Commits Breakdown Table */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-muted-foreground block">
              Miner Bids & Sortition Probability ({sortedCommits.length})
            </span>

            <div className="rounded-lg border border-border overflow-hidden bg-background">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 border-b border-border text-muted-foreground font-medium">
                  <tr>
                    <th className="py-2 px-3 text-left">Miner</th>
                    <th className="py-2 px-3 text-right">Burn Spend</th>
                    <th className="py-2 px-3 text-right">Win Share</th>
                    <th className="py-2 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono">
                  {sortedCommits.map((c) => {
                    const cleanSender = c.sender.replace(/['"]/g, "").trim();
                    const color = stringToColor(cleanSender);
                    const sharePct = block.sortitionSpendSats > 0
                      ? ((c.spendSats / block.sortitionSpendSats) * 100).toFixed(1)
                      : "0.0";

                    return (
                      <tr
                        key={c.txid}
                        onClick={() => {
                          if (onSelectCommit) {
                            onClose();
                            onSelectCommit(c);
                          }
                        }}
                        className="hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full shrink-0 ring-1 ring-border"
                              style={{ backgroundColor: color }}
                            />
                            <span className="font-semibold truncate max-w-[120px]">
                              {truncateAddress(cleanSender, 4, 3)}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right text-foreground">
                          {formatNumber(c.spendSats)} sats
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground">
                          {sharePct}%
                        </td>
                        <td className="py-2 px-3 text-center">
                          {c.won ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                              Won
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
          <a
            href={mempoolUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
          >
            Bitcoin Block on Mempool <ExternalLink className="w-3 h-3" />
          </a>

          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
