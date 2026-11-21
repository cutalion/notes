---
title: Shop models overview
description: The main models of the fixture shop and how they relate.
---

The shop has orders, payments, and shipments. The [`Order`](../app/models/order.rb#L13) model owns the status.

## Orders

```mermaid
flowchart LR
  Cart --> Order --> Payment
```

| Model | Table | Owner |
|---|---|---|
| Order | orders | checkout |
| Payment | payments | billing |
| Shipment | shipments | logistics |

## Payments

```mermaid
flowchart TD
  Payment --> Capture
  Payment --> Refund
```

### Capture

A capture moves the money. A refund returns it.

## Shipments

```mermaid
flowchart LR
  Order --> Shipment --> Carrier
```

The legacy account model is [gone from this checkout](../app/models/legacy_account.rb).
