---
title: Wallet top-ups
description: How a wallet top-up reaches the balance.
---

:::caution
A top-up is credited only after the provider confirms it.
:::

The provider sends the event with wallet_address populated, and the balance follows.

![The top-up flow](flow.png)

![The top-up screen](screen.png)

The wide report lives in [`wide_report.rb`](../../app/reports/wide_report.rb).
