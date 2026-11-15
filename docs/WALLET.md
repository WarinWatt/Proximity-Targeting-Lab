# Grant-credit wallet

Internal THB-denominated credits are granted by an authenticated Owner. Grants are not cash receipts or external top-ups. Only the Owner can issue grants; customers can never grant their own credits. Every mutation has an idempotency key, payload binding and append-only ledger evidence.

## Funds flow

1. Grant: available wallet credit increases.
2. Purchase: the entire campaign budget is moved from available credit to campaign escrow. An unfunded purchase is rejected atomically.
3. Auction: queued and playing reservations use only that campaign's remaining escrow. Five stations share the same budget.
4. Playback completion: campaign spend increases once; wallet available is not debited a second time.
5. Refund on an open campaign: campaign escrow increases. This is not an additional wallet grant.
6. Close: allowed only with no queued/playing runs. Remaining escrow is released to the wallet exactly once; closed campaigns do not enter auctions.
7. Refund after close: refunded amount returns directly to available wallet credit so it is not stranded in a closed campaign.

Legacy campaigns are not silently funded or charged. They retain historical records and must be explicitly funded from available wallet credit before entering new auctions. Historical queued/playing runs may complete under their original rules.

## Invariants

- Wallet credits never fall below zero; duplicate grant/purchase/refund/close cannot create extra credit.
- Available plus escrow plus net consumed credit reconciles to grants for newly funded campaigns.
- Grant credits are excluded from ad revenue; only recorded playback charge/refund totals describe consumption.
- Engagement remains nonbillable telemetry until independent validation.
- External top-ups can be added later as a separately verified funding source; no client-provided payment confirmation is trusted.

No cash withdrawals, bank gateway, VAT invoice or payment settlement is implemented by this release.
