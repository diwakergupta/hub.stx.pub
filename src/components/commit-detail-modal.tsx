import * as React from "react";
import { ExternalLink, Copy, Check, X, ShieldCheck, Flame, Layers } from "lucide-react";
import type { MinerVizNode } from "@/shared/miner-viz";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber, formatStx, stringToColor } from "@/lib/utils";

interface CommitDetailModalProps {
  commit: MinerVizNode | null;
  onClose: () => void;
  onSelectCommit?: (txid: string) => void;
}

export function CommitDetailModal({ commit, onClose, onSelectCommit }: CommitDetailModalProps) {
  const [copied, setCopied] = React.useState<string | null>(null);

  if (!commit) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const minerColor = stringToColor(commit.sender);
  const mempoolUrl = `https://mempool.space/tx/${commit.txid}`;
  const blockExplorerUrl = commit.blockHash
    ? `https://explorer.hiro.so/block/0x${commit.blockHash}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-0">
      <div 
        className="relative w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl text-card-foreground animate-in zoom-in-95"
        role="dialog"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-3.5 h-3.5 rounded-full ring-2 ring-border shrink-0"
            style={{ backgroundColor: minerColor }}
          />
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              Block Commit Details
            </h3>
            <p className="text-xs text-muted-foreground font-mono">
              Bitcoin Block #{commit.burnBlockHeight.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {commit.tip && (
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="w-3 h-3" /> Canonical Tip
            </Badge>
          )}
          {commit.won && !commit.tip && (
            <Badge variant="blue" className="gap-1">
              <ShieldCheck className="w-3 h-3" /> Won Sortition
            </Badge>
          )}
          {commit.canonical && (
            <Badge variant="secondary">Canonical Path</Badge>
          )}
          {!commit.won && (
            <Badge variant="outline" className="text-muted-foreground">
              Candidate Commit
            </Badge>
          )}
        </div>

        <div className="space-y-3.5 text-sm">
          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Miner Identity</span>
              <button
                onClick={() => copyToClipboard(commit.sender, "sender")}
                className="flex items-center gap-1 hover:text-foreground font-mono"
              >
                {copied === "sender" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                Copy
              </button>
            </div>
            <p className="font-mono text-xs break-all select-all font-medium">
              {commit.sender}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <span className="text-xs text-muted-foreground block mb-1">Burn Fee Spent</span>
              <span className="text-base font-semibold font-mono flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-500" />
                {formatNumber(commit.spendSats)} <span className="text-xs font-normal text-muted-foreground">sats</span>
              </span>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <span className="text-xs text-muted-foreground block mb-1">Stacks Tip Height</span>
              <span className="text-base font-semibold font-mono flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-500" />
                {commit.stacksHeight > 0 ? commit.stacksHeight.toLocaleString() : "—"}
              </span>
            </div>
          </div>

          {commit.won && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <span className="text-xs text-muted-foreground block mb-1">Coinbase Reward</span>
                <span className="text-sm font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                  {commit.coinbaseEarned > 0 ? `${formatStx(commit.coinbaseEarned / 1_000_000)} STX` : "—"}
                </span>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <span className="text-xs text-muted-foreground block mb-1">Tenure Fees Earned</span>
                <span className="text-sm font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                  {commit.feesEarned > 0 ? `${formatStx(commit.feesEarned / 1_000_000)} STX` : "—"}
                </span>
              </div>
            </div>
          )}

          {commit.memo ? (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <span className="text-xs text-muted-foreground block mb-1">Commit Memo</span>
              <p className="font-mono text-xs break-all bg-background/50 p-1.5 rounded border border-border/50">
                {commit.memo}
              </p>
            </div>
          ) : null}

          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Bitcoin TxID</span>
              <a
                href={mempoolUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                Mempool <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="font-mono text-xs break-all text-muted-foreground">
              {commit.txid}
            </p>
          </div>

          {commit.parentTxid && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground block">Parent Commit</span>
                <span className="font-mono text-xs text-muted-foreground truncate max-w-[280px] inline-block">
                  {commit.parentTxid}
                </span>
              </div>
              {onSelectCommit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSelectCommit(commit.parentTxid!)}
                  className="text-xs h-7"
                >
                  View Parent
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2 pt-2 border-t border-border">
          {blockExplorerUrl && (
            <Button
              variant="default"
              size="sm"
              asChild
            >
              <a href={blockExplorerUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5">
                Stacks Block Explorer <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
