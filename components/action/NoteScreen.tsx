"use client";

import React, { useState } from "react";
import { useZestoxx } from "@/components/ZestoxxProvider";
import { useWatchSymbols } from "@/components/useWatchSymbols";
import { exchangeOf } from "@/lib/actions";
import { typeOf } from "@/lib/symbols";
import { NO_RECENT_TRADES } from "@/lib/dynamic-symbols";
import ActionScreen from "./ActionScreen";
import { FormCard, FormRow, Notice, PriceStrip, TextArea } from "./ActionParts";

export const MAX_NOTE = 500;

/** A note on a symbol, full screen: kept in the paper account (up to 500 characters), with the live price strip above it. Saving an empty note deletes it. */
export default function NoteScreen({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const { live, notes, setNote, chgFor, hasFeedQuote, prevCloseFor, quoteStateOf } = useZestoxx();
  useWatchSymbols([symbol]);
  const saved = notes[symbol] ?? "";
  const [text, setText] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "saved" | "deleted">(null);
  const price = live[symbol] > 0 ? live[symbol] : null;
  const pct = price != null && hasFeedQuote(symbol) ? chgFor(symbol) : null;
  const change = price != null && pct != null ? price - prevCloseFor(symbol) : null;
  const noTrades = quoteStateOf(symbol) === "none";
  const strip = <PriceStrip exchange={exchangeOf(symbol)} price={price} type={typeOf(symbol)} change={change} pct={pct} noPriceText={noTrades ? NO_RECENT_TRADES : undefined} />;

  const submit = () => {
    setError(null);
    if (text.length > MAX_NOTE) return setError(`A note holds up to ${MAX_NOTE} characters. This one is ${text.length}.`);
    if (!text.trim() && !saved) return setError("Write a note to save it.");
    setNote(symbol, text);
    setDone(text.trim() ? "saved" : "deleted");
  };

  if (done) {
    return (
      <ActionScreen label="Note" symbol={symbol} onBack={onClose} strip={strip} footer={{ label: "Done", onPress: onClose, tone: "primary", testId: "action-done" }}>
        <Notice tone="ok" testId="note-saved">
          {done === "saved" ? "Note saved in your paper account." : "Note deleted."}
        </Notice>
        {done === "saved" && (
          <FormCard testId="note-preview">
            <p data-testid="result-line" className="whitespace-pre-wrap px-3 py-3 text-[14px] text-slate-800">
              {text}
            </p>
          </FormCard>
        )}
      </ActionScreen>
    );
  }

  return (
    <ActionScreen label={saved ? "Edit note" : "Add note"} symbol={symbol} onBack={onClose} strip={strip} footer={{ label: text.trim() || !saved ? `Save note · ${symbol}` : `Delete note · ${symbol}`, onPress: submit, tone: "primary", testId: "action-submit" }}>
      {error && <Notice tone="error" testId="note-error">{error}</Notice>}
      <FormCard testId="note-card">
        <FormRow label="Note" htmlFor="note-text" hint="Kept in your paper account. Only you see it.">
          <TextArea id="note-text" testId="note-text" ariaLabel={`Your note on ${symbol}`} value={text} onChange={(v) => (setText(v), setError(null))} max={MAX_NOTE} />
        </FormRow>
      </FormCard>
      {saved && !text.trim() && <Notice tone="warn" testId="note-delete-warning">The note is empty, so saving will delete it.</Notice>}
    </ActionScreen>
  );
}
