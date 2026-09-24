import * as React from "react";
// @ts-ignore
import { c32ToB58, b58ToC32 } from "c32check";
import { ArrowLeftRight, Copy, Check, Sparkles, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function UtilitiesPage() {
  const [input, setInput] = React.useState<string>("");
  const [result, setResult] = React.useState<string | null>(null);
  const [conversionType, setConversionType] = React.useState<"stx-to-btc" | "btc-to-stx" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<boolean>(false);

  const handleConvert = (value: string) => {
    setInput(value);
    setResult(null);
    setConversionType(null);
    setError(null);

    const trimmed = value.trim();
    if (!trimmed) return;

    // Try Stacks -> Bitcoin
    try {
      const btc = c32ToB58(trimmed);
      setResult(btc);
      setConversionType("stx-to-btc");
      return;
    } catch {}

    // Try Bitcoin -> Stacks
    try {
      const stx = b58ToC32(trimmed);
      setResult(stx);
      setConversionType("btc-to-stx");
      return;
    } catch {}

    setError("Invalid address format. Please enter a valid Stacks (SP...) or Bitcoin base58 (1..., 3...) address.");
  };

  const copyResult = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Utilities</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Helpful cryptographic converters and address formatting tools for Stacks miners and developers.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base">Address Converter</CardTitle>
              <CardDescription>
                Convert between Stacks (C32) and Bitcoin (Base58) addresses. Format is automatically detected.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Input Address</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleConvert("SP3FGQ8Z7JY9BWYZ5WM53E0M9NK7WHJF0691NZ159")}
                  className="text-primary hover:underline"
                >
                  Try Sample Stacks
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => handleConvert("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2")}
                  className="text-primary hover:underline"
                >
                  Try Sample Bitcoin
                </button>
              </div>
            </div>

            <Input
              placeholder="Paste Stacks (SP...) or Bitcoin address..."
              value={input}
              onChange={(e) => handleConvert(e.target.value)}
              className="font-mono text-sm h-11"
              autoFocus
            />
          </div>

          {result && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2 animate-in fade-in-50">
              <div className="flex items-center justify-between">
                <Badge variant="success">
                  {conversionType === "stx-to-btc" ? "Bitcoin Address (Base58)" : "Stacks Address (C32)"}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyResult}
                  className="h-7 gap-1 text-xs bg-background/80"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="font-mono text-base font-semibold text-emerald-900 dark:text-emerald-200 break-all select-all">
                {result}
              </p>
            </div>
          )}

          {error && input && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 flex items-start gap-2.5 text-destructive text-xs animate-in fade-in-50">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default UtilitiesPage;
